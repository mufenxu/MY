import { createHash } from "node:crypto";

export const LIBRARY_SEAT_REMINDER_KINDS = Object.freeze({
  CHECK_IN_SOON: "check_in_soon",
  CHECK_IN_OVERDUE: "check_in_overdue",
  ENDING_SOON: "ending_soon",
  AWAY_OVERDUE: "away_overdue"
});

const DEFAULT_OPTIONS = Object.freeze({
  checkInLeadMinutes: 15,
  checkInGraceMinutes: 20,
  endingLeadMinutes: 10,
  awayMinutes: 30
});

function stringValue(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function clockOf(value) {
  const match = stringValue(value).match(/(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function librarySeatDateTime(date, time) {
  const dateMatch = stringValue(date).replace(/\//g, "-").match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const clock = clockOf(time);
  if (!dateMatch || !clock) return null;
  const stamp = Date.UTC(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(clock.slice(0, 2)) - 8,
    Number(clock.slice(3))
  );
  return Number.isFinite(stamp) ? new Date(stamp) : null;
}

function positiveMinutes(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function librarySeatReminderPlan(usage, now = new Date(), options = {}) {
  if (!usage || typeof usage !== "object") return [];
  const status = stringValue(usage.status).toUpperCase();
  const reservationId = stringValue(usage.id);
  const date = stringValue(usage.date);
  const startTime = clockOf(usage.startTime);
  const endTime = clockOf(usage.endTime);
  const base = {
    reservationId,
    date,
    startTime,
    endTime,
    seatLabel: stringValue(usage.seatLabel || usage.seatNo),
    location: [stringValue(usage.buildName), stringValue(usage.floorName), stringValue(usage.roomName)]
      .filter(Boolean)
      .join(" ")
  };
  const current = (now instanceof Date ? now : new Date(now)).getTime();
  if (!Number.isFinite(current)) return [];
  const minutesBetween = (from, to) => Math.max(0, Math.round((to - from) / 60_000));
  const reminders = [];

  if (status === "RESERVE") {
    const startAt = librarySeatDateTime(date, startTime);
    if (startAt) {
      const checkInLeadMinutes = positiveMinutes(options.checkInLeadMinutes, DEFAULT_OPTIONS.checkInLeadMinutes);
      const checkInGraceMinutes = positiveMinutes(options.checkInGraceMinutes, DEFAULT_OPTIONS.checkInGraceMinutes);
      const untilStart = startAt.getTime() - current;
      if (untilStart > 0 && untilStart <= checkInLeadMinutes * 60_000) {
        reminders.push({
          ...base,
          kind: LIBRARY_SEAT_REMINDER_KINDS.CHECK_IN_SOON,
          dedupeKey: `${reservationId}|${date}|${startTime}|check_in_soon`,
          title: "座位即将开始",
          summary: `${minutesBetween(current, startAt.getTime())} 分钟后开始，请及时签到`,
          priority: "normal"
        });
      } else if (untilStart <= 0 && -untilStart <= checkInGraceMinutes * 60_000) {
        reminders.push({
          ...base,
          kind: LIBRARY_SEAT_REMINDER_KINDS.CHECK_IN_OVERDUE,
          dedupeKey: `${reservationId}|${date}|${startTime}|check_in_overdue`,
          title: "座位还未签到",
          summary: "已过开始时间仍未签到，请立即签到，避免记为失约",
          priority: "high"
        });
      }
    }
  }

  if (status === "CHECK_IN") {
    const endAt = librarySeatDateTime(date, endTime);
    const endingLeadMinutes = positiveMinutes(options.endingLeadMinutes, DEFAULT_OPTIONS.endingLeadMinutes);
    if (endAt && endingLeadMinutes > 0) {
      const untilEnd = endAt.getTime() - current;
      if (untilEnd > 0 && untilEnd <= endingLeadMinutes * 60_000) {
        reminders.push({
          ...base,
          kind: LIBRARY_SEAT_REMINDER_KINDS.ENDING_SOON,
          dedupeKey: `${reservationId}|${date}|${endTime}|ending_soon`,
          title: "座位即将结束",
          summary: `${minutesBetween(current, endAt.getTime())} 分钟后结束，请按时签退`,
          priority: "normal"
        });
      }
    }
  }

  if (status === "AWAY") {
    const awayMinutes = positiveMinutes(options.awayMinutes, DEFAULT_OPTIONS.awayMinutes);
    const awayStart = librarySeatDateTime(date, clockOf(usage.awayRange));
    if (awayStart) {
      const awayFor = current - awayStart.getTime();
      if (awayFor >= awayMinutes * 60_000) {
        reminders.push({
          ...base,
          kind: LIBRARY_SEAT_REMINDER_KINDS.AWAY_OVERDUE,
          dedupeKey: `${reservationId}|${date}|${clockOf(usage.awayRange)}|away_overdue`,
          title: "暂离时间较长",
          summary: `已暂离 ${minutesBetween(awayStart.getTime(), current)} 分钟，请及时返回签到`,
          priority: "high"
        });
      }
    }
  }

  return reminders;
}

export function buildLibrarySeatReminderPayload(reminder, { appId = "", wecomId = "" } = {}) {
  const appRecipientId = stringValue(appId);
  if (!reminder || !appRecipientId) return null;
  const wecomRecipientId = stringValue(wecomId);
  const identity = createHash("sha256")
    .update(`${appRecipientId}|${reminder.dedupeKey}`)
    .digest("hex")
    .slice(0, 48);
  const dedupeKey = `campus-library-seat-${identity}`;
  const items = [];
  if (reminder.seatLabel) items.push({ key: "座位", value: `${reminder.seatLabel} 号` });
  if (reminder.location) items.push({ key: "地点", value: reminder.location });
  if (reminder.startTime && reminder.endTime) {
    items.push({ key: "时段", value: `${reminder.startTime} - ${reminder.endTime}` });
  }
  return {
    idempotencyKey: dedupeKey,
    audience: { users: [appRecipientId] },
    channels: wecomRecipientId ? ["app", "wecom"] : ["app"],
    priority: reminder.priority === "high" ? "high" : "normal",
    category: "campus.library-seat.reminder",
    content: {
      kind: "text",
      title: reminder.title,
      summary: reminder.summary,
      ...(items.length ? { blocks: [{ type: "keyValue", items }] } : {})
    },
    source: {
      service: "campus-service",
      entityType: "librarySeatReservation",
      entityId: reminder.dedupeKey
    },
    actions: [{
      id: "open-library-seat-reservation",
      label: "查看我的座位",
      deepLink: "mycontrol://open?destination=library-seat-reservation"
    }],
    dedupeKey,
    dedupeWindowSeconds: 3600,
    maxAttempts: 3,
    ...(wecomRecipientId ? { wecom: { touser: wecomRecipientId } } : {})
  };
}
