import { createBackgroundSchedulers } from "./src/services/background-schedulers.js";
import { createIdentityService } from "./src/services/identity-service.js";
import { createCampusConnectors } from "./src/services/campus-connectors.js";
import { createChaoxingService } from "./src/services/chaoxing-service.js";
import { createReservationService } from "./src/services/reservation-service.js";
import { createAcademicService } from "./src/services/academic-service.js";
import { createSchoolWebvpnService } from "./src/services/school-webvpn.js";
import { freeClassroomQueryFromSearch } from "./src/lib/academic-parsers.js";
import { ACADEMIC_TIMETABLE_SOURCES } from "./src/lib/academic-config.js";
import { createServer } from "node:http";
import { isIP } from "node:net";
import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import smCrypto from "sm-crypto";
import { createLogger } from "./src/lib/logger.js";
import { KeyedSerialQueue } from "./src/lib/keyed-serial-queue.js";
import { FixedWindowAttemptLimiter } from "./src/lib/rate-limiter.js";
import { shouldLogClientError, shouldLogRequestCompleted } from "./src/lib/request-logging.js";
import { loadDotEnv, parseBooleanEnv } from "./src/lib/env.js";
import { createHttpToolkit, HttpError } from "./src/lib/http.js";
import { normalizePagination } from "./src/lib/pagination.js";
import { hashPassword, isValidUsername, normalizeUsername, verifyPassword } from "./src/lib/password.js";
import { createSensitiveJsonCodec, deriveDataEncryptionKey } from "./src/lib/sensitive-json.js";
import {
  casEncryptPassword as encryptCasPassword,
  extractFormAction,
  extractInputValue,
  htmlErrorMessage
} from "./src/lib/cas-protocol.js";
import { normalizeAllowedSchoolUrl } from "./src/lib/school-url.js";
import { verifyPlatformSso } from "./src/lib/platform-sso.js";
import { platformRoleAllowsRequest } from "./src/lib/platform-role.js";
import { invalidateRequestMemo, requestMemo, setRequestMemo } from "./src/lib/request-memo.js";
import { createStaticAssetHandler } from "./src/lib/static-assets.js";
import {
  normalizeReservationInput,
  normalizeLibroomMyReservationRecord,
  summarizeLibroomAvailability
} from "./src/lib/libroom.js";
import { normalizeLibrarySeatReservationInput } from "./src/lib/library-seat.js";
import { discardUpstreamResponse, releaseUpstreamResponse, trackUpstreamResponse } from "./src/lib/upstream-response.js";
import { createCampusRepository } from "./src/storage/campus-repository.js";
import { handleCampusCoreRoutes } from "./src/routes/campus-core-routes.js";
import { handleChaoxingRoutes } from "./src/routes/chaoxing-routes.js";
import { handleLibroomRoutes } from "./src/routes/libroom-routes.js";
import { handleLibrarySeatRoutes } from "./src/routes/library-seat-routes.js";
import { handleAcademicRoutes } from "./src/routes/academic-routes.js";
import { handleSystemAdminRoutes } from "./src/routes/system-admin-routes.js";
import { renderAcademicCalendar } from "./src/lib/academic-calendar.js";
import { casLoginUrlWithService, isCasLoginRedirect } from "./src/lib/uias-cas.js";
import {
  cookieHeaderFor,
  emptySessionJar as emptyJar,
  isCookieExpired,
  mergeSessionJars,
  updateJarFromResponse
} from "./src/lib/session-jar.js";
import { createWaterValveService } from "./src/lib/water-valve.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
process.umask(0o077);
const publicDir = join(__dirname, "public");
const dataDir = resolve(process.env.HGU_DATA_DIR || join(__dirname, "data"));
const legacySessionPath = join(dataDir, "school-session.json");
const legacyAcademicCachePath = join(dataDir, "academic-timetable-cache.json");
const legacyAcademicCurrentCachePath = join(dataDir, "academic-timetable-current-cache.json");
const userContextStorage = new AsyncLocalStorage();

loadDotEnv(join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 22101);
const HOST = process.env.HGU_HOST || process.env.HOST || "127.0.0.1";
const SCHOOL_ORIGIN = "https://nrg.hgu.edu.cn";
const CAS_ORIGIN = "https://cas.hgu.edu.cn";

const SERVICE_URL = `${SCHOOL_ORIGIN}/wecom/oauth/servicecenter/main.do`;
const ENERGY_RECHARGE_SERVICE_URL = `${SCHOOL_ORIGIN}/wecom/oauth/recharge/main.do`;
const ENERGY_RECHARGE_URL = `${ENERGY_RECHARGE_SERVICE_URL}#`;

const ACADEMIC_EVALUATION_MAX_DRAFTS = Number(process.env.HGU_ACADEMIC_EVALUATION_MAX_DRAFTS || 1_000);
const ACADEMIC_EVALUATION_MAX_DRAFTS_PER_USER = Number(process.env.HGU_ACADEMIC_EVALUATION_MAX_DRAFTS_PER_USER || 10);

const REQUEST_TIMEOUT_MS = Number(process.env.NRG_TIMEOUT_MS || 15000);
const ALLOW_GLOBAL_NRG_COOKIE = parseBooleanEnv(process.env.HGU_ALLOW_GLOBAL_NRG_COOKIE, false);
const ASSUMED_SESSION_TTL_HOURS = Number(process.env.NRG_SESSION_TTL_HOURS || 12);
const SESSION_REFRESH_SKEW_MS = Number(process.env.HGU_SESSION_REFRESH_SKEW_MS || 5 * 60 * 1000);

const NODE_ENV = process.env.NODE_ENV || "development";
const APP_AUTH_PASSWORD = process.env.HGU_APP_PASSWORD
  || process.env.APP_PASSWORD
  || process.env.HGU_ADMIN_PASSWORD
  || process.env.HGU_APP_USER_PASSWORD
  || (NODE_ENV === "production" ? "" : "admin12345678");
const APP_AUTH_REQUIRED = parseBooleanEnv(
  process.env.HGU_APP_AUTH_REQUIRED,
  true
);
const APP_SESSION_SECRET = process.env.HGU_APP_SESSION_SECRET
  || process.env.APP_SESSION_SECRET
  || (NODE_ENV === "production" ? "" : randomBytes(32).toString("base64url"));
const APP_SESSION_TTL_HOURS = Number(process.env.HGU_APP_SESSION_TTL_HOURS || 24 * 30);
const APP_COOKIE_SECURE = parseBooleanEnv(process.env.HGU_APP_COOKIE_SECURE, NODE_ENV === "production");
const ENABLE_HTTPS_REDIRECT = parseBooleanEnv(
  process.env.HGU_ENABLE_HTTPS_REDIRECT,
  NODE_ENV === "production" && APP_COOKIE_SECURE
);
const APP_COOKIE_NAME = APP_COOKIE_SECURE ? "__Host-hgu_app_session" : "hgu_app_session";
const APP_EMBEDDED_COOKIE_NAME = "hgu_app_session";
const APP_SESSION_HEADER_NAME = "x-hgu-app-session";
const APP_COOKIE_SAMESITE = ["Strict", "Lax", "None"].find(
  (value) => value.toLowerCase() === String(process.env.HGU_APP_COOKIE_SAMESITE || "Lax").toLowerCase()
) || "Lax";
const APP_LOGIN_MAX_ATTEMPTS = Number(process.env.HGU_APP_LOGIN_MAX_ATTEMPTS || 8);
const APP_LOGIN_WINDOW_MS = Number(process.env.HGU_APP_LOGIN_WINDOW_MS || 10 * 60 * 1000);
const APP_LOGIN_MAX_TRACKED_CLIENTS = Number(process.env.HGU_APP_LOGIN_MAX_TRACKED_CLIENTS || 10_000);
const APP_PASSWORD_MIN_LENGTH = Number(process.env.HGU_APP_PASSWORD_MIN_LENGTH || 12);
const APP_SESSION_SECRET_MIN_LENGTH = Number(process.env.HGU_APP_SESSION_SECRET_MIN_LENGTH || 32);
const APP_PASSWORD_MAX_LENGTH = Number(process.env.HGU_APP_PASSWORD_MAX_LENGTH || 256);
const TRUST_PROXY = parseBooleanEnv(process.env.HGU_TRUST_PROXY, false);
const ENABLE_HSTS = parseBooleanEnv(process.env.HGU_ENABLE_HSTS, NODE_ENV === "production");
const MAX_UPSTREAM_RESPONSE_BYTES = Number(process.env.HGU_MAX_UPSTREAM_RESPONSE_BYTES || 5 * 1024 * 1024);
const MAX_CONCURRENT_UPSTREAM_REQUESTS = Number(process.env.HGU_MAX_CONCURRENT_UPSTREAM_REQUESTS || 32);
const API_REQUESTS_PER_MINUTE = Number(process.env.HGU_API_REQUESTS_PER_MINUTE || 180);
const SCHOOL_LOGIN_MAX_ATTEMPTS = Number(process.env.HGU_SCHOOL_LOGIN_MAX_ATTEMPTS || 5);
const EXTRA_ALLOWED_SCHOOL_HOSTS = new Set(
  String(process.env.HGU_EXTRA_ALLOWED_SCHOOL_HOSTS || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
);
const DEFAULT_ADMIN_USERNAME = process.env.HGU_ADMIN_USERNAME || process.env.HGU_APP_USERNAME || "admin";
const DEFAULT_ADMIN_PASSWORD = process.env.HGU_ADMIN_PASSWORD
  || process.env.HGU_APP_USER_PASSWORD
  || APP_AUTH_PASSWORD
  || (NODE_ENV === "production" ? "" : "admin12345678");
const MAX_JSON_BODY_BYTES = Number(process.env.HGU_MAX_JSON_BODY_BYTES || 64 * 1024);
const CAS_RSA_MODULUS = "008aed7e057fe8f14c73550b0e6467b023616ddc8fa91846d2613cdb7f7621e3cada4cd5d812d627af6b87727ade4e26d26208b7326815941492b2204c3167ab2d53df1e3a2c9153bdb7c8c2e968df97a5e7e01cc410f92c4c2c2fba529b3ee988ebc1fca99ff5119e036d732c368acf8beba01aa2fdafa45b21e4de4928d0d403";
const CAS_RSA_EXPONENT = "010001";
// These compatibility values mirror public campus client protocols. Deployments can override them
// without changing source if the upstream applications rotate their protocol configuration.






const { sm2, sm3 } = smCrypto;

const academicSessionQueue = new KeyedSerialQueue();
const campusSessionQueue = new KeyedSerialQueue();

const schoolReloginQueue = new KeyedSerialQueue();
const schoolReloginFailedAt = new Map();
const schoolReloginSuccessAt = new Map();
const SCHOOL_RELOGIN_INTERVAL_MS = 6 * 24 * 60 * 60 * 1000;
const SCHOOL_RELOGIN_FAILURE_COOLDOWN_MS = 5 * 60 * 1000;
const SCHOOL_RELOGIN_SUCCESS_DEDUPE_MS = 10 * 1000;
const SCHOOL_AUTH_RETRY_ATTEMPTS = 2;
const logger = createLogger({ service: "hgu-campus-hub", environment: NODE_ENV });
const CONFIGURED_DATA_ENCRYPTION_KEY = String(process.env.HGU_DATA_ENCRYPTION_KEY || "").trim();
const DERIVED_DATA_ENCRYPTION_KEY = deriveDataEncryptionKey(APP_SESSION_SECRET);
const DATA_ENCRYPTION_KEY_DERIVED = !CONFIGURED_DATA_ENCRYPTION_KEY && Boolean(DERIVED_DATA_ENCRYPTION_KEY);
const sensitiveJson = createSensitiveJsonCodec({
  key: CONFIGURED_DATA_ENCRYPTION_KEY || DERIVED_DATA_ENCRYPTION_KEY,
  fallbackKeys: CONFIGURED_DATA_ENCRYPTION_KEY && DERIVED_DATA_ENCRYPTION_KEY ? [DERIVED_DATA_ENCRYPTION_KEY] : [],
  required: NODE_ENV === "production"
});
if (DATA_ENCRYPTION_KEY_DERIVED) {
  logger.warn("data_encryption_key_derived", {
    message: "未配置 HGU_DATA_ENCRYPTION_KEY，已从 HGU_APP_SESSION_SECRET 安全派生备用数据密钥。建议后续配置独立数据密钥以加强密钥隔离。"
  });
}
const loginIpLimiter = new FixedWindowAttemptLimiter({
  limit: APP_LOGIN_MAX_ATTEMPTS * 3,
  windowMs: APP_LOGIN_WINDOW_MS,
  maxEntries: APP_LOGIN_MAX_TRACKED_CLIENTS
});
const loginAccountLimiter = new FixedWindowAttemptLimiter({
  limit: APP_LOGIN_MAX_ATTEMPTS,
  windowMs: APP_LOGIN_WINDOW_MS,
  maxEntries: APP_LOGIN_MAX_TRACKED_CLIENTS
});
const apiUserLimiter = new FixedWindowAttemptLimiter({
  limit: API_REQUESTS_PER_MINUTE,
  windowMs: 60_000,
  maxEntries: APP_LOGIN_MAX_TRACKED_CLIENTS
});
const schoolLoginLimiter = new FixedWindowAttemptLimiter({
  limit: SCHOOL_LOGIN_MAX_ATTEMPTS,
  windowMs: 15 * 60 * 1_000,
  maxEntries: APP_LOGIN_MAX_TRACKED_CLIENTS
});
let activeUpstreamRequests = 0;

async function withAcademicSessionLock(task) {
  const context = userContextStorage.getStore();
  if (context?.academicSessionLockHeld) return task();
  const userId = currentUserId();
  return academicSessionQueue.run(userId, async () => {
    if (context) context.academicSessionLockHeld = true;
    try {
      return await task();
    } finally {
      if (context) delete context.academicSessionLockHeld;
    }
  });
}

async function withCampusSessionLock(task) {
  const context = userContextStorage.getStore();
  if (context?.campusSessionLockHeld) return task();
  const userId = currentUserId();
  return campusSessionQueue.run(userId, async () => {
    if (context) context.campusSessionLockHeld = true;
    try {
      return await task();
    } finally {
      if (context) delete context.campusSessionLockHeld;
    }
  });
}

if (APP_AUTH_REQUIRED && !APP_SESSION_SECRET) {
  throw new Error("公网部署必须设置 HGU_APP_SESSION_SECRET。");
}
if (APP_AUTH_REQUIRED && DEFAULT_ADMIN_PASSWORD && DEFAULT_ADMIN_PASSWORD.length < APP_PASSWORD_MIN_LENGTH) {
  throw new Error(`HGU_ADMIN_PASSWORD must be at least ${APP_PASSWORD_MIN_LENGTH} characters.`);
}
if (APP_AUTH_REQUIRED && APP_SESSION_SECRET.length < APP_SESSION_SECRET_MIN_LENGTH) {
  throw new Error(`HGU_APP_SESSION_SECRET must be at least ${APP_SESSION_SECRET_MIN_LENGTH} characters.`);
}
if (APP_COOKIE_SAMESITE === "None" && !APP_COOKIE_SECURE) {
  throw new Error("SameSite=None requires HGU_APP_COOKIE_SECURE=true.");
}
if (NODE_ENV === "production" && !APP_AUTH_REQUIRED && !parseBooleanEnv(process.env.HGU_ALLOW_UNAUTHENTICATED, false)) {
  throw new Error("Production mode refuses to disable application authentication unless HGU_ALLOW_UNAUTHENTICATED=true is explicitly set.");
}
if (NODE_ENV === "production" && !APP_COOKIE_SECURE && !parseBooleanEnv(process.env.HGU_ALLOW_INSECURE_COOKIE, false)) {
  throw new Error("Production mode requires HGU_APP_COOKIE_SECURE=true unless HGU_ALLOW_INSECURE_COOKIE=true is explicitly set.");
}
if (DEFAULT_ADMIN_PASSWORD === "admin12345678" && !["127.0.0.1", "localhost", "::1"].includes(HOST)) {
  throw new Error("The development default administrator password may only be used on a loopback address.");
}
for (const [name, value] of [
  ["PORT", PORT],
  ["NRG_TIMEOUT_MS", REQUEST_TIMEOUT_MS],
  ["HGU_APP_SESSION_TTL_HOURS", APP_SESSION_TTL_HOURS],
  ["HGU_APP_LOGIN_MAX_ATTEMPTS", APP_LOGIN_MAX_ATTEMPTS],
  ["HGU_APP_LOGIN_WINDOW_MS", APP_LOGIN_WINDOW_MS],
  ["HGU_MAX_JSON_BODY_BYTES", MAX_JSON_BODY_BYTES],
  ["HGU_MAX_UPSTREAM_RESPONSE_BYTES", MAX_UPSTREAM_RESPONSE_BYTES],
  ["HGU_MAX_CONCURRENT_UPSTREAM_REQUESTS", MAX_CONCURRENT_UPSTREAM_REQUESTS],
  ["HGU_API_REQUESTS_PER_MINUTE", API_REQUESTS_PER_MINUTE],
  ["HGU_SCHOOL_LOGIN_MAX_ATTEMPTS", SCHOOL_LOGIN_MAX_ATTEMPTS],
  ["HGU_ACADEMIC_EVALUATION_MAX_DRAFTS", ACADEMIC_EVALUATION_MAX_DRAFTS],
  ["HGU_ACADEMIC_EVALUATION_MAX_DRAFTS_PER_USER", ACADEMIC_EVALUATION_MAX_DRAFTS_PER_USER]
]) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number.`);
}

const { json, maybeRedirectHttps, redirect, securityHeaders } = createHttpToolkit({
  enableHsts: ENABLE_HSTS,
  enableHttpsRedirect: ENABLE_HTTPS_REDIRECT,
  publicOrigin: process.env.HGU_PUBLIC_ORIGIN || "",
  trustProxy: TRUST_PROXY,
  getRequestId: () => userContextStorage.getStore()?.requestId || ""
});

function parseJsonLike(text) {
  const source = String(text || "").trim();
  if (!source) return {};
  const jsonp = source.match(/^[\w$.]+\(([\s\S]*)\);?$/);
  return JSON.parse(jsonp ? jsonp[1] : source);
}

function md5(text) {
  return createHash("md5").update(String(text)).digest("hex");
}

function cleanParams(input = {}) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

function sortedParamString(input = {}) {
  const params = cleanParams(input);
  return Object.keys(params)
    .sort()
    .map((key) => {
      const value = params[key];
      return `${key}=${typeof value === "object" ? JSON.stringify(value) : value}`;
    })
    .join("&");
}

function randomAlphaNum(length = 12) {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

function sha256Hex(text) {
  return createHash("sha256").update(String(text)).digest("hex");
}

function hmacBase64Url(text) {
  return createHmac("sha256", APP_SESSION_SECRET).update(String(text)).digest("base64url");
}

function safeEqualString(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

const repository = createCampusRepository();
await repository.initialize();

async function migrateSensitiveDataRows() {
  if (!sensitiveJson.encrypted) return;
  const [sessionRows, cacheRows, subscriptionRows] = await Promise.all([
    repository.listSchoolSessions(),
    repository.listAcademicCaches(),
    repository.listCalendarSubscriptions()
  ]);
  for (const row of sessionRows) {
    const decoded = sensitiveJson.decodeWithMetadata(row.jar_json);
    if (String(row.jar_json || "").startsWith("enc:v1:") && decoded.keyIndex === 0) continue;
    await repository.upsertSchoolSession(row.user_id, sensitiveJson.encode(decoded.value), nowIso());
  }
  for (const row of cacheRows) {
    const decoded = sensitiveJson.decodeWithMetadata(row.cache_json);
    if (String(row.cache_json || "").startsWith("enc:v1:") && decoded.keyIndex === 0) continue;
    await repository.upsertAcademicCache(row.user_id, row.source_key, sensitiveJson.encode(decoded.value), nowIso());
  }
  for (const row of subscriptionRows) {
    const decoded = sensitiveJson.decodeWithMetadata(row.token_json);
    if (String(row.token_json || "").startsWith("enc:v1:") && decoded.keyIndex === 0) continue;
    await repository.upsertCalendarSubscription(row.user_id, {
      tokenHash: row.token_hash,
      tokenJson: sensitiveJson.encode(decoded.value),
      enabled: row.enabled,
      timestamp: nowIso()
    });
  }
}

await migrateSensitiveDataRows();

function nowIso() {
  return new Date().toISOString();
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    disabled: Boolean(row.disabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at || null
  };
}

function publicUserWithStatus(row) {
  const user = publicUser(row);
  if (!user) return null;
  const schoolSession = publicSchoolSessionInfo(row.school_session_jar_json);
  return {
    ...user,
    hasSchoolSession: Boolean(row.has_school_session),
    schoolSessionUpdatedAt: row.school_session_updated_at || null,
    schoolAccount: schoolSession.account,
    schoolOwnerName: schoolSession.ownerName,
    schoolSessionStatus: schoolSession.status,
    schoolSessionNeedsLogin: schoolSession.needsLogin
  };
}

function publicSchoolSessionInfo(jarJson) {
  if (!jarJson) {
    return { account: null, ownerName: null, status: "missing", needsLogin: false };
  }
  try {
    const parsed = sensitiveJson.decode(jarJson);
    const jar = {
      ...emptyJar(),
      ...parsed,
      meta: parsed.meta || {},
      cookies: parsed.cookies || {}
    };
    const summary = storedSessionSummary(jar);
    return {
      account: summary.schoolAccount || null,
      ownerName: summary.ownerName || summary.campus?.ownerName || null,
      status: summary.needsLogin || !summary.schoolAccount ? "expired" : (summary.hasStoredSession ? "active" : "missing"),
      needsLogin: Boolean(summary.needsLogin || !summary.schoolAccount)
    };
  } catch {
    return { account: null, ownerName: null, status: "unknown", needsLogin: false };
  }
}

function validateNewPassword(password) {
  const value = String(password || "");
  if (value.length < APP_PASSWORD_MIN_LENGTH) {
    throw new HttpError(400, `系统账号密码至少需要 ${APP_PASSWORD_MIN_LENGTH} 位。`);
  }
  if (value.length > APP_PASSWORD_MAX_LENGTH) {
    throw new HttpError(400, `系统账号密码不能超过 ${APP_PASSWORD_MAX_LENGTH} 位。`);
  }
  return value;
}

function validateNewUsername(username) {
  const normalized = normalizeUsername(username);
  if (!isValidUsername(normalized)) {
    throw new HttpError(400, "用户名需为 3-64 位字母、数字、点、下划线或连字符，且必须以字母或数字开头。");
  }
  return normalized;
}

async function hashUserPassword(password) {
  const value = validateNewPassword(password);
  return hashPassword(value);
}

async function verifyUserPassword(password, passwordHash) {
  return verifyPassword(password, passwordHash, { maxLength: APP_PASSWORD_MAX_LENGTH });
}

async function insertSystemUser({ normalized, passwordHash, role = "user" }) {
  const id = randomUUID();
  const timestamp = nowIso();
  try {
    await repository.insertUser({
      id,
      username: normalized,
      password_hash: passwordHash,
      role,
      disabled: 0,
      session_version: 1,
      created_at: timestamp,
      updated_at: timestamp,
      last_login_at: null
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw new HttpError(409, "系统用户名已存在。");
    }
    throw error;
  }
  invalidateRequestMemo(userContextStorage.getStore(), "user:");
  return publicUser(await findUserById(id));
}

async function createSystemUser({ username, password, role = "user" }) {
  const normalized = validateNewUsername(username);
  const passwordHash = await hashUserPassword(password);
  return insertSystemUser({ normalized, passwordHash, role });
}

const DUMMY_PASSWORD_HASH = await hashUserPassword(randomBytes(24).toString("base64url"));

async function findUserById(id) {
  if (!id) return null;
  const normalizedId = String(id);
  const context = userContextStorage.getStore();
  return requestMemo(
    context,
    `user:id:${normalizedId}`,
    () => repository.findUserById(normalizedId),
    { clone: structuredClone }
  );
}

async function findUserByUsername(username) {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;
  const context = userContextStorage.getStore();
  return requestMemo(context, `user:username:${normalized}`, async () => {
    const user = await repository.findUserByUsername(normalized);
    if (user?.id) setRequestMemo(context, `user:id:${user.id}`, structuredClone(user));
    return user;
  }, { clone: structuredClone });
}

async function listSystemUsers(pagination) {
  const [rows, total] = await Promise.all([
    repository.listUsersWithSessions({ offset: pagination.offset, limit: pagination.pageSize }),
    repository.countUsers()
  ]);
  return {
    items: rows.map(publicUserWithStatus),
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize))
    }
  };
}

async function authenticateSystemUser(username, password) {
  const user = await findUserByUsername(username);
  const passwordValid = await verifyUserPassword(password, user?.password_hash || DUMMY_PASSWORD_HASH);
  if (!user || user.disabled || !passwordValid) return null;
  await repository.updateUserLogin(user.id, nowIso());
  invalidateRequestMemo(userContextStorage.getStore(), "user:");
  return findUserById(user.id);
}

async function setSystemUserDisabled({ id, disabled, actorId }) {
  const user = await findUserById(id);
  if (!user) throw new HttpError(404, "系统用户不存在。");
  if (user.id === actorId && disabled) throw new HttpError(400, "不能停用当前登录的管理员账号。");
  await repository.setUserDisabled(user.id, disabled, nowIso());
  invalidateRequestMemo(userContextStorage.getStore(), "user:");
  return publicUser(await findUserById(user.id));
}

async function revokeSystemUserSessions(id) {
  await repository.bumpSessionVersion(id, nowIso());
  invalidateRequestMemo(userContextStorage.getStore(), "user:");
}

async function resetSystemUserPassword({ id, password }) {
  const user = await findUserById(id);
  if (!user) throw new HttpError(404, "系统用户不存在。");
  const passwordHash = await hashUserPassword(password);
  await repository.setUserPassword(user.id, passwordHash, nowIso());
  invalidateRequestMemo(userContextStorage.getStore(), "user:");
  return publicUser(await findUserById(user.id));
}

async function changeOwnPassword({ userId, currentPassword, newPassword }) {
  const user = await findUserById(userId);
  if (!user) throw new HttpError(404, "系统用户不存在。");
  if (!(await verifyUserPassword(currentPassword || "", user.password_hash))) {
    throw new HttpError(401, "当前系统密码不正确。");
  }
  return resetSystemUserPassword({ id: user.id, password: newPassword });
}

async function deleteSystemUser({ id, actorId }) {
  const user = await findUserById(id);
  if (!user) throw new HttpError(404, "系统用户不存在。");
  if (user.id === actorId) throw new HttpError(400, "不能删除当前登录的管理员账号。");
  const evaluationJob = activeAcademicEvaluationAutoJob(user.id);
  if (evaluationJob) {
    evaluationJob.cancelRequested = true;
    evaluationJob.status = "canceling";
    touchAcademicEvaluationAutoJob(evaluationJob);
  }
  for (const [draftId, draft] of academicEvaluationDrafts.entries()) {
    if (draft.userId === user.id) academicEvaluationDrafts.delete(draftId);
  }
  await repository.deleteUser(user.id);
  invalidateRequestMemo(userContextStorage.getStore(), "user:");
  return publicUser(user);
}

function normalizeInviteCode(code) {
  return String(code || "").trim().replace(/[\s-]+/g, "").toUpperCase();
}

function decodeBoundedPathSegment(value, label, maxLength = 128) {
  let decoded;
  try {
    decoded = decodeURIComponent(String(value || ""));
  } catch {
    throw new HttpError(400, `${label}格式不正确。`);
  }
  if (!decoded || decoded.length > maxLength) throw new HttpError(400, `${label}格式不正确。`);
  return decoded;
}

function inviteCodePreview(code) {
  const normalized = normalizeInviteCode(code);
  return normalized ? `HGU-••••-${normalized.slice(-4)}` : "HGU-••••";
}

function normalizeSchoolLoginAccount(account) {
  return String(account || "").trim();
}

function formatInviteCode(raw) {
  const normalized = normalizeInviteCode(raw);
  return normalized.replace(/(.{3})(.{4})(.{4})(.{4})/, "$1-$2-$3-$4");
}

function inviteCodeHash(code) {
  return sha256Hex(normalizeInviteCode(code));
}

function generateInviteCode() {
  return formatInviteCode(`HGU${randomAlphaNum(12)}`);
}

function inviteStatus(row) {
  if (row.revoked_at) return "revoked";
  if (row.used_at) return "used";
  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) return "expired";
  return "active";
}

function publicInvite(row, { code = null } = {}) {
  if (!row) return null;
  const visibleCode = code || row.code_text || null;
  return {
    id: row.id,
    code: visibleCode,
    codePreview: visibleCode || row.code_preview,
    role: row.role,
    note: row.note || "",
    status: inviteStatus(row),
    createdAt: row.created_at,
    expiresAt: row.expires_at || null,
    usedAt: row.used_at || null,
    revokedAt: row.revoked_at || null,
    createdBy: row.created_by_username || null,
    usedBy: row.used_by_username || null
  };
}

async function listInvites() {
  return (await repository.listInvites()).map(publicInvite);
}

async function createInvite({ role = "user", note = "", expiresInDays = 7, actorId }) {
  const id = randomUUID();
  const code = generateInviteCode();
  const normalized = normalizeInviteCode(code);
  const timestamp = nowIso();
  const days = Number(expiresInDays);
  const normalizedNote = String(note || "").trim();
  if (normalizedNote.length > 200) throw new HttpError(400, "邀请码备注不能超过 200 个字符。");
  const expiresAt = Number.isFinite(days) && days > 0
    ? new Date(Date.now() + Math.min(days, 365) * 24 * 60 * 60 * 1000).toISOString()
    : null;
  const row = await repository.insertInvite({
    id,
    code_hash: inviteCodeHash(normalized),
    code_preview: inviteCodePreview(code),
    code_text: code,
    role: role === "admin" ? "admin" : "user",
    note: normalizedNote || null,
    created_by: actorId,
    used_by: null,
    created_at: timestamp,
    expires_at: expiresAt,
    used_at: null,
    revoked_at: null
  });
  return publicInvite(row, { code });
}

async function revokeInvite({ id }) {
  const invite = await repository.findInviteById(id);
  if (!invite) throw new HttpError(404, "邀请码不存在。");
  if (invite.used_at) throw new HttpError(400, "已使用的邀请码不能撤销。");
  return publicInvite(await repository.revokeInvite(id, nowIso()));
}

async function deleteInvite({ id }) {
  const invite = await repository.findInviteById(id);
  if (!invite) throw new HttpError(404, "邀请码不存在。");
  await repository.deleteInvite(id);
  return publicInvite(invite);
}

async function registerWithInvite({ inviteCode, username, password }) {
  const codeHash = inviteCodeHash(inviteCode);
  const existingInvite = await repository.findInviteByHash(codeHash);
  if (!existingInvite || inviteStatus(existingInvite) !== "active") throw new HttpError(400, "邀请码无效或已失效。");
  const normalized = validateNewUsername(username);
  const passwordHash = await hashUserPassword(password);
  const timestamp = nowIso();
  const user = await repository.registerWithInvite({
    codeHash,
    timestamp,
    inviteIsActive: (invite) => inviteStatus(invite) === "active",
    user: {
      id: randomUUID(),
      username: normalized,
      password_hash: passwordHash,
      role: "user",
      disabled: 0,
      session_version: 1,
      created_at: timestamp,
      updated_at: timestamp,
      last_login_at: null
    }
  });
  if (!user) throw new HttpError(400, "邀请码无效或已失效。");
  invalidateRequestMemo(userContextStorage.getStore(), "user:");
  return user;
}

async function getDefaultUser() {
  return repository.findFirstUser();
}

function readLegacyJson(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function migrateLegacyJsonData(userId) {
  if (!userId) return;
  const hasSession = await repository.getSchoolSession(userId);
  const legacySession = readLegacyJson(legacySessionPath);
  if (!hasSession && legacySession) {
    await repository.upsertSchoolSession(userId, sensitiveJson.encode(legacySession), nowIso());
  }

  for (const [sourceKey, filePath] of [
    ["current", legacyAcademicCurrentCachePath],
    ["selection", legacyAcademicCachePath]
  ]) {
    const hasCache = await repository.getAcademicCache(userId, sourceKey);
    const legacyCache = readLegacyJson(filePath);
    if (!hasCache && legacyCache) {
      await repository.upsertAcademicCache(userId, sourceKey, sensitiveJson.encode(legacyCache), nowIso());
    }
  }
}

async function ensureDefaultAdminUser() {
  const count = await repository.countUsers();
  if (count > 0) return;
  if (!DEFAULT_ADMIN_PASSWORD) throw new Error("首次启动必须设置 HGU_ADMIN_PASSWORD。");
  const admin = await createSystemUser({
    username: DEFAULT_ADMIN_USERNAME,
    password: DEFAULT_ADMIN_PASSWORD,
    role: "admin"
  });
  await migrateLegacyJsonData(admin.id);
}

await ensureDefaultAdminUser();
const defaultSystemUser = await getDefaultUser();

function parseCookieHeader(headerValue = "") {
  const cookies = {};
  for (const part of String(headerValue || "").split(";")) {
    const eqIndex = part.indexOf("=");
    if (eqIndex <= 0) continue;
    const name = part.slice(0, eqIndex).trim();
    const value = part.slice(eqIndex + 1).trim();
    if (name) cookies[name] = value;
  }
  return cookies;
}

function serializeCookie(name, value, {
  maxAge,
  path = "/",
  httpOnly = true,
  sameSite = APP_COOKIE_SAMESITE,
  secure = APP_COOKIE_SECURE
} = {}) {
  const pieces = [`${name}=${value}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (maxAge !== undefined) pieces.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  if (httpOnly) pieces.push("HttpOnly");
  if (secure) pieces.push("Secure");
  pieces.push("Priority=High");
  return pieces.join("; ");
}

function signAppSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmacBase64Url(body)}`;
}

function appSessionData(user, { csrfToken = null, expiresAt = null } = {}) {
  return {
    authenticated: true,
    csrfToken,
    expiresAt,
    user: publicUser(user)
  };
}

async function verifyAppSession(token) {
  if (!APP_AUTH_REQUIRED) return appSessionData(defaultSystemUser, { csrfToken: null, expiresAt: null });
  const [body, signature] = String(token || "").split(".");
  if (!body || !signature || !safeEqualString(signature, hmacBase64Url(body))) {
    throw new HttpError(401, "系统访问会话无效，请重新输入访问密码。");
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw new HttpError(401, "系统访问会话格式无效，请重新输入访问密码。");
  }
  if (!payload.exp || Number(payload.exp) <= Date.now()) {
    throw new HttpError(401, "系统访问会话已过期，请重新输入访问密码。");
  }
  const user = await findUserById(payload.uid);
  if (!user || user.disabled || Number(payload.sv) !== Number(user.session_version || 1)) {
    throw new HttpError(401, "系统账号不存在或已停用，请重新登录。");
  }
  return appSessionData(user, {
    csrfToken: payload.csrf || null,
    expiresAt: new Date(Number(payload.exp)).toISOString()
  });
}

function isEmbeddedWechatBrowser(req) {
  return /MicroMessenger/i.test(String(req?.headers?.["user-agent"] || ""));
}

function appSessionTokenFromHeader(req) {
  if (!isEmbeddedWechatBrowser(req)) return "";
  const value = req.headers[APP_SESSION_HEADER_NAME];
  const token = Array.isArray(value) ? value[0] : String(value || "");
  return token.length <= 4_096 ? token : "";
}

async function getAppSession(req) {
  if (!APP_AUTH_REQUIRED) return appSessionData(defaultSystemUser, { csrfToken: null, expiresAt: null });
  const platformIdentity = verifyPlatformSso(req);
  if (platformIdentity) {
    const mappedUsername = platformIdentity.account_id
      ? platformIdentity.local_username
      : process.env.PLATFORM_SSO_CAMPUS_USERNAME || platformIdentity.sub;
    const user = await findUserByUsername(mappedUsername);
    if (!user || user.disabled || user.role !== "admin") {
      throw new HttpError(403, "统一管理员未映射到校园服务管理员账号。", null, "PLATFORM_SSO_ACCOUNT_NOT_MAPPED");
    }
    return {
      required: true,
      platformSso: true,
      platformUserId: platformIdentity.sub,
      platformRole: platformIdentity.role,
      ...appSessionData(user, {
        csrfToken: platformIdentity.csrf,
        expiresAt: new Date((platformIdentity.session_exp || platformIdentity.exp) * 1000).toISOString()
      })
    };
  }
  const headerToken = appSessionTokenFromHeader(req);
  if (headerToken) return verifyAppSession(headerToken);
  const cookies = parseCookieHeader(req.headers.cookie);
  const embeddedWechat = isEmbeddedWechatBrowser(req);
  const cookieToken = embeddedWechat
    ? (cookies[APP_EMBEDDED_COOKIE_NAME] || cookies[APP_COOKIE_NAME])
    : cookies[APP_COOKIE_NAME];
  if (!cookieToken) return verifyAppSession("");
  return verifyAppSession(cookieToken);
}

async function appAuthStatus(req) {
  if (!APP_AUTH_REQUIRED) {
    return { required: false, ...appSessionData(defaultSystemUser, { csrfToken: null, expiresAt: null }) };
  }
  try {
    return { required: true, ...await getAppSession(req) };
  } catch {
    return { required: true, authenticated: false, csrfToken: null, expiresAt: null };
  }
}

function appSessionSetCookies(req, token, maxAge) {
  // Older WeChat/X5 WebViews may reject an unsupported __Host- cookie or
  // multiple Set-Cookie values. Keep one host-only fallback cookie for them.
  const cookieName = APP_COOKIE_SECURE && isEmbeddedWechatBrowser(req)
    ? APP_EMBEDDED_COOKIE_NAME
    : APP_COOKIE_NAME;
  return serializeCookie(cookieName, token, { maxAge });
}

function issueAppSessionHeaders(user, req) {
  const ttlMs = Math.max(1, APP_SESSION_TTL_HOURS) * 60 * 60 * 1000;
  const payload = {
    v: 1,
    uid: user.id,
    sv: Number(user.session_version || 1),
    iat: Date.now(),
    exp: Date.now() + ttlMs,
    csrf: randomToken(24)
  };
  const token = signAppSession(payload);
  const session = {
    required: true,
    ...appSessionData(user, {
      csrfToken: payload.csrf,
      expiresAt: new Date(payload.exp).toISOString()
    })
  };
  if (isEmbeddedWechatBrowser(req)) session.sessionToken = token;
  return {
    session,
    headers: {
      "set-cookie": appSessionSetCookies(req, token, Math.floor(ttlMs / 1000))
    }
  };
}

function clearAppSessionHeaders(req) {
  return { "set-cookie": appSessionSetCookies(req, "", 0) };
}

function clientAddress(req) {
  const remote = String(req.socket?.remoteAddress || "unknown").slice(0, 64);
  if (!TRUST_PROXY) return remote;
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",").at(-1).trim();
  return isIP(forwarded) ? forwarded : remote;
}

function loginAttemptKeys(req, username) {
  const ip = clientAddress(req);
  const account = normalizeUsername(username) || "unknown";
  return { ip, account: `${ip}|${account}` };
}

function checkAppLoginRate(req, username) {
  const keys = loginAttemptKeys(req, username);
  const ipResult = loginIpLimiter.check(keys.ip);
  const accountResult = loginAccountLimiter.check(keys.account);
  if (!ipResult.allowed || !accountResult.allowed) {
    const waitSeconds = Math.ceil(Math.max(ipResult.retryAfterMs, accountResult.retryAfterMs) / 1000);
    throw new HttpError(429, `访问密码尝试次数过多，请 ${waitSeconds} 秒后再试。`);
  }
}

function recordAppLoginAttempt(req, username, success) {
  const keys = loginAttemptKeys(req, username);
  if (success) {
    loginAccountLimiter.reset(keys.account);
    return;
  }
  loginIpLimiter.recordFailure(keys.ip);
  loginAccountLimiter.recordFailure(keys.account);
}

function methodNeedsCsrf(method) {
  return !["GET", "HEAD", "OPTIONS"].includes(String(method || "GET").toUpperCase());
}

async function requireAppAccess(req) {
  const session = await getAppSession(req);
  if (
    session.platformSso
    && !platformRoleAllowsRequest(
      session.platformRole,
      req.method,
      new URL(req.url || '/', 'http://campus.internal').pathname
    )
  ) {
    throw new HttpError(403, "The unified-platform role cannot perform this operation.");
  }
  if (methodNeedsCsrf(req.method)) {
    const isPlatformTrustedClient = session.platformSso && req.headers["x-platform-request"] === "console";
    if (!isPlatformTrustedClient) {
      const supplied = req.headers["x-csrf-token"];
      if (!session.csrfToken || !supplied || !safeEqualString(String(supplied), session.csrfToken)) {
        throw new HttpError(403, "系统访问校验失败，请刷新页面后重试。");
      }
    }
  }
  return session;
}

function currentUser() {
  const user = userContextStorage.getStore()?.user;
  if (user) return user;
  const fallback = defaultSystemUser;
  if (!fallback) throw new HttpError(401, "请先登录系统账号。");
  return fallback;
}

function currentUserId() {
  return currentUser().id;
}

function requireAdminUser() {
  const user = currentUser();
  if (user.role !== "admin") throw new HttpError(403, "需要管理员权限。");
  return user;
}

function formEncode(input = {}) {
  const form = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined && value !== null) form.set(key, String(value));
  });
  return form.toString();
}

function normalizeCampusBillQuery(input = {}) {
  const query = typeof input === "string" ? { mode: "month", time: input } : input;
  const mode = query.mode === "recent" ? "recent" : "month";
  const time = query.time || defaultMonth();

  if (mode === "month") {
    if (!/^\d{4}-\d{2}$/.test(time)) {
      throw new HttpError(400, "time 参数格式应为 YYYY-MM。");
    }
    return { mode, time, label: time };
  }

  return { mode: "recent", time: null, label: "最近记录" };
}

function campusQueryFromSearch(searchParams) {
  return normalizeCampusBillQuery({
    mode: searchParams.get("mode") || (searchParams.has("time") ? "month" : "month"),
    time: searchParams.get("time") || defaultMonth()
  });
}

function validDateMs(value) {
  const ms = Date.parse(value || "");
  return Number.isFinite(ms) ? ms : null;
}

function latestIsoDate(...values) {
  const latest = values
    .map(validDateMs)
    .filter((value) => value !== null)
    .sort((a, b) => b - a)[0];
  return latest ? new Date(latest).toISOString() : null;
}

function addHoursIso(value, hours = ASSUMED_SESSION_TTL_HOURS) {
  const ms = validDateMs(value);
  return ms === null ? null : new Date(ms + hours * 60 * 60 * 1000).toISOString();
}

function cookiesForDomain(jar, domain) {
  return Object.values(jar.cookies?.[domain] || {});
}

function validCookieForDomain(jar, domain, predicate = () => true) {
  return cookiesForDomain(jar, domain).find((cookie) => !isCookieExpired(cookie) && predicate(cookie)) || null;
}

function cookieExpiresAt(cookie) {
  return cookie?.expiresAt || null;
}

function sessionStatusValue({ connected, expiresAt, assumedExpiresAt, lastError }) {
  if (lastError) return "error";
  if (!connected) return "missing";
  const expiry = validDateMs(expiresAt || assumedExpiresAt);
  if (expiry !== null && expiry <= Date.now()) return "expired";
  if (expiry !== null && expiry <= Date.now() + SESSION_REFRESH_SKEW_MS) return "refreshing";
  return "active";
}

function sessionNeedsRefresh(summary) {
  if (!summary) return false;
  if (!summary.connected) return true;
  if (summary.status === "expired" || summary.status === "refreshing" || summary.status === "error") return true;
  return false;
}

function refreshBlockedByCas(summary) {
  return !summary?.canRefreshServices || summary.status === "expired" || summary.status === "error";
}

function serviceSessionSummary({ key, label, connected, capturedAt, expiresAt, lastError = null, detail = {} }) {
  const assumedExpiresAt = connected && !expiresAt ? addHoursIso(capturedAt) : null;
  const status = sessionStatusValue({ connected, expiresAt, assumedExpiresAt, lastError });
  return {
    key,
    label,
    connected: Boolean(connected),
    status,
    capturedAt: connected ? capturedAt || null : null,
    expiresAt: expiresAt || null,
    assumedExpiresAt,
    lastError,
    ...detail
  };
}

function casSessionSummary(jar) {
  const castgc = validCookieForDomain(jar, "cas.hgu.edu.cn", (cookie) => cookie.name === "CASTGC");
  const session = validCookieForDomain(jar, "cas.hgu.edu.cn", (cookie) => cookie.name === "SESSION");
  const connected = Boolean(castgc || session);
  const capturedAt = latestIsoDate(castgc?.createdAt, session?.createdAt, jar.meta?.loginAt, jar.updatedAt);
  const expiresAt = cookieExpiresAt(castgc);
  const castgcStatus = sessionStatusValue({
    connected: Boolean(castgc),
    expiresAt,
    assumedExpiresAt: null,
    lastError: null
  });
  const canRefreshServices = Boolean(castgc) && castgcStatus !== "expired";

  return serviceSessionSummary({
    key: "cas",
    label: "CAS 有效期",
    connected,
    capturedAt,
    expiresAt,
    lastError: canRefreshServices ? null : (jar.meta?.cas?.lastError || null),
    detail: {
      hasCasCookie: connected,
      hasTicketGrantingCookie: Boolean(castgc),
      canRefreshServices
    }
  });
}

function energySessionSummary(jar) {
  const nrgCookie = validCookieForDomain(jar, "nrg.hgu.edu.cn");
  const connected = Boolean(nrgCookie);
  const capturedAt = connected ? (jar.meta?.nrgCapturedAt || nrgCookie?.createdAt || jar.updatedAt || null) : null;
  return serviceSessionSummary({
    key: "energy",
    label: "能耗",
    connected,
    capturedAt,
    expiresAt: cookieExpiresAt(nrgCookie),
    lastError: jar.meta?.energy?.lastError || null,
    detail: {
      hasNrgCookie: connected,
      account: jar.meta?.account || null,
      ownerName: jar.meta?.ownerName || null,
      lastValidatedAt: jar.meta?.lastValidatedAt || null
    }
  });
}

function campusSessionSummary(jar) {
  const campus = jar.meta?.campus || {};
  const capturedAt = latestIsoDate(
    campus.easytong?.capturedAt,
    campus.uwc?.capturedAt,
    campus.appdm?.capturedAt,
    campus.uias?.capturedAt
  );
  const connected = Boolean(campus.easytong?.token || campus.uwc?.token || campus.appdm?.token);
  const lastError = campus.lastError || null;

  return serviceSessionSummary({
    key: "campus",
    label: "一卡通",
    connected,
    capturedAt,
    expiresAt: null,
    lastError,
    detail: {
      hasEasytongToken: Boolean(campus.easytong?.token),
      hasUwcToken: Boolean(campus.uwc?.token),
      hasAppdmToken: Boolean(campus.appdm?.token),
      account: campus.easytong?.accNum || campus.uwc?.accNum || null,
      ownerName: campus.easytong?.accName || campus.uwc?.accName || null,
      appdmPersonId: campus.appdm?.personId || null,
      appdmLastError: campus.appdmLastError || null
    }
  });
}

function isLoginPage(text) {
  return /open\.weixin\.qq\.com|window\.location\.href|统一身份认证|<html[\s>]/i.test(String(text || "").slice(0, 1200));
}

function timestamp() {
  return String(Date.now());
}

function appendQuery(path, params = {}) {
  const url = new URL(path, SCHOOL_ORIGIN);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url;
}

function readEnvCookie() {
  if (!ALLOW_GLOBAL_NRG_COOKIE) return "";
  if (process.env.NRG_COOKIE && process.env.NRG_COOKIE.trim()) {
    return process.env.NRG_COOKIE.trim();
  }
  if (process.env.NRG_COOKIE_FILE && existsSync(process.env.NRG_COOKIE_FILE)) {
    return readFileSync(process.env.NRG_COOKIE_FILE, "utf8").trim();
  }
  return "";
}

async function saveSessionJarForUser(userId, incoming) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const row = await repository.getSchoolSession(userId);
    let stored = emptyJar();
    if (row?.jar_json) stored = sensitiveJson.decode(row.jar_json);
    const merged = mergeSessionJars(stored, incoming);
    const expectedVersion = row ? Number(row.version || 0) : null;
    const saved = await repository.replaceSchoolSessionIfVersion(
      userId,
      expectedVersion,
      sensitiveJson.encode(merged),
      merged.updatedAt
    );
    if (saved) {
      setRequestMemo(userContextStorage.getStore(), `school-session:${userId}`, structuredClone(merged));
      return merged;
    }
  }
  throw new HttpError(409, "校园会话正在被其他请求更新，请重试。", null, "SESSION_WRITE_CONFLICT");
}

async function loadSessionJarForUser(userId) {
  const row = await repository.getSchoolSession(userId);
  if (!row) return emptyJar();
  try {
    const parsed = sensitiveJson.decode(row.jar_json);
    return {
      ...emptyJar(),
      ...parsed,
      meta: parsed.meta || {},
      cookies: parsed.cookies || {},
      deletedCookies: parsed.deletedCookies || {}
    };
  } catch (error) {
    if (String(row.jar_json || "").startsWith("enc:v1:")) throw error;
    return emptyJar();
  }
}

async function readSessionJar() {
  const userId = currentUserId();
  return requestMemo(
    userContextStorage.getStore(),
    `school-session:${userId}`,
    () => loadSessionJarForUser(userId),
    { clone: structuredClone }
  );
}

async function saveSessionJar(jar) {
  const merged = await saveSessionJarForUser(currentUserId(), jar);
  Object.assign(jar, merged);
}

async function clearSessionJar() {
  const userId = currentUserId();
  await repository.deleteSchoolSession(userId);
  setRequestMemo(userContextStorage.getStore(), `school-session:${userId}`, emptyJar());
}

function savedSchoolReloginCredentials(jar) {
  const settings = jar.meta?.autoRelogin;
  if (!settings?.enabled || !settings.username || !settings.password) return null;
  return {
    username: settings.username,
    password: settings.password,
    rememberMe: settings.rememberMe !== false
  };
}

function autoReloginSummary(jar) {
  const enabled = Boolean(savedSchoolReloginCredentials(jar));
  const loginAt = validDateMs(jar.meta?.loginAt) ?? validDateMs(jar.meta?.autoRelogin?.savedAt);
  return {
    enabled,
    nextLoginAt: enabled && loginAt !== null
      ? new Date(loginAt + SCHOOL_RELOGIN_INTERVAL_MS).toISOString()
      : null
  };
}

function schoolReloginLog(value) {
  return {
    status: value?.status || null,
    code: value?.code || null,
    message: value?.message || value?.loginRequiredMessage || null
  };
}

async function reloginWithSavedCredentials(reason) {
  return reloginWithSavedCredentialsInternal(reason, { force: false });
}

function schoolSessionReloginWanted(summary, jar) {
  const automatic = autoReloginSummary(jar);
  if (automatic.enabled && (
    !summary?.hasStoredSession
    || !automatic.nextLoginAt
    || Date.parse(automatic.nextLoginAt) <= Date.now()
  )) return true;
  if (!summary?.hasStoredSession) return false;
  if (summary.needsLogin) return true;
  const cas = summary.sessions?.cas;
  const casHealthy = Boolean(cas && (cas.status === "active" || cas.status === "refreshing"));
  if (cas) {
    if (cas.status === "expired" || cas.status === "error") return true;
    if (cas.status === "missing" && savedSchoolReloginCredentials(jar)) return true;
  }
  const portal = summary.sessions?.portal;
  return Boolean(portal && (portal.status === "expired" || portal.status === "error") && !casHealthy);
}

function schoolSessionHealthy(summary) {
  const cas = summary?.sessions?.cas;
  return Boolean(summary && !summary.needsLogin && cas && (cas.status === "active" || cas.status === "refreshing"));
}

async function reloginWithSavedCredentialsInternal(reason, { force }) {
  const userId = currentUserId();
  return schoolReloginQueue.run(userId, async () => {
    const failedAt = schoolReloginFailedAt.get(userId) || 0;
    if (Date.now() - failedAt < SCHOOL_RELOGIN_FAILURE_COOLDOWN_MS) {
      if (force) {
        logger.info("school_session_auto_relogin_skip", {
          userId,
          reason: schoolReloginLog(reason),
          cause: "failure_cooldown"
        });
      }
      return false;
    }
    const jar = await loadSessionJarForUser(userId);
    const current = storedSessionSummary(jar);
    const credentials = savedSchoolReloginCredentials(jar);
    const reloggedAt = schoolReloginSuccessAt.get(userId) || 0;
    if (!force && !schoolSessionReloginWanted(current, jar)) {
      if (!schoolSessionHealthy(current)) {
        logger.info("school_session_auto_relogin_skip", {
          userId,
          reason: schoolReloginLog(reason),
          cause: "session_not_expired"
        });
      }
      return false;
    }
    if (Date.now() - reloggedAt < SCHOOL_RELOGIN_SUCCESS_DEDUPE_MS) {
      if (!force || schoolSessionHealthy(current)) return false;
    }
    if (!credentials) {
      logger.info("school_session_auto_relogin_skip", {
        userId,
        reason: schoolReloginLog(reason),
        cause: "no_saved_credentials"
      });
      return false;
    }
    try {
      await loginWithCasFull({ ...credentials, saveCredentials: true });
      schoolReloginFailedAt.delete(userId);
      schoolReloginSuccessAt.set(userId, Date.now());
      logger.info("school_session_auto_relogin", {
        userId,
        reason: schoolReloginLog(reason)
      });
      return true;
    } catch (error) {
      schoolReloginFailedAt.set(userId, Date.now());
      logger.warn("school_session_auto_relogin_failed", {
        userId,
        reason: schoolReloginLog(reason),
        error: schoolReloginLog(error)
      });
      return false;
    }
  });
}

function schoolAuthRecoveryAllowed(req, error) {
  if (!isCasLoginRequiredError(error)) return false;
  const path = String(req.url || "").split("?", 1)[0];
  if (path.startsWith("/api/auth/") || path.startsWith("/api/app-auth/")) return false;
  return Boolean(userContextStorage.getStore()?.user);
}

function schoolAuthRequestRetryAllowed(req, error) {
  if (!schoolAuthRecoveryAllowed(req, error)) return false;
  return req.method === "GET" || req.method === "HEAD";
}

async function recoverSchoolSessionAfterAuthError(error) {
  const userId = currentUserId();
  if (!userId) return false;
  try {
    const jar = await loadSessionJarForUser(userId);
    markCasFailureIfNeeded(jar, error);
    await saveSessionJarForUser(userId, jar);
    const recovered = await reloginWithSavedCredentialsInternal(error, { force: true });
    if (recovered) {
      await refreshSchoolSessionMemo();
    }
    return recovered;
  } catch (recoveryError) {
    logger.warn("school_session_auto_relogin_error_path_failed", {
      userId,
      reason: schoolReloginLog(error),
      error: recoveryError?.message || String(recoveryError)
    });
    return false;
  }
}

async function refreshSchoolSessionMemo() {
  const userId = currentUserId();
  const store = userContextStorage.getStore();
  if (!userId || !store) return;
  setRequestMemo(store, `school-session:${userId}`, await loadSessionJarForUser(userId));
}

async function schoolSessionRecoveredOrHealthy() {
  const userId = currentUserId();
  if (!userId) return false;
  try {
    const jar = await loadSessionJarForUser(userId);
    return schoolSessionHealthy(storedSessionSummary(jar));
  } catch {
    return false;
  }
}

async function reloginSchoolSessionIfWanted(reason = { message: "background school task" }) {
  const userId = currentUserId();
  if (!userId) return false;
  try {
    const jar = await loadSessionJarForUser(userId);
    if (!schoolSessionReloginWanted(storedSessionSummary(jar), jar)) return false;
    return reloginWithSavedCredentials(reason);
  } catch (error) {
    logger.warn("school_session_auto_relogin_precheck_failed", {
      userId,
      reason: schoolReloginLog(reason),
      error: error?.message || String(error)
    });
    return false;
  }
}

function academicSessionSummary(jar) {
  const academicCookie = validCookieForDomain(jar, "newjwxs.hgu.edu.cn");
  const capturedAt = academicCookie ? (jar.meta?.academicCapturedAt || jar.updatedAt || null) : null;
  return serviceSessionSummary({
    key: "academic",
    label: "教务",
    connected: Boolean(academicCookie),
    capturedAt,
    expiresAt: cookieExpiresAt(academicCookie),
    lastError: jar.meta?.academic?.lastError || null,
    detail: {
      hasAcademicCookie: Boolean(academicCookie)
    }
  });
}

function portalSessionSummary(jar) {
  const portalCookie = validCookieForDomain(jar, "my.hgu.edu.cn");
  const connected = Boolean(portalCookie);
  const capturedAt = connected ? (jar.meta?.portalCapturedAt || portalCookie?.createdAt || jar.updatedAt || null) : null;
  return serviceSessionSummary({
    key: "portal",
    label: "用户中心",
    connected,
    capturedAt,
    expiresAt: cookieExpiresAt(portalCookie),
    lastError: jar.meta?.portal?.lastError || null,
    detail: {
      hasPortalCookie: connected
    }
  });
}

function libroomSessionSummary(jar) {
  const libroom = jar.meta?.libroom || {};
  return serviceSessionSummary({
    key: "libroom",
    label: "空间预约",
    connected: Boolean(libroom.token),
    capturedAt: libroom.capturedAt || null,
    expiresAt: libroom.expiresAt || null,
    lastError: libroom.lastError || null,
    detail: {
      hasToken: Boolean(libroom.token)
    }
  });
}

function librarySeatSessionSummary(jar) {
  const librarySeat = jar.meta?.librarySeat || {};
  return serviceSessionSummary({
    key: "librarySeat",
    label: "座位预约",
    connected: Boolean(librarySeat.token),
    capturedAt: librarySeat.capturedAt || null,
    expiresAt: librarySeat.expiresAt || null,
    lastError: librarySeat.lastError || null,
    detail: {
      hasToken: Boolean(librarySeat.token)
    }
  });
}

function isCasLoginRequiredError(error) {
  const message = error?.message || "";
  const code = error?.code || "";
  return Boolean(
    error?.status === 401
    && (
      /统一身份认证|CAS|重新登录学校账号/.test(message)
      || code === "LIBROOM_AUTH_EXPIRED"
      || code === "LIBROOM_CAS_TICKET_REQUIRED"
      || code === "LIBRARY_SEAT_AUTH_EXPIRED"
      || code === "LIBRARY_SEAT_CAS_TOKEN_REQUIRED"
    )
  );
}

function casLoginRequiredMessage(error) {
  const message = error?.message || "";
  return /统一身份认证|CAS|重新登录学校账号/.test(message)
    ? message
    : "统一身份认证会话已过期，请重新登录学校账号。";
}

function markCasFailureIfNeeded(jar, error) {
  if (isCasLoginRequiredError(error)) {
    jar.meta ||= {};
    jar.meta.cas ||= {};
    jar.meta.cas.lastError = casLoginRequiredMessage(error);
  }
}

function sessionHasLoginRequiredError(summary) {
  const message = summary?.lastError || summary?.appdmLastError || "";
  return summary?.status === "error" && /统一身份认证|CAS|重新登录学校账号/.test(message);
}

function storedSessionSummary(jar) {
  const cas = casSessionSummary(jar);
  const energy = energySessionSummary(jar);
  const campus = campusSessionSummary(jar);
  const academic = academicSessionSummary(jar);
  const portal = portalSessionSummary(jar);
  const libroom = libroomSessionSummary(jar);
  const librarySeat = librarySeatSessionSummary(jar);
  const hasStoredSession = Boolean(cas.connected || energy.connected || campus.connected || academic.connected || portal.connected || libroom.connected || libroom.lastError || librarySeat.connected || librarySeat.lastError);
  const schoolAccount = normalizeSchoolLoginAccount(jar.meta?.schoolAccount || jar.meta?.loginUsername);
  const primaryRefreshableSessions = [energy, campus, academic];
  const globalLoginSessions = [energy, academic, libroom, librarySeat];
  const needsLogin = hasStoredSession && (
    (refreshBlockedByCas(cas) && primaryRefreshableSessions.some(sessionNeedsRefresh))
    || globalLoginSessions.some(sessionHasLoginRequiredError)
  );
  const loginRequiredMessage = needsLogin ? "统一身份认证会话已过期，请重新登录学校账号。" : null;

  const sessions = { cas, energy, campus, academic, portal, libroom, librarySeat };
  if (loginRequiredMessage) {
    for (const session of primaryRefreshableSessions) {
      if (sessionNeedsRefresh(session)) {
        session.status = "expired";
        session.lastError ||= loginRequiredMessage;
      }
    }
  }

  return {
    hasStoredSession,
    hasNrgCookie: energy.hasNrgCookie,
    hasCasCookie: cas.hasCasCookie,
    capturedAt: energy.capturedAt || cas.capturedAt || null,
    expiresAt: energy.expiresAt || null,
    assumedExpiresAt: energy.assumedExpiresAt || null,
    lastValidatedAt: energy.lastValidatedAt || null,
    account: energy.account || jar.meta?.account || null,
    ownerName: energy.ownerName || jar.meta?.ownerName || null,
    schoolAccount,
    hasSchoolAccount: Boolean(schoolAccount),
    autoRelogin: autoReloginSummary(jar),
    needsLogin,
    loginRequiredMessage,
    sessions,
    campus,
    academic,
    portal
  };
}

async function refreshStoredSessionsIfNeeded(jar) {
  const before = storedSessionSummary(jar);
  if (schoolSessionReloginWanted(before, jar)) {
    const relogined = await reloginWithSavedCredentials(before);
    if (relogined) {
      Object.assign(jar, await loadSessionJarForUser(currentUserId()));
      return jar;
    }
  }
  if (!before.hasStoredSession) return jar;
  if (refreshBlockedByCas(before.sessions.cas)) return jar;

  let touched = false;
  if (before.sessions.cas.canRefreshServices && jar.meta?.cas?.lastError) {
    jar.meta.cas.lastError = null;
    touched = true;
  }

  const setMetaError = (section, error, { markCas = true } = {}) => {
    jar.meta[section] ||= {};
    if (markCas) markCasFailureIfNeeded(jar, error);
    jar.meta[section].lastError = error.message || "学校会话自动刷新失败，请重新登录学校账号。";
    touched = true;
  };

  if (sessionNeedsRefresh(before.sessions.energy)) {
    try {
      const view = await getViewData(jar);
      jar.meta.account = view.account || jar.meta.account || null;
      jar.meta.ownerName = view.ownerName || jar.meta.ownerName || null;
      jar.meta.lastValidatedAt = new Date().toISOString();
      jar.meta.energy ||= {};
      jar.meta.energy.lastError = null;
      touched = true;
    } catch (error) {
      setMetaError("energy", error);
    }
  }

  if (sessionNeedsRefresh(before.sessions.campus)) {
    try {
      await activateCampusSessions(jar, {});
      touched = true;
    } catch (error) {
      jar.meta.campus ||= {};
      jar.meta.campus.lastError = error.message || "校园一卡通自动刷新失败，请重新登录学校账号。";
      touched = true;
    }
  }

  if (sessionNeedsRefresh(before.sessions.academic)) {
    try {
      await activateAcademicSession(jar, {});
      touched = true;
    } catch (error) {
      setMetaError("academic", error);
    }
  }

  if (sessionNeedsRefresh(before.sessions.portal)) {
    try {
      await activatePortalSession(jar, {});
      touched = true;
    } catch (error) {
      setMetaError("portal", error, { markCas: false });
    }
  }

  if (touched) await saveSessionJar(jar);
  return jar;
}

async function sessionStatus({ refresh = true } = {}) {
  const jar = await readSessionJar();
  if (refresh) {
    await refreshStoredSessionsIfNeeded(jar);
  }
  const stored = storedSessionSummary(jar);
  const envCookie = readEnvCookie();
  return {
    ...stored,
    source: stored.hasStoredSession ? "stored" : envCookie ? "env" : "none",
    hasCookie: stored.hasStoredSession || Boolean(envCookie),
    hasEnvCookie: Boolean(envCookie),
    schoolOrigin: SCHOOL_ORIGIN
  };
}

function casEncryptPassword(password) {
  return encryptCasPassword(password, {
    modulusHex: CAS_RSA_MODULUS,
    exponentHex: CAS_RSA_EXPONENT
  });
}

function assertAllowedSchoolUrl(value) {
  try {
    return normalizeAllowedSchoolUrl(value, { extraHosts: EXTRA_ALLOWED_SCHOOL_HOSTS });
  } catch (error) {
    if (error?.code === "UNTRUSTED_SCHOOL_REDIRECT") {
      throw new HttpError(502, error.message, null, error.code);
    }
    throw error;
  }
}

function assertUpstreamResponseSize(response) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_UPSTREAM_RESPONSE_BYTES) {
    response.body?.cancel().catch(() => {});
    throw new HttpError(502, "学校系统返回的数据超过安全上限。");
  }
}

async function readUpstreamText(response) {
  try {
    assertUpstreamResponseSize(response);
    if (!response.body) return "";
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      reader.cancel().catch(() => {});
    }, REQUEST_TIMEOUT_MS);
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_UPSTREAM_RESPONSE_BYTES) {
          await reader.cancel().catch(() => {});
          throw new HttpError(502, "学校系统返回的数据超过安全上限。", null, "UPSTREAM_RESPONSE_TOO_LARGE");
        }
        chunks.push(Buffer.from(value));
      }
    } finally {
      clearTimeout(timeout);
    }
    if (timedOut) throw new HttpError(504, "学校系统响应超时。", null, "UPSTREAM_RESPONSE_TIMEOUT");
    return Buffer.concat(chunks, total).toString("utf8");
  } finally {
    releaseUpstreamResponse(response);
  }
}

async function fetchWithJar(url, {
  jar,
  method = "GET",
  headers = {},
  body,
  timeoutMs = REQUEST_TIMEOUT_MS,
  redirect = "manual"
} = {}) {
  const safeUrl = assertAllowedSchoolUrl(url);
  if (activeUpstreamRequests >= MAX_CONCURRENT_UPSTREAM_REQUESTS) {
    throw new HttpError(503, "学校接口请求较多，请稍后重试。", null, "UPSTREAM_CAPACITY_EXCEEDED");
  }
  activeUpstreamRequests += 1;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const cookie = cookieHeaderFor(jar, safeUrl);
  const requestHeaders = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    ...headers
  };
  if (cookie) requestHeaders.cookie = cookie;

  try {
    const response = await fetch(safeUrl, {
      method,
      headers: requestHeaders,
      body,
      redirect,
      signal: controller.signal
    });
    assertUpstreamResponseSize(response);
    updateJarFromResponse(jar, response, safeUrl);
    return trackUpstreamResponse(response, () => {
      activeUpstreamRequests -= 1;
    });
  } catch (error) {
    activeUpstreamRequests -= 1;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function followRedirectsWithJar(startUrl, jar, options = {}) {
  let currentUrl = startUrl;
  let response = null;
  for (let i = 0; i < 8; i += 1) {
    response = await fetchWithJar(currentUrl, { ...options, jar, redirect: "manual" });
    if (response.status < 300 || response.status >= 400) return { response, url: currentUrl };
    const location = response.headers.get("location");
    if (!location) return { response, url: currentUrl };
    await discardUpstreamResponse(response);
    currentUrl = assertAllowedSchoolUrl(new URL(location, currentUrl).href);
    options = { method: "GET", headers: options.headers || {} };
  }
  throw new HttpError(502, "登录跳转次数过多。");
}

async function loginCasService({ jar, username, password, rememberMe = true, serviceUrl }) {
  const loginUrl = `${CAS_ORIGIN}/cas/login?service=${encodeURIComponent(serviceUrl)}`;
  const loginPage = await fetchWithJar(loginUrl, {
    jar,
    headers: { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }
  });

  if (loginPage.status >= 300 && loginPage.status < 400) {
    const location = loginPage.headers.get("location");
    await discardUpstreamResponse(loginPage);
    if (!location) throw new HttpError(401, "CAS 未返回服务跳转地址，登录失败。");
    return followRedirectsWithJar(new URL(location, loginUrl).href, jar, {
      method: "GET",
      headers: { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }
    });
  }

  const html = await readUpstreamText(loginPage);
  const redirectUrl = extractSimpleLocationRedirectUrl(html, loginUrl);
  if (redirectUrl) return assertAllowedSchoolUrl(redirectUrl);

  if (!username || !password) {
    throw new HttpError(401, "统一身份认证会话已过期，请重新登录学校账号。");
  }
  if (html.includes('id="authcode"')) {
    throw new HttpError(400, "学校登录页当前需要验证码，暂不支持自动登录。请先在学校页面正常登录一次。");
  }

  const execution = extractInputValue(html, "execution");
  if (!execution) {
    throw new HttpError(502, "未找到 CAS 登录令牌 execution，登录页结构可能已变化。");
  }

  const action = new URL(extractFormAction(html, serviceUrl), loginUrl).href;
  const form = new URLSearchParams();
  form.set("username", username);
  form.set("password", casEncryptPassword(password));
  form.set("execution", execution);
  form.set("encrypted", "true");
  form.set("_eventId", "submit");
  form.set("loginType", "1");
  form.set("submit", "登录");
  if (rememberMe) form.set("rememberMe", "true");

  const post = await fetchWithJar(action, {
    jar,
    method: "POST",
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "content-type": "application/x-www-form-urlencoded",
      origin: CAS_ORIGIN,
      referer: loginUrl
    },
    body: form.toString()
  });

  if (post.status < 300 || post.status >= 400) {
    const failureHtml = await readUpstreamText(post);
    throw new HttpError(401, htmlErrorMessage(failureHtml));
  }

  const location = post.headers.get("location");
  await discardUpstreamResponse(post);
  if (!location) {
    throw new HttpError(401, "CAS 未返回服务跳转地址，登录失败。");
  }

  return followRedirectsWithJar(new URL(location, action).href, jar, {
    method: "GET",
    headers: { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }
  });
}

async function getCasTicketRedirect({ jar, username, password, rememberMe = true, serviceUrl, loginBaseUrl = `${CAS_ORIGIN}/cas/login` }) {
  let loginUrl = casLoginUrlWithService(loginBaseUrl, serviceUrl, CAS_ORIGIN);
  let loginPage = await fetchWithJar(loginUrl, {
    jar,
    headers: { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }
  });

  for (let i = 0; loginPage.status >= 300 && loginPage.status < 400 && i < 4; i += 1) {
    const location = loginPage.headers.get("location");
    await discardUpstreamResponse(loginPage);
    if (!location) throw new HttpError(401, "CAS 未返回服务跳转地址，登录失败。");
    const redirectUrl = assertAllowedSchoolUrl(new URL(location, loginUrl).href);
    if (!isCasLoginRedirect(redirectUrl, CAS_ORIGIN)) return redirectUrl;
    loginUrl = redirectUrl;
    loginPage = await fetchWithJar(loginUrl, {
      jar,
      headers: { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }
    });
  }

  const html = await readUpstreamText(loginPage);
  if (!username || !password) {
    throw new HttpError(401, "统一身份认证会话已过期，请重新登录学校账号。");
  }
  if (html.includes('id="authcode"')) {
    throw new HttpError(400, "学校登录页当前需要验证码，暂不支持自动登录。请先在学校页面正常登录一次。");
  }

  const execution = extractInputValue(html, "execution");
  if (!execution) {
    throw new HttpError(502, "未找到 CAS 登录令牌 execution，登录页结构可能已变化。");
  }

  const action = new URL(extractFormAction(html, serviceUrl), loginUrl).href;
  const form = new URLSearchParams();
  form.set("username", username);
  form.set("password", casEncryptPassword(password));
  form.set("execution", execution);
  form.set("encrypted", "true");
  form.set("_eventId", "submit");
  form.set("loginType", "1");
  form.set("submit", "登录");
  if (rememberMe) form.set("rememberMe", "true");

  const post = await fetchWithJar(action, {
    jar,
    method: "POST",
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "content-type": "application/x-www-form-urlencoded",
      origin: CAS_ORIGIN,
      referer: loginUrl
    },
    body: form.toString()
  });
  if (post.status < 300 || post.status >= 400) {
    const failureHtml = await readUpstreamText(post);
    throw new HttpError(401, htmlErrorMessage(failureHtml));
  }
  const location = post.headers.get("location");
  await discardUpstreamResponse(post);
  if (!location) throw new HttpError(401, "CAS 未返回服务跳转地址，登录失败。");
  return assertAllowedSchoolUrl(new URL(location, action).href);
}

async function loginWithCasFull({ username, password, rememberMe = true, saveCredentials = false }) {
  const jar = emptyJar();
  await loginCasService({ jar, username, password, rememberMe, serviceUrl: SERVICE_URL });

  jar.meta.schoolAccount = normalizeSchoolLoginAccount(username);
  jar.meta.autoRelogin = saveCredentials
    ? {
        enabled: true,
        username: normalizeSchoolLoginAccount(username),
        password,
        rememberMe: rememberMe !== false,
        savedAt: new Date().toISOString()
      }
    : null;
  jar.meta.loginAt = new Date().toISOString();
  await saveSessionJar(jar);
  let view = null;
  try {
    view = await getViewData(jar);
  } catch (error) {
    jar.meta.energy ||= {};
    jar.meta.energy.lastError = error.message || "能耗平台登录后刷新失败，请稍后重试。";
  }
  if (view) {
    jar.meta.account = view.account || null;
    jar.meta.ownerName = view.ownerName || null;
    jar.meta.lastValidatedAt = new Date().toISOString();
  }
  await activateCampusSessions(jar, { username, password, rememberMe }).catch((error) => {
    jar.meta.campus ||= {};
    jar.meta.campus.lastError = error.message || "校园一卡通登录失败";
  });
  await activateAcademicSession(jar, { username, password, rememberMe }).catch((error) => {
    jar.meta.academic ||= {};
    jar.meta.academic.lastError = error.message || "教务系统登录失败";
  });
  await activatePortalSession(jar, { username, password, rememberMe }).catch((error) => {
    jar.meta.portal ||= {};
    jar.meta.portal.lastError = error.message || "用户中心登录失败";
  });
  await issueLibroomMemberToken(jar, { username, password, rememberMe }).catch((error) => {
    logger.warn("libroom_member_token_failed", { userId: currentUserId(), ...libroomFailureLog(error) });
    markCasFailureIfNeeded(jar, error);
    jar.meta.libroom = {
      lastError: isCasLoginRequiredError(error)
        ? casLoginRequiredMessage(error)
        : (error.message || "空间预约登录失败")
    };
  });
  await saveSessionJar(jar);
  return { view, status: storedSessionSummary(jar) };
}

async function loginWithCas({ username, password, rememberMe = true, saveCredentials = false }) {
  return loginWithCasFull({ username, password, rememberMe, saveCredentials });
}

function calendarPaths(token) {
  const encoded = encodeURIComponent(token);
  return {
    path: `/api/academic/calendar/${encoded}.ics`,
    platformPath: `/api/campus/academic/calendar/${encoded}.ics`
  };
}

function decodeCalendarToken(row) {
  if (!row?.enabled || !row.token_json) return "";
  try {
    return String(sensitiveJson.decode(row.token_json)?.token || "");
  } catch {
    return "";
  }
}

function publicReminderPreference(row) {
  return {
    enabled: Boolean(row?.enabled),
    recipientId: String(row?.recipient_id || ""),
    appRecipientId: String(row?.app_recipient_id || ""),
    leadMinutes: Number(row?.lead_minutes || 15),
    updatedAt: row?.updated_at || null,
    deliveryConfigured: Boolean(process.env.NOTIFICATION_SERVICE_URL && (process.env.CAMPUS_NOTIFICATION_API_KEY || process.env.NOTIFY_API_KEY))
  };
}

async function academicIntegrationSettings(userId) {
  const [subscription, reminder] = await Promise.all([
    repository.getCalendarSubscription(userId),
    repository.getReminderPreference(userId)
  ]);
  const token = decodeCalendarToken(subscription);
  return {
    calendar: {
      enabled: Boolean(subscription?.enabled && token),
      ...(token ? calendarPaths(token) : {}),
      updatedAt: subscription?.updated_at || null
    },
    reminder: publicReminderPreference(reminder)
  };
}

async function rotateAcademicCalendarSubscription(userId) {
  const token = randomBytes(32).toString("base64url");
  await repository.upsertCalendarSubscription(userId, {
    tokenHash: sha256Hex(token),
    tokenJson: sensitiveJson.encode({ token }),
    enabled: true,
    timestamp: nowIso()
  });
  return academicIntegrationSettings(userId);
}

async function saveAcademicReminderPreference(userId, body = {}, platformUserId = "") {
  const enabled = Boolean(body.enabled);
  const recipientId = String(body.recipientId || "").trim();
  const current = platformUserId ? null : await repository.getReminderPreference(userId);
  const appRecipientId = String(platformUserId || current?.app_recipient_id || "").trim();
  const leadMinutes = Number(body.leadMinutes || 15);
  if (recipientId && !/^[^\s|]{1,128}$/u.test(recipientId)) {
    throw new HttpError(400, "企业微信成员账号格式无效。");
  }
  if (enabled && !recipientId && !appRecipientId) {
    throw new HttpError(400, "启用提醒时必须关联 App 平台账号或填写企业微信成员账号。");
  }
  if (![5, 10, 15, 30, 60].includes(leadMinutes)) {
    throw new HttpError(400, "课前提醒时间只支持 5、10、15、30 或 60 分钟。");
  }
  const row = await repository.upsertReminderPreference(userId, {
    enabled,
    recipientId,
    appRecipientId,
    leadMinutes
  }, nowIso());
  return publicReminderPreference(row);
}

async function cachedAcademicTimetableForUser(userId) {
  const row = await repository.getAcademicCache(userId, ACADEMIC_TIMETABLE_SOURCES.current.key)
    || await repository.getAcademicCache(userId, ACADEMIC_TIMETABLE_SOURCES.selection.key);
  if (!row) return null;
  try {
    return sensitiveJson.decode(row.cache_json);
  } catch {
    return null;
  }
}

async function serveAcademicCalendar(res, token) {
  const subscription = await repository.findCalendarSubscriptionByTokenHash(sha256Hex(token));
  if (!subscription) {
    json(res, 404, { ok: false, error: "课程日历订阅不存在或已停用。" });
    return;
  }
  const timetable = await cachedAcademicTimetableForUser(subscription.user_id);
  if (!timetable) {
    json(res, 503, { ok: false, error: "课程表尚未同步，请先在校园工作台同步课表。" });
    return;
  }
  const body = renderAcademicCalendar(timetable);
  res.writeHead(200, {
    ...securityHeaders(),
    "x-request-id": userContextStorage.getStore()?.requestId || "",
    "content-type": "text/calendar; charset=utf-8",
    "content-disposition": "inline; filename=campus-calendar.ics",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

async function readBodyText(req) {
  const declaredLength = Number(req.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
    req.resume();
    throw new HttpError(413, "请求体过大。");
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_JSON_BODY_BYTES) {
      req.resume();
      throw new HttpError(413, "请求体过大。");
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return "";
  return Buffer.concat(chunks).toString("utf8");
}

async function readBodyJson(req) {
  const contentType = String(req.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
  if (contentType && contentType !== "application/json") {
    throw new HttpError(415, "请求体必须使用 application/json。", null, "UNSUPPORTED_MEDIA_TYPE");
  }
  const text = await readBodyText(req);
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new HttpError(400, "JSON 请求体格式不正确。", null, "INVALID_JSON");
  }
}

async function readBodyForm(req) {
  const contentType = String(req.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") {
    throw new HttpError(415, "请求体必须使用表单编码。", null, "UNSUPPORTED_MEDIA_TYPE");
  }
  return Object.fromEntries(new URLSearchParams(await readBodyText(req)));
}

async function activeCookieHeader(targetUrl) {
  const jar = await readSessionJar();
  const stored = cookieHeaderFor(jar, targetUrl);
  if (stored) return { cookie: stored, jar, source: "stored" };
  const envCookie = readEnvCookie();
  if (envCookie) return { cookie: envCookie, jar, source: "env" };
  return { cookie: "", jar, source: "none" };
}

async function schoolRequest(path, {
  method = "POST",
  params = {},
  referer = "/wecom/oauth/servicecenter/main.do",
  timeoutMs = REQUEST_TIMEOUT_MS,
  jar: explicitJar
} = {}) {
  const upperMethod = method.toUpperCase();
  const targetUrl = upperMethod === "GET" ? appendQuery(path, params) : appendQuery(path);
  const session = explicitJar
    ? { cookie: cookieHeaderFor(explicitJar, targetUrl.href), jar: explicitJar, source: "stored" }
    : await activeCookieHeader(targetUrl.href);

  if (!session.cookie) {
    throw new HttpError(401, "还没有连接学校账号，请先登录。");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    accept: "application/json,text/javascript,*/*;q=0.01",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0",
    "x-requested-with": "XMLHttpRequest",
    origin: SCHOOL_ORIGIN,
    referer: new URL(referer, SCHOOL_ORIGIN).href,
    cookie: session.cookie
  };

  const options = {
    method: upperMethod,
    headers,
    redirect: "manual",
    signal: controller.signal
  };

  if (upperMethod !== "GET") {
    headers["content-type"] = "application/x-www-form-urlencoded; charset=UTF-8";
    options.body = new URLSearchParams(params).toString();
  }

  if (activeUpstreamRequests >= MAX_CONCURRENT_UPSTREAM_REQUESTS) {
    clearTimeout(timer);
    throw new HttpError(503, "学校接口请求较多，请稍后重试。", null, "UPSTREAM_CAPACITY_EXCEEDED");
  }
  activeUpstreamRequests += 1;
  try {
    assertAllowedSchoolUrl(targetUrl.href);
    const response = await fetch(targetUrl, options);
    assertUpstreamResponseSize(response);
    if (session.source === "stored") updateJarFromResponse(session.jar, response, targetUrl.href);
    const text = await readUpstreamText(response);

    if (response.status >= 300 && response.status < 400) {
      throw new HttpError(401, "学校平台返回登录跳转，会话可能已过期。", {
        location: response.headers.get("location"),
        endpoint: targetUrl.pathname
      });
    }
    if (!response.ok) {
      throw new HttpError(response.status, `学校接口返回 HTTP ${response.status}`, {
        endpoint: targetUrl.pathname,
        sample: text.slice(0, 300)
      });
    }
    if (isLoginPage(text)) {
      throw new HttpError(401, "学校平台返回登录页，会话可能已过期。", {
        endpoint: targetUrl.pathname
      });
    }

    const parsed = parseJsonLike(text);
    if (parsed && parsed.success === false) {
      throw new HttpError(502, parsed.reason || "学校接口返回失败。", {
        endpoint: targetUrl.pathname,
        raw: parsed
      });
    }

    if (session.source === "stored") await saveSessionJar(session.jar);
    return parsed && Object.prototype.hasOwnProperty.call(parsed, "data") ? parsed.data : parsed;
  } finally {
    clearTimeout(timer);
    activeUpstreamRequests -= 1;
  }
}

async function activateEnergySession(jar, credentials = {}) {
  await loginCasService({
    jar,
    username: credentials.username,
    password: credentials.password,
    rememberMe: credentials.rememberMe ?? true,
    serviceUrl: SERVICE_URL
  });
  jar.meta.nrgCapturedAt = new Date().toISOString();
  jar.meta.cas ||= {};
  jar.meta.cas.lastError = null;
  jar.meta.energy ||= {};
  jar.meta.energy.lastError = null;
  await saveSessionJar(jar);
}

async function energyRequest(path, options = {}) {
  const { retryOnAuth = true, jar: explicitJar, ...requestOptions } = options;
  const jar = explicitJar || await readSessionJar();
  try {
    return await schoolRequest(path, { ...requestOptions, jar });
  } catch (error) {
    if (!retryOnAuth || error.status !== 401) throw error;
    await activateEnergySession(jar);
    return schoolRequest(path, { ...requestOptions, jar });
  }
}

async function getViewData(jar, { retryEmpty = true } = {}) {
  const targetJar = jar || await readSessionJar();
  let view = await energyRequest(`/wecom/oauth/servicecenter/getviewdata.do?timestamp=${timestamp()}`, {
    method: "POST",
    referer: "/wecom/oauth/servicecenter/main.do",
    jar: targetJar
  });
  if ((!view || !view.account) && retryEmpty) {
    await activateEnergySession(targetJar);
    view = await getViewData(targetJar, { retryEmpty: false });
  }
  if (!view || !view.account) {
    throw new HttpError(401, "能耗平台没有返回房间信息，会话可能已过期，请重新登录学校账号。");
  }
  return view;
}

async function getWallet(jar, knownView = null) {
  const view = knownView || await getViewData(jar);
  const [account, packages] = await Promise.all([
    energyRequest(`/wecom/oauth/wallet/getWalletAccount.do?timestamp=${timestamp()}`, {
      method: "POST",
      referer: "/wecom/oauth/wallet/main.do",
      jar
    }),
    energyRequest(`/wecom/oauth/wallet/getPackageInfo.do?timestamp=${timestamp()}`, {
      method: "POST",
      referer: "/wecom/oauth/wallet/main.do",
      jar
    }).catch(() => [])
  ]);

  return {
    view,
    account,
    packages: Array.isArray(packages) ? packages : []
  };
}

async function getEnergyRechargeLink() {
  const jar = await readSessionJar();
  const view = await getViewData(jar);
  if (!cookieHeaderFor(jar, `${CAS_ORIGIN}/cas/login`)) {
    throw new HttpError(401, "统一身份认证会话已过期，请在本系统重新登录学校账号后再打开能耗充值。");
  }

  let ticketUrl;
  try {
    ticketUrl = await getCasTicketRedirect({ jar, serviceUrl: ENERGY_RECHARGE_SERVICE_URL });
    jar.meta.cas ||= {};
    jar.meta.cas.lastError = null;
    await saveSessionJar(jar);
  } catch (error) {
    if (error?.status === 401) {
      jar.meta.cas ||= {};
      jar.meta.cas.lastError = "统一身份认证会话已过期，请在本系统重新登录学校账号后再打开能耗充值。";
      await saveSessionJar(jar).catch(() => {});
      throw new HttpError(401, jar.meta.cas.lastError);
    }
    throw error;
  }

  const url = new URL(ticketUrl);
  url.hash = "";
  return {
    url: `${url.href}#`,
    fallbackUrl: ENERGY_RECHARGE_URL,
    autoLogin: true,
    target: "official",
    account: view.account || "",
    room: view.ownerName || view.roomName || "",
    note: "Open the official energy recharge page with a one-time CAS service ticket. Amount selection and payment are completed on nrg.hgu.edu.cn."
  };
}

async function getMonthBill(time, jar) {
  if (!/^\d{4}-\d{2}$/.test(time)) {
    throw new HttpError(400, "time 参数格式应为 YYYY-MM。");
  }
  return energyRequest("/wecom/oauth/mybill/monthOfBillOther.do", {
    method: "GET",
    params: { time, _: timestamp() },
    referer: "/wecom/oauth/mybill/main.do",
    jar
  });
}

async function getYesterdayBill(jar) {
  return energyRequest("/wecom/oauth/mybill/yesterdayOfBill.do", {
    method: "GET",
    params: { _: timestamp() },
    referer: "/wecom/oauth/mybill/main.do",
    jar
  });
}

function buildBatchParams(meterInfo = []) {
  return meterInfo
    .filter((meter) => meter && meter.meterCode && meter.modelCode && meter.catCode)
    .map((meter) => ({
      meterCode: meter.meterCode,
      modelCode: meter.modelCode,
      catCode: meter.catCode
    }));
}

function mergeMeterLiveData(meterInfo = [], liveRows = []) {
  const liveByCode = new Map(liveRows.map((row) => [String(row.meterCode), row]));
  return meterInfo.map((meter) => {
    const live = liveByCode.get(String(meter.meterCode)) || {
      status: meter.isUsed,
      value: meter.temp || ""
    };
    return {
      ...meter,
      live
    };
  });
}

async function getMeters(jar, knownView = null) {
  const view = knownView || await getViewData(jar);
  const data = await energyRequest("/wecom/oauth/meter/getAllMyMetersList.do", {
    method: "POST",
    params: { account: view.account },
    referer: "/wecom/oauth/meter/main.do",
    jar
  });

  const meterInfo = Array.isArray(data?.meterInfo) ? data.meterInfo : [];
  let liveRows = [];
  const batchParams = buildBatchParams(meterInfo);

  if (batchParams.length) {
    const liveResult = await energyRequest("/wecom/oauth/meter/doBatchCheck.do", {
      method: "POST",
      params: { autoCheckParamData: JSON.stringify(batchParams) },
      referer: "/wecom/oauth/meter/main.do",
      timeoutMs: Number(process.env.NRG_METER_LIVE_TIMEOUT_MS || 6000),
      jar
    }).catch((error) => ({ __error: error.message }));

    if (Array.isArray(liveResult?.data)) liveRows = liveResult.data;
    else if (Array.isArray(liveResult)) liveRows = liveResult;
  }

  return {
    view,
    catCode: Array.isArray(data?.catCode) ? data.catCode : [],
    eapsInfo: data?.eapsInfo || {},
    meters: mergeMeterLiveData(meterInfo, liveRows)
  };
}

async function getSummary(time) {
  const jar = await readSessionJar();
  const view = await getViewData(jar);
  const [wallet, bill, meters] = await Promise.all([
    getWallet(jar, view),
    getMonthBill(time, jar),
    getMeters(jar, view)
  ]);
  return { wallet, bill, meters, time };
}

function defaultMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

async function loginSystemUser(req, username, password) {
  const normalizedUsername = username || DEFAULT_ADMIN_USERNAME;
  checkAppLoginRate(req, normalizedUsername);
  const user = await authenticateSystemUser(normalizedUsername, password || "");
  const success = Boolean(user);
  recordAppLoginAttempt(req, normalizedUsername, success);
  if (!success) {
    logger.warn("audit_app_login_failed", {
      clientAddress: clientAddress(req),
      username: normalizeUsername(normalizedUsername)
    });
    throw new HttpError(401, "系统账号或密码不正确。");
  }
  const issued = issueAppSessionHeaders(user, req);
  logger.info("audit_app_login_succeeded", { actorUserId: user.id });
  return issued;
}

async function handleAppLoginForm(req, res) {
  if (!APP_AUTH_REQUIRED) {
    redirect(res, "/");
    return;
  }
  try {
    const body = await readBodyForm(req);
    const issued = await loginSystemUser(req, body.username, body.password);
    redirect(res, "/", issued.headers);
  } catch (error) {
    const code = error instanceof HttpError && error.status === 429 ? "rate-limited" : "invalid";
    redirect(res, `/?appLoginError=${code}`);
  }
}

async function handleApiRoutes(req, res, url) {
    if (url.pathname === "/api/app-auth/status") {
      json(res, 200, { ok: true, data: await appAuthStatus(req) });
      return;
    }
    if (url.pathname === "/api/app-auth/login" && req.method === "POST") {
      if (!APP_AUTH_REQUIRED) {
        json(res, 200, { ok: true, data: await appAuthStatus(req) });
        return;
      }
      const body = await readBodyJson(req);
      const issued = await loginSystemUser(req, body.username, body.password);
      json(res, 200, { ok: true, data: issued.session }, issued.headers);
      return;
    }
    if (url.pathname === "/api/app-auth/register" && req.method === "POST") {
      const body = await readBodyJson(req);
      checkAppLoginRate(req, body.username);
      let user = null;
      try {
        user = await registerWithInvite({
          inviteCode: body.inviteCode,
          username: body.username,
          password: body.password
        });
        recordAppLoginAttempt(req, body.username, true);
      } catch (error) {
        recordAppLoginAttempt(req, body.username, false);
        throw error;
      }
      const issued = issueAppSessionHeaders(user, req);
      json(res, 201, { ok: true, data: issued.session }, issued.headers);
      return;
    }

    if (url.pathname === "/api/health") {
      const { csrfToken: _csrfToken, ...healthAuth } = await appAuthStatus(req);
      json(res, 200, {
        ok: true,
        service: "hgu-campus-hub",
        appAuth: healthAuth
      });
      return;
    }
    if (url.pathname === "/api/ready") {
      const ready = await repository.ping();
      json(res, ready ? 200 : 503, { ok: ready, service: "hgu-campus-hub", ready });
      return;
    }
    const calendarMatch = url.pathname.match(/^\/api\/academic\/calendar\/([A-Za-z0-9_-]{43,128})\.ics$/);
    if (calendarMatch && req.method === "GET") {
      await serveAcademicCalendar(res, calendarMatch[1]);
      return;
    }

    const appSession = APP_AUTH_REQUIRED ? await requireAppAccess(req) : await getAppSession(req);
    const contextUser = await findUserById(appSession.user?.id);
    if (!contextUser) throw new HttpError(401, "请先登录系统账号。");
    const requestContext = userContextStorage.getStore();
    if (requestContext) requestContext.user = contextUser;
    else userContextStorage.enterWith({ user: contextUser });
    const apiLimit = apiUserLimiter.check(contextUser.id);
    if (!apiLimit.allowed) {
      throw new HttpError(429, `请求过于频繁，请 ${Math.ceil(apiLimit.retryAfterMs / 1000)} 秒后重试。`, null, "API_RATE_LIMITED");
    }
    apiUserLimiter.recordFailure(contextUser.id);

    if (url.pathname === "/api/app-auth/logout" && req.method === "POST") {
      if (appSession.platformSso) {
        json(res, 200, { ok: true, data: appSession });
        return;
      }
      await revokeSystemUserSessions(currentUserId());
      logger.info("audit_app_logout", { actorUserId: currentUserId() });
      json(res, 200, {
        ok: true,
        data: { required: APP_AUTH_REQUIRED, authenticated: !APP_AUTH_REQUIRED, csrfToken: null, expiresAt: null }
      }, clearAppSessionHeaders(req));
      return;
    }
    if (url.pathname === "/api/app-auth/password" && req.method === "POST") {
      const body = await readBodyJson(req);
      await changeOwnPassword({
        userId: currentUserId(),
        currentPassword: body.currentPassword,
        newPassword: body.newPassword
      });
      const refreshedUser = await findUserById(currentUserId());
      const issued = issueAppSessionHeaders(refreshedUser, req);
      logger.info("audit_password_changed", { actorUserId: currentUserId() });
      json(res, 200, { ok: true, data: issued.session }, issued.headers);
      return;
    }

    if (await handleSystemAdminRoutes(req, res, url, {
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
    })) {
      return;
    }

    if (await handleChaoxingRoutes(req, res, url, { chaoxing, currentUserId, json, readBodyJson })) return;

    if (await handleCampusCoreRoutes(req, res, url, {
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
    })) {
      return;
    }
    if (await handleLibroomRoutes(req, res, url, {
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
    })) {
      return;
    }

    if (await handleLibrarySeatRoutes(req, res, url, {
      HttpError,
      currentUserId,
      getLibrarySeatOfficialWebViewLogin,
      json,
      librarySeatClient,
      librarySeatWaitlistPublic,
      librarySeatWaitlistRequestTargets,
      logger,
      normalizeLibrarySeatReservationInput,
      platformUserId: appSession.platformUserId,
      readBodyJson,
      repository,
      saveLibrarySeatWaitlist,
      wakeLibrarySeatReminderScheduler,
      wakeLibrarySeatWaitlistScheduler
    })) {
      return;
    }

    if (url.pathname === "/api/identity-card") {
      json(res, 200, { ok: true, data: await getIdentityCard() });
      return;
    }
    if (url.pathname === "/api/identity-card/code" && req.method === "POST") {
      json(res, 200, { ok: true, data: await refreshIdentityCodeOnly() });
      return;
    }
    if (url.pathname === "/api/identity-face") {
      json(res, 200, { ok: true, data: await getIdentityFaceInfo() });
      return;
    }
    if (url.pathname === "/api/identity-face/link") {
      json(res, 200, { ok: true, data: await getIdentityFaceOfficialLink() });
      return;
    }

    if (await handleAcademicRoutes(req, res, url, {
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
      platformUserId: appSession.platformUserId,
      readBodyJson,
      repository,
      rotateAcademicCalendarSubscription,
      saveAcademicReminderPreference,
      startAcademicEvaluationAutoJob,
      stopAcademicEvaluationAutoJob,
      submitAcademicEvaluation,
      withAcademicSessionLock
    })) {
      return;
    }

    throw new HttpError(404, "接口不存在。");
}

async function handleApi(req, res, url) {
  for (let attempt = 0; attempt < SCHOOL_AUTH_RETRY_ATTEMPTS; attempt += 1) {
    try {
      await handleApiRoutes(req, res, url);
      return;
    } catch (error) {
      if (attempt === 0 && !res.headersSent && schoolAuthRecoveryAllowed(req, error)) {
        const recovered = await recoverSchoolSessionAfterAuthError(error);
        const healed = recovered || await schoolSessionRecoveredOrHealthy();
        if (healed && schoolAuthRequestRetryAllowed(req, error)) {
          await refreshSchoolSessionMemo();
          continue;
        }
      }
      respondApiError(req, res, url, error);
      return;
    }
  }
}

function respondApiError(req, res, url, error) {
  const rawStatus = Number(error?.status);
  const status = Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599 ? rawStatus : 500;
  const context = userContextStorage.getStore() || {};
  const logFields = {
    requestId: context.requestId,
    userId: context.user?.id,
    method: req.method,
    path: url.pathname,
    status,
    error
  };
  if (status >= 500) logger.error("http_request_failed", logFields);
  else if (status !== 401 && status !== 404) logger.warn("http_request_rejected", logFields);
  const safeDetails = error?.details && status < 500
    ? Object.fromEntries(Object.entries(error.details).filter(([key]) => ["waitSeconds", "availableAt", "code"].includes(key)))
    : undefined;
  json(res, status, {
    ok: false,
    error: status >= 500 && NODE_ENV === "production" ? "服务器暂时无法完成请求，请稍后重试。" : (error.message || "服务器异常"),
    code: error.code || (status >= 500 ? "INTERNAL_ERROR" : "REQUEST_FAILED"),
    details: safeDetails,
    requestId: context.requestId || null
  });
}

const chaoxing = createChaoxingService({ repository, sensitiveJson, readUpstreamText });

const {
  requestAcademicHtml,
  looksLikeCasLoginHtml,
  looksLikeAcademicTimetableHtml,
  extractWebvpnVerifyUrl,
  extractSimpleLocationRedirectUrl,
  fetchLibroomWithWebvpn,
  getLibroomCasLoginOptions,
  requestLibroomJsonWithWebvpn,
  looksLikeAcademicLoginHtml,
  requestAcademicHtmlWithSimpleRedirects,
  ensureWebvpnSession
} = createSchoolWebvpnService({
  currentUserId,
  fetchWithJar,
  followRedirectsWithJar,
  logger,
  loginCasService,
  parseJsonLike,
  readSessionJar,
  readUpstreamText,
  saveSessionJar,
  userContextStorage,
  withAcademicSessionLock
});

const {
  academicEvaluationDrafts,
  academicEvaluationAutoJobs,
  academicEvaluationAutoTasks,
  academicTimetableSourceFromSearch,
  activateAcademicSession,
  getAcademicEvaluations,
  getAcademicEvaluationDraft,
  submitAcademicEvaluation,
  activeAcademicEvaluationAutoStatus,
  academicEvaluationAutoCapacitySnapshot,
  activeAcademicEvaluationAutoJob,
  touchAcademicEvaluationAutoJob,
  academicEvaluationAutoStatus,
  startAcademicEvaluationAutoJob,
  stopAcademicEvaluationAutoJob,
  getAcademicGpa,
  getFreeClassrooms,
  getAcademicTimetable
} = createAcademicService({
  ACADEMIC_EVALUATION_MAX_DRAFTS,
  ACADEMIC_EVALUATION_MAX_DRAFTS_PER_USER,
  assertAllowedSchoolUrl,
  CAS_ORIGIN,
  currentUser,
  currentUserId,
  ensureWebvpnSession,
  extractWebvpnVerifyUrl,
  fetchWithJar,
  logger,
  loginCasService,
  looksLikeAcademicLoginHtml,
  looksLikeAcademicTimetableHtml,
  nowIso,
  parseJsonLike,
  readSessionJar,
  readUpstreamText,
  repository,
  requestAcademicHtml,
  requestAcademicHtmlWithSimpleRedirects,
  saveSessionJar,
  sensitiveJson,
  isShuttingDown: () => shuttingDown,
  userContextStorage,
  withAcademicSessionLock
});

const {
  libroomFailureLog,
  issueLibroomMemberToken,
  getLibroomOfficialLoginUrl,
  getLibroomOfficialWebViewLogin,
  getLibrarySeatOfficialWebViewLogin,
  librarySeatClient,
  libroomClient,
  libroomSpaceId,
  libroomDate,
  autoReservationTaskPublic,
  saveAutoReservationTask,
  runAutoReservationTask,
  librarySeatWaitlistPublic,
  saveLibrarySeatWaitlist,
  librarySeatWaitlistRequestTargets,
  librarySeatWaitlistFailureText,
  notifyLibrarySeatWaitlist,
  runLibrarySeatWaitlistTask
} = createReservationService({
  assertAllowedSchoolUrl,
  CAS_ORIGIN,
  casLoginRequiredMessage,
  currentUserId,
  ensureWebvpnSession,
  extractWebvpnVerifyUrl,
  fetchLibroomWithWebvpn,
  fetchWithJar,
  followRedirectsWithJar,
  getCasTicketRedirect,
  getLibroomCasLoginOptions,
  isCasLoginRequiredError,
  logger,
  loginCasService,
  looksLikeCasLoginHtml,
  markCasFailureIfNeeded,
  nowIso,
  parseJsonLike,
  readSessionJar,
  readUpstreamText,
  repository,
  requestLibroomJsonWithWebvpn,
  savedSchoolReloginCredentials,
  saveSessionJar
});

const {
  uwcAuthedRequest,
  activateCampusSessions,
  getCampusCard,
  getCampusWater,
  refreshCampusWaterCode,
  ensureCampusSessions,
  getCampusAccommodation,
  getCampusSummary,
  getCampusRechargeLink
} = createCampusConnectors({
  assertAllowedSchoolUrl,
  campusSessionSummary,
  CAS_ORIGIN,
  cleanParams,
  currentUserId,
  defaultMonth,
  fetchWithJar,
  formEncode,
  getCasTicketRedirect,
  logger,
  md5,
  normalizeCampusBillQuery,
  parseJsonLike,
  randomAlphaNum,
  readSessionJar,
  readUpstreamText,
  REQUEST_TIMEOUT_MS,
  saveSessionJar,
  sm2,
  sm3,
  sortedParamString,
  userContextStorage
});

const {
  getIdentityFaceOfficialLink,
  activatePortalSession,
  getIdentityCard,
  getIdentityFaceInfo,
  refreshIdentityCodeOnly
} = createIdentityService({
  CAS_ORIGIN,
  fetchWithJar,
  followRedirectsWithJar,
  getCasTicketRedirect,
  loginCasService,
  parseJsonLike,
  portalSessionSummary,
  readSessionJar,
  readUpstreamText,
  REQUEST_TIMEOUT_MS,
  saveSessionJar,
  storedSessionSummary
});

const {
  backgroundTasks,
  stopBackgroundSchedulers,
  backgroundOperationsSnapshot,
  startAcademicAutoRefresh,
  startAcademicReminderScheduler,
  wakeLibroomAutoReservationScheduler,
  startLibroomAutoReservationScheduler,
  wakeLibrarySeatWaitlistScheduler,
  startLibrarySeatWaitlistScheduler,
  wakeLibrarySeatReminderScheduler,
  startLibrarySeatReminderScheduler
} = createBackgroundSchedulers({
  academicEvaluationAutoCapacitySnapshot,
  academicEvaluationAutoTasks,
  activeUpstreamRequestCount: () => activeUpstreamRequests,
  cachedAcademicTimetableForUser,
  CAS_ORIGIN,
  getAcademicTimetable,
  getLibrarySeatCurrentUse: async () => (await librarySeatClient()).getCurrentUse(),
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
  isShuttingDown: () => shuttingDown,
  userContextStorage,
  withAcademicSessionLock
});

const serveStatic = createStaticAssetHandler({
  publicDir,
  production: NODE_ENV === "production",
  securityHeaders,
  getRequestId: () => userContextStorage.getStore()?.requestId || "",
  json
});

const waterValveAutoCloseTimers = new Set();

const waterValve = createWaterValveService({
  ensureSessions: ensureCampusSessions,
  readSessionJar,
  saveSessionJar,
  request: uwcAuthedRequest,
  scheduleAutoClose: (seqNo, delayMs) => {
    const user = userContextStorage.getStore()?.user || defaultSystemUser || null;
    if (!user) return;
    const timer = setTimeout(() => {
      waterValveAutoCloseTimers.delete(timer);
      if (shuttingDown) return;
      userContextStorage
        .run({ requestId: `water-valve-auto-${randomUUID()}`, user }, () =>
          withCampusSessionLock(() => waterValve.closeIfExpired(seqNo))
        )
        .catch((error) =>
          logger.warn("water_valve_auto_close_failed", { seqNo, reason: error?.message || String(error) })
        );
    }, delayMs);
    timer.unref?.();
    waterValveAutoCloseTimers.add(timer);
  }
});

const server = createServer((req, res) => {
  const incomingRequestId = String(req.headers["x-request-id"] || "");
  const requestId = /^[A-Za-z0-9._:-]{1,128}$/.test(incomingRequestId) ? incomingRequestId : randomUUID();
  const startedAt = performance.now();
  res.once("finish", () => {
    const path = String(req.url || "").split("?", 1)[0];
    const durationMs = Math.round((performance.now() - startedAt) * 10) / 10;
    if (!shouldLogRequestCompleted({ path, status: res.statusCode, durationMs })) return;
    logger.info("http_request_completed", {
      requestId,
      method: req.method,
      path,
      status: res.statusCode,
      durationMs
    });
  });

  const task = userContextStorage.run({ requestId, user: null }, async () => {
    const url = new URL(req.url || "/", "http://localhost");
    if (maybeRedirectHttps(req, res, url)) return;
    if (url.pathname === "/app-auth/login" && req.method === "POST") {
      await handleAppLoginForm(req, res);
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(req, res, url);
  });

  task.catch((error) => {
    logger.error("unhandled_request_error", { requestId, method: req.method, path: req.url, error });
    if (!res.headersSent) {
      json(res, 500, {
        ok: false,
        error: "服务器暂时无法完成请求，请稍后重试。",
        code: "INTERNAL_ERROR",
        requestId
      });
    } else {
      res.destroy(error);
    }
  });
});

server.headersTimeout = 15_000;
server.requestTimeout = 30_000;
server.keepAliveTimeout = 5_000;
server.maxRequestsPerSocket = 1_000;
server.on("clientError", (error, socket) => {
  if (shouldLogClientError(error)) logger.warn("http_client_error", { error });
  if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
});

server.listen(PORT, HOST, () => {
  const address = server.address();
  logger.info("service_started", { host: HOST, port: typeof address === "object" ? address?.port : PORT });
  startAcademicAutoRefresh();
  startAcademicReminderScheduler();
  startLibroomAutoReservationScheduler();
  startLibrarySeatWaitlistScheduler();
  startLibrarySeatReminderScheduler();
});

let shuttingDown = false;
async function drainServiceTasks(timeoutMs = 8_000) {
  const tasks = [...backgroundTasks, ...academicEvaluationAutoTasks];
  if (!tasks.length) return true;
  let timer;
  const completed = await Promise.race([
    Promise.allSettled(tasks).then(() => true),
    new Promise((resolveDrain) => {
      timer = setTimeout(() => resolveDrain(false), timeoutMs);
    })
  ]);
  if (timer) clearTimeout(timer);
  return completed;
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("service_stopping", { signal });
  stopBackgroundSchedulers();
  for (const timer of waterValveAutoCloseTimers) clearTimeout(timer);
  waterValveAutoCloseTimers.clear();
  for (const job of academicEvaluationAutoJobs.values()) {
    if (!activeAcademicEvaluationAutoStatus(job.status)) continue;
    job.cancelRequested = true;
    job.status = "canceling";
    touchAcademicEvaluationAutoJob(job);
  }
  const forceTimer = setTimeout(() => {
    logger.error("service_shutdown_timeout", { signal });
    server.closeAllConnections?.();
  }, 10_000);
  forceTimer.unref();
  server.close(async () => {
    clearTimeout(forceTimer);
    const drained = await drainServiceTasks();
    if (!drained) {
      logger.warn("service_task_drain_timeout", {
        signal,
        backgroundTasks: backgroundTasks.size,
        evaluationTasks: academicEvaluationAutoTasks.size
      });
    }
    await repository.close();
    logger.info("service_stopped", { signal, drained });
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
