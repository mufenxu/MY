export async function handleLibrarySeatRoutes(req, res, url, {
  HttpError,
  currentUserId,
  getLibrarySeatOfficialWebViewLogin,
  json,
  librarySeatClient,
  librarySeatWaitlistPublic,
  librarySeatWaitlistRequestTargets,
  logger,
  normalizeLibrarySeatReservationInput,
  platformUserId,
  readBodyJson,
  repository,
  saveLibrarySeatWaitlist,
  wakeLibrarySeatReminderScheduler,
  wakeLibrarySeatWaitlistScheduler
}) {
  if (url.pathname === "/api/campus/library-seat/official-webview-login" && req.method === "GET") {
    json(res, 200, { ok: true, data: await getLibrarySeatOfficialWebViewLogin() });
    return true;
  }
  if (url.pathname === "/api/campus/library-seat/overview" && req.method === "GET") {
    const client = await librarySeatClient();
    json(res, 200, { ok: true, data: await client.getOverview() });
    return true;
  }
  if (url.pathname === "/api/campus/library-seat/areas" && req.method === "GET") {
    const venueId = url.searchParams.get("venueId") || url.searchParams.get("buildingId") || "";
    const date = url.searchParams.get("date") || "";
    const startMinute = url.searchParams.get("startMinute") || url.searchParams.get("beginMinute") || "";
    const endMinute = url.searchParams.get("endMinute") || "";
    const floorId = url.searchParams.get("floorId") || "";
    const pageSize = url.searchParams.get("pageSize") || "";
    const currentPage = url.searchParams.get("currentPage") || "";
    const client = await librarySeatClient();
    const data = await client.listAreas({
      venueId,
      date,
      startMinute: Number(startMinute),
      endMinute: endMinute === "" ? "" : Number(endMinute),
      floorId,
      pageSize: pageSize === "" ? undefined : Number(pageSize),
      currentPage: currentPage === "" ? undefined : Number(currentPage),
      power: url.searchParams.get("power") === "true",
      window: url.searchParams.get("window") === "true" || url.searchParams.get("windows") === "true"
    });
    json(res, 200, { ok: true, data });
    return true;
  }
  if (url.pathname === "/api/campus/library-seat/seats" && req.method === "GET") {
    const roomId = url.searchParams.get("roomId") || url.searchParams.get("areaId") || "";
    const date = url.searchParams.get("date") || "";
    const client = await librarySeatClient();
    const data = await client.getSeats({
      roomId,
      date,
      startMinute: Number(url.searchParams.get("startMinute") || 0),
      endMinute: Number(url.searchParams.get("endMinute") || 0),
      amPm: url.searchParams.get("amPm") || ""
    });
    json(res, 200, { ok: true, data });
    return true;
  }
  if (url.pathname === "/api/campus/library-seat/timeline" && req.method === "GET") {
    const client = await librarySeatClient();
    const data = await client.getTimeline({
      seatId: url.searchParams.get("seatId") || url.searchParams.get("id") || "",
      date: url.searchParams.get("date") || ""
    });
    json(res, 200, { ok: true, data });
    return true;
  }
  if (url.pathname === "/api/campus/library-seat/start-times" && req.method === "GET") {
    const client = await librarySeatClient();
    const data = await client.getStartTimes({
      seatId: url.searchParams.get("seatId") || url.searchParams.get("id") || "",
      date: url.searchParams.get("date") || ""
    });
    json(res, 200, { ok: true, data });
    return true;
  }
  if (url.pathname === "/api/campus/library-seat/layout" && req.method === "GET") {
    const client = await librarySeatClient();
    const data = await client.getSeatLayout({
      roomId: url.searchParams.get("roomId") || url.searchParams.get("areaId") || "",
      updV: Number(url.searchParams.get("updV") || url.searchParams.get("version") || 0)
    });
    json(res, 200, { ok: true, data });
    return true;
  }
  if (url.pathname === "/api/campus/library-seat/credit" && req.method === "GET") {
    const client = await librarySeatClient();
    const data = await client.getCreditProfile({
      venueId: url.searchParams.get("venueId") || url.searchParams.get("buildId") || ""
    });
    json(res, 200, { ok: true, data });
    return true;
  }
  if (url.pathname === "/api/campus/library-seat/reservations" && req.method === "GET") {
    const client = await librarySeatClient();
    json(res, 200, { ok: true, data: await client.getMyReservations() });
    return true;
  }
  if (url.pathname === "/api/campus/library-seat/reservations/history" && req.method === "GET") {
    const client = await librarySeatClient();
    const data = await client.getMyReservationHistory({
      page: url.searchParams.get("page"),
      size: url.searchParams.get("size")
    });
    json(res, 200, { ok: true, data });
    return true;
  }
  if (url.pathname === "/api/campus/library-seat/reservations" && req.method === "POST") {
    const body = await readBodyJson(req);
    const normalized = normalizeLibrarySeatReservationInput(body);
    const client = await librarySeatClient();
    const result = await client.submitReservation(body);
    logger.info("audit_library_seat_reservation_submitted", {
      actorUserId: currentUserId(),
      seatId: normalized.seatId,
      date: normalized.date,
      startMinute: normalized.startMinute,
      endMinute: normalized.endMinute
    });
    json(res, 201, { ok: true, data: result });
    return true;
  }
  if (url.pathname === "/api/campus/library-seat/current-use" && req.method === "GET") {
    const client = await librarySeatClient();
    json(res, 200, { ok: true, data: await client.getCurrentUse() });
    return true;
  }
  if (url.pathname === "/api/campus/library-seat/current-use/check-in" && req.method === "POST") {
    const client = await librarySeatClient();
    const data = await client.checkIn();
    wakeLibrarySeatReminderScheduler("checked_in");
    logger.info("audit_library_seat_checked_in", { actorUserId: currentUserId() });
    json(res, 200, { ok: true, data });
    return true;
  }
  if (url.pathname === "/api/campus/library-seat/current-use/leave" && req.method === "POST") {
    const client = await librarySeatClient();
    const data = await client.leaveSeat();
    wakeLibrarySeatReminderScheduler("left_seat");
    logger.info("audit_library_seat_left", { actorUserId: currentUserId() });
    json(res, 200, { ok: true, data });
    return true;
  }
  if (url.pathname === "/api/campus/library-seat/current-use/stop" && req.method === "POST") {
    const client = await librarySeatClient();
    const data = await client.stopSeat();
    wakeLibrarySeatReminderScheduler("stopped_seat");
    logger.info("audit_library_seat_stopped", { actorUserId: currentUserId() });
    json(res, 200, { ok: true, data });
    return true;
  }
  const librarySeatReservationActionPath = url.pathname.match(
    /^\/api\/campus\/library-seat\/reservations\/([^/]+)\/(cancel|life)$/
  );
  if (librarySeatReservationActionPath) {
    const reservationId = decodeURIComponent(librarySeatReservationActionPath[1]);
    const action = librarySeatReservationActionPath[2];
    const client = await librarySeatClient();
    if (action === "cancel" && req.method === "POST") {
      const data = await client.cancelReservation(reservationId);
      wakeLibrarySeatReminderScheduler("reservation_cancelled");
      logger.info("audit_library_seat_reservation_cancelled", {
        actorUserId: currentUserId(),
        reservationId,
        remainingCancelCount: data.remainingCancelCount
      });
      json(res, 200, { ok: true, data });
      return true;
    }
    if (action === "life" && req.method === "GET") {
      json(res, 200, { ok: true, data: await client.getMakeLife(reservationId) });
      return true;
    }
  }
  if (url.pathname === "/api/campus/library-seat/breaches" && req.method === "GET") {
    const client = await librarySeatClient();
    const data = await client.getBreachRecords({
      page: url.searchParams.get("page"),
      size: url.searchParams.get("size")
    });
    json(res, 200, { ok: true, data });
    return true;
  }
  if (url.pathname === "/api/campus/library-seat/door-logs" && req.method === "GET") {
    const client = await librarySeatClient();
    const data = await client.getDoorLog({ date: url.searchParams.get("date") || "" });
    json(res, 200, { ok: true, data });
    return true;
  }
  const librarySeatWaitlistPath = url.pathname.match(/^\/api\/campus\/library-seat\/waitlists(?:\/([^/]+))?$/);
  if (librarySeatWaitlistPath) {
    const userId = currentUserId();
    const taskId = librarySeatWaitlistPath[1] ? decodeURIComponent(librarySeatWaitlistPath[1]) : "";
    if (req.method === "GET" && !taskId) {
      json(res, 200, {
        ok: true,
        data: (await repository.listLibrarySeatWaitlists(userId)).map(librarySeatWaitlistPublic)
      });
      return true;
    }
    if (req.method === "POST" && !taskId) {
      const body = await readBodyJson(req);
      const targets = await librarySeatWaitlistRequestTargets(userId, platformUserId);
      const data = await saveLibrarySeatWaitlist(userId, body, null, targets);
      wakeLibrarySeatWaitlistScheduler("task_changed");
      logger.info("audit_library_seat_waitlist_created", { actorUserId: userId, taskId: data.id });
      json(res, 201, { ok: true, data });
      return true;
    }
    if (!taskId) {
      throw new HttpError(400, "座位候补任务标识不正确。", null, "INVALID_LIBRARY_SEAT_WAITLIST_ID");
    }
    const existing = await repository.getLibrarySeatWaitlist(userId, taskId);
    if (!existing) {
      throw new HttpError(404, "座位候补任务不存在。", null, "LIBRARY_SEAT_WAITLIST_NOT_FOUND");
    }
    if (req.method === "PUT") {
      const body = await readBodyJson(req);
      const data = await saveLibrarySeatWaitlist(userId, { ...existing, ...body }, existing);
      wakeLibrarySeatWaitlistScheduler("task_changed");
      logger.info("audit_library_seat_waitlist_updated", { actorUserId: userId, taskId: data.id, enabled: data.enabled });
      json(res, 200, { ok: true, data });
      return true;
    }
    if (req.method === "DELETE") {
      await repository.deleteLibrarySeatWaitlist(userId, taskId);
      wakeLibrarySeatWaitlistScheduler("task_changed");
      logger.info("audit_library_seat_waitlist_deleted", { actorUserId: userId, taskId });
      json(res, 200, { ok: true, data: null });
      return true;
    }
  }
  return false;
}
