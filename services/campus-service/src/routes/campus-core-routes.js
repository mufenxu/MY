export async function handleCampusCoreRoutes(req, res, url, {
  HttpError,
  campusQueryFromSearch,
  clearSessionJar,
  currentUserId,
  defaultMonth,
  getCampusAccommodation,
  getCampusCard,
  getCampusRechargeLink,
  getCampusSummary,
  getCampusWater,
  getEnergyRechargeLink,
  getMonthBill,
  getMeters,
  getSummary,
  getViewData,
  getWallet,
  getYesterdayBill,
  json,
  logger,
  loginWithCas,
  readBodyJson,
  readSessionJar,
  refreshCampusWaterCode,
  saveSessionJar,
  schoolLoginLimiter,
  sensitiveJson,
  sessionStatus,
  waterValve,
  withCampusSessionLock
}) {
  if (url.pathname === "/api/auth/status") {
    json(res, 200, { ok: true, data: await sessionStatus() });
    return true;
  }
  if (url.pathname === "/api/auth/login" && req.method === "POST") {
    const body = await readBodyJson(req);
    if (body.autoRelogin === true && !sensitiveJson.encrypted) {
      throw new HttpError(503, "请先配置 HGU_DATA_ENCRYPTION_KEY，再开启学校会话自动重登。");
    }
    const schoolLoginLimit = schoolLoginLimiter.check(currentUserId());
    if (!schoolLoginLimit.allowed) {
      throw new HttpError(
        429,
        `学校账号登录尝试较多，请 ${Math.ceil(schoolLoginLimit.retryAfterMs / 1000)} 秒后重试。`,
        null,
        "SCHOOL_LOGIN_RATE_LIMITED"
      );
    }
    let data;
    try {
      data = await loginWithCas({ ...body, saveCredentials: body.autoRelogin === true });
      schoolLoginLimiter.reset(currentUserId());
      logger.info("audit_school_account_connected", { actorUserId: currentUserId() });
    } catch (error) {
      schoolLoginLimiter.recordFailure(currentUserId());
      throw error;
    }
    json(res, 200, { ok: true, data });
    return true;
  }
  if (url.pathname === "/api/auth/logout" && req.method === "POST") {
    await clearSessionJar();
    logger.info("audit_school_account_disconnected", { actorUserId: currentUserId() });
    json(res, 200, { ok: true, data: await sessionStatus() });
    return true;
  }
  if (url.pathname === "/api/auth/validate" && req.method === "POST") {
    const view = await getViewData();
    const jar = await readSessionJar();
    jar.meta.account = view.account || jar.meta.account || null;
    jar.meta.ownerName = view.ownerName || jar.meta.ownerName || null;
    jar.meta.lastValidatedAt = new Date().toISOString();
    await saveSessionJar(jar);
    json(res, 200, { ok: true, data: { view, status: await sessionStatus() } });
    return true;
  }
  if (url.pathname === "/api/energy/view") {
    json(res, 200, { ok: true, data: await getViewData() });
    return true;
  }
  if (url.pathname === "/api/energy/wallet") {
    json(res, 200, { ok: true, data: await getWallet() });
    return true;
  }
  if (url.pathname === "/api/energy/bill/month") {
    const time = url.searchParams.get("time") || defaultMonth();
    json(res, 200, { ok: true, data: await getMonthBill(time), time });
    return true;
  }
  if (url.pathname === "/api/energy/bill/yesterday") {
    json(res, 200, { ok: true, data: await getYesterdayBill() });
    return true;
  }
  if (url.pathname === "/api/energy/meters") {
    json(res, 200, { ok: true, data: await getMeters() });
    return true;
  }
  if (url.pathname === "/api/energy/summary") {
    const time = url.searchParams.get("time") || defaultMonth();
    json(res, 200, { ok: true, data: await getSummary(time) });
    return true;
  }
  if (url.pathname === "/api/energy/recharge-link") {
    json(res, 200, { ok: true, data: await getEnergyRechargeLink() });
    return true;
  }
  if (url.pathname === "/api/campus/summary") {
    const query = campusQueryFromSearch(url.searchParams);
    json(res, 200, { ok: true, data: await withCampusSessionLock(() => getCampusSummary(query)) });
    return true;
  }
  if (url.pathname === "/api/campus/card") {
    const query = campusQueryFromSearch(url.searchParams);
    json(res, 200, { ok: true, data: await withCampusSessionLock(() => getCampusCard(query)) });
    return true;
  }
  if (url.pathname === "/api/campus/water") {
    const query = campusQueryFromSearch(url.searchParams);
    json(res, 200, { ok: true, data: await withCampusSessionLock(() => getCampusWater(query)) });
    return true;
  }
  if (url.pathname === "/api/campus/accommodation") {
    json(res, 200, { ok: true, data: await withCampusSessionLock(() => getCampusAccommodation()) });
    return true;
  }
  if (url.pathname === "/api/campus/water-code/refresh" && req.method === "POST") {
    json(res, 200, { ok: true, data: await withCampusSessionLock(() => refreshCampusWaterCode()) });
    return true;
  }
  if (url.pathname === "/api/campus/water-valve") {
    json(res, 200, { ok: true, data: await withCampusSessionLock(() => waterValve.get()) });
    return true;
  }
  if (url.pathname === "/api/campus/water-valve/bind" && req.method === "POST") {
    const body = await readBodyJson(req);
    json(res, 200, { ok: true, data: await withCampusSessionLock(() => waterValve.bind(body.rawCode || body.code || body.seqNo)) });
    return true;
  }
  if (url.pathname === "/api/campus/water-valve/open" && req.method === "POST") {
    const body = await readBodyJson(req);
    json(res, 200, { ok: true, data: await withCampusSessionLock(() => waterValve.open(body.seqNo)) });
    return true;
  }
  if (url.pathname === "/api/campus/water-valve/close" && req.method === "POST") {
    const body = await readBodyJson(req);
    json(res, 200, { ok: true, data: await withCampusSessionLock(() => waterValve.close(body.seqNo)) });
    return true;
  }
  if (url.pathname === "/api/campus/water-valve/unbind" && req.method === "POST") {
    const body = await readBodyJson(req);
    json(res, 200, { ok: true, data: await withCampusSessionLock(() => waterValve.unbind(body.seqNo)) });
    return true;
  }
  if (url.pathname === "/api/campus/water-valve/reorder" && req.method === "POST") {
    const body = await readBodyJson(req);
    json(res, 200, { ok: true, data: await withCampusSessionLock(() => waterValve.reorder(body.seqNos)) });
    return true;
  }
  if (url.pathname === "/api/campus/recharge-link") {
    json(res, 200, { ok: true, data: await withCampusSessionLock(() => getCampusRechargeLink()) });
    return true;
  }
  return false;
}
