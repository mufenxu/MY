export async function handleLibroomRoutes(req, res, url, {
  HttpError,
  autoReservationTaskPublic,
  currentUserId,
  getLibroomOfficialLoginUrl,
  getLibroomOfficialWebViewLogin,
  json,
  libroomAvailabilityCovers,
  libroomClient,
  libroomDate,
  libroomIsFutureSlot,
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
    // 改期查询可排除指定预约自身占用的时段：该预约会在改期流程中被先取消、再立即重建。
    const excludeReservationId = (url.searchParams.get("excludeReservationId")
      || url.searchParams.get("exclude_reservation_id") || "").trim();
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
      let excludeRecord = null;
      if (excludeReservationId) {
        try {
          excludeRecord = (await client.getMyReservations({ limit: 50 }))
            .map((record) => normalizeLibroomMyReservationRecord(record))
            .find((record) => record && String(record.id) === excludeReservationId) || null;
        } catch (err) {
          logger.warn("libroom_reschedule_exclude_lookup_failed", { error: err?.message });
        }
      }

      const checkAvailability = async (space) => {
        const spaceId = space?.id ?? space?.area_id ?? space?.areaId;
        if (!spaceId) return null;
        try {
          let avail = summarizeLibroomAvailability(space, { date });
          if (avail?.source === "unrecognized") {
            avail = await client.getAvailability({ spaceId, date });
          }
          const excludeWindow = excludeRecord
            && excludeRecord.spaceId > 0
            && excludeRecord.spaceId === Number(spaceId)
            && excludeRecord.date === date
            && excludeRecord.startTime
            && excludeRecord.endTime
            ? { start: excludeRecord.startTime, end: excludeRecord.endTime }
            : null;
          if (libroomAvailabilityCovers(avail, { startTime, endTime, excludeWindow })) {
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
    await client.cancelReservation(reservationId);

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
  const endUseMatch = url.pathname.match(/^\/api\/campus\/libroom\/reservations\/([^/]+)\/end$/);
  if (endUseMatch && req.method === "POST") {
    const reservationId = decodeURIComponent(endUseMatch[1]);
    const client = await libroomClient();
    await client.endReservation(reservationId);

    logger.info("audit_libroom_reservation_ended", {
      actorUserId: currentUserId(),
      reservationId
    });
    json(res, 200, { ok: true, data: { success: true } });
    return true;
  }
  // 学校预约系统没有「修改预约」接口，改期只能按「先取消、再创建」编排：
  // 先确认目标时段空闲，再取消原预约并立即提交新预约，把原预约失效到新预约生效的空窗压到最短。
  const rescheduleMatch = url.pathname.match(/^\/api\/campus\/libroom\/reservations\/([^/]+)\/reschedule$/);
  if (rescheduleMatch && req.method === "POST") {
    const reservationId = decodeURIComponent(rescheduleMatch[1]);
    if (!reservationId) throw new HttpError(400, "预约记录标识不正确。", null, "INVALID_RESERVATION_ID");
    const body = await readBodyJson(req);
    const normalized = normalizeReservationInput(body);
    const client = await libroomClient();

    const previous = (await client.getMyReservations({ limit: 50 }))
      .map((record) => normalizeLibroomMyReservationRecord(record))
      .find((record) => record && String(record.id) === String(reservationId));
    if (!previous) {
      throw new HttpError(404, "未找到可改期的预约记录，请先刷新「已约空间」后重试。", null, "LIBROOM_RESERVATION_NOT_FOUND");
    }
    if (previous.canEndUse) {
      throw new HttpError(409, "该预约已进入使用中状态，只能「结束使用」，无法改期。", null, "LIBROOM_RESERVATION_IN_USE");
    }
    if (!previous.canCancel) {
      throw new HttpError(409, "该预约当前已不可取消，无法改期。", null, "LIBROOM_RESERVATION_NOT_CANCELLABLE");
    }

    const targetAreaId = normalized.payload.area_id;
    const sameSpace = previous.spaceId > 0 && previous.spaceId === targetAreaId;
    const sameDate = Boolean(previous.date) && previous.date === normalized.date;
    if (sameSpace && sameDate
      && previous.startTime === normalized.startTime && previous.endTime === normalized.endTime) {
      throw new HttpError(409, "目标时段与原预约完全相同，无需改期。", null, "LIBROOM_RESCHEDULE_UNCHANGED");
    }
    // 改期会先取消原预约，因此目标时段必须尚未开始，否则取消成功、重建必被拒绝。
    if (!libroomIsFutureSlot({ date: normalized.date, startTime: normalized.startTime })) {
      throw new HttpError(409, "改期目标时段已经开始或已过，原预约未做改动，请选择稍后的时间。", null, "LIBROOM_RESCHEDULE_SLOT_PASSED");
    }

    // 同一研讨间同日改期时，原预约占用的时段会在取消后释放，预检需要排除自身占用。
    const excludeWindow = sameSpace && sameDate && previous.startTime && previous.endTime
      ? { start: previous.startTime, end: previous.endTime }
      : null;
    const availability = await client.getAvailability({ spaceId: targetAreaId, date: normalized.date });
    if (!libroomAvailabilityCovers(availability, {
      startTime: normalized.startTime,
      endTime: normalized.endTime,
      excludeWindow
    })) {
      // 学校接口没有给出可识别的占用轴时不能断言「已被占用」，否则会误导用户。
      const undetermined = availability?.source === "unrecognized"
        || (!(availability?.freeWindows?.length) && !(availability?.busyWindows?.length));
      throw new HttpError(
        409,
        undetermined
          ? "暂时无法确认目标时段是否空闲，原预约未做改动，请稍后重试或改用学校官方预约系统。"
          : "目标时段已被占用，原预约未做改动，请重新选择时间或研讨间。",
        null,
        undetermined ? "LIBROOM_TARGET_SLOT_UNKNOWN" : "LIBROOM_TARGET_SLOT_BUSY"
      );
    }

    await client.cancelReservation(reservationId);
    const jar = await readSessionJar();
    if (Array.isArray(jar.meta?.libroom_my_reservations)) {
      jar.meta.libroom_my_reservations = jar.meta.libroom_my_reservations.filter((item) => String(item.id) !== String(reservationId));
      await saveSessionJar(jar).catch(() => {});
    }

    let result;
    try {
      result = await client.submitReservation(body);
    } catch (error) {
      logger.warn("audit_libroom_reschedule_partial_failure", {
        actorUserId: currentUserId(),
        reservationId,
        error: error?.message
      });
      throw new HttpError(
        409,
        `原预约已取消，但新预约未提交成功：${error?.message || "学校系统拒绝了本次预约"}。请尽快重新预约。`,
        { reservationCancelled: true, reservationId, previous },
        "LIBROOM_RESCHEDULE_PARTIAL"
      );
    }

    logger.info("audit_libroom_reservation_rescheduled", {
      actorUserId: currentUserId(),
      reservationId,
      areaId: targetAreaId,
      date: normalized.date,
      startTime: normalized.startTime,
      endTime: normalized.endTime
    });
    json(res, 200, { ok: true, data: { success: true, previous, reservation: result } });
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
