export async function handleSystemAdminRoutes(req, res, url, {
  HttpError,
  backgroundOperationsSnapshot,
  createInvite,
  createSystemUser,
  currentUserId,
  decodeBoundedPathSegment,
  deleteInvite,
  deleteSystemUser,
  json,
  listInvites,
  listSystemUsers,
  logger,
  normalizePagination,
  readBodyJson,
  requireAdminUser,
  resetSystemUserPassword,
  revokeInvite,
  setSystemUserDisabled
}) {
  if (url.pathname === "/api/operations/status" && req.method === "GET") {
    requireAdminUser();
    json(res, 200, { ok: true, data: backgroundOperationsSnapshot() });
    return true;
  }
  if (url.pathname === "/api/users" && req.method === "GET") {
    requireAdminUser();
    const pagination = normalizePagination({
      page: url.searchParams.get("page"),
      pageSize: url.searchParams.get("pageSize")
    });
    const users = await listSystemUsers(pagination);
    json(res, 200, { ok: true, data: users.items, pagination: users.pagination });
    return true;
  }
  if (url.pathname === "/api/users" && req.method === "POST") {
    requireAdminUser();
    const body = await readBodyJson(req);
    const user = await createSystemUser({
      username: body.username,
      password: body.password,
      role: body.role === "admin" ? "admin" : "user"
    });
    logger.info("audit_user_created", { actorUserId: currentUserId(), targetUserId: user.id, role: user.role });
    json(res, 201, { ok: true, data: user });
    return true;
  }
  if (url.pathname === "/api/invites" && req.method === "GET") {
    requireAdminUser();
    json(res, 200, { ok: true, data: await listInvites() });
    return true;
  }
  if (url.pathname === "/api/invites" && req.method === "POST") {
    requireAdminUser();
    const body = await readBodyJson(req);
    const invite = await createInvite({
      role: body.role,
      note: body.note,
      expiresInDays: body.expiresInDays,
      actorId: currentUserId()
    });
    logger.info("audit_invite_created", { actorUserId: currentUserId(), inviteId: invite.id, role: invite.role });
    json(res, 201, { ok: true, data: invite });
    return true;
  }
  const inviteActionMatch = url.pathname.match(/^\/api\/invites\/([^/]+)$/);
  if (inviteActionMatch && req.method === "PATCH") {
    requireAdminUser();
    const body = await readBodyJson(req);
    if (body.revoked !== true) throw new HttpError(400, "无效的邀请码操作。");
    const invite = await revokeInvite({ id: decodeBoundedPathSegment(inviteActionMatch[1], "邀请码编号") });
    logger.info("audit_invite_revoked", { actorUserId: currentUserId(), inviteId: invite.id });
    json(res, 200, { ok: true, data: invite });
    return true;
  }
  if (inviteActionMatch && req.method === "DELETE") {
    requireAdminUser();
    const invite = await deleteInvite({ id: decodeBoundedPathSegment(inviteActionMatch[1], "邀请码编号") });
    logger.info("audit_invite_deleted", { actorUserId: currentUserId(), inviteId: invite.id });
    json(res, 200, { ok: true, data: invite });
    return true;
  }
  const userActionMatch = url.pathname.match(/^\/api\/users\/([^/]+)(?:\/(password))?$/);
  if (userActionMatch) {
    requireAdminUser();
    const targetUserId = decodeBoundedPathSegment(userActionMatch[1], "用户编号");
    const subAction = userActionMatch[2] || "";
    if (subAction === "password" && req.method === "POST") {
      const body = await readBodyJson(req);
      const user = await resetSystemUserPassword({ id: targetUserId, password: body.password });
      logger.info("audit_user_password_reset", { actorUserId: currentUserId(), targetUserId: user.id });
      json(res, 200, { ok: true, data: user });
      return true;
    }
    if (!subAction && req.method === "PATCH") {
      const body = await readBodyJson(req);
      const user = await setSystemUserDisabled({
        id: targetUserId,
        disabled: Boolean(body.disabled),
        actorId: currentUserId()
      });
      logger.info("audit_user_status_changed", {
        actorUserId: currentUserId(),
        targetUserId: user.id,
        disabled: user.disabled
      });
      json(res, 200, { ok: true, data: user });
      return true;
    }
    if (!subAction && req.method === "DELETE") {
      const user = await deleteSystemUser({ id: targetUserId, actorId: currentUserId() });
      logger.info("audit_user_deleted", { actorUserId: currentUserId(), targetUserId: user.id });
      json(res, 200, { ok: true, data: user });
      return true;
    }
  }
  return false;
}
