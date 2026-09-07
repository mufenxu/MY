export async function handleAcademicRoutes(req, res, url, {
  academicEvaluationAutoStatus,
  academicIntegrationSettings,
  academicTimetableSourceFromSearch,
  currentUserId,
  decodeBoundedPathSegment,
  freeClassroomQueryFromSearch,
  getAcademicEvaluationDraft,
  getAcademicEvaluations,
  getAcademicGpa,
  getAcademicTimetable,
  getFreeClassrooms,
  json,
  logger,
  nowIso,
  platformUserId,
  readBodyJson,
  repository,
  rotateAcademicCalendarSubscription,
  saveAcademicReminderPreference,
  startAcademicEvaluationAutoJob,
  stopAcademicEvaluationAutoJob,
  submitAcademicEvaluation,
  withAcademicSessionLock
}) {
  if (url.pathname === "/api/academic/timetable") {
    const source = academicTimetableSourceFromSearch(url.searchParams);
    json(res, 200, { ok: true, data: await withAcademicSessionLock(() => getAcademicTimetable(source)) });
    return true;
  }
  if (url.pathname === "/api/academic/integrations" && req.method === "GET") {
    json(res, 200, { ok: true, data: await academicIntegrationSettings(currentUserId()) });
    return true;
  }
  if (url.pathname === "/api/academic/calendar/rotate" && req.method === "POST") {
    const data = await rotateAcademicCalendarSubscription(currentUserId());
    logger.info("audit_academic_calendar_rotated", { actorUserId: currentUserId() });
    json(res, 201, { ok: true, data });
    return true;
  }
  if (url.pathname === "/api/academic/calendar" && req.method === "DELETE") {
    await repository.disableCalendarSubscription(currentUserId(), nowIso());
    logger.info("audit_academic_calendar_disabled", { actorUserId: currentUserId() });
    json(res, 200, { ok: true, data: await academicIntegrationSettings(currentUserId()) });
    return true;
  }
  if (url.pathname === "/api/academic/reminder" && req.method === "PUT") {
    const body = await readBodyJson(req);
    const data = await saveAcademicReminderPreference(currentUserId(), body, platformUserId);
    logger.info("audit_academic_reminder_updated", {
      actorUserId: currentUserId(),
      enabled: data.enabled,
      leadMinutes: data.leadMinutes
    });
    json(res, 200, { ok: true, data });
    return true;
  }
  if (url.pathname === "/api/academic/gpa") {
    json(res, 200, { ok: true, data: await withAcademicSessionLock(() => getAcademicGpa()) });
    return true;
  }
  if (url.pathname === "/api/academic/free-classrooms") {
    const query = freeClassroomQueryFromSearch(url.searchParams);
    json(res, 200, { ok: true, data: await withAcademicSessionLock(() => getFreeClassrooms(query)) });
    return true;
  }
  if (url.pathname === "/api/academic/evaluations" && req.method === "GET") {
    json(res, 200, { ok: true, data: await withAcademicSessionLock(() => getAcademicEvaluations()) });
    return true;
  }
  if (url.pathname === "/api/academic/evaluations/auto" && req.method === "GET") {
    json(res, 200, { ok: true, data: academicEvaluationAutoStatus() });
    return true;
  }
  if (url.pathname === "/api/academic/evaluations/auto/start" && req.method === "POST") {
    const body = await readBodyJson(req);
    const result = startAcademicEvaluationAutoJob(body);
    logger.info(result.reused ? "audit_academic_evaluation_auto_reused" : "audit_academic_evaluation_auto_started", {
      actorUserId: currentUserId(),
      jobId: result.id
    });
    json(res, 202, { ok: true, data: result });
    return true;
  }
  if (url.pathname === "/api/academic/evaluations/auto/stop" && req.method === "POST") {
    const result = stopAcademicEvaluationAutoJob();
    logger.info("audit_academic_evaluation_auto_stop_requested", { actorUserId: currentUserId(), jobId: result.id || null });
    json(res, 200, { ok: true, data: result });
    return true;
  }
  const evaluationMatch = url.pathname.match(/^\/api\/academic\/evaluations\/([^/]+)(?:\/(submit))?$/);
  if (evaluationMatch && req.method === "GET" && !evaluationMatch[2]) {
    const lessonId = decodeBoundedPathSegment(evaluationMatch[1], "教学评估课程编号", 100);
    json(res, 200, { ok: true, data: await withAcademicSessionLock(() => getAcademicEvaluationDraft(lessonId)) });
    return true;
  }
  if (evaluationMatch && req.method === "POST" && evaluationMatch[2] === "submit") {
    const body = await readBodyJson(req);
    const result = await withAcademicSessionLock(() => submitAcademicEvaluation(body));
    logger.info("audit_academic_evaluation_submitted", { actorUserId: currentUserId() });
    json(res, 200, { ok: true, data: result });
    return true;
  }
  return false;
}
