export async function handleLibroomRoutes(req, res, url, {
  HttpError,
  autoReservationTaskPublic,
  currentUserId,
  getLibroomOfficialLoginUrl,
  getLibroomOfficialWebViewLogin,
  json,
  libroomClient,
  libroomDate,
  libroomSpaceId,
  logger,
  normalizeLibroomMyReservationRecord,
  normalizeReservationInput,
  readBodyJson,
  readSessionJar,
  redirect,
  repository,
  saveAutoReservationTask,
  saveSessionJar,
  summarizeLibroomAvailability,
  wakeLibroomAutoReservationScheduler
}) {
  const autoReservationPath = url.pathname.match(/^\/api\/campus\/libroom\/auto-reservations(?:\/([^/]+))?$/);
  if (autoReservationPath) {
    const userId = currentUserId();
    const taskId = autoReservationPath[1] ? decodeURIComponent(autoReservationPath[1]) : "";
    if (req.method === "GET" && !taskId) {
      json(res, 200, { ok: true, data: (await repository.listAutoReservationTasks(userId)).map(autoReservationTaskPublic) });
      return true;
    }
    if (req.method === "POST" && !taskId) {
      const body = await readBodyJson(req);
      const data = await saveAutoReservationTask(userId, body);
      wakeLibroomAutoReservationScheduler("task_changed");
      json(res, 201, { ok: true, data });
      return true;
    }
    if (!taskId) throw new HttpError(400, "自动预约任务标识不正确。", null, "INVALID_AUTO_RESERVATION_ID");
    const existing = await repository.getAutoReservationTask(userId, taskId);
    if (!existing) throw new HttpError(404, "自动预约任务不存在。", null, "AUTO_RESERVATION_NOT_FOUND");
    if (req.method === "PUT") {
      const body = await readBodyJson(req);
      const data = await saveAutoReservationTask(userId, { ...existing, ...body }, existing);
      wakeLibroomAutoReservationScheduler("task_changed");
      json(res, 200, { ok: true, data });
      return true;
    }
    if (req.method === "DELETE") {
      await repository.deleteAutoReservationTask(userId, taskId);
      wakeLibroomAutoReservationScheduler("task_changed");
      json(res, 200, { ok: true, data: null });
      return true;
    }
  }
  if (url.pathname === "/api/campus/libroom/official-login" && req.method === "GET") {
    redirect(res, await getLibroomOfficialLoginUrl());
    return true;
  }
  if (url.pathname === "/api/campus/libroom/official-webview-login" && req.method === "GET") {
    json(res, 200, { ok: true, data: await getLibroomOfficialWebViewLogin() });
    return true;
  }
  if (url.pathname === "/api/campus/libroom/spaces" && req.method === "GET") {
    const date = url.searchParams.get("date") || "";
    const startTime = url.searchParams.get("startTime") || url.searchParams.get("start_time") || "";
    const endTime = url.searchParams.get("endTime") || url.searchParams.get("end_time") || "";
    const client = await libroomClient();

    let spaces = [];
    if (date && startTime && endTime) {
      try {
        spaces = await client.listSpaces({ date, start_time: startTime, end_time: endTime });
      } catch (err) {
        logger.warn("libroom_list_spaces_time_query_failed", { error: err?.message });
      }
      if (!Array.isArray(spaces) || spaces.length === 0) {
        spaces = await client.listSpaces({ date });
      }
    } else {
      spaces = await client.listSpaces({});
    }

    if (date && startTime && endTime && Array.isArray(spaces) && spaces.length > 0) {
      const checkAvailability = async (space) => {
        const spaceId = space?.id ?? space?.area_id ?? space?.areaId;
        if (!spaceId) return null;
        try {
          let avail = summarizeLibroomAvailability(space, { date });
          if (avail?.source === "unrecognized") {
            avail = await client.getAvailability({ spaceId, date });
          }
          const freeWindows = avail?.freeWindows || [];
          const busyWindows = avail?.busyWindows || [];

          const isFree = freeWindows.some((w) => String(w.start || "") <= startTime && String(w.end || "") >= endTime) &&
            !busyWindows.some((b) => !(String(b.end || "") <= startTime || String(b.start || "") >= endTime));

          if (isFree) {
            return { ...space, availability: avail };
          }
          return null;
        } catch {
          return null;
        }
      };

      const results = await Promise.all(spaces.map(checkAvailability));
      const availableSpaces = results.filter(Boolean);
      json(res, 200, { ok: true, data: availableSpaces });
      return true;
    }

    json(res, 200, { ok: true, data: spaces });
    return true;
  }
  if (url.pathname === "/api/campus/libroom/rules" && req.method === "GET") {
    const client = await libroomClient();
    json(res, 200, { ok: true, data: await client.getRules() });
    return true;
  }
  if (url.pathname === "/api/campus/libroom/availability" && req.method === "GET") {
    const spaceId = libroomSpaceId(url.searchParams.get("spaceId"));
    const date = libroomDate(url.searchParams.get("date"));
    const client = await libroomClient();
    const availability = await client.getAvailability({ spaceId, date });
    json(res, 200, { ok: true, data: { date, availability } });
    return true;
  }
  if (url.pathname === "/api/campus/libroom/reservations" && req.method === "GET") {
    const client = await libroomClient();
    const records = await client.getMyReservations({});
    const normalized = records
      .map((record) => normalizeLibroomMyReservationRecord(record))
      .filter(Boolean)
      .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.startTime || "").localeCompare(a.startTime || ""));
    json(res, 200, { ok: true, data: normalized });
    return true;
  }
  const cancelMatch = url.pathname.match(/^\/api\/campus\/libroom\/reservations\/([^/]+)\/cancel$/);
  if ((cancelMatch || url.pathname === "/api/campus/libroom/reservations/cancel") && req.method === "POST") {
    const reservationId = cancelMatch ? cancelMatch[1] : (url.searchParams.get("id") || (await readBodyJson(req)).id);
    const client = await libroomClient();
    try {
      await client.cancelReservation(reservationId);
    } catch (err) {
      logger.warn("libroom_cancel_upstream_failed", { error: err?.message, id: reservationId });
    }

    // 从本地会话记录中同步标记为已取消或移除
    const jar = await readSessionJar();
    if (Array.isArray(jar.meta?.libroom_my_reservations)) {
      jar.meta.libroom_my_reservations = jar.meta.libroom_my_reservations.filter((item) => String(item.id) !== String(reservationId));
      await saveSessionJar(jar).catch(() => {});
    }

    logger.info("audit_libroom_reservation_cancelled", {
      actorUserId: currentUserId(),
      reservationId
    });
    json(res, 200, { ok: true, data: { success: true } });
    return true;
  }
  if (url.pathname === "/api/campus/libroom/reservations" && req.method === "POST") {
    const body = await readBodyJson(req);
    const normalized = normalizeReservationInput(body);
    const client = await libroomClient();
    const result = await client.submitReservation(body);

    logger.info("audit_libroom_reservation_submitted", {
      actorUserId: currentUserId(),
      areaId: normalized.payload.area_id,
      date: normalized.date,
      startTime: normalized.startTime,
      endTime: normalized.endTime
    });
    json(res, 201, { ok: true, data: result });
    return true;
  }
  return false;
}
