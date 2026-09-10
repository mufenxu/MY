import { ACADEMIC_TIMETABLE_SOURCES } from "../lib/academic-config.js";
import { autoReservationNextScanDelay, autoReservationRunPlan } from "../lib/libroom-auto-reservation.js";
import { buildCourseOccurrences } from "../lib/academic-calendar.js";
import { buildCourseReminderDelivery, enqueueCampusNotification, sendCampusNotification } from "../lib/notification-client.js";
import { cookieHeaderFor } from "../lib/session-jar.js";
import { iterateTaskPages, mapWithConcurrency } from "../lib/bounded-concurrency.js";
import { librarySeatWaitlistNextScanDelay, librarySeatWaitlistRunPlan } from "../lib/library-seat-waitlist.js";
import { randomUUID } from "node:crypto";

export function groupAutoReservationTasksByUser(tasks = []) {
  const groups = new Map();
  for (const task of Array.isArray(tasks) ? tasks : []) {
    const userId = String(task?.user_id || "").trim();
    if (!userId) continue;
    const group = groups.get(userId) || [];
    group.push(task);
    groups.set(userId, group);
  }
  return Array.from(groups.entries());
}

export function createBackgroundSchedulers({
  academicEvaluationAutoCapacitySnapshot,
  academicEvaluationAutoTasks,
  activeUpstreamRequestCount,
  cachedAcademicTimetableForUser,
  CAS_ORIGIN,
  getAcademicTimetable,
  isCasLoginRequiredError,
  librarySeatWaitlistFailureText,
  logger,
  MAX_CONCURRENT_UPSTREAM_REQUESTS,
  notifyLibrarySeatWaitlist,
  nowIso,
  readSessionJar,
  recoverSchoolSessionAfterAuthError,
  reloginSchoolSessionIfWanted,
  repository,
  runAutoReservationTask,
  runLibrarySeatWaitlistTask,
  isShuttingDown,
  userContextStorage,
  withAcademicSessionLock,
}) {
  const ACADEMIC_AUTO_REFRESH_MS = Number(process.env.ACADEMIC_AUTO_REFRESH_MS || 10 * 60 * 1000);

  const ACADEMIC_AUTO_REFRESH_START_DELAY_MS = Number(process.env.ACADEMIC_AUTO_REFRESH_START_DELAY_MS || 30 * 1000);

  const CAMPUS_REMINDER_INTERVAL_MS = Number(process.env.CAMPUS_REMINDER_INTERVAL_MS || 5 * 60 * 1000);

  const CAMPUS_REMINDER_START_DELAY_MS = Number(process.env.CAMPUS_REMINDER_START_DELAY_MS || 45 * 1000);

  const LIBROOM_AUTO_RESERVATION_INTERVAL_MS = Number(process.env.CAMPUS_LIBROOM_AUTO_RESERVATION_INTERVAL_MS || 15 * 1000);

  const LIBROOM_AUTO_RESERVATION_START_DELAY_MS = Number(process.env.CAMPUS_LIBROOM_AUTO_RESERVATION_START_DELAY_MS || 0);

  const LIBRARY_SEAT_WAITLIST_FAST_INTERVAL_MS = Number(process.env.CAMPUS_LIBRARY_SEAT_WAITLIST_FAST_INTERVAL_MS || 20 * 1000);

  const LIBRARY_SEAT_WAITLIST_MEDIUM_INTERVAL_MS = Number(process.env.CAMPUS_LIBRARY_SEAT_WAITLIST_MEDIUM_INTERVAL_MS || 2 * 60 * 1000);

  const LIBRARY_SEAT_WAITLIST_SLOW_INTERVAL_MS = Number(process.env.CAMPUS_LIBRARY_SEAT_WAITLIST_SLOW_INTERVAL_MS || 10 * 60 * 1000);

  const LIBRARY_SEAT_WAITLIST_START_DELAY_MS = Number(process.env.CAMPUS_LIBRARY_SEAT_WAITLIST_START_DELAY_MS || 0);

  const LIBRARY_SEAT_WAITLIST_HOT_WINDOW_MS = Number(process.env.CAMPUS_LIBRARY_SEAT_WAITLIST_HOT_WINDOW_MS || 2 * 60 * 60 * 1000);

  const LIBRARY_SEAT_WAITLIST_MEDIUM_WINDOW_MS = Number(process.env.CAMPUS_LIBRARY_SEAT_WAITLIST_MEDIUM_WINDOW_MS || 24 * 60 * 60 * 1000);

  const LIBRARY_SEAT_WAITLIST_MAX_FAILURES = Math.min(50, Math.max(1, Number(process.env.CAMPUS_LIBRARY_SEAT_WAITLIST_MAX_FAILURES || 5)));

  const CAMPUS_REMINDER_HORIZON_HOURS = Math.min(168, Math.max(1, Number(process.env.CAMPUS_REMINDER_HORIZON_HOURS || 24) || 24));

  const CAMPUS_REMINDER_BATCH_SIZE = Math.min(1_000, Math.max(1, Math.trunc(Number(process.env.CAMPUS_REMINDER_BATCH_SIZE || 100) || 100)));

  const BACKGROUND_USER_SCAN_LIMIT = 1_000;

  const ACADEMIC_REFRESH_CONCURRENCY = 3;

  const ACADEMIC_REFRESH_MAX_RUNTIME_MS = 10 * 60 * 1000;

  const ACADEMIC_REMINDER_CACHE_CONCURRENCY = 5;

  const ACADEMIC_REMINDER_ENQUEUE_CONCURRENCY = 5;

  const ACADEMIC_REMINDER_MAX_RUNTIME_MS = 3 * 60 * 1000;

  const ACADEMIC_REMINDER_MAX_ENQUEUE_ATTEMPTS = 3;

  const ACADEMIC_REMINDER_RETRY_DELAY_MS = 60 * 1000;

  const backgroundTasks = new Set();

  let libroomAutoReservationTimer = null;

  let libroomAutoReservationRunning = false;

  let libroomAutoReservationRescheduleRequested = false;

  let librarySeatWaitlistTimer = null;

  let librarySeatWaitlistRunning = false;

  let librarySeatWaitlistRescheduleRequested = false;

  let academicAutoRefreshRunning = false;

  let academicRefreshStartTimer = null;

  let academicRefreshInterval = null;

  let academicReminderRunning = false;

  let academicReminderStartTimer = null;

  let academicReminderInterval = null;

  const academicRefreshOperation = {
    running: false,
    skippedRuns: 0,
    lastReason: null,
    lastStartedAt: null,
    lastFinishedAt: null,
    lastDurationMs: null,
    scanned: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
    truncated: 0,
    timedOut: false,
    lastError: null
  };

  const academicReminderOperation = {
    running: false,
    skippedRuns: 0,
    lastReason: null,
    lastStartedAt: null,
    lastFinishedAt: null,
    lastDurationMs: null,
    scanned: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
    truncated: 0,
    queued: 0,
    deduplicated: 0,
    retryPending: 0,
    retryExhausted: 0,
    timedOut: false,
    lastError: null
  };

  function stopBackgroundSchedulers() {
    if (academicRefreshStartTimer) clearTimeout(academicRefreshStartTimer);
    if (academicRefreshInterval) clearInterval(academicRefreshInterval);
    if (academicReminderStartTimer) clearTimeout(academicReminderStartTimer);
    if (academicReminderInterval) clearInterval(academicReminderInterval);
    if (libroomAutoReservationTimer) clearTimeout(libroomAutoReservationTimer);
    if (librarySeatWaitlistTimer) clearTimeout(librarySeatWaitlistTimer);
  }

  function beginBackgroundOperation(state, reason) {
    state.running = true;
    state.lastReason = reason;
    state.lastStartedAt = nowIso();
    state.lastFinishedAt = null;
    state.lastDurationMs = null;
    state.scanned = 0;
    state.completed = 0;
    state.failed = 0;
    state.skipped = 0;
    state.truncated = 0;
    state.queued = 0;
    state.deduplicated = 0;
    state.timedOut = false;
    state.lastError = null;
    return performance.now();
  }

  function finishBackgroundOperation(state, startedAt, error = null) {
    state.running = false;
    state.lastFinishedAt = nowIso();
    state.lastDurationMs = Math.round((performance.now() - startedAt) * 10) / 10;
    state.lastError = error?.message || null;
  }

  function trackBackgroundTask(taskFactory) {
    const task = Promise.resolve().then(taskFactory);
    backgroundTasks.add(task);
    task.then(
      () => backgroundTasks.delete(task),
      () => backgroundTasks.delete(task)
    );
    return task;
  }

  function backgroundOperationsSnapshot() {
    return {
      upstream: {
        active: activeUpstreamRequestCount(),
        max: MAX_CONCURRENT_UPSTREAM_REQUESTS
      },
      academicRefresh: {
        ...academicRefreshOperation,
        concurrency: ACADEMIC_REFRESH_CONCURRENCY,
        maxRuntimeMs: ACADEMIC_REFRESH_MAX_RUNTIME_MS,
        userScanLimit: BACKGROUND_USER_SCAN_LIMIT
      },
      academicReminders: {
        ...academicReminderOperation,
        cacheConcurrency: ACADEMIC_REMINDER_CACHE_CONCURRENCY,
        enqueueConcurrency: ACADEMIC_REMINDER_ENQUEUE_CONCURRENCY,
        maxRuntimeMs: ACADEMIC_REMINDER_MAX_RUNTIME_MS,
        userScanLimit: BACKGROUND_USER_SCAN_LIMIT,
        batchSize: CAMPUS_REMINDER_BATCH_SIZE
      },
      academicEvaluations: academicEvaluationAutoCapacitySnapshot(),
      trackedTasks: backgroundTasks.size + academicEvaluationAutoTasks.size
    };
  }

  async function hasAcademicRefreshSession() {
    const jar = await readSessionJar();
    return Boolean(
      cookieHeaderFor(jar, ACADEMIC_TIMETABLE_SOURCES.current.payloadUrl)
      || cookieHeaderFor(jar, `${CAS_ORIGIN}/cas/login`)
    );
  }

  async function refreshAcademicTimetableInBackground(reason) {
    if (isShuttingDown()) return;
    if (academicAutoRefreshRunning) {
      academicRefreshOperation.skippedRuns += 1;
      return;
    }
    academicAutoRefreshRunning = true;
    const startedAt = beginBackgroundOperation(academicRefreshOperation, reason);
    let operationError = null;
    try {
      const checkpoint = await repository.getBackgroundCheckpoint("academic-refresh") || {};
      const rows = await repository.listActiveUsers({
        afterId: checkpoint.afterId || "", limit: BACKGROUND_USER_SCAN_LIMIT + 1
      });
      const users = rows.slice(0, BACKGROUND_USER_SCAN_LIMIT);
      const deadline = Date.now() + ACADEMIC_REFRESH_MAX_RUNTIME_MS;
      academicRefreshOperation.scanned = users.length;
      academicRefreshOperation.truncated = Math.max(0, rows.length - users.length);
      const outcomes = await mapWithConcurrency(users, ACADEMIC_REFRESH_CONCURRENCY, (user) => (
        userContextStorage.run({ requestId: `job-${randomUUID()}`, user }, async () => {
          try {
            if (isShuttingDown() || Date.now() >= deadline) return "timed_out";
            await reloginSchoolSessionIfWanted({ message: "academic auto refresh" });
            if (!(await hasAcademicRefreshSession())) return;
            const timetable = await withAcademicSessionLock(
              () => getAcademicTimetable(ACADEMIC_TIMETABLE_SOURCES.current)
            );
            const sessions = timetable.stats?.arrangedSessions ?? timetable.courses?.length ?? 0;
            if (timetable.live === false) {
              logger.warn("academic_refresh_used_cache", {
                reason,
                userId: user.id,
                staleReason: timetable.staleReason || "live sync failed"
              });
            } else if (reason !== "interval") {
              logger.info("academic_refresh_completed", { reason, userId: user.id, sessions });
            }
            return "completed";
          } catch (error) {
            logger.warn("academic_refresh_failed", { reason, userId: user.id, error });
            if (isCasLoginRequiredError(error)) {
              try {
                const recovered = await recoverSchoolSessionAfterAuthError(error);
                if (recovered) {
                  const retried = await withAcademicSessionLock(
                    () => getAcademicTimetable(ACADEMIC_TIMETABLE_SOURCES.current)
                  );
                  if (retried.live === false) {
                    logger.warn("academic_refresh_used_cache", {
                      reason,
                      userId: user.id,
                      staleReason: retried.staleReason || "live sync failed after relogin"
                    });
                  } else {
                    logger.info("academic_refresh_completed_after_relogin", { reason, userId: user.id });
                  }
                  return "completed";
                }
              } catch (retryError) {
                logger.warn("academic_refresh_failed_after_relogin", { reason, userId: user.id, error: retryError });
              }
            }
            return "failed";
          }
        })
      ));
      academicRefreshOperation.completed = outcomes.filter((outcome) => outcome === "completed").length;
      academicRefreshOperation.failed = outcomes.filter((outcome) => outcome === "failed").length;
      academicRefreshOperation.skipped = outcomes.filter((outcome) => !outcome || outcome === "timed_out").length;
      academicRefreshOperation.timedOut = outcomes.includes("timed_out");
      const firstUnprocessed = outcomes.indexOf("timed_out");
      const handled = firstUnprocessed < 0 ? users.length : firstUnprocessed;
      const afterId = handled > 0 ? users[handled - 1].id : checkpoint.afterId || "";
      await repository.saveBackgroundCheckpoint("academic-refresh", {
        afterId: handled === users.length && rows.length <= BACKGROUND_USER_SCAN_LIMIT ? "" : afterId
      });
    } catch (error) {
      operationError = error;
      logger.warn("academic_refresh_scan_failed", { reason, error });
    } finally {
      academicAutoRefreshRunning = false;
      finishBackgroundOperation(academicRefreshOperation, startedAt, operationError);
    }
  }

  function startAcademicAutoRefresh() {
    if (!Number.isFinite(ACADEMIC_AUTO_REFRESH_MS) || ACADEMIC_AUTO_REFRESH_MS <= 0) return;
    academicRefreshStartTimer = setTimeout(
      () => trackBackgroundTask(() => refreshAcademicTimetableInBackground("startup")),
      Math.max(0, ACADEMIC_AUTO_REFRESH_START_DELAY_MS)
    );
    academicRefreshInterval = setInterval(
      () => trackBackgroundTask(() => refreshAcademicTimetableInBackground("interval")),
      ACADEMIC_AUTO_REFRESH_MS
    );
  }

  async function enqueueUpcomingAcademicReminders(reason) {
    if (isShuttingDown()) return;
    if (academicReminderRunning) {
      academicReminderOperation.skippedRuns += 1;
      return;
    }
    academicReminderRunning = true;
    let queued = 0;
    let deduplicated = 0;
    const startedAt = beginBackgroundOperation(academicReminderOperation, reason);
    let operationError = null;
    try {
      const now = new Date();
      const horizon = new Date(now.getTime() + CAMPUS_REMINDER_HORIZON_HOURS * 60 * 60 * 1000);
      const deadline = Date.now() + ACADEMIC_REMINDER_MAX_RUNTIME_MS;
      const stored = await repository.getBackgroundCheckpoint("academic-reminders") || {};
      let { retries: storedRetries = [], ...checkpoint } = stored;
      const occurrenceKey = (occurrence) => `${occurrence.startAt.toISOString()}|${occurrence.id}`;
      const retryKey = (userId, occurrence) => `${userId}|${occurrenceKey(occurrence)}`;
      const retries = new Map(storedRetries
        .filter((entry) => new Date(entry.occurrence.startAt) > now)
        .map((entry) => [entry.key, entry]));
      const shouldStop = () => isShuttingDown() || Date.now() >= deadline;
      const attemptedKeys = new Set();
      let attemptsUsed = 0;
      const saveProgress = async () => {
        academicReminderOperation.queued = queued;
        academicReminderOperation.deduplicated = deduplicated;
        academicReminderOperation.completed = queued + deduplicated;
        academicReminderOperation.retryPending = [...retries.values()].filter((entry) => entry.attempts < ACADEMIC_REMINDER_MAX_ENQUEUE_ATTEMPTS).length;
        academicReminderOperation.retryExhausted = retries.size - academicReminderOperation.retryPending;
        await repository.saveBackgroundCheckpoint("academic-reminders", { ...checkpoint, retries: [...retries.values()] });
      };
      const enqueue = async (preference, occurrence, previous = null) => {
        if (shouldStop()) return "timed_out";
        const key = retryKey(preference.user_id, occurrence);
        if (occurrence.startAt.getTime() <= Date.now()) {
          retries.delete(key);
          academicReminderOperation.skipped += 1;
          return "skipped";
        }
        attemptedKeys.add(key);
        attemptsUsed += 1;
        try {
          const delivery = buildCourseReminderDelivery(preference, occurrence, new Date());
          const requestId = `campus-reminder-${randomUUID()}`;
          const result = delivery.kind === "canonical"
            ? await sendCampusNotification(delivery.payload, { requestId })
            : await enqueueCampusNotification(delivery.payload, { requestId });
          retries.delete(key);
          if (result.deduplicated) deduplicated += 1;
          else queued += 1;
          return "completed";
        } catch (error) {
          const attempts = (previous?.attempts || 0) + 1;
          retries.set(key, {
            key, userId: preference.user_id, occurrence, attempts,
            retryAt: Date.now() + ACADEMIC_REMINDER_RETRY_DELAY_MS * 2 ** (attempts - 1)
          });
          academicReminderOperation.failed += 1;
          logger.warn("academic_reminder_enqueue_failed", { reason, userId: preference.user_id, courseId: occurrence.id, attempts, error });
          return "failed";
        }
      };

      // Reserve part of each run for new users while retrying failed enqueue requests.
      const dueRetries = [...retries.values()]
        .filter((entry) => entry.attempts < ACADEMIC_REMINDER_MAX_ENQUEUE_ATTEMPTS && entry.retryAt <= Date.now())
        .sort((a, b) => a.retryAt - b.retryAt)
        .slice(0, Math.max(1, Math.floor(CAMPUS_REMINDER_BATCH_SIZE / 2)));
      await mapWithConcurrency(dueRetries, ACADEMIC_REMINDER_ENQUEUE_CONCURRENCY, async (entry) => {
        if (shouldStop()) return;
        try {
          const preference = await repository.getReminderPreference(entry.userId);
          if (!preference?.enabled || (!preference.recipient_id && !preference.app_recipient_id)) {
            retries.delete(entry.key);
            return;
          }
          const occurrence = { ...entry.occurrence, startAt: new Date(entry.occurrence.startAt), endAt: new Date(entry.occurrence.endAt) };
          await enqueue(preference, occurrence, entry);
        } catch (error) {
          entry.retryAt = Date.now() + ACADEMIC_REMINDER_RETRY_DELAY_MS;
          academicReminderOperation.failed += 1;
          logger.warn("academic_reminder_retry_read_failed", { reason, userId: entry.userId, error });
        }
      });
      if (storedRetries.length) await saveProgress();

      while (!shouldStop() && attemptsUsed < CAMPUS_REMINDER_BATCH_SIZE && academicReminderOperation.scanned < BACKGROUND_USER_SCAN_LIMIT) {
        // Keep enough retry slots to persist every failure before advancing the scan cursor.
        const capacity = Math.min(CAMPUS_REMINDER_BATCH_SIZE - attemptsUsed, BACKGROUND_USER_SCAN_LIMIT - retries.size);
        if (capacity <= 0) {
          academicReminderOperation.truncated = 1;
          break;
        }
        const pageSize = Math.min(ACADEMIC_REMINDER_CACHE_CONCURRENCY, capacity, BACKGROUND_USER_SCAN_LIMIT - academicReminderOperation.scanned);
        const rows = await repository.listEnabledReminderPreferences({ afterId: checkpoint.afterId || "", limit: pageSize + 1 });
        const preferences = rows.slice(0, pageSize);
        academicReminderOperation.scanned += preferences.length;
        const prepared = await mapWithConcurrency(preferences, ACADEMIC_REMINDER_CACHE_CONCURRENCY, async (preference) => {
          if (shouldStop()) return { preference, occurrences: [], timedOut: true };
          try {
            const timetable = await cachedAcademicTimetableForUser(preference.user_id);
            const occurrences = timetable ? buildCourseOccurrences(timetable, { now, from: now, to: horizon })
              .filter((occurrence) => occurrence.startAt > now && occurrence.startAt <= horizon
                && (preference.user_id !== checkpoint.pendingUserId || occurrenceKey(occurrence) > checkpoint.occurrenceAfter)
                && !retries.has(retryKey(preference.user_id, occurrence))
                && !attemptedKeys.has(retryKey(preference.user_id, occurrence)))
              .sort((a, b) => a.startAt - b.startAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) : [];
            return { preference, occurrences };
          } catch (error) {
            academicReminderOperation.failed += 1;
            logger.warn("academic_reminder_cache_read_failed", { reason, userId: preference.user_id, error });
            return { preference, occurrences: [], error };
          }
        });
        const candidates = [];
        for (const { preference, occurrences, timedOut, error } of prepared) {
          if (timedOut || error) break;
          for (const occurrence of occurrences) {
            if (candidates.length >= capacity) break;
            candidates.push({ preference, occurrence });
          }
          if (candidates.length >= capacity) break;
        }
        const outcomes = await mapWithConcurrency(candidates, ACADEMIC_REMINDER_ENQUEUE_CONCURRENCY,
          ({ preference, occurrence }) => enqueue(preference, occurrence));
        let outcomeIndex = 0;
        let handledUsers = 0;
        for (const { preference, occurrences, timedOut, error } of prepared) {
          if (timedOut || error) break;
          let handledOccurrences = 0;
          for (const occurrence of occurrences) {
            if (!outcomes[outcomeIndex] || outcomes[outcomeIndex] === "timed_out") break;
            outcomeIndex += 1;
            handledOccurrences += 1;
            checkpoint = {
              afterId: checkpoint.afterId || "", pendingUserId: preference.user_id, occurrenceAfter: occurrenceKey(occurrence)
            };
          }
          if (handledOccurrences < occurrences.length) break;
          checkpoint = { afterId: preference.user_id };
          handledUsers += 1;
          if (!occurrences.length) academicReminderOperation.skipped += 1;
        }
        const finishedCycle = handledUsers === preferences.length && rows.length <= pageSize;
        if (finishedCycle) checkpoint = { afterId: "" };
        academicReminderOperation.truncated = rows.length - handledUsers;
        await saveProgress();
        if (finishedCycle || handledUsers < preferences.length) break;
      }
      academicReminderOperation.timedOut = shouldStop();
      if (reason !== "interval" || queued > 0) {
        logger.info("academic_reminder_scan_completed", { reason, queued, deduplicated, users: academicReminderOperation.scanned });
      }
    } catch (error) {
      operationError = error;
      logger.warn("academic_reminder_scan_failed", { reason, error });
    } finally {
      academicReminderRunning = false;
      finishBackgroundOperation(academicReminderOperation, startedAt, operationError);
    }
  }

  function startAcademicReminderScheduler() {
    const configured = Boolean(
      process.env.NOTIFICATION_SERVICE_URL
      && (process.env.CAMPUS_NOTIFICATION_API_KEY || process.env.NOTIFY_API_KEY)
    );
    if (!configured || !Number.isFinite(CAMPUS_REMINDER_INTERVAL_MS) || CAMPUS_REMINDER_INTERVAL_MS <= 0) return;
    academicReminderStartTimer = setTimeout(
      () => trackBackgroundTask(() => enqueueUpcomingAcademicReminders("startup")),
      Math.max(0, CAMPUS_REMINDER_START_DELAY_MS)
    );
    academicReminderInterval = setInterval(
      () => trackBackgroundTask(() => enqueueUpcomingAcademicReminders("interval")),
      CAMPUS_REMINDER_INTERVAL_MS
    );
  }

  function libroomAutoReservationSchedulerEnabled() {
    return Number.isFinite(LIBROOM_AUTO_RESERVATION_INTERVAL_MS) && LIBROOM_AUTO_RESERVATION_INTERVAL_MS > 0;
  }

  function scheduleLibroomAutoReservationScan(reason, delayMs) {
    if (isShuttingDown() || !libroomAutoReservationSchedulerEnabled()) return;
    if (libroomAutoReservationTimer) clearTimeout(libroomAutoReservationTimer);
    const delay = Math.max(0, Math.trunc(Number(delayMs) || 0));
    libroomAutoReservationTimer = setTimeout(() => {
      libroomAutoReservationTimer = null;
      trackBackgroundTask(() => runLibroomAutoReservationScheduler(reason));
    }, delay);
  }

  function wakeLibroomAutoReservationScheduler(reason) {
    if (!libroomAutoReservationSchedulerEnabled()) return;
    if (libroomAutoReservationRunning) {
      libroomAutoReservationRescheduleRequested = true;
      return;
    }
    scheduleLibroomAutoReservationScan(reason, 0);
  }

  async function runLibroomAutoReservationScheduler(reason) {
    if (isShuttingDown()) return;
    if (libroomAutoReservationRunning) {
      libroomAutoReservationRescheduleRequested = true;
      return;
    }
    libroomAutoReservationRunning = true;
    let nextDelayMs = LIBROOM_AUTO_RESERVATION_INTERVAL_MS;
    try {
      let scanned = 0;
      for await (const tasks of iterateTaskPages(repository.listEnabledAutoReservationTasks.bind(repository), {
        batchSize: BACKGROUND_USER_SCAN_LIMIT,
        shouldStop: () => isShuttingDown()
      })) {
        const now = new Date();
        await mapWithConcurrency(groupAutoReservationTasksByUser(tasks), 2, async ([userId, userTasks]) => {
          const user = await repository.findUserById(userId);
          if (!user || user.disabled) return "skipped";
          return userContextStorage.run(
            { requestId: `auto-reservation-${randomUUID()}`, user },
            async () => {
              await reloginSchoolSessionIfWanted({ message: "libroom auto reservation" });
              const statuses = [];
              for (const task of userTasks) {
                const plan = autoReservationRunPlan(task, now);
                if (!["ready", "expired", "invalid"].includes(plan.state)) continue;
                const result = await runAutoReservationTask(task, user, now);
                statuses.push(result?.status || "claimed");
                if (result?.status === "succeeded") break;
              }
              return statuses.length ? statuses.join(",") : "skipped";
            }
          ).catch((error) => {
            logger.warn("libroom_auto_reservation_user_failed", { userId, error });
            return "failed";
          });
        });
        scanned += tasks.length;
        nextDelayMs = Math.min(nextDelayMs, autoReservationNextScanDelay(tasks, new Date(), { fallbackMs: LIBROOM_AUTO_RESERVATION_INTERVAL_MS }));
      }
      if (reason !== "interval" && scanned) {
        logger.info("libroom_auto_reservation_scan_completed", { reason, tasks: scanned });
      }
    } catch (error) {
      logger.warn("libroom_auto_reservation_scan_failed", { reason, error });
    } finally {
      libroomAutoReservationRunning = false;
      const delay = libroomAutoReservationRescheduleRequested ? 0 : nextDelayMs;
      libroomAutoReservationRescheduleRequested = false;
      scheduleLibroomAutoReservationScan("interval", delay);
    }
  }

  function startLibroomAutoReservationScheduler() {
    if (!libroomAutoReservationSchedulerEnabled()) return;
    scheduleLibroomAutoReservationScan("startup", Math.max(0, LIBROOM_AUTO_RESERVATION_START_DELAY_MS));
  }

  function librarySeatWaitlistSchedulerEnabled() {
    return Number.isFinite(LIBRARY_SEAT_WAITLIST_FAST_INTERVAL_MS) && LIBRARY_SEAT_WAITLIST_FAST_INTERVAL_MS > 0;
  }

  function scheduleLibrarySeatWaitlistScan(reason, delayMs) {
    if (isShuttingDown() || !librarySeatWaitlistSchedulerEnabled()) return;
    if (librarySeatWaitlistTimer) clearTimeout(librarySeatWaitlistTimer);
    const delay = Math.max(0, Math.trunc(Number(delayMs) || 0));
    librarySeatWaitlistTimer = setTimeout(() => {
      librarySeatWaitlistTimer = null;
      trackBackgroundTask(() => runLibrarySeatWaitlistScheduler(reason));
    }, delay);
  }

  function wakeLibrarySeatWaitlistScheduler(reason) {
    if (!librarySeatWaitlistSchedulerEnabled()) return;
    if (librarySeatWaitlistRunning) {
      librarySeatWaitlistRescheduleRequested = true;
      return;
    }
    scheduleLibrarySeatWaitlistScan(reason, 0);
  }

  async function runLibrarySeatWaitlistScheduler(reason) {
    if (isShuttingDown()) return;
    if (librarySeatWaitlistRunning) {
      librarySeatWaitlistRescheduleRequested = true;
      return;
    }
    librarySeatWaitlistRunning = true;
    let nextDelayMs = LIBRARY_SEAT_WAITLIST_SLOW_INTERVAL_MS;
    try {
      let scanned = 0;
      for await (const tasks of iterateTaskPages(repository.listEnabledLibrarySeatWaitlists.bind(repository), {
        batchSize: BACKGROUND_USER_SCAN_LIMIT,
        shouldStop: () => isShuttingDown()
      })) {
        const now = new Date();
        await mapWithConcurrency(tasks, 2, async (task) => {
          const plan = librarySeatWaitlistRunPlan(task, now);
          const user = await repository.findUserById(task.user_id);
          if (!user || user.disabled) {
            if (plan.expired) {
              await repository.finishLibrarySeatWaitlist(task.user_id, task.id, {
                status: "expired",
                message: "候补时段已结束，未能预约成功。",
                areaName: null,
                seatId: null,
                seatLabel: null
              }, now.toISOString());
            }
            return "skipped";
          }
          return userContextStorage.run(
            { requestId: `library-seat-waitlist-${randomUUID()}`, user },
            async () => {
              try {
                await reloginSchoolSessionIfWanted({ message: "library seat waitlist" });
                const result = await runLibrarySeatWaitlistTask(task, user, now);
                return result?.status || "claimed";
              } catch (error) {
                const failures = Number(task.consecutive_failures || 0) + 1;
                const message = librarySeatWaitlistFailureText(error);
                const timestamp = now.toISOString();
                if (failures >= LIBRARY_SEAT_WAITLIST_MAX_FAILURES) {
                  const result = {
                    status: "failed",
                    message: `候补已停止：${message}`,
                    areaName: null,
                    seatId: null,
                    seatLabel: null
                  };
                  await repository.finishLibrarySeatWaitlist(user.id, task.id, result, timestamp);
                  await notifyLibrarySeatWaitlist(user, task, result).catch((notifyError) => {
                    logger.warn("library_seat_waitlist_notify_failed", { taskId: task.id, error: notifyError?.message });
                  });
                } else {
                  await repository.updateLibrarySeatWaitlist(user.id, task.id, {
                    status: "listening",
                    last_message: `第 ${failures} 次检测失败：${message}`,
                    consecutive_failures: failures,
                    last_run_at: timestamp
                  }, timestamp);
                }
                logger.warn("library_seat_waitlist_scan_task_failed", { userId: user.id, taskId: task.id, failures });
                return "failed";
              }
            }
          );
        });
        scanned += tasks.length;
        nextDelayMs = Math.min(nextDelayMs, librarySeatWaitlistNextScanDelay(tasks, new Date(), {
          fastMs: LIBRARY_SEAT_WAITLIST_FAST_INTERVAL_MS,
          mediumMs: LIBRARY_SEAT_WAITLIST_MEDIUM_INTERVAL_MS,
          slowMs: LIBRARY_SEAT_WAITLIST_SLOW_INTERVAL_MS,
          hotWindowMs: LIBRARY_SEAT_WAITLIST_HOT_WINDOW_MS,
          mediumWindowMs: LIBRARY_SEAT_WAITLIST_MEDIUM_WINDOW_MS
        }));
      }
      if (reason !== "interval" && scanned) {
        logger.info("library_seat_waitlist_scan_completed", { reason, tasks: scanned });
      }
    } catch (error) {
      logger.warn("library_seat_waitlist_scan_failed", { reason, error: error?.message });
    } finally {
      librarySeatWaitlistRunning = false;
      const delay = librarySeatWaitlistRescheduleRequested ? 0 : nextDelayMs;
      librarySeatWaitlistRescheduleRequested = false;
      scheduleLibrarySeatWaitlistScan("interval", delay);
    }
  }

  function startLibrarySeatWaitlistScheduler() {
    if (!librarySeatWaitlistSchedulerEnabled()) return;
    scheduleLibrarySeatWaitlistScan("startup", Math.max(0, LIBRARY_SEAT_WAITLIST_START_DELAY_MS));
  }
  return {
    backgroundTasks,
    stopBackgroundSchedulers,
    backgroundOperationsSnapshot,
    startAcademicAutoRefresh,
    startAcademicReminderScheduler,
    wakeLibroomAutoReservationScheduler,
    startLibroomAutoReservationScheduler,
    wakeLibrarySeatWaitlistScheduler,
    startLibrarySeatWaitlistScheduler
  };
}
