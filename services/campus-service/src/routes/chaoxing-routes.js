export async function handleChaoxingRoutes(req, res, url, { chaoxing, currentUserId, json, readBodyJson }) {
  if (!url.pathname.startsWith("/api/chaoxing/")) return false;
  const userId = currentUserId();
  const path = url.pathname.slice("/api/chaoxing/".length);
  let data;
  if (path === "session" && req.method === "GET") data = await chaoxing.status(userId);
  else if (path === "session" && req.method === "POST") data = await chaoxing.connect(userId, await readBodyJson(req));
  else if (path === "disconnect" && req.method === "POST") {
    await chaoxing.disconnect(userId);
    data = { connected: false };
  } else if (path === "courses" && req.method === "GET") data = await chaoxing.courses(userId);
  else if (path === "activities" && req.method === "GET") data = await chaoxing.activities(userId, Object.fromEntries(url.searchParams));
  else if (path === "activity" && req.method === "GET") data = await chaoxing.detail(userId, Object.fromEntries(url.searchParams));
  else if (path === "sign" && req.method === "POST") data = await chaoxing.sign(userId, await readBodyJson(req));
  else return false;
  res.setHeader("Cache-Control", "no-store");
  json(res, 200, { ok: true, data });
  return true;
}
