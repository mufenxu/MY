import { createServer } from "node:http";
import { isIP } from "node:net";
import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import smCrypto from "sm-crypto";
import CryptoJS from "crypto-js";
import * as cheerio from "cheerio";
import QRCode from "qrcode";
import bwipjs from "bwip-js";
import Database from "better-sqlite3";
import { runWithAuthRecovery } from "./src/lib/auth-recovery.js";
import { createLogger } from "./src/lib/logger.js";
import { KeyedSerialQueue } from "./src/lib/keyed-serial-queue.js";
import { FixedWindowAttemptLimiter } from "./src/lib/rate-limiter.js";
import { shouldLogClientError, shouldLogRequestCompleted } from "./src/lib/request-logging.js";
import { loadDotEnv, parseBooleanEnv } from "./src/lib/env.js";
import { createHttpToolkit, HttpError } from "./src/lib/http.js";
import { hashPassword, isValidUsername, normalizeUsername, verifyPassword } from "./src/lib/password.js";
import { createSensitiveJsonCodec, deriveDataEncryptionKey } from "./src/lib/sensitive-json.js";
import { normalizeAllowedSchoolUrl } from "./src/lib/school-url.js";
import { createStaticAssetHandler } from "./src/lib/static-assets.js";
import {
  UIAS_ENDPOINTS,
  casServiceFromTicketRedirect,
  casLoginUrlWithService,
  uiasCasServiceUrl
} from "./src/lib/uias-cas.js";
import {
  cookieHeaderFor,
  emptySessionJar as emptyJar,
  isCookieExpired,
  mergeSessionJars,
  updateJarFromResponse
} from "./src/lib/session-jar.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
process.umask(0o077);
const publicDir = join(__dirname, "public");
const dataDir = resolve(process.env.HGU_DATA_DIR || join(__dirname, "data"));
const databasePath = join(dataDir, "app.db");
const legacySessionPath = join(dataDir, "school-session.json");
const legacyAcademicCachePath = join(dataDir, "academic-timetable-cache.json");
const legacyAcademicCurrentCachePath = join(dataDir, "academic-timetable-current-cache.json");
const userContextStorage = new AsyncLocalStorage();

loadDotEnv(join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 8780);
const HOST = process.env.HGU_HOST || process.env.HOST || "127.0.0.1";
const SCHOOL_ORIGIN = "https://nrg.hgu.edu.cn";
const CAS_ORIGIN = "https://cas.hgu.edu.cn";
const YKT_ORIGIN = "https://ykt.hgu.edu.cn";
const JWXS_ORIGIN = "https://newjwxs.hgu.edu.cn";
const WEBVPN_ORIGIN = "https://webvpn.hgu.edu.cn";
const MY_ORIGIN = "https://my.hgu.edu.cn";
const SERVICE_URL = `${SCHOOL_ORIGIN}/wecom/oauth/servicecenter/main.do`;
const ENERGY_RECHARGE_SERVICE_URL = `${SCHOOL_ORIGIN}/wecom/oauth/recharge/main.do`;
const ENERGY_RECHARGE_URL = `${ENERGY_RECHARGE_SERVICE_URL}#`;
const JWXS_TIMETABLE_URL = `${JWXS_ORIGIN}/student/courseSelect/courseSelectResult/index`;
const JWXS_CURRICULUM_URL = `${JWXS_ORIGIN}/student/courseSelect/thisSemesterCurriculum/callback`;
const JWXS_CURRENT_TIMETABLE_URL = `${JWXS_ORIGIN}/student/courseSelect/thisSemesterCurriculum/index`;
const JWXS_CURRENT_SCHEDULE_URL = `${JWXS_ORIGIN}/student/courseSelect/thisSemesterCurriculum/ajaxStudentSchedule/callback`;
const JWXS_GPA_HOME_URL = `${JWXS_ORIGIN}/`;
const JWXS_GPA_MORE_URL = `${JWXS_ORIGIN}/main/showMoreGPA`;
const ACADEMIC_TIMETABLE_SOURCES = {
  current: {
    key: "current",
    label: "本学期课表",
    pageUrl: JWXS_CURRENT_TIMETABLE_URL,
    payloadUrl: JWXS_CURRENT_SCHEDULE_URL,
    cacheFile: "academic-timetable-current-cache.json"
  },
  selection: {
    key: "selection",
    label: "选课结果",
    pageUrl: JWXS_TIMETABLE_URL,
    payloadUrl: JWXS_CURRICULUM_URL,
    cacheFile: "academic-timetable-cache.json"
  }
};
const ACADEMIC_GPA_LABELS = ["GPA", "核心课GPA", "必修课GPA", "学位课GPA"];
const JWXS_FREE_CLASSROOM_INDEX_URL = `${JWXS_ORIGIN}/student/teachingResources/freeClassroom/index`;
const JWXS_FREE_CLASSROOM_TODAY_URL = `${JWXS_ORIGIN}/student/teachingResources/freeClassroom/today`;
const JWXS_EVALUATION_INDEX_URL = `${JWXS_ORIGIN}/student/teachingEvaluation/newEvaluation/index`;
const JWXS_EVALUATION_LIST_URL = `${JWXS_ORIGIN}/student/teachingAssessment/evaluation/queryAll`;
const JWXS_EVALUATION_SAVE_URL = `${JWXS_ORIGIN}/student/teachingAssessment/baseInformation/questionsAdd/doSave`;
const ACADEMIC_EVALUATION_DRAFT_TTL_MS = 15 * 60 * 1000;
const ACADEMIC_EVALUATION_WAIT_MS = 46 * 1000;
const ACADEMIC_EVALUATION_MAX_DRAFTS = Number(process.env.HGU_ACADEMIC_EVALUATION_MAX_DRAFTS || 1_000);
const ACADEMIC_EVALUATION_MAX_DRAFTS_PER_USER = Number(process.env.HGU_ACADEMIC_EVALUATION_MAX_DRAFTS_PER_USER || 10);
const ACADEMIC_EVALUATION_AUTO_SUBJECTIVE_TEXT = String(process.env.HGU_ACADEMIC_EVALUATION_AUTO_SUBJECTIVE_TEXT || "好").trim() || "好";
const JWXS_LOGIN_URL = `${JWXS_ORIGIN}/login`;
const WEBVPN_CAS_LOGIN_URL = `${WEBVPN_ORIGIN}/passport/v1/public/casLogin?sfDomain=cas96624`;
const UIAS_LOGIN_URL = `${YKT_ORIGIN}/uias-h5/login`;
const EASYTONG_APP_URL = `${YKT_ORIGIN}/easytong_webapp/index.html#/aotoLogin?name=balance`;
const EASYTONG_RECHARGE_APP_URL = `${YKT_ORIGIN}/easytong_webapp/index.html#/aotoLogin?name=rechargeYm`;
const UWC_APP_URL = `${YKT_ORIGIN}/uwc_webapp/#/home`;
const EASYTONG_UIAS_APP = Object.freeze({
  key: "easytong",
  appUrl: EASYTONG_APP_URL,
  pathHints: ["/easytong_webapp/"],
  routeHints: ["name=balance", "#/balance", "balance"]
});
const EASYTONG_RECHARGE_UIAS_APP = Object.freeze({
  key: "easytongRecharge",
  appUrl: EASYTONG_RECHARGE_APP_URL,
  pathHints: ["/easytong_webapp/"],
  routeHints: ["name=recharge", "recharge"]
});
const UWC_UIAS_APP = Object.freeze({
  key: "uwc",
  appUrl: UWC_APP_URL,
  pathHints: ["/uwc_webapp/"],
  routeHints: ["uwc_webapp"]
});
const MY_USERCENTER_HOME_URL = `${MY_ORIGIN}/yhzt/usercenter-front-web/home.html?isFrame=true`;
const MY_INFO_PAGE_URL = `${MY_ORIGIN}/sopplus/_web/portalWechat/app/myInfo.html`;
const MY_FACE_INFO_CALLBACK_URL = `${MY_ORIGIN}/commoncallback/yhzt/usercenter-front-web/home.html`;
const PORTAL_LOGIN_REQUIRED_MESSAGE = "用户中心会话未连接，请在本系统重新登录学校账号后同步身份卡。";
const APPDM_MOBILE_CAS_URL_FALLBACK = `${CAS_ORIGIN}/cas/oauth2.0/authorize?response_type=code&client_id=yktgyxtydd&state=home&scope=ssomp&redirect_uri=https%3A%2F%2Fykt.hgu.edu.cn%2Fappdm-home%2Fappsys%2FsudytechOAuthLogin%2FmobileLogin`;
const APPDM_AES_KEY_FALLBACK = process.env.HGU_APPDM_AES_KEY || "shuangqibestbest";
const REQUEST_TIMEOUT_MS = Number(process.env.NRG_TIMEOUT_MS || 15000);
const ALLOW_GLOBAL_NRG_COOKIE = parseBooleanEnv(process.env.HGU_ALLOW_GLOBAL_NRG_COOKIE, false);
const ASSUMED_SESSION_TTL_HOURS = Number(process.env.NRG_SESSION_TTL_HOURS || 12);
const SESSION_REFRESH_SKEW_MS = Number(process.env.HGU_SESSION_REFRESH_SKEW_MS || 5 * 60 * 1000);
const ACADEMIC_AUTO_REFRESH_MS = Number(process.env.ACADEMIC_AUTO_REFRESH_MS || 10 * 60 * 1000);
const ACADEMIC_AUTO_REFRESH_START_DELAY_MS = Number(process.env.ACADEMIC_AUTO_REFRESH_START_DELAY_MS || 30 * 1000);
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
const UIAS_SIGN_PRIVATE_KEY = process.env.HGU_UIAS_SIGN_PRIVATE_KEY || "e04d85ea0b237f2dfca75aa073978263227b48a0ee742f40f60cc89c6b5f6eee";
const EASYTONG_MD5_KEY = process.env.HGU_EASYTONG_MD5_KEY || "ok15we1@oid8x5afd@";
const UWC_SIGN_KEY = process.env.HGU_UWC_SIGN_KEY || "hzsun.com.uwc的sign验签加密key";
const UWC_3DES_KEY = process.env.HGU_UWC_3DES_KEY || "684523174589651002354157";
const UWC_RESPONSE_3DES_KEY = process.env.HGU_UWC_RESPONSE_3DES_KEY || "123457890ABCDEGHIJ123456";
const UWC_3DES_IV = process.env.HGU_UWC_3DES_IV || "00000000";
const { sm2, sm3 } = smCrypto;
const academicEvaluationDrafts = new Map();
const academicEvaluationAutoJobs = new Map();
const academicSessionQueue = new KeyedSerialQueue();
const campusSessionQueue = new KeyedSerialQueue();
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
if (APP_AUTH_REQUIRED && !DEFAULT_ADMIN_PASSWORD && !existsSync(databasePath)) {
  throw new Error("首次启动必须设置 HGU_ADMIN_PASSWORD。");
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

mkdirSync(dataDir, { recursive: true });
const db = new Database(databasePath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
  PRAGMA synchronous = NORMAL;

  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    disabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_login_at TEXT
  );

  CREATE TABLE IF NOT EXISTS school_sessions (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    jar_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS academic_caches (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_key TEXT NOT NULL,
    cache_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, source_key)
  );

  CREATE TABLE IF NOT EXISTS invites (
    id TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL UNIQUE,
    code_preview TEXT NOT NULL,
    code_text TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    note TEXT,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    used_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT,
    used_at TEXT,
    revoked_at TEXT
  );
`);

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

ensureColumn("invites", "code_text", "TEXT");
ensureColumn("users", "session_version", "INTEGER NOT NULL DEFAULT 1");

function recordSchemaMigration(version, name) {
  db.prepare("INSERT OR IGNORE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)")
    .run(version, name, nowIso());
}

recordSchemaMigration(1, "baseline_schema");
recordSchemaMigration(2, "session_security_and_encrypted_sensitive_data");

function migrateSensitiveDataRows() {
  if (!sensitiveJson.encrypted) return;
  const sessionRows = db.prepare("SELECT user_id, jar_json FROM school_sessions").all();
  const cacheRows = db.prepare("SELECT user_id, source_key, cache_json FROM academic_caches").all();
  const updateSession = db.prepare("UPDATE school_sessions SET jar_json = ?, updated_at = ? WHERE user_id = ?");
  const updateCache = db.prepare("UPDATE academic_caches SET cache_json = ?, updated_at = ? WHERE user_id = ? AND source_key = ?");
  const migrate = db.transaction(() => {
    for (const row of sessionRows) {
      const decoded = sensitiveJson.decodeWithMetadata(row.jar_json);
      if (String(row.jar_json || "").startsWith("enc:v1:") && decoded.keyIndex === 0) continue;
      updateSession.run(sensitiveJson.encode(decoded.value), nowIso(), row.user_id);
    }
    for (const row of cacheRows) {
      const decoded = sensitiveJson.decodeWithMetadata(row.cache_json);
      if (String(row.cache_json || "").startsWith("enc:v1:") && decoded.keyIndex === 0) continue;
      updateCache.run(sensitiveJson.encode(decoded.value), nowIso(), row.user_id, row.source_key);
    }
  });
  migrate();
}

migrateSensitiveDataRows();

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

function insertSystemUser({ normalized, passwordHash, role = "user" }) {
  const id = randomUUID();
  const timestamp = nowIso();
  try {
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, disabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `).run(id, normalized, passwordHash, role, timestamp, timestamp);
  } catch (error) {
    if (String(error?.code || "").includes("CONSTRAINT")) {
      throw new HttpError(409, "系统用户名已存在。");
    }
    throw error;
  }
  return publicUser(findUserById(id));
}

async function createSystemUser({ username, password, role = "user" }) {
  const normalized = validateNewUsername(username);
  const passwordHash = await hashUserPassword(password);
  return insertSystemUser({ normalized, passwordHash, role });
}

const DUMMY_PASSWORD_HASH = await hashUserPassword(randomBytes(24).toString("base64url"));

function findUserById(id) {
  if (!id) return null;
  return db.prepare("SELECT * FROM users WHERE id = ?").get(String(id)) || null;
}

function findUserByUsername(username) {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;
  return db.prepare("SELECT * FROM users WHERE username = ?").get(normalized) || null;
}

function listSystemUsers() {
  return db.prepare(`
    SELECT
      users.*,
      school_sessions.updated_at AS school_session_updated_at,
      school_sessions.jar_json AS school_session_jar_json,
      CASE WHEN school_sessions.user_id IS NULL THEN 0 ELSE 1 END AS has_school_session
    FROM users
    LEFT JOIN school_sessions ON school_sessions.user_id = users.id
    ORDER BY users.created_at ASC
  `).all().map(publicUserWithStatus);
}

async function authenticateSystemUser(username, password) {
  const user = findUserByUsername(username);
  const passwordValid = await verifyUserPassword(password, user?.password_hash || DUMMY_PASSWORD_HASH);
  if (!user || user.disabled || !passwordValid) return null;
  db.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").run(nowIso(), nowIso(), user.id);
  return findUserById(user.id);
}

function setSystemUserDisabled({ id, disabled, actorId }) {
  const user = findUserById(id);
  if (!user) throw new HttpError(404, "系统用户不存在。");
  if (user.id === actorId && disabled) throw new HttpError(400, "不能停用当前登录的管理员账号。");
  db.prepare("UPDATE users SET disabled = ?, session_version = session_version + 1, updated_at = ? WHERE id = ?")
    .run(disabled ? 1 : 0, nowIso(), user.id);
  return publicUser(findUserById(user.id));
}

function revokeSystemUserSessions(id) {
  db.prepare("UPDATE users SET session_version = session_version + 1, updated_at = ? WHERE id = ?")
    .run(nowIso(), id);
}

async function resetSystemUserPassword({ id, password }) {
  const user = findUserById(id);
  if (!user) throw new HttpError(404, "系统用户不存在。");
  const passwordHash = await hashUserPassword(password);
  db.prepare("UPDATE users SET password_hash = ?, session_version = session_version + 1, updated_at = ? WHERE id = ?")
    .run(passwordHash, nowIso(), user.id);
  return publicUser(findUserById(user.id));
}

async function changeOwnPassword({ userId, currentPassword, newPassword }) {
  const user = findUserById(userId);
  if (!user) throw new HttpError(404, "系统用户不存在。");
  if (!(await verifyUserPassword(currentPassword || "", user.password_hash))) {
    throw new HttpError(401, "当前系统密码不正确。");
  }
  return resetSystemUserPassword({ id: user.id, password: newPassword });
}

function deleteSystemUser({ id, actorId }) {
  const user = findUserById(id);
  if (!user) throw new HttpError(404, "系统用户不存在。");
  if (user.id === actorId) throw new HttpError(400, "不能删除当前登录的管理员账号。");
  db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
  return publicUser(user);
}

function normalizeInviteCode(code) {
  return String(code || "").trim().replace(/[\s-]+/g, "").toUpperCase();
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

function listInvites() {
  return db.prepare(`
    SELECT
      invites.*,
      creator.username AS created_by_username,
      used_user.username AS used_by_username
    FROM invites
    LEFT JOIN users creator ON creator.id = invites.created_by
    LEFT JOIN users used_user ON used_user.id = invites.used_by
    ORDER BY invites.created_at DESC
    LIMIT 100
  `).all().map(publicInvite);
}

function createInvite({ role = "user", note = "", expiresInDays = 7, actorId }) {
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
  db.prepare(`
    INSERT INTO invites (id, code_hash, code_preview, code_text, role, note, created_by, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    inviteCodeHash(normalized),
    inviteCodePreview(code),
    code,
    role === "admin" ? "admin" : "user",
    normalizedNote || null,
    actorId,
    timestamp,
    expiresAt
  );
  const row = db.prepare("SELECT * FROM invites WHERE id = ?").get(id);
  return publicInvite(row, { code });
}

function revokeInvite({ id }) {
  const invite = db.prepare("SELECT * FROM invites WHERE id = ?").get(id);
  if (!invite) throw new HttpError(404, "邀请码不存在。");
  if (invite.used_at) throw new HttpError(400, "已使用的邀请码不能撤销。");
  db.prepare("UPDATE invites SET revoked_at = ? WHERE id = ?").run(nowIso(), id);
  return publicInvite(db.prepare("SELECT * FROM invites WHERE id = ?").get(id));
}

function deleteInvite({ id }) {
  const invite = db.prepare("SELECT * FROM invites WHERE id = ?").get(id);
  if (!invite) throw new HttpError(404, "邀请码不存在。");
  db.prepare("DELETE FROM invites WHERE id = ?").run(id);
  return publicInvite(invite);
}

const registerWithInviteTx = db.transaction(({ inviteCode, normalized, passwordHash }) => {
  const invite = db.prepare("SELECT * FROM invites WHERE code_hash = ?").get(inviteCodeHash(inviteCode));
  if (!invite) throw new HttpError(400, "邀请码无效。");
  if (inviteStatus(invite) !== "active") throw new HttpError(400, "邀请码已失效。");
  const user = insertSystemUser({ normalized, passwordHash, role: invite.role });
  db.prepare("UPDATE invites SET used_by = ?, used_at = ? WHERE id = ?").run(user.id, nowIso(), invite.id);
  return findUserById(user.id);
});

async function registerWithInvite({ inviteCode, username, password }) {
  const existingInvite = db.prepare("SELECT * FROM invites WHERE code_hash = ?").get(inviteCodeHash(inviteCode));
  if (!existingInvite || inviteStatus(existingInvite) !== "active") throw new HttpError(400, "邀请码无效或已失效。");
  const normalized = validateNewUsername(username);
  const passwordHash = await hashUserPassword(password);
  return registerWithInviteTx({ inviteCode, normalized, passwordHash });
}

function getDefaultUser() {
  return db.prepare("SELECT * FROM users ORDER BY created_at ASC LIMIT 1").get() || null;
}

function readLegacyJson(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function migrateLegacyJsonData(userId) {
  if (!userId) return;
  const hasSession = db.prepare("SELECT 1 FROM school_sessions WHERE user_id = ?").get(userId);
  const legacySession = readLegacyJson(legacySessionPath);
  if (!hasSession && legacySession) {
    db.prepare(`
      INSERT INTO school_sessions (user_id, jar_json, updated_at)
      VALUES (?, ?, ?)
    `).run(userId, sensitiveJson.encode(legacySession), nowIso());
  }

  for (const [sourceKey, filePath] of [
    ["current", legacyAcademicCurrentCachePath],
    ["selection", legacyAcademicCachePath]
  ]) {
    const hasCache = db.prepare("SELECT 1 FROM academic_caches WHERE user_id = ? AND source_key = ?").get(userId, sourceKey);
    const legacyCache = readLegacyJson(filePath);
    if (!hasCache && legacyCache) {
      db.prepare(`
        INSERT INTO academic_caches (user_id, source_key, cache_json, updated_at)
        VALUES (?, ?, ?, ?)
      `).run(userId, sourceKey, sensitiveJson.encode(legacyCache), nowIso());
    }
  }
}

async function ensureDefaultAdminUser() {
  const count = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  if (count > 0) return;
  const admin = await createSystemUser({
    username: DEFAULT_ADMIN_USERNAME,
    password: DEFAULT_ADMIN_PASSWORD,
    role: "admin"
  });
  migrateLegacyJsonData(admin.id);
}

await ensureDefaultAdminUser();

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

function verifyAppSession(token) {
  if (!APP_AUTH_REQUIRED) return appSessionData(getDefaultUser(), { csrfToken: null, expiresAt: null });
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
  const user = findUserById(payload.uid);
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

function getAppSession(req) {
  if (!APP_AUTH_REQUIRED) return appSessionData(getDefaultUser(), { csrfToken: null, expiresAt: null });
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

function appAuthStatus(req) {
  if (!APP_AUTH_REQUIRED) {
    return { required: false, ...appSessionData(getDefaultUser(), { csrfToken: null, expiresAt: null }) };
  }
  try {
    return { required: true, ...getAppSession(req) };
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

function requireAppAccess(req) {
  const session = getAppSession(req);
  if (methodNeedsCsrf(req.method)) {
    const supplied = req.headers["x-csrf-token"];
    if (!session.csrfToken || !supplied || !safeEqualString(String(supplied), session.csrfToken)) {
      throw new HttpError(403, "系统访问校验失败，请刷新页面后重试。");
    }
  }
  return session;
}

function currentUser() {
  const user = userContextStorage.getStore()?.user;
  if (user) return user;
  const fallback = getDefaultUser();
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

function monthCompact(month) {
  return String(month || defaultMonth()).replace("-", "");
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

const saveSessionJarTx = db.transaction((userId, incoming) => {
  const row = db.prepare("SELECT jar_json FROM school_sessions WHERE user_id = ?").get(userId);
  let stored = emptyJar();
  if (row?.jar_json) stored = sensitiveJson.decode(row.jar_json);
  const merged = mergeSessionJars(stored, incoming);
  db.prepare(`
    INSERT INTO school_sessions (user_id, jar_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      jar_json = excluded.jar_json,
      updated_at = excluded.updated_at
  `).run(userId, sensitiveJson.encode(merged), merged.updatedAt);
  return merged;
});

async function readSessionJar() {
  const userId = currentUserId();
  const row = db.prepare("SELECT jar_json FROM school_sessions WHERE user_id = ?").get(userId);
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

async function saveSessionJar(jar) {
  const merged = saveSessionJarTx(currentUserId(), jar);
  Object.assign(jar, merged);
}

async function clearSessionJar() {
  db.prepare("DELETE FROM school_sessions WHERE user_id = ?").run(currentUserId());
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

function markCasFailureIfNeeded(jar, error) {
  const message = error?.message || "";
  if (error?.status === 401 && /统一身份认证|CAS|重新登录学校账号/.test(message)) {
    jar.meta.cas ||= {};
    jar.meta.cas.lastError = message;
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
  const hasStoredSession = Boolean(cas.connected || energy.connected || campus.connected || academic.connected || portal.connected);
  const schoolAccount = normalizeSchoolLoginAccount(jar.meta?.schoolAccount || jar.meta?.loginUsername);
  const primaryRefreshableSessions = [energy, campus, academic];
  const globalLoginSessions = [energy, academic];
  const needsLogin = hasStoredSession && (
    (refreshBlockedByCas(cas) && primaryRefreshableSessions.some(sessionNeedsRefresh))
    || globalLoginSessions.some(sessionHasLoginRequiredError)
  );
  const loginRequiredMessage = needsLogin ? "统一身份认证会话已过期，请重新登录学校账号。" : null;

  const sessions = { cas, energy, campus, academic, portal };
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
  if (!before.hasStoredSession || refreshBlockedByCas(before.sessions.cas)) return jar;

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

function modPow(base, exponent, modulus) {
  let result = 1n;
  let x = base % modulus;
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) result = (result * x) % modulus;
    e >>= 1n;
    x = (x * x) % modulus;
  }
  return result;
}

function highDigitIndexFromHex(hex) {
  const normalized = hex.replace(/^0+/, "") || "0";
  return Math.ceil(normalized.length / 4) - 1;
}

function casEncryptPassword(password) {
  const modulus = BigInt(`0x${CAS_RSA_MODULUS}`);
  const exponent = BigInt(`0x${CAS_RSA_EXPONENT}`);
  const chunkSize = 2 * highDigitIndexFromHex(CAS_RSA_MODULUS);
  const bytes = Array.from(String(password), (char) => char.charCodeAt(0));
  while (bytes.length % chunkSize !== 0) bytes.push(0);

  const blocks = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    let block = 0n;
    for (let j = 0, k = i; k < i + chunkSize; j += 1) {
      const digit = BigInt(bytes[k++] + (bytes[k++] << 8));
      block += digit << BigInt(16 * j);
    }
    const encrypted = modPow(block, exponent, modulus);
    blocks.push(encrypted.toString(16));
  }
  return blocks.join(" ");
}

function extractInputValue(html, name) {
  const pattern = new RegExp(`<input[^>]+name=["']${name}["'][^>]*value=["']([^"']*)["']`, "i");
  return html.match(pattern)?.[1] || "";
}

function extractFormAction(html, serviceUrl = SERVICE_URL) {
  const match = html.match(/<form[^>]+id=["']fm1["'][^>]+action=["']([^"']+)["']/i);
  return match?.[1] || `/cas/login?service=${encodeURIComponent(serviceUrl)}`;
}

function htmlErrorMessage(html) {
  const candidates = [
    html.match(/<span[^>]+id=["']msg1["'][^>]*>([\s\S]*?)<\/span>/i)?.[1],
    html.match(/<span[^>]+id=["']swiSpan1["'][^>]*>([\s\S]*?)<\/span>/i)?.[1],
    html.match(/class=["'][^"']*form-error[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]
  ].filter(Boolean);
  const cleaned = candidates
    .map((item) => item.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
    .find(Boolean);
  return cleaned || "登录失败，请检查账号密码或是否需要验证码。";
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
    return response;
  } finally {
    clearTimeout(timer);
    activeUpstreamRequests -= 1;
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
    if (!location) throw new HttpError(401, "CAS 未返回服务跳转地址，登录失败。");
    return followRedirectsWithJar(new URL(location, loginUrl).href, jar, {
      method: "GET",
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
  if (!location) {
    throw new HttpError(401, "CAS 未返回服务跳转地址，登录失败。");
  }

  return followRedirectsWithJar(new URL(location, action).href, jar, {
    method: "GET",
    headers: { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }
  });
}

async function getCasTicketRedirect({ jar, username, password, rememberMe = true, serviceUrl, loginBaseUrl = `${CAS_ORIGIN}/cas/login` }) {
  const loginUrl = casLoginUrlWithService(loginBaseUrl, serviceUrl, CAS_ORIGIN);
  const loginPage = await fetchWithJar(loginUrl, {
    jar,
    headers: { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }
  });

  if (loginPage.status >= 300 && loginPage.status < 400) {
    const location = loginPage.headers.get("location");
    if (!location) throw new HttpError(401, "CAS 未返回服务跳转地址，登录失败。");
    return assertAllowedSchoolUrl(new URL(location, loginUrl).href);
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
  if (!location) throw new HttpError(401, "CAS 未返回服务跳转地址，登录失败。");
  return assertAllowedSchoolUrl(new URL(location, action).href);
}

async function loginWithCasFull({ username, password, rememberMe = true }) {
  const jar = emptyJar();
  await loginCasService({ jar, username, password, rememberMe, serviceUrl: SERVICE_URL });

  const view = await getViewData(jar);
  jar.meta.schoolAccount = normalizeSchoolLoginAccount(username);
  jar.meta.account = view.account || null;
  jar.meta.ownerName = view.ownerName || null;
  jar.meta.lastValidatedAt = new Date().toISOString();
  jar.meta.loginAt = new Date().toISOString();
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
  await saveSessionJar(jar);
  return { view, status: storedSessionSummary(jar) };
}

async function loginWithCas({ username, password, rememberMe = true }) {
  return loginWithCasFull({ username, password, rememberMe });
}

function uiasRequestSignature({ method, path, params, data, nonce, date }) {
  const upperMethod = method.toUpperCase();
  const digestSource = upperMethod === "GET" || upperMethod === "DELETE"
    ? sortedParamString(params)
    : sortedParamString(data);
  const digest = digestSource ? md5(digestSource) : "";
  const signText = `${upperMethod}\n${path}\n${digest}\n${nonce}\n${date.toUTCString()}`;
  return sm2.doSignature(sm3(signText), UIAS_SIGN_PRIVATE_KEY);
}

async function uiasRequest(jar, name, {
  method = "GET",
  params = {},
  data,
  authorization = "",
  referer = `${YKT_ORIGIN}/uias-h5/login`
} = {}) {
  const path = UIAS_ENDPOINTS[name] || name;
  const upperMethod = method.toUpperCase();
  const requestUrl = new URL(path, YKT_ORIGIN);
  const cleanQuery = cleanParams(params);
  if (upperMethod === "GET" || upperMethod === "DELETE") {
    Object.entries(cleanQuery).forEach(([key, value]) => requestUrl.searchParams.append(key, String(value)));
  }

  const nonce = randomAlphaNum(12);
  const date = new Date();
  const headers = {
    accept: "application/json, text/plain, */*",
    Authorization: authorization || "",
    nonce,
    timestamp: String(date.getTime()),
    charset: "utf-8",
    Sign: uiasRequestSignature({
      method: upperMethod,
      path,
      params: cleanQuery,
      data,
      nonce,
      date
    }),
    referer
  };

  let body;
  if (upperMethod !== "GET" && upperMethod !== "DELETE") {
    headers["content-type"] = "application/json;charset=UTF-8";
    body = JSON.stringify(data || {});
  }

  const response = await fetchWithJar(requestUrl.href, {
    jar,
    method: upperMethod,
    headers,
    body,
    timeoutMs: REQUEST_TIMEOUT_MS
  });
  const text = await readUpstreamText(response);
  if (!response.ok) {
    throw new HttpError(response.status, `UIAS 返回 HTTP ${response.status}`, { endpoint: path, sample: text.slice(0, 200) });
  }

  const payload = parseJsonLike(text || "{}");
  if (payload.code === 200) return payload.data;
  if (payload.code === undefined && payload.data !== undefined) return payload.data;
  throw new HttpError(401, payload.msg || payload.message || "UIAS 登录失败", { endpoint: path, code: payload.code });
}

async function loginUiasByCas(jar, credentials) {
  // The current portal enters UIAS through the bare login URL. Embedding an app
  // route in the CAS service makes UIAS rebuild a different service and reject
  // the otherwise valid one-time ticket.
  const serviceUrl = uiasCasServiceUrl(UIAS_LOGIN_URL);
  const loginBaseUrl = await uiasRequest(jar, "CasLoginUrl");
  if (typeof loginBaseUrl !== "string" || !loginBaseUrl) {
    throw new HttpError(502, "UIAS 未返回 CAS 登录地址。");
  }
  const finalUrl = await getCasTicketRedirect({ ...credentials, jar, serviceUrl, loginBaseUrl });
  const { ticket, serviceUrl: returnedServiceUrl } = casServiceFromTicketRedirect(finalUrl);
  if (!ticket) {
    throw new HttpError(401, "CAS 已登录，但 UIAS 未返回 ticket。");
  }

  await uiasRequest(jar, "CasLogin", {
    referer: finalUrl,
    params: {
      ticket,
      loginSrc: 2,
      service: returnedServiceUrl
    }
  });

  jar.meta.campus ||= {};
  jar.meta.campus.uias = {
    capturedAt: new Date().toISOString()
  };
}

function uiasPortalList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload?.list)) return payload.list;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function sanitizeUiasPortalApp(app = {}) {
  return {
    applicationId: app.applicationId ?? app.id ?? null,
    appId: app.appId ?? app.clientId ?? app.client_id ?? null,
    clientId: app.clientId ?? app.client_id ?? app.appId ?? null,
    applicationName: app.applicationName ?? app.name ?? app.desc ?? null,
    instruction: app.instruction ?? app.desc ?? null,
    envIp: app.envIp ?? app.appUrl ?? app.url ?? null,
    sdk: app.sdk ?? null
  };
}

async function getUiasPortalApps(jar) {
  const results = await Promise.allSettled([
    uiasRequest(jar, "MyApplication"),
    uiasRequest(jar, "MyRecommendApplication")
  ]);
  const apps = results.flatMap((result) => (
    result.status === "fulfilled" ? uiasPortalList(result.value) : []
  )).map(sanitizeUiasPortalApp);

  if (apps.length) {
    jar.meta.campus ||= {};
    jar.meta.campus.portalApps = {
      capturedAt: new Date().toISOString(),
      list: apps
    };
  }
  return apps;
}

function portalAppSearchText(app) {
  return [
    app.applicationId,
    app.appId,
    app.clientId,
    app.applicationName,
    app.instruction,
    app.envIp,
    app.sdk
  ]
    .filter((value) => value !== undefined && value !== null)
    .map((value) => String(value).toLowerCase())
    .join(" ");
}

function portalAppScore(app, target) {
  const text = portalAppSearchText(app);
  let score = 0;
  const appUrl = String(target.appUrl || "").toLowerCase();
  if (appUrl && text.includes(appUrl)) score += 100;
  for (const hint of target.routeHints || []) {
    if (hint && text.includes(String(hint).toLowerCase())) score += 50;
  }
  for (const hint of target.pathHints || []) {
    if (hint && text.includes(String(hint).toLowerCase())) score += 20;
  }
  return score;
}

async function findUiasPortalApp(jar, target) {
  const apps = await getUiasPortalApps(jar).catch(() => []);
  return apps
    .map((app) => ({ app, score: portalAppScore(app, target) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.app || null;
}

function addUiasTokenCandidate(candidates, label, params) {
  const clean = cleanParams(params);
  if (!Object.keys(clean).length) return;
  const key = JSON.stringify(clean);
  if (candidates.some((candidate) => candidate.key === key)) return;
  candidates.push({ key, label, params: clean });
}

async function getUiasAppToken(jar, targetInput, isCas = 1) {
  const target = typeof targetInput === "string" ? { appUrl: targetInput } : { ...targetInput };
  const candidates = [];
  const portalApp = await findUiasPortalApp(jar, target);
  const clientId = portalApp?.clientId || portalApp?.appId;
  if (clientId) {
    addUiasTokenCandidate(candidates, "portal-client", { clientId });
    addUiasTokenCandidate(candidates, "portal-client-cas", { clientId, isCas, isAppEnter: 0 });
  }
  if (portalApp?.envIp) {
    addUiasTokenCandidate(candidates, "portal-url", {
      appUrl: portalApp.envIp,
      isCas,
      isAppEnter: 0
    });
  }
  addUiasTokenCandidate(candidates, "app-url", {
    appUrl: target.appUrl,
    isCas,
    isAppEnter: 0
  });

  let lastError = null;
  for (const candidate of candidates) {
    try {
      const data = await uiasRequest(jar, "AppToken", { params: candidate.params });
      const token = data?.value || data?.token || data;
      if (token && typeof token === "string") return token;
      throw new HttpError(502, `UIAS 未返回应用 token（${candidate.label}）。`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new HttpError(502, "UIAS 未返回应用 token。");
}

function easytongSignPayload(input = {}) {
  const payload = { ...input };
  payload.Time ||= formatDateCompact();
  const values = Object.keys(payload)
    .sort()
    .map((key) => payload[key])
    .join("|");
  payload.Sign = md5(`${values}|${EASYTONG_MD5_KEY}`);
  payload.ContentType = "application/json";
  return payload;
}

function formatDateCompact(date = new Date()) {
  // School signatures expect Beijing time, while many public servers run in UTC.
  const chinaTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const y = chinaTime.getUTCFullYear();
  const mo = String(chinaTime.getUTCMonth() + 1).padStart(2, "0");
  const d = String(chinaTime.getUTCDate()).padStart(2, "0");
  const h = String(chinaTime.getUTCHours()).padStart(2, "0");
  const mi = String(chinaTime.getUTCMinutes()).padStart(2, "0");
  const s = String(chinaTime.getUTCSeconds()).padStart(2, "0");
  return `${y}${mo}${d}${h}${mi}${s}`;
}

function tripleBase64Decode(value) {
  let output = String(value || "");
  for (let i = 0; i < 3; i += 1) {
    try {
      output = Buffer.from(decodeURIComponent(output), "base64").toString("utf8");
    } catch {
      return value;
    }
  }
  return output || value;
}

function normalizeRemoteError(payload, fallback) {
  if (!payload) return fallback;
  return payload.msg || payload.Msg || payload.message || fallback;
}

function upstreamErrorContext(error, stage = "") {
  return {
    stage,
    status: error?.status || null,
    code: error?.code || error?.details?.code || null,
    endpoint: error?.details?.endpoint || null,
    message: error?.message || "unknown upstream error"
  };
}

function isEasytongAuthMessage(message) {
  return /access[_-]?token|token|Token|TOKEN|ticket|Ticket|TICKET|未登录|登录已失效|登录过期|授权/.test(String(message || ""));
}

function easytongErrorStatus(payload) {
  const code = payload?.code ?? payload?.Code;
  const message = normalizeRemoteError(payload, "");
  if (String(code) === "40004" || isEasytongAuthMessage(message)) return 401;
  return 502;
}

async function easytongRawPost(jar, path, body, token = "") {
  const requestUrl = new URL(path, YKT_ORIGIN);
  const headers = {
    accept: "application/json, text/plain, */*",
    "content-type": "application/json; charset=utf-8",
    referer: `${YKT_ORIGIN}/easytong_webapp/index.html`,
    origin: YKT_ORIGIN
  };
  if (token) headers.Authorization = token;

  const response = await fetchWithJar(requestUrl.href, {
    jar,
    method: "POST",
    headers,
    body: JSON.stringify(body || {}),
    timeoutMs: REQUEST_TIMEOUT_MS
  });
  const text = await readUpstreamText(response);
  if (!response.ok) throw new HttpError(response.status, `一卡通返回 HTTP ${response.status}`, { endpoint: path, sample: text.slice(0, 200) });
  return parseJsonLike(text || "{}");
}

async function easytongRequest(jar, path, data = {}, token = "") {
  const requestUrl = new URL(path, YKT_ORIGIN);
  const payload = easytongSignPayload(cleanParams(data));
  const headers = {
    accept: "application/json, text/plain, */*",
    "content-type": "application/x-www-form-urlencoded",
    h5Req: "Y",
    referer: `${YKT_ORIGIN}/easytong_webapp/index.html`,
    origin: YKT_ORIGIN
  };
  if (token) headers.Authorization = token;

  const response = await fetchWithJar(requestUrl.href, {
    jar,
    method: "POST",
    headers,
    body: formEncode(payload),
    timeoutMs: REQUEST_TIMEOUT_MS
  });
  const text = await readUpstreamText(response);
  if (!response.ok) throw new HttpError(response.status, `一卡通返回 HTTP ${response.status}`, { endpoint: path, sample: text.slice(0, 200) });

  const payloadJson = parseJsonLike(text || "{}");
  if (payloadJson.Code && payloadJson.Code !== "1") {
    throw new HttpError(easytongErrorStatus(payloadJson), normalizeRemoteError(payloadJson, "一卡通接口返回失败"), { endpoint: path, code: payloadJson.Code });
  }
  if (payloadJson.code !== undefined && payloadJson.code !== 1) {
    throw new HttpError(easytongErrorStatus(payloadJson), normalizeRemoteError(payloadJson, "一卡通接口返回失败"), { endpoint: path, code: payloadJson.code });
  }
  return payloadJson;
}

async function loginEasytongByUiasToken(jar, appToken) {
  const login = await easytongRawPost(jar, "/easytong_app/h5uia/uiaApp", { token: appToken });
  if (login.code !== 1 || !login.token) {
    throw new HttpError(401, normalizeRemoteError(login, "一卡通应用 token 换取失败"));
  }

  const accNum = tripleBase64Decode(login.accNum);
  const accInfo = await easytongRequest(jar, "/easytong_app/GetAccInfo", { AccNum: accNum }, login.token);
  const campus = jar.meta.campus ||= {};
  campus.easytong = {
    token: login.token,
    accNum: accInfo.accNum || accNum,
    epId: accInfo.epid || accInfo.epId || login.epid || null,
    perCode: accInfo.personId || null,
    accName: accInfo.accName || null,
    capturedAt: new Date().toISOString()
  };
  return campus.easytong;
}

function isEasytongAuthError(error) {
  return error?.status === 401 || isEasytongAuthMessage(error?.message);
}

async function refreshEasytongSession(jar) {
  try {
    const appToken = await getUiasAppToken(jar, EASYTONG_UIAS_APP, 1);
    await loginEasytongByUiasToken(jar, appToken);
  } catch {
    await loginUiasByCas(jar, {});
    const appToken = await getUiasAppToken(jar, EASYTONG_UIAS_APP, 1);
    await loginEasytongByUiasToken(jar, appToken);
  }
  jar.meta.campus ||= {};
  jar.meta.campus.lastError = null;
  await saveSessionJar(jar);
}

async function easytongAuthedRequest(jar, path, dataFactory = {}, options = {}) {
  const { retryOnAuth = true } = options;
  const buildData = () => {
    const session = campusAuth(jar, "easytong");
    const data = typeof dataFactory === "function" ? dataFactory(session) : dataFactory;
    return { session, data };
  };

  try {
    const { session, data } = buildData();
    return await easytongRequest(jar, path, data, session.token);
  } catch (error) {
    if (!retryOnAuth || !isEasytongAuthError(error)) throw error;
    await refreshEasytongSession(jar);
    const { session, data } = buildData();
    return easytongRequest(jar, path, data, session.token);
  }
}

function uwcMd5Base64(text) {
  return CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(CryptoJS.MD5(text).toString()));
}

function uwcSign(input = {}) {
  const payload = { ...input, merchantKey: UWC_SIGN_KEY };
  const source = Object.keys(payload)
    .sort()
    .map((key) => `${key}=${payload[key]}`)
    .join("&");
  return uwcMd5Base64(source);
}

function uwcEncrypt(text) {
  const key = CryptoJS.enc.Utf8.parse(UWC_3DES_KEY);
  const iv = CryptoJS.enc.Utf8.parse(UWC_3DES_IV);
  return CryptoJS.TripleDES.encrypt(text, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  }).toString();
}

function uwcDecryptWithKey(text, keyText) {
  const key = CryptoJS.enc.Utf8.parse(keyText);
  const iv = CryptoJS.enc.Utf8.parse(UWC_3DES_IV);
  return CryptoJS.TripleDES.decrypt(text, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  }).toString(CryptoJS.enc.Utf8);
}

function uwcDecrypt(text) {
  const keys = [UWC_3DES_KEY, UWC_RESPONSE_3DES_KEY];
  for (const key of keys) {
    try {
      const decrypted = uwcDecryptWithKey(text, key);
      if (decrypted) return decrypted;
    } catch {
      // Try the alternate key used by some UWC deployments for response payloads.
    }
  }
  throw new HttpError(502, "生活用水接口响应解密失败。");
}

async function uwcRequest(jar, path, data = {}, token = "") {
  const requestUrl = new URL(`/uwc_web_app${path}`, YKT_ORIGIN);
  const payload = cleanParams(data);
  payload.sign = uwcSign(payload);
  const encrypted = uwcEncrypt(JSON.stringify(payload));
  const headers = {
    accept: "application/json, text/plain, */*",
    "content-type": "application/x-www-form-urlencoded",
    timestamp: String(Date.now()),
    nonceStr: randomUUID(),
    referer: `${YKT_ORIGIN}/uwc_webapp/`,
    origin: YKT_ORIGIN
  };
  if (token) headers.token = token;

  const response = await fetchWithJar(requestUrl.href, {
    jar,
    method: "POST",
    headers,
    body: `paramStr=${encodeURIComponent(encrypted)}`,
    timeoutMs: REQUEST_TIMEOUT_MS
  });
  const text = await readUpstreamText(response);
  if (!response.ok) throw new HttpError(response.status, `生活用水返回 HTTP ${response.status}`, { endpoint: path, sample: text.slice(0, 200) });

  const raw = parseJsonLike(text || "{}");
  if (!raw.resultMap) throw new HttpError(502, "生活用水接口未返回加密结果。", { endpoint: path, raw });
  const decrypted = parseJsonLike(uwcDecrypt(raw.resultMap));
  if (decrypted.code !== "1") {
    throw new HttpError(decrypted.code === "-2" ? 401 : 502, decrypted.msg || "生活用水接口返回失败", { endpoint: path, code: decrypted.code });
  }

  const responseSign = decrypted.sign;
  delete decrypted.sign;
  if (responseSign && responseSign !== uwcSign(decrypted)) {
    throw new HttpError(502, "生活用水接口签名校验失败。", { endpoint: path });
  }
  if (decrypted.data && typeof decrypted.data === "string" && !path.includes("getUserToYM")) {
    decrypted.data = parseJsonLike(decrypted.data);
  }
  return decrypted;
}

function isUwcAuthError(error) {
  const message = String(error?.message || "");
  return error?.status === 401 || /账号在其他地方登录|未登录|登录已失效|登录过期|token|Token|TOKEN|ticket|Ticket|TICKET|授权/.test(message);
}

async function refreshUwcSession(jar) {
  try {
    const appToken = await getUiasAppToken(jar, UWC_UIAS_APP, 1);
    await loginUwcByUiasToken(jar, appToken);
  } catch {
    await activateCampusSessions(jar, {});
  }
  jar.meta.campus ||= {};
  jar.meta.campus.lastError = null;
  await saveSessionJar(jar);
}

async function uwcAuthedRequest(jar, path, dataFactory = {}, options = {}) {
  const { retryOnAuth = true, maxAuthRecoveries = 2 } = options;
  const buildData = () => {
    const session = campusAuth(jar, "uwc");
    const data = typeof dataFactory === "function" ? dataFactory(session) : dataFactory;
    return { session, data };
  };

  return runWithAuthRecovery(async () => {
    const { session, data } = buildData();
    return uwcRequest(jar, path, data, session.token);
  }, {
    isAuthError: isUwcAuthError,
    maxRecoveries: retryOnAuth ? maxAuthRecoveries : 0,
    onRecovery: async ({ attempt, error }) => {
      logger.info("uwc_session_auto_recovery", {
        userId: currentUserId(),
        endpoint: path,
        attempt,
        message: error?.message || "UWC authentication expired"
      });
    },
    recover: async () => refreshUwcSession(jar)
  });
}

async function getAppdmConfig(jar) {
  try {
    const response = await fetchWithJar(`${YKT_ORIGIN}/appdm-home/appsys/sys/config/listAll`, {
      jar,
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        "content-type": "application/json;charset=UTF-8",
        origin: YKT_ORIGIN,
        referer: `${YKT_ORIGIN}/appdm-home/wxweb/`
      },
      body: JSON.stringify({ timestamp: Date.now(), key: "" }),
      timeoutMs: REQUEST_TIMEOUT_MS
    });
    const text = await readUpstreamText(response);
    if (!response.ok) throw new HttpError(response.status, `公寓系统配置返回 HTTP ${response.status}`);
    const payload = parseJsonLike(text || "{}");
    if (payload.code !== 0) throw new HttpError(502, normalizeRemoteError(payload, "公寓系统配置读取失败"));
    const config = Object.fromEntries(
      (Array.isArray(payload.configList) ? payload.configList : [])
        .map((item) => [item.label || item.configKey, item.value ?? item.configValue])
        .filter(([key, value]) => key && value !== undefined && value !== null)
    );
    return {
      mobileCasUrl: config.MOBILE_CAS_URL || APPDM_MOBILE_CAS_URL_FALLBACK,
      aesKey: config.interfaceParam || APPDM_AES_KEY_FALLBACK
    };
  } catch {
    return {
      mobileCasUrl: APPDM_MOBILE_CAS_URL_FALLBACK,
      aesKey: APPDM_AES_KEY_FALLBACK
    };
  }
}

function appdmHashParams(finalUrl) {
  const hash = new URL(finalUrl).hash || "";
  const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
  return new URLSearchParams(query);
}

function decryptAppdmSqCode(sqcode, aesKey) {
  const normalized = decodeURIComponent(String(sqcode || "")).replace(/\s/g, "+");
  const decrypted = CryptoJS.AES.decrypt(normalized, CryptoJS.enc.Utf8.parse(aesKey), {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7
  }).toString(CryptoJS.enc.Utf8);
  if (!decrypted) throw new HttpError(401, "公寓系统授权解析失败，请重新登录学校账号。");
  return decrypted;
}

async function loginAppdmByCas(jar) {
  const config = await getAppdmConfig(jar);
  let currentUrl = config.mobileCasUrl;
  let finalUrl = currentUrl;
  let finalHtml = "";

  for (let i = 0; i < 10; i += 1) {
    const response = await fetchWithJar(currentUrl, {
      jar,
      method: "GET",
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      timeoutMs: REQUEST_TIMEOUT_MS
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) break;
      currentUrl = assertAllowedSchoolUrl(new URL(location, currentUrl).href);
      finalUrl = currentUrl;
      if (currentUrl.includes("#/hoyOauth?")) break;
      continue;
    }

    finalHtml = await readUpstreamText(response).catch(() => "");
    break;
  }

  const params = appdmHashParams(finalUrl);
  const sqcode = params.get("sqcode");
  if (!sqcode) {
    if (/id=["']fm1["']|统一身份认证|登录/.test(finalHtml)) {
      throw new HttpError(401, "统一身份认证会话已过期，请重新登录学校账号。");
    }
    throw new HttpError(401, "公寓系统授权未返回 token，请重新登录学校账号。");
  }

  const campus = jar.meta.campus ||= {};
  campus.appdm = {
    token: decryptAppdmSqCode(sqcode, config.aesKey),
    personId: params.get("personId") || null,
    capturedAt: new Date().toISOString()
  };
  campus.appdmLastError = null;
  return campus.appdm;
}

function isAppdmAuthError(error) {
  const message = String(error?.message || "");
  return error?.status === 401 || /token|Token|TOKEN|未登录|登录已失效|登录过期|授权|无效/.test(message);
}

async function appdmRequest(jar, path, {
  method = "POST",
  params = {},
  data = {},
  token = ""
} = {}) {
  const upperMethod = method.toUpperCase();
  const requestUrl = new URL(`/appdm-home${path}`, YKT_ORIGIN);
  Object.entries(cleanParams({ ...params, t: Date.now() })).forEach(([key, value]) => {
    requestUrl.searchParams.set(key, String(value));
  });

  const headers = {
    accept: "application/json, text/plain, */*",
    "content-type": "application/json;charset=UTF-8",
    origin: YKT_ORIGIN,
    referer: `${YKT_ORIGIN}/appdm-home/wxweb/`
  };
  if (token) headers.token = token;

  const response = await fetchWithJar(requestUrl.href, {
    jar,
    method: upperMethod,
    headers,
    body: upperMethod === "GET" || upperMethod === "DELETE" ? undefined : JSON.stringify(data || {}),
    timeoutMs: REQUEST_TIMEOUT_MS
  });
  const text = await readUpstreamText(response);
  if (!response.ok) throw new HttpError(response.status, `公寓系统返回 HTTP ${response.status}`, { endpoint: path, sample: text.slice(0, 200) });

  const payload = parseJsonLike(text || "{}");
  if (payload.code !== undefined && payload.code !== 0) {
    const status = payload.code === 401 || payload.code === 403 ? 401 : 502;
    throw new HttpError(status, normalizeRemoteError(payload, "公寓系统接口返回失败"), { endpoint: path, code: payload.code });
  }
  return payload;
}

async function appdmAuthedRequest(jar, path, options = {}) {
  const { retryOnAuth = true, ...requestOptions } = options;
  try {
    const session = campusAuth(jar, "appdm");
    return await appdmRequest(jar, path, { ...requestOptions, token: session.token });
  } catch (error) {
    if (!retryOnAuth || !isAppdmAuthError(error)) throw error;
    await loginAppdmByCas(jar);
    const session = campusAuth(jar, "appdm");
    return appdmRequest(jar, path, { ...requestOptions, token: session.token });
  }
}

async function loginUwcByUiasToken(jar, appToken) {
  const login = await uwcRequest(jar, "/miniapps/loginByToken", { uiastoken: appToken });
  if (login.code !== "1" || !login.data?.token) {
    throw new HttpError(401, normalizeRemoteError(login, "生活用水 token 换取失败"));
  }
  const campus = jar.meta.campus ||= {};
  campus.uwc = {
    token: login.data.token,
    accNum: login.data.accNum,
    epId: login.data.epId,
    userId: login.data.userId || null,
    perCode: login.data.perCode || null,
    accName: login.data.accName || null,
    capturedAt: new Date().toISOString()
  };
  return campus.uwc;
}

async function activateCampusSessions(jar, credentials) {
  let stage = "uias-cas-login";
  try {
    await loginUiasByCas(jar, credentials);
    stage = "uias-easytong-token";
    const easytongAppToken = await getUiasAppToken(jar, EASYTONG_UIAS_APP, 1);
    stage = "uias-uwc-token";
    const uwcAppToken = await getUiasAppToken(jar, UWC_UIAS_APP, 1);
    stage = "easytong-login";
    await loginEasytongByUiasToken(jar, easytongAppToken);
    stage = "uwc-login";
    await loginUwcByUiasToken(jar, uwcAppToken);
    await loginAppdmByCas(jar).catch((error) => {
      jar.meta.campus ||= {};
      jar.meta.campus.appdmLastError = error.message || "公寓系统自动连接失败";
    });
    jar.meta.campus ||= {};
    jar.meta.campus.lastError = null;
  } catch (error) {
    logger.warn("campus_activation_failed", {
      userId: currentUserId(),
      ...upstreamErrorContext(error, stage)
    });
    throw error;
  }
}

function campusAuth(jar, key) {
  const session = jar.meta?.campus?.[key];
  if (!session?.token) {
    throw new HttpError(401, "校园一卡通尚未连接，请重新登录学校账号。");
  }
  return session;
}

function campusDealCount(payload) {
  const list = Array.isArray(payload?.list) ? payload.list : [];
  return list.reduce((sum, group) => {
    if (Array.isArray(group?.dealDetail)) return sum + group.dealDetail.length;
    if (Array.isArray(group?.list)) return sum + group.list.length;
    return sum + (group && typeof group === "object" ? 1 : 0);
  }, 0);
}

async function requestCampusCardBill(jar, billPayload) {
  try {
    return await easytongAuthedRequest(jar, "/easytong_app/GetDealRec", (session) => ({
      ...billPayload,
      AccNum: session.accNum || billPayload.AccNum
    }));
  } catch (firstError) {
    try {
      return await easytongAuthedRequest(jar, "/easytong_app/GetDealRec", (session) => ({
        ...billPayload,
        AccNum: session.accNum || billPayload.AccNum,
        EPID: session.epId || 0
      }));
    } catch (secondError) {
      throw new HttpError(secondError.status || firstError.status || 502, secondError.message || firstError.message || "暂无一卡通账单");
    }
  }
}

async function getCampusCardBill(jar, billQuery) {
  const session = campusAuth(jar, "easytong");
  const pageSize = 100;
  const basePayload = {
    AccNum: session.accNum,
    CardAccNum: "-1",
    Count: pageSize,
    EPID: 0,
    TypeNum: -1,
    WalletNum: "0"
  };
  if (billQuery.mode === "month") basePayload.YearMonth = monthCompact(billQuery.time);

  let begin = 1;
  let combined = null;
  for (let page = 0; page < 10; page += 1) {
    const payload = await requestCampusCardBill(jar, {
      ...basePayload,
      BeginRecNum: begin
    });
    const list = Array.isArray(payload.list) ? payload.list : [];
    const dealCount = campusDealCount(payload);
    combined ||= { ...payload, list: [] };
    combined.list.push(...list);
    if (dealCount < pageSize || list.length === 0) break;
    begin += dealCount;
  }
  return combined || { code: 1, list: [], msg: "暂无一卡通账单" };
}

async function getCampusWaterBill(jar, waterMonth) {
  const pageSize = 100;
  let combined = null;
  for (let page = 1; page <= 10; page += 1) {
    const payload = await uwcAuthedRequest(jar, "/public/getTransactionBill", (currentSession) => ({
      accNum: currentSession.accNum,
      epId: currentSession.epId,
      date: waterMonth,
      current: page,
      pageSize
    }));
    const rows = Array.isArray(payload.data) ? payload.data : [];
    combined ||= { ...payload, data: [] };
    combined.data.push(...rows);
    const totalCount = Number(payload.totalCount ?? payload.total ?? payload.count ?? rows.length);
    if (!rows.length || !Number.isFinite(totalCount) || combined.data.length >= totalCount || rows.length < pageSize) break;
  }
  return combined || { msg: "暂无生活用水账单", code: "1", data: [], totalCount: 0 };
}

async function getCampusCard(queryInput = {}) {
  const billQuery = normalizeCampusBillQuery(queryInput);
  const jar = await readSessionJar();
  campusAuth(jar, "easytong");
  const wallet = await easytongAuthedRequest(jar, "/easytong_app/GetWalletMoney", (session) => ({
    AccNum: session.accNum,
    EPID: session.epId || 0
  }));
  const cards = await easytongAuthedRequest(jar, "/easytong_app/GetAccCardInfoForDev", (session) => ({
    AccNum: session.accNum,
    CardStatus: 2
  })).catch(() => null);

  let bill;
  try {
    bill = await getCampusCardBill(jar, billQuery);
  } catch (error) {
    bill = {
      code: 1,
      list: [],
      msg: error.message || "暂无一卡通账单"
    };
  }

  await saveSessionJar(jar);
  const session = campusAuth(jar, "easytong");
  const walletList = Array.isArray(wallet.list) ? wallet.list : [];
  return {
    account: {
      accNum: session.accNum,
      accName: session.accName,
      epId: session.epId
    },
    wallet,
    cards,
    bill,
    billQuery,
    totalBalance: walletList.reduce((sum, item) => sum + Number(item.walletMoney ?? item.ewalletMoney ?? 0), 0)
  };
}

async function getCampusWater(queryInput = {}) {
  const billQuery = normalizeCampusBillQuery(queryInput);
  const waterMonth = billQuery.mode === "month" ? billQuery.time : defaultMonth();
  const jar = await readSessionJar();
  campusAuth(jar, "uwc");
  // UWC can invalidate the earlier token when concurrent requests both refresh it.
  // Resolve the user-facing code first, then reuse the recovered session for bills.
  const waterCode = await uwcAuthedRequest(jar, "/randomWaterCodeApp/queryRanCode", (currentSession) => ({
    accNum: currentSession.accNum,
    epId: currentSession.epId
  })).catch((error) => ({ error: error.message }));
  const waterBill = await getCampusWaterBill(jar, waterMonth).catch((error) => ({ error: error.message }));

  const session = campusAuth(jar, "uwc");
  await saveSessionJar(jar);
  return {
    account: {
      accNum: session.accNum,
      accName: session.accName,
      epId: session.epId
    },
    waterCode,
    waterBill,
    billQuery: {
      mode: "month",
      time: waterMonth,
      label: waterMonth
    }
  };
}

async function refreshCampusWaterCode() {
  await ensureCampusSessions();
  const jar = await readSessionJar();
  const waterCode = await uwcAuthedRequest(jar, "/randomWaterCodeApp/createRanCode", (session) => ({
    accNum: session.accNum,
    epId: session.epId
  }));
  const session = campusAuth(jar, "uwc");
  await saveSessionJar(jar);
  return {
    account: {
      accNum: session.accNum,
      accName: session.accName,
      epId: session.epId
    },
    waterCode,
    generatedAt: new Date().toISOString()
  };
}

async function ensureCampusSessions() {
  const jar = await readSessionJar();
  const campus = campusSessionSummary(jar);
  if (campus.hasEasytongToken && campus.hasUwcToken && campus.hasAppdmToken) return;

  try {
    if (!campus.hasEasytongToken || !campus.hasUwcToken) {
      await activateCampusSessions(jar, {});
    } else if (!campus.hasAppdmToken) {
      await loginAppdmByCas(jar);
    }
  } catch (error) {
    jar.meta.campus ||= {};
    if (!campus.hasEasytongToken || !campus.hasUwcToken) {
      jar.meta.campus.lastError = error.message || "校园一卡通自动连接失败";
    } else {
      jar.meta.campus.appdmLastError = error.message || "公寓系统自动连接失败";
    }
  }
  await saveSessionJar(jar);
}

async function getCampusAccommodation() {
  const jar = await readSessionJar();
  if (!jar.meta?.campus?.appdm?.token) {
    try {
      await loginAppdmByCas(jar);
    } catch (error) {
      jar.meta.campus ||= {};
      jar.meta.campus.appdmLastError = error.message || "公寓系统自动连接失败";
      await saveSessionJar(jar);
      throw error;
    }
  }

  const userInfo = await appdmAuthedRequest(jar, "/appsys/sys/user/info", { method: "GET" });
  const username = userInfo.user?.username || jar.meta?.campus?.appdm?.personId;
  if (!username) throw new HttpError(502, "公寓系统未返回学号，无法查询住宿信息。");

  const now = formatDateCompact();
  const personPayload = await appdmAuthedRequest(jar, "/appou/person/search/queryPersonDetailInfoByPersonsn", {
    method: "POST",
    params: {
      personsn: username,
      accessKey: md5(`${username}SQ${now}`),
      timestamp: Date.now()
    }
  });
  const person = personPayload.personvo || personPayload.data?.personvo || personPayload.data || {};
  const bedCode = person.bedCode || "";

  const [roomiesResult, deviceResult] = await Promise.allSettled([
    bedCode
      ? appdmAuthedRequest(jar, "/appdm/scattered/scatteredreside/selectInRoomStudentInfoListBybedCode", {
        method: "POST",
        params: {
          bedCode,
          accessKey: md5(`${bedCode}SQ${formatDateCompact()}`),
          timestamp: Date.now()
        }
      })
      : Promise.resolve({ page: { list: [] } }),
    bedCode
      ? appdmAuthedRequest(jar, "/appdm/dormitory/dormitorydevice/getDeviceInfo", {
        method: "POST",
        params: { bedCode, type: "10" }
      })
      : Promise.resolve({})
  ]);

  await saveSessionJar(jar);

  const checkInDate = person.checkInDate || "";
  const checkOutDate = person.checkOutDate || "";
  const accommodationStatus = person.accommodationStatus === "是"
    ? "已入住"
    : person.accommodationStatus === "否"
      ? "未入住"
      : (person.accommodationStatus || "--");

  return {
    account: {
      username,
      realName: userInfo.user?.realName || person.personname || null,
      personId: jar.meta?.campus?.appdm?.personId || null
    },
    profile: {
      studentNo: person.personsn || username,
      name: person.personname || userInfo.user?.realName || "--",
      collegeInfo: person.collegeInfo || person.department || "--",
      dormitoryInfo: person.dormitoryinfo || person.dormitoryinfo2 || "--",
      bedCode,
      planStatus: person.planStatus || "--",
      accommodationStatus,
      checkInDate,
      checkOutDate,
      accommodationDate: [checkInDate, checkOutDate].filter(Boolean).join(" 至 ") || "--",
      fees: person.fees || "--"
    },
    roomies: roomiesResult.status === "fulfilled" && Array.isArray(roomiesResult.value?.page?.list)
      ? roomiesResult.value.page.list
      : [],
    roomiesError: roomiesResult.status === "rejected" ? roomiesResult.reason.message : null,
    device: deviceResult.status === "fulfilled" ? (deviceResult.value?.dormitoryDevice || null) : null,
    deviceError: deviceResult.status === "rejected" ? deviceResult.reason.message : null,
    capturedAt: new Date().toISOString()
  };
}

async function getCampusSummary(queryInput = {}) {
  const billQuery = normalizeCampusBillQuery(queryInput);
  await ensureCampusSessions();
  // These connectors share one persisted UIAS/CAS jar. Run them in order so a
  // later login cannot invalidate a token while another connector is using it.
  const [cardResult] = await Promise.allSettled([getCampusCard(billQuery)]);
  const [waterResult] = await Promise.allSettled([getCampusWater(billQuery)]);
  const [accommodationResult] = await Promise.allSettled([getCampusAccommodation()]);
  const jar = await readSessionJar();
  const status = campusSessionSummary(jar);
  const campusError = status.lastError || null;
  const cardError = cardResult.status === "rejected"
    ? (status.hasEasytongToken ? cardResult.reason.message : (campusError || cardResult.reason.message))
    : null;
  const waterError = waterResult.status === "rejected"
    ? (status.hasUwcToken ? waterResult.reason.message : (campusError || waterResult.reason.message))
    : null;
  return {
    time: billQuery.time,
    billMode: billQuery.mode,
    billLabel: billQuery.label,
    status,
    card: cardResult.status === "fulfilled" ? cardResult.value : { error: cardError },
    water: waterResult.status === "fulfilled" ? waterResult.value : { error: waterError },
    accommodation: accommodationResult.status === "fulfilled" ? accommodationResult.value : { error: accommodationResult.reason.message }
  };
}

const WEEKDAYS = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"];
async function getCampusRechargeLink() {
  await ensureCampusSessions();
  const jar = await readSessionJar();
  let token;
  try {
    token = await getUiasAppToken(jar, EASYTONG_RECHARGE_UIAS_APP, 1);
  } catch {
    await activateCampusSessions(jar, {});
    token = await getUiasAppToken(jar, EASYTONG_RECHARGE_UIAS_APP, 1);
  }
  await saveSessionJar(jar);
  return {
    url: `${EASYTONG_RECHARGE_APP_URL}&token=${encodeURIComponent(token)}`,
    target: "official",
    note: "Open the official campus-card recharge page. Payment is completed on ykt.hgu.edu.cn."
  };
}

const DEFAULT_SECTION_TIMES = [
  { section: 1, label: "第一小节", start: "08:00", end: "08:45" },
  { section: 2, label: "第二小节", start: "08:50", end: "09:35" },
  { section: 3, label: "第三小节", start: "09:50", end: "10:35" },
  { section: 4, label: "第四小节", start: "10:40", end: "11:25" },
  { section: 5, label: "第五小节", start: "11:30", end: "12:15" },
  { section: 6, label: "第六小节", start: "14:00", end: "14:45" },
  { section: 7, label: "第七小节", start: "14:50", end: "15:35" },
  { section: 8, label: "第八小节", start: "15:50", end: "16:35" },
  { section: 9, label: "第九小节", start: "16:40", end: "17:25" },
  { section: 10, label: "第十小节", start: "17:30", end: "18:15" },
  { section: 11, label: "第十一小节", start: "19:00", end: "19:45" },
  { section: 12, label: "第十二小节", start: "19:50", end: "20:35" }
];
const NEW_CAMPUS_BUILDINGS = [
  { number: "101", name: "体育馆", study: false },
  { number: "102", name: "一号球类操场", study: false },
  { number: "103", name: "一号田径操场", study: false },
  { number: "111", name: "1号学院楼", study: true },
  { number: "112", name: "2号学院楼", study: true },
  { number: "201", name: "图书馆", study: true },
  { number: "202", name: "实验楼", study: true },
  { number: "203", name: "教一", study: true },
  { number: "205", name: "教二", study: true },
  { number: "701", name: "综合楼", study: true }
];
const NEW_CAMPUS_BUILDING_BY_NUMBER = new Map(NEW_CAMPUS_BUILDINGS.map((building) => [building.number, building]));

function normalizeHtmlText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r?\n+/g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .trim();
}

function looksLikeCasLoginHtml(html, finalUrl = "") {
  const sample = String(html || "").slice(0, 5000);
  return finalUrl.includes("/cas/login") || /统一身份认证|name=["']execution["']|id=["']authcode["']/.test(sample);
}

function looksLikeAcademicTimetableHtml(html) {
  const sample = String(html || "").slice(0, 200000);
  return /选课结果|courseTable|课程号[\s\S]{0,300}选课状态[\s\S]{0,80}时间[\s\S]{0,80}地点/.test(sample);
}

function extractWebvpnVerifyUrl(html, baseUrl) {
  try {
    const url = new URL(baseUrl);
    if (url.hostname === new URL(WEBVPN_ORIGIN).hostname && url.pathname === "/portal/shortcut.html" && url.searchParams.get("t")) {
      const verify = new URL("/controller/v1/public/verify", WEBVPN_ORIGIN);
      verify.searchParams.set("t", url.searchParams.get("t"));
      return verify.href;
    }
  } catch {
    // Fall through to HTML script extraction.
  }
  const source = String(html || "");
  const match = source.match(/locationUrl\s*=\s*["']([^"']*\/controller\/v1\/public\/verify[^"']*)["']/)
    || source.match(/window\.location(?:\.href)?\s*=\s*["']([^"']*\/controller\/v1\/public\/verify[^"']*)["']/);
  return match ? new URL(match[1], baseUrl).href : "";
}

function webvpnClientUrl(path) {
  const url = new URL(path, WEBVPN_ORIGIN);
  url.searchParams.set("clientType", "SDPBrowserClient");
  url.searchParams.set("platform", "Windows");
  url.searchParams.set("lang", "zh-CN");
  return url.href;
}

function webvpnHeaders(extra = {}) {
  return {
    accept: "application/json, text/plain, */*",
    "x-sdp-rid": Buffer.from(new URL(WEBVPN_ORIGIN).host).toString("base64"),
    ...extra
  };
}

function webvpnData(payload) {
  return payload && typeof payload.data === "object" && payload.data !== null ? payload.data : {};
}

function webvpnMessage(payload, fallback) {
  return payload?.message || payload?.msg || fallback;
}

function assertWebvpnOk(payload, context) {
  if (payload?.code === 0) return;
  throw new HttpError(502, `${context}：${webvpnMessage(payload, "学校 WebVPN 返回失败")}`, {
    code: payload?.code,
    traceId: payload?.traceId
  });
}

async function requestWebvpnJson(jar, targetUrl, {
  method = "GET",
  headers = {},
  body,
  referer = `${WEBVPN_ORIGIN}/portal/`
} = {}) {
  const url = new URL(targetUrl, WEBVPN_ORIGIN).href;
  const response = await fetchWithJar(url, {
    jar,
    method,
    headers: webvpnHeaders({ referer, ...headers }),
    body
  });
  const text = await readUpstreamText(response);
  let payload = null;
  try {
    payload = parseJsonLike(text);
  } catch {
    payload = null;
  }
  if (response.status >= 400) {
    throw new HttpError(response.status, webvpnMessage(payload, `WebVPN 返回 HTTP ${response.status}`), {
      endpoint: new URL(url).pathname,
      code: payload?.code,
      sample: normalizeHtmlText(text).slice(0, 200)
    });
  }
  if (!payload || typeof payload !== "object") {
    throw new HttpError(502, "WebVPN 返回的 JSON 结构不符合预期。", {
      endpoint: new URL(url).pathname,
      sample: normalizeHtmlText(text).slice(0, 200)
    });
  }
  return payload;
}

function parseWebvpnCallbackData(callbackUrl) {
  try {
    const raw = new URL(callbackUrl).searchParams.get("data");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function addWebvpnClientParams(url) {
  url.searchParams.set("clientType", "SDPBrowserClient");
  url.searchParams.set("platform", "Windows");
  url.searchParams.set("lang", "zh-CN");
  return url;
}

function extractSimpleLocationRedirectUrl(html, baseUrl) {
  const source = String(html || "");
  if (source.length > 3500) return "";
  const isShell = /navigator\.userAgent\.search\(['"]ms-office['"]\)|var\s+locationUrl\s*=/.test(source);
  if (!isShell) return "";
  const direct = source.match(/location\.replace\(["']([^"']+)/)
    || source.match(/window\.location(?:\.href)?\s*=\s*["']([^"']+)/);
  if (direct) return new URL(direct[1], baseUrl).href;
  const variable = source.match(/locationUrl\s*=\s*["']([^"']+)["']/);
  return variable ? new URL(variable[1], baseUrl).href : "";
}

function looksLikeAcademicLoginHtml(html, finalUrl = "") {
  const url = String(finalUrl || "");
  const sample = String(html || "").slice(0, 5000);
  return looksLikeCasLoginHtml(html, finalUrl)
    || /\/(?:gotoLogin|login|sigin)(?:$|[?#])/.test(new URL(url, JWXS_ORIGIN).pathname)
    || /location\.replace\(["']https:\/\/newjwxs\.hgu\.edu\.cn(?::443)?\/(?:gotoLogin|login|sigin)/.test(sample);
}

async function requestAcademicHtmlWithSimpleRedirects(jar, targetUrl, { referer = JWXS_ORIGIN } = {}) {
  let currentUrl = targetUrl;
  let currentReferer = referer;
  let page = null;
  for (let i = 0; i < 6; i += 1) {
    page = await requestAcademicHtml(jar, currentUrl, { referer: currentReferer });
    const redirectUrl = extractSimpleLocationRedirectUrl(page.html, page.finalUrl);
    if (!redirectUrl) return page;
    currentReferer = page.finalUrl;
    currentUrl = redirectUrl;
  }
  return page;
}

async function ensureWebvpnSessionUnlocked(jar, { username, password, rememberMe = true } = {}) {
  let { response, url: callbackUrl } = await followRedirectsWithJar(WEBVPN_CAS_LOGIN_URL, jar, {
    method: "GET",
    headers: { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }
  });
  let html = await readUpstreamText(response);

  if (looksLikeCasLoginHtml(html, callbackUrl)) {
    if (!username || !password) {
      throw new HttpError(401, "统一身份认证会话已过期，请重新登录学校账号。");
    }
    const serviceUrl = new URL(callbackUrl).searchParams.get("service") || WEBVPN_CAS_LOGIN_URL;
    const logged = await loginCasService({ jar, username, password, rememberMe, serviceUrl });
    callbackUrl = logged.url;
    html = await readUpstreamText(logged.response);
  }

  const callback = new URL(callbackUrl, WEBVPN_ORIGIN);
  if (callback.searchParams.get("nextService") !== "auth/authCheck") {
    const appList = await requestWebvpnJson(jar, webvpnClientUrl("/controller/v1/user/appList"), { referer: `${WEBVPN_ORIGIN}/portal/` });
    assertWebvpnOk(appList, "WebVPN 应用列表校验失败");
    return;
  }

  const authConfig = await requestWebvpnJson(jar, `${WEBVPN_ORIGIN}/passport/v1/public/authConfig?mod=1`, {
    referer: callbackUrl
  });
  assertWebvpnOk(authConfig, "WebVPN 初始化失败");
  const csrfToken = webvpnData(authConfig).security?.csrfToken || "";

  const callbackData = parseWebvpnCallbackData(callbackUrl);
  if (callbackData?.env?.need && callbackData.ticket) {
    jar.meta.academic ||= {};
    jar.meta.academic.webvpnDeviceId ||= `00${randomBytes(32).toString("hex")}`;
    const report = await requestWebvpnJson(jar, webvpnClientUrl("/controller/v1/public/reportEnv"), {
      method: "POST",
      referer: callbackUrl,
      headers: {
        "content-type": "application/json",
        origin: WEBVPN_ORIGIN,
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        ticket: callbackData.ticket,
        deviceId: jar.meta.academic.webvpnDeviceId,
        env: {
          endpoint: {
            device_id: jar.meta.academic.webvpnDeviceId,
            device: { type: "browser" }
          }
        }
      })
    });
    assertWebvpnOk(report, "WebVPN 浏览器环境上报失败");
  }

  const authCheckUrl = addWebvpnClientParams(new URL("/passport/v1/auth/authCheck", WEBVPN_ORIGIN));
  callback.searchParams.forEach((value, key) => authCheckUrl.searchParams.set(key, value));
  const authCheck = await requestWebvpnJson(jar, authCheckUrl.href, {
    referer: callbackUrl,
    headers: { "x-csrf-token": csrfToken }
  });
  if (authCheck?.code !== 0 && /concurrency login/i.test(webvpnMessage(authCheck, ""))) {
    // 学校网关在前一个登录刚完成时仍可能短暂返回并发登录；先复用已建立的会话。
    await new Promise((resolve) => setTimeout(resolve, 400));
    try {
      const recoveredAppList = await requestWebvpnJson(jar, webvpnClientUrl("/controller/v1/user/appList"), {
        referer: `${WEBVPN_ORIGIN}/portal/`,
        headers: { "x-csrf-token": csrfToken }
      });
      if (recoveredAppList?.code === 0) {
        jar.meta.academic ||= {};
        jar.meta.academic.webvpnCapturedAt = new Date().toISOString();
        logger.warn("webvpn_concurrency_login_recovered", { userId: currentUserId() });
        return;
      }
    } catch (error) {
      logger.warn("webvpn_concurrency_login_recovery_failed", { userId: currentUserId(), error });
    }
  }
  assertWebvpnOk(authCheck, "WebVPN 认证确认失败");

  const appList = await requestWebvpnJson(jar, webvpnClientUrl("/controller/v1/user/appList"), {
    referer: `${WEBVPN_ORIGIN}/portal/`,
    headers: { "x-csrf-token": csrfToken }
  });
  assertWebvpnOk(appList, "WebVPN 应用列表校验失败");

  jar.meta.academic ||= {};
  jar.meta.academic.webvpnCapturedAt = new Date().toISOString();
}

async function ensureWebvpnSession(jar, credentials = {}) {
  if (userContextStorage.getStore()?.academicSessionLockHeld) {
    return ensureWebvpnSessionUnlocked(jar, credentials);
  }
  return withAcademicSessionLock(async () => {
    const latestJar = await readSessionJar();
    Object.assign(jar, mergeSessionJars(latestJar, jar));
    const result = await ensureWebvpnSessionUnlocked(jar, credentials);
    await saveSessionJar(jar);
    return result;
  });
}

function academicTimetableSource(key) {
  return ACADEMIC_TIMETABLE_SOURCES[key] || ACADEMIC_TIMETABLE_SOURCES.current;
}

function academicTimetableSourceFromSearch(searchParams) {
  return academicTimetableSource(searchParams.get("source"));
}

async function ensureAcademicWebvpnAccess(jar, source = ACADEMIC_TIMETABLE_SOURCES.current) {
  const page = await requestAcademicHtml(jar, source.pageUrl);
  const verifyUrl = extractWebvpnVerifyUrl(page.html, page.finalUrl);
  if (!verifyUrl) return page;
  await requestAcademicHtmlWithSimpleRedirects(jar, verifyUrl, { referer: page.finalUrl });
  return page;
}

async function loginAcademicCasSession(jar, { username, password, rememberMe = true } = {}) {
  await loginCasService({ jar, username, password, rememberMe, serviceUrl: JWXS_LOGIN_URL });
  await requestAcademicHtmlWithSimpleRedirects(jar, `${JWXS_ORIGIN}/sigin`, { referer: JWXS_LOGIN_URL }).catch(() => null);
  jar.meta.cas ||= {};
  jar.meta.cas.lastError = null;
  jar.meta.academicCapturedAt = new Date().toISOString();
}

async function activateAcademicSessionUnlocked(jar, { username, password, rememberMe = true } = {}) {
  await ensureWebvpnSession(jar, { username, password, rememberMe });
  await ensureAcademicWebvpnAccess(jar);
  await loginAcademicCasSession(jar, { username, password, rememberMe });
  jar.meta.academic ||= {};
  jar.meta.academic.lastError = null;
}

async function activateAcademicSession(jar, credentials = {}) {
  return withAcademicSessionLock(async () => {
    const latestJar = await readSessionJar();
    Object.assign(jar, mergeSessionJars(latestJar, jar));
    const result = await activateAcademicSessionUnlocked(jar, credentials);
    await saveSessionJar(jar);
    return result;
  });
}

async function fetchAcademicTimetableHtml(source = ACADEMIC_TIMETABLE_SOURCES.current) {
  const jar = await readSessionJar();
  const hasAcademicCookie = Boolean(cookieHeaderFor(jar, source.pageUrl));
  const hasCasCookie = Boolean(cookieHeaderFor(jar, `${CAS_ORIGIN}/cas/login`));
  if (!hasAcademicCookie && !hasCasCookie) {
    throw new HttpError(401, "还没有连接学校账号，请先登录。");
  }

  let page = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    page = await requestAcademicHtmlWithSimpleRedirects(jar, source.pageUrl);
    if (looksLikeAcademicTimetableHtml(page.html)) break;

    const verifyUrl = extractWebvpnVerifyUrl(page.html, page.finalUrl);
    if (verifyUrl) {
      await ensureWebvpnSession(jar);
      await requestAcademicHtmlWithSimpleRedirects(jar, verifyUrl, { referer: page.finalUrl });
      continue;
    }

    if (looksLikeAcademicLoginHtml(page.html, page.finalUrl)) {
      await activateAcademicSession(jar);
      continue;
    }

    break;
  }

  if (looksLikeAcademicLoginHtml(page.html, page.finalUrl)) {
    throw new HttpError(401, "教务系统会话已过期，请重新登录学校账号。");
  }
  if (extractWebvpnVerifyUrl(page.html, page.finalUrl)) {
    throw new HttpError(502, "教务系统 WebVPN 校验未完成，请稍后重试或重新登录。");
  }
  if (!looksLikeAcademicTimetableHtml(page.html)) {
    throw new HttpError(502, `教务系统返回的${source.label}页面结构不符合预期。`, {
      finalUrl: page.finalUrl,
      sample: normalizeHtmlText(page.html).slice(0, 240)
    });
  }

  jar.meta.academic ||= {};
  jar.meta.academic.lastError = null;
  await saveSessionJar(jar);
  return page;
}

async function requestAcademicJsonOnce(jar, targetUrl, { referer = JWXS_TIMETABLE_URL } = {}) {
  const response = await fetchWithJar(targetUrl, {
    jar,
    method: "GET",
    headers: {
      accept: "application/json,text/javascript,*/*;q=0.01",
      referer,
      "x-requested-with": "XMLHttpRequest"
    }
  });
  return { response, text: await readUpstreamText(response), finalUrl: targetUrl };
}

async function requestAcademicGpaPayloadOnce(jar) {
  const response = await fetchWithJar(JWXS_GPA_MORE_URL, {
    jar,
    method: "POST",
    headers: {
      accept: "application/json,text/javascript,*/*;q=0.01",
      origin: JWXS_ORIGIN,
      referer: JWXS_GPA_HOME_URL,
      "x-requested-with": "XMLHttpRequest"
    }
  });
  return { response, text: await readUpstreamText(response), finalUrl: JWXS_GPA_MORE_URL };
}

async function fetchAcademicGpaPayload() {
  await fetchAcademicTimetableHtml();
  const jar = await readSessionJar();

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const page = await requestAcademicGpaPayloadOnce(jar);
    const location = page.response.headers.get("location");
    if (page.response.status >= 300 && page.response.status < 400) {
      if (location) {
        const redirectUrl = assertAllowedSchoolUrl(new URL(location, JWXS_GPA_MORE_URL).href);
        if (looksLikeAcademicLoginHtml("", redirectUrl) || redirectUrl.includes("/cas/login")) {
          await activateAcademicSession(jar);
          continue;
        }
      }
      throw new HttpError(401, "教务 GPA 接口返回登录跳转，会话可能已过期。", { location });
    }

    const verifyUrl = extractWebvpnVerifyUrl(page.text, page.finalUrl);
    if (verifyUrl) {
      await ensureWebvpnSession(jar);
      await requestAcademicHtmlWithSimpleRedirects(jar, verifyUrl, { referer: page.finalUrl });
      continue;
    }

    if (looksLikeAcademicLoginHtml(page.text, page.finalUrl)) {
      await activateAcademicSession(jar);
      continue;
    }

    if (page.response.status >= 400) {
      throw new HttpError(page.response.status, `教务 GPA 接口返回 HTTP ${page.response.status}`, {
        sample: normalizeHtmlText(page.text).slice(0, 240)
      });
    }

    try {
      const payload = parseJsonLike(page.text);
      jar.meta.academic ||= {};
      jar.meta.academic.lastError = null;
      await saveSessionJar(jar);
      return { payload, finalUrl: page.finalUrl };
    } catch {
      throw new HttpError(502, "教务 GPA 接口返回的 JSON 结构不符合预期。", {
        sample: normalizeHtmlText(page.text).slice(0, 240)
      });
    }
  }

  throw new HttpError(502, "教务 GPA 接口多次同步仍未完成 WebVPN 校验。");
}

async function fetchAcademicCurriculumPayload(source = ACADEMIC_TIMETABLE_SOURCES.current) {
  const jar = await readSessionJar();
  const hasAcademicCookie = Boolean(cookieHeaderFor(jar, source.payloadUrl));
  const hasCasCookie = Boolean(cookieHeaderFor(jar, `${CAS_ORIGIN}/cas/login`));
  if (!hasAcademicCookie && !hasCasCookie) {
    throw new HttpError(401, "还没有连接学校账号，请先登录。");
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const page = await requestAcademicJsonOnce(jar, source.payloadUrl, { referer: source.pageUrl });
    const location = page.response.headers.get("location");
    if (page.response.status >= 300 && page.response.status < 400) {
      if (location) {
        const redirectUrl = assertAllowedSchoolUrl(new URL(location, source.payloadUrl).href);
        if (looksLikeAcademicLoginHtml("", redirectUrl) || redirectUrl.includes("/cas/login")) {
          await activateAcademicSession(jar);
          continue;
        }
      }
      throw new HttpError(401, "教务系统返回登录跳转，会话可能已过期。", { location });
    }

    const verifyUrl = extractWebvpnVerifyUrl(page.text, page.finalUrl);
    if (verifyUrl) {
      await ensureWebvpnSession(jar);
      await requestAcademicHtmlWithSimpleRedirects(jar, verifyUrl, { referer: page.finalUrl });
      continue;
    }

    if (looksLikeAcademicLoginHtml(page.text, page.finalUrl)) {
      await activateAcademicSession(jar);
      continue;
    }

    if (page.response.status >= 400) {
      throw new HttpError(page.response.status, `教务课程接口返回 HTTP ${page.response.status}`, {
        sample: normalizeHtmlText(page.text).slice(0, 240)
      });
    }

    try {
      const payload = parseJsonLike(page.text);
      jar.meta.academic ||= {};
      jar.meta.academic.lastError = null;
      await saveSessionJar(jar);
      return { payload, finalUrl: page.finalUrl };
    } catch {
      throw new HttpError(502, "教务课程接口返回的 JSON 结构不符合预期。", {
        sample: normalizeHtmlText(page.text).slice(0, 240)
      });
    }
  }

  throw new HttpError(502, "教务课程接口多次同步仍未完成 WebVPN 校验。");
}

async function requestAcademicHtml(jar, targetUrl, { referer = JWXS_ORIGIN } = {}) {
  const { response, url: finalUrl } = await followRedirectsWithJar(targetUrl, jar, {
    method: "GET",
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      referer
    }
  });
  const html = await readUpstreamText(response);
  if (response.status >= 400) {
    throw new HttpError(response.status, `教务系统返回 HTTP ${response.status}`, {
      finalUrl,
      sample: normalizeHtmlText(html).slice(0, 240)
    });
  }
  return { html, finalUrl };
}

function looksLikeAcademicEvaluationIndex(html) {
  const sample = String(html || "").slice(0, 240000);
  return /teachingAssessment\/evaluation\/queryAll|教学评估/.test(sample);
}

function looksLikeAcademicEvaluationForm(html) {
  const sample = String(html || "").slice(0, 300000);
  return /id=["']saveEvaluation["']|name=["']tokenValue["']/.test(sample);
}

async function ensureAcademicEvaluationHtml(jar, targetUrl, { form = false } = {}) {
  const hasAcademicCookie = Boolean(cookieHeaderFor(jar, targetUrl));
  const hasCasCookie = Boolean(cookieHeaderFor(jar, `${CAS_ORIGIN}/cas/login`));
  if (!hasAcademicCookie && !hasCasCookie) {
    throw new HttpError(401, "还没有连接学校账号，请先登录。");
  }

  let page = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    page = await requestAcademicHtmlWithSimpleRedirects(jar, targetUrl, { referer: JWXS_EVALUATION_INDEX_URL });
    const valid = form ? looksLikeAcademicEvaluationForm(page.html) : looksLikeAcademicEvaluationIndex(page.html);
    if (valid) break;

    const verifyUrl = extractWebvpnVerifyUrl(page.html, page.finalUrl);
    if (verifyUrl) {
      await ensureWebvpnSession(jar);
      await requestAcademicHtmlWithSimpleRedirects(jar, verifyUrl, { referer: page.finalUrl });
      continue;
    }
    if (looksLikeAcademicLoginHtml(page.html, page.finalUrl)) {
      await activateAcademicSession(jar);
      continue;
    }
    break;
  }

  if (!page || looksLikeAcademicLoginHtml(page.html, page.finalUrl)) {
    throw new HttpError(401, "教务系统会话已过期，请重新登录学校账号。");
  }
  if (extractWebvpnVerifyUrl(page.html, page.finalUrl)) {
    throw new HttpError(502, "教务系统 WebVPN 校验未完成，请稍后重试。");
  }
  const valid = form ? looksLikeAcademicEvaluationForm(page.html) : looksLikeAcademicEvaluationIndex(page.html);
  if (!valid) {
    throw new HttpError(502, form ? "教务系统没有返回可填写的教学评估问卷。" : "教务系统返回的教学评估页面结构不符合预期。", {
      finalUrl: page.finalUrl,
      sample: normalizeHtmlText(page.html).slice(0, 260)
    });
  }
  return page;
}

async function requestAcademicEvaluationJson(jar, targetUrl, {
  method = "POST",
  body,
  referer = JWXS_EVALUATION_INDEX_URL
} = {}) {
  const response = await fetchWithJar(targetUrl, {
    jar,
    method,
    headers: {
      accept: "application/json,text/javascript,*/*;q=0.01",
      origin: JWXS_ORIGIN,
      referer,
      "x-requested-with": "XMLHttpRequest",
      ...(body instanceof URLSearchParams ? { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" } : {})
    },
    body: body instanceof URLSearchParams ? body.toString() : body
  });
  const text = await readUpstreamText(response);
  const location = response.headers.get("location");
  if (response.status >= 300 && response.status < 400) {
    throw new HttpError(401, "教务教学评估接口返回登录跳转，会话可能已过期。", { location });
  }
  if (looksLikeAcademicLoginHtml(text, targetUrl)) {
    throw new HttpError(401, "教务系统会话已过期，请重新登录学校账号。");
  }
  if (response.status >= 400) {
    throw new HttpError(response.status, `教务教学评估接口返回 HTTP ${response.status}`, {
      sample: normalizeHtmlText(text).slice(0, 260)
    });
  }
  try {
    return parseJsonLike(text);
  } catch {
    throw new HttpError(502, "教务教学评估接口返回的 JSON 结构不符合预期。", {
      sample: normalizeHtmlText(text).slice(0, 260)
    });
  }
}

function normalizeAcademicEvaluationRecord(record = {}) {
  const completed = String(record.SFPG ?? record.sfpg ?? "0") === "1";
  return {
    id: normalizeHtmlText(record.KTID ?? record.ktid),
    resultId: normalizeHtmlText(record.PGID ?? record.pgid),
    questionnaire: normalizeHtmlText(record.WJMC ?? record.wjmc),
    teacher: normalizeHtmlText(record.JSM ?? record.LSRXM ?? record.jsm ?? record.lsrxm),
    course: normalizeHtmlText(record.KCM ?? record.kcm),
    courseCode: normalizeHtmlText(record.KCH ?? record.kch),
    courseSequence: normalizeHtmlText(record.KXH ?? record.kxh),
    completed,
    evaluationType: normalizeHtmlText(record.PGLXDM ?? record.pglxdm),
    allowsMultiple: String(record.YXDCPG ?? record.yxdcpg ?? "0") === "1",
    courseEndedAt: normalizeHtmlText(record.JKRQ ?? record.jkrq),
    evaluationDays: Number(record.JKPGTS ?? record.jkpgts ?? 0) || 0
  };
}

async function getAcademicEvaluations() {
  const jar = await readSessionJar();
  await ensureAcademicEvaluationHtml(jar, JWXS_EVALUATION_INDEX_URL);
  const params = new URLSearchParams({ pageNum: "1", pageSize: "500", flag: "ktjs" });
  let payload;
  try {
    payload = await requestAcademicEvaluationJson(jar, JWXS_EVALUATION_LIST_URL, { body: params });
  } catch (error) {
    if (error.status !== 401) throw error;
    await activateAcademicSession(jar);
    await ensureAcademicEvaluationHtml(jar, JWXS_EVALUATION_INDEX_URL);
    payload = await requestAcademicEvaluationJson(jar, JWXS_EVALUATION_LIST_URL, { body: params });
  }
  const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  const rawRecords = Array.isArray(data?.records) ? data.records : [];
  const records = rawRecords.map(normalizeAcademicEvaluationRecord).filter((record) => record.id);
  const completedCount = records.filter((record) => record.completed).length;
  jar.meta.academic ||= {};
  jar.meta.academic.lastError = null;
  await saveSessionJar(jar);
  return {
    generatedAt: new Date().toISOString(),
    totalCount: Number(data?.pageContext?.totalCount ?? records.length) || records.length,
    pendingCount: records.length - completedCount,
    completedCount,
    records
  };
}

function academicEvaluationQuestionPrompt(control) {
  const row = control.closest("tr");
  const promptRow = row.prevAll("tr").first();
  return normalizeHtmlText(promptRow.text()).replace(/^\d+[、.]\s*/, "");
}

function parseAcademicEvaluationForm(html, ktid) {
  const $ = cheerio.load(html);
  const form = $("#saveEvaluation");
  if (!form.length) throw new HttpError(502, "教学评估问卷缺少保存表单。");

  const hidden = {};
  form.find('input[type="hidden"]').each((_, element) => {
    const input = $(element);
    const name = input.attr("name");
    if (name) hidden[name] = input.val() || "";
  });
  if (!hidden.tokenValue || !hidden.wjbm || !hidden.ktid) {
    throw new HttpError(502, "教学评估问卷缺少提交令牌或问卷编号。");
  }
  if (String(hidden.ktid) !== String(ktid)) {
    throw new HttpError(409, "教学评估问卷与所选课程不匹配，请刷新后重试。");
  }

  const questions = [];
  const seen = new Set();
  form.find(".value_element").each((_, element) => {
    const control = $(element);
    const name = normalizeHtmlText(control.attr("name"));
    if (!name || seen.has(name)) return;
    seen.add(name);
    const tag = String(element.tagName || "").toLowerCase();
    const inputType = normalizeHtmlText(control.attr("type")).toLowerCase();
    const isScore = control.attr("data-name") === "szt";
    let type = "text";
    if (isScore) type = "score";
    else if (tag === "textarea") type = "subjective";
    else if (inputType === "radio") type = "radio";
    else if (inputType === "checkbox") type = "checkbox";
    const options = [];
    if (type === "radio" || type === "checkbox") {
      form.find(`[name="${name}"]`).each((__, optionElement) => {
        const option = $(optionElement);
        options.push({ value: normalizeHtmlText(option.val()), label: normalizeHtmlText(option.parent().text()) });
      });
    }
    questions.push({
      id: name,
      prompt: academicEvaluationQuestionPrompt(control),
      type,
      max: type === "score" ? (Number(control.attr("jgf")) || 10) : null,
      required: !name.endsWith("_sfxytxxxsm"),
      options
    });
  });
  if (!questions.length) throw new HttpError(502, "教学评估问卷没有可识别的题目。");
  return {
    hidden,
    questions,
    questionnaire: normalizeHtmlText($("h4").first().text()).replace(/\s*基本信息[\s\S]*$/, "")
  };
}

function purgeAcademicEvaluationDrafts() {
  const now = Date.now();
  for (const [id, draft] of academicEvaluationDrafts.entries()) {
    if (draft.expiresAt <= now) academicEvaluationDrafts.delete(id);
  }
}

async function getAcademicEvaluationDraft(ktid) {
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(String(ktid || ""))) {
    throw new HttpError(400, "教学评估课程编号不正确。");
  }
  purgeAcademicEvaluationDrafts();
  const evaluationList = await getAcademicEvaluations();
  const evaluation = evaluationList.records.find((record) => record.id === String(ktid));
  if (!evaluation) throw new HttpError(404, "没有找到这门课程的教学评估任务。");
  if (evaluation.completed) throw new HttpError(409, "这门课程已经完成教学评估，不能重复填写。");
  const jar = await readSessionJar();
  const targetUrl = `${JWXS_ORIGIN}/student/teachingEvaluation/newEvaluation/evaluation/${encodeURIComponent(ktid)}`;
  const page = await ensureAcademicEvaluationHtml(jar, targetUrl, { form: true });
  const parsed = parseAcademicEvaluationForm(page.html, ktid);
  const now = Date.now();
  const userDrafts = [...academicEvaluationDrafts.values()]
    .filter((draft) => draft.userId === currentUserId())
    .sort((a, b) => a.createdAt - b.createdAt);
  while (userDrafts.length >= ACADEMIC_EVALUATION_MAX_DRAFTS_PER_USER) {
    academicEvaluationDrafts.delete(userDrafts.shift().id);
  }
  while (academicEvaluationDrafts.size >= ACADEMIC_EVALUATION_MAX_DRAFTS) {
    const oldestId = academicEvaluationDrafts.keys().next().value;
    if (!oldestId) break;
    academicEvaluationDrafts.delete(oldestId);
  }
  const draftId = randomUUID();
  const draft = {
    id: draftId,
    userId: currentUserId(),
    ktid: String(ktid),
    referer: targetUrl,
    allowsMultiple: Boolean(evaluation.allowsMultiple),
    hidden: parsed.hidden,
    questions: parsed.questions,
    tjcs: Number(parsed.hidden.tjcs) || 1,
    createdAt: now,
    availableAt: now + ACADEMIC_EVALUATION_WAIT_MS,
    expiresAt: now + ACADEMIC_EVALUATION_DRAFT_TTL_MS
  };
  academicEvaluationDrafts.set(draftId, draft);
  await saveSessionJar(jar);
  return {
    draftId,
    ktid: draft.ktid,
    questionnaire: parsed.questionnaire,
    questions: parsed.questions,
    availableAt: new Date(draft.availableAt).toISOString(),
    expiresAt: new Date(draft.expiresAt).toISOString(),
    officialWaitSeconds: Math.ceil(ACADEMIC_EVALUATION_WAIT_MS / 1000)
  };
}

function normalizedAcademicEvaluationAnswers(draft, input = {}) {
  const answers = {};
  for (const question of draft.questions) {
    const raw = input[question.id];
    if (question.type === "score") {
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 1 || value > question.max) {
        throw new HttpError(400, `“${question.prompt || "评分题"}”请输入 1-${question.max} 的整数。`);
      }
      answers[question.id] = String(value);
      continue;
    }
    if (question.type === "checkbox") {
      const values = Array.isArray(raw) ? raw.map((value) => String(value)) : [];
      const allowed = new Set(question.options.map((option) => option.value));
      if (question.required && !values.length) throw new HttpError(400, `请完成“${question.prompt || "多选题"}”。`);
      if (values.some((value) => !allowed.has(value))) throw new HttpError(400, "教学评估答案选项不正确。");
      answers[question.id] = values;
      continue;
    }
    if (question.type === "radio") {
      const value = String(raw ?? "");
      const allowed = new Set(question.options.map((option) => option.value));
      if (question.required && !value) throw new HttpError(400, `请完成“${question.prompt || "单选题"}”。`);
      if (value && !allowed.has(value)) throw new HttpError(400, "教学评估答案选项不正确。");
      answers[question.id] = value;
      continue;
    }
    const value = normalizeHtmlText(raw);
    if (question.required && !value) throw new HttpError(400, `请填写“${question.prompt || "主观评价"}”。`);
    if (value.length > 1000) throw new HttpError(400, "主观评价不能超过 1000 个字符。");
    answers[question.id] = value;
  }
  return answers;
}

async function checkAcademicEvaluationAlreadySubmitted(jar, ktid, referer = JWXS_EVALUATION_INDEX_URL) {
  const targetUrl = `${JWXS_ORIGIN}/student/teachingAssessment/baseInformation/questionsAdd/checkIsTeachEvaluationed?ktid=${encodeURIComponent(ktid)}`;
  const payload = await requestAcademicEvaluationJson(jar, targetUrl, {
    method: "GET",
    referer
  });
  const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  const result = String(data?.result ?? "").toLowerCase();
  return {
    submitted: result === "yes" || result === "true" || result === "1",
    message: normalizeHtmlText(data?.msg || data?.msg2 || payload?.msg || payload?.msg2 || "")
  };
}

async function submitAcademicEvaluation({ draftId, answers: inputAnswers }) {
  purgeAcademicEvaluationDrafts();
  const draft = academicEvaluationDrafts.get(String(draftId || ""));
  if (!draft || draft.userId !== currentUserId()) {
    throw new HttpError(410, "教学评估草稿已失效，请重新打开问卷。");
  }
  const waitMs = draft.availableAt - Date.now();
  if (waitMs > 0) {
    throw new HttpError(429, `请按教务系统要求再等待 ${Math.ceil(waitMs / 1000)} 秒后提交。`, {
      waitSeconds: Math.ceil(waitMs / 1000),
      availableAt: new Date(draft.availableAt).toISOString()
    });
  }
  if (draft.submitting) throw new HttpError(409, "该教学评估正在提交，请勿重复操作。");
  draft.submitting = true;
  try {
  const answers = normalizedAcademicEvaluationAnswers(draft, inputAnswers || {});
  const form = new FormData();
  draft.tjcs += 1;
  form.set("tjcs", String(draft.tjcs));
  form.set("wjbm", String(draft.hidden.wjbm));
  form.set("ktid", String(draft.ktid));
  form.set("tokenValue", String(draft.hidden.tokenValue));
  form.set("compare", String(draft.hidden.compare || ""));
  for (const [name, value] of Object.entries(answers)) {
    if (Array.isArray(value)) value.forEach((item) => form.append(name, item));
    else form.set(name, value);
  }

  const jar = await readSessionJar();
  if (!draft.allowsMultiple) {
    const duplicate = await checkAcademicEvaluationAlreadySubmitted(jar, draft.ktid, draft.referer);
    if (duplicate.submitted) {
      throw new HttpError(409, duplicate.message || "这门课程已经完成教学评估，不能重复提交。");
    }
  }
  const targetUrl = `${JWXS_EVALUATION_SAVE_URL}?tokenValue=${encodeURIComponent(draft.hidden.tokenValue)}`;
  const payload = await requestAcademicEvaluationJson(jar, targetUrl, {
    body: form,
    referer: draft.referer
  });
  if (payload?.token) draft.hidden.tokenValue = String(payload.token);
  const result = String(payload?.result ?? "");
  const message = normalizeHtmlText(payload?.msg2 || payload?.msg || "");
  if (result === "ok" && !message) {
    academicEvaluationDrafts.delete(draft.id);
    await saveSessionJar(jar);
    return { submitted: true, message: "教学评估已提交成功。" };
  }
  if (result.includes("/")) {
    academicEvaluationDrafts.delete(draft.id);
    await saveSessionJar(jar);
    return { submitted: true, message: message || "教学评估已提交。" };
  }
  if (result === "ok" && message) {
    const waitSeconds = 45 * draft.tjcs;
    draft.availableAt = Date.now() + waitSeconds * 1000;
    throw new HttpError(429, message, { waitSeconds, availableAt: new Date(draft.availableAt).toISOString() });
  }
  throw new HttpError(409, message || result || "教务系统未接受本次教学评估，请刷新后重试。");
  } finally {
    if (academicEvaluationDrafts.has(draft.id)) draft.submitting = false;
  }
}

function activeAcademicEvaluationAutoStatus(status) {
  return ["queued", "running", "canceling"].includes(status);
}

function activeAcademicEvaluationAutoJob(userId) {
  const job = academicEvaluationAutoJobs.get(userId);
  return job && activeAcademicEvaluationAutoStatus(job.status) ? job : null;
}

function normalizeAcademicEvaluationAutoText(value) {
  const text = normalizeHtmlText(value || ACADEMIC_EVALUATION_AUTO_SUBJECTIVE_TEXT);
  return text.slice(0, 1000) || ACADEMIC_EVALUATION_AUTO_SUBJECTIVE_TEXT;
}

function academicEvaluationDefaultAnswers(questions = [], subjectiveText = ACADEMIC_EVALUATION_AUTO_SUBJECTIVE_TEXT) {
  const answers = {};
  const text = normalizeAcademicEvaluationAutoText(subjectiveText);
  for (const question of questions) {
    if (question.type === "score") {
      answers[question.id] = String(Number(question.max) || 10);
      continue;
    }
    if (question.type === "subjective" || question.type === "text") {
      answers[question.id] = text;
      continue;
    }
    if (question.type === "radio") {
      answers[question.id] = question.options?.[0]?.value || "";
      continue;
    }
    if (question.type === "checkbox") {
      answers[question.id] = question.required && question.options?.[0]?.value ? [question.options[0].value] : [];
      continue;
    }
    answers[question.id] = text;
  }
  return answers;
}

function academicEvaluationAutoJobSnapshot(job) {
  if (!job) return { status: "idle", entries: [] };
  return {
    id: job.id,
    status: job.status,
    requestedAt: job.requestedAt,
    startedAt: job.startedAt || null,
    finishedAt: job.finishedAt || null,
    updatedAt: job.updatedAt,
    total: job.total,
    completed: job.completed,
    failed: job.failed,
    skipped: job.skipped,
    currentIndex: job.currentIndex,
    current: job.current,
    waitRemainingSeconds: job.waitRemainingSeconds,
    nextActionAt: job.nextActionAt || null,
    finalPendingCount: job.finalPendingCount,
    error: job.error || null,
    entries: job.entries.map((entry) => ({
      id: entry.id,
      course: entry.course,
      teacher: entry.teacher,
      courseCode: entry.courseCode,
      courseSequence: entry.courseSequence,
      status: entry.status,
      message: entry.message || "",
      startedAt: entry.startedAt || null,
      finishedAt: entry.finishedAt || null,
      availableAt: entry.availableAt || null,
      scoreQuestionCount: entry.scoreQuestionCount || 0,
      fullScoreCount: entry.fullScoreCount || 0
    }))
  };
}

function touchAcademicEvaluationAutoJob(job) {
  job.updatedAt = nowIso();
}

function academicEvaluationAutoStatus() {
  return academicEvaluationAutoJobSnapshot(academicEvaluationAutoJobs.get(currentUserId()));
}

function academicEvaluationAutoEntry(record, index) {
  return {
    id: record.id,
    course: record.course || "未命名课程",
    teacher: record.teacher || "",
    courseCode: record.courseCode || "",
    courseSequence: record.courseSequence || "",
    index,
    status: "queued",
    message: "等待处理"
  };
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function waitForAcademicEvaluationAutoJob(job, availableAt) {
  const targetMs = Date.parse(availableAt || "");
  if (!Number.isFinite(targetMs)) return true;
  job.nextActionAt = new Date(targetMs).toISOString();
  while (Date.now() < targetMs) {
    if (job.cancelRequested) return false;
    job.waitRemainingSeconds = Math.max(0, Math.ceil((targetMs - Date.now()) / 1000));
    touchAcademicEvaluationAutoJob(job);
    await sleep(Math.min(1000, Math.max(0, targetMs - Date.now())));
  }
  job.waitRemainingSeconds = 0;
  job.nextActionAt = null;
  touchAcademicEvaluationAutoJob(job);
  return !job.cancelRequested;
}

function isDuplicateAcademicEvaluationError(error) {
  return error?.status === 409 && /已经|重复|已评/.test(String(error.message || ""));
}

async function finalizeAcademicEvaluationAutoJob(job) {
  try {
    const latest = await withAcademicSessionLock(() => getAcademicEvaluations());
    job.finalPendingCount = latest.pendingCount;
  } catch (error) {
    logger.warn("academic_evaluation_auto_final_refresh_failed", { userId: job.userId, jobId: job.id, error });
  }
}

async function runAcademicEvaluationAutoJob(job) {
  job.status = "running";
  job.startedAt = nowIso();
  touchAcademicEvaluationAutoJob(job);

  const list = await withAcademicSessionLock(() => getAcademicEvaluations());
  const pending = (Array.isArray(list.records) ? list.records : []).filter((record) => !record.completed);
  job.total = pending.length;
  job.entries = pending.map(academicEvaluationAutoEntry);
  touchAcademicEvaluationAutoJob(job);

  if (!pending.length) {
    job.status = "completed";
    job.finishedAt = nowIso();
    job.message = "没有待评课程。";
    job.finalPendingCount = 0;
    touchAcademicEvaluationAutoJob(job);
    return;
  }

  for (let index = 0; index < job.entries.length; index += 1) {
    const entry = job.entries[index];
    if (job.cancelRequested) {
      entry.status = "canceled";
      entry.message = "任务已停止。";
      break;
    }

    job.currentIndex = index + 1;
    job.current = { id: entry.id, course: entry.course, teacher: entry.teacher };
    job.waitRemainingSeconds = 0;
    entry.startedAt = nowIso();
    entry.status = "opening";
    entry.message = "正在加载问卷";
    touchAcademicEvaluationAutoJob(job);

    try {
      const draft = await withAcademicSessionLock(() => getAcademicEvaluationDraft(entry.id));
      const answers = academicEvaluationDefaultAnswers(draft.questions, job.subjectiveText);
      const scoreQuestions = draft.questions.filter((question) => question.type === "score");
      entry.scoreQuestionCount = scoreQuestions.length;
      entry.fullScoreCount = scoreQuestions.length;
      entry.availableAt = draft.availableAt;
      entry.status = "waiting";
      entry.message = `等待学校要求的 ${draft.officialWaitSeconds || Math.ceil(ACADEMIC_EVALUATION_WAIT_MS / 1000)} 秒`;
      touchAcademicEvaluationAutoJob(job);

      const shouldContinue = await waitForAcademicEvaluationAutoJob(job, draft.availableAt);
      if (!shouldContinue) {
        entry.status = "canceled";
        entry.message = "任务已停止。";
        break;
      }

      entry.status = "submitting";
      entry.message = "正在提交";
      touchAcademicEvaluationAutoJob(job);
      const result = await withAcademicSessionLock(() => submitAcademicEvaluation({
        draftId: draft.draftId,
        answers
      }));
      entry.status = "submitted";
      entry.message = result.message || "已提交";
      job.completed += 1;
    } catch (error) {
      if (job.cancelRequested) {
        entry.status = "canceled";
        entry.message = "任务已停止。";
        break;
      }
      if (isDuplicateAcademicEvaluationError(error)) {
        entry.status = "skipped";
        entry.message = error.message || "课程已完成评估，已跳过。";
        job.skipped += 1;
      } else {
        entry.status = "failed";
        entry.message = error.message || "提交失败";
        job.failed += 1;
        logger.warn("academic_evaluation_auto_course_failed", {
          userId: job.userId,
          jobId: job.id,
          courseId: entry.id,
          error
        });
        if (error.status === 401) {
          job.error = entry.message;
          job.status = "failed";
          break;
        }
      }
    } finally {
      entry.finishedAt = entry.finishedAt || nowIso();
      touchAcademicEvaluationAutoJob(job);
    }
  }

  job.current = null;
  job.currentIndex = Math.min(job.currentIndex, job.total);
  job.waitRemainingSeconds = 0;
  job.nextActionAt = null;
  await finalizeAcademicEvaluationAutoJob(job);

  if (job.cancelRequested) {
    job.status = "canceled";
  } else if (job.status !== "failed") {
    job.status = job.failed ? "completed_with_errors" : "completed";
  }
  job.finishedAt = nowIso();
  touchAcademicEvaluationAutoJob(job);
}

function scheduleAcademicEvaluationAutoJob(job, user) {
  setImmediate(() => {
    const task = userContextStorage.run({ requestId: `evaluation-auto-${job.id}`, user }, () => runAcademicEvaluationAutoJob(job));
    Promise.resolve(task).catch((error) => {
      job.status = job.cancelRequested ? "canceled" : "failed";
      job.error = error.message || "自动完成评估失败。";
      job.finishedAt = nowIso();
      touchAcademicEvaluationAutoJob(job);
      logger.warn("academic_evaluation_auto_failed", { userId: job.userId, jobId: job.id, error });
    });
  });
}

function startAcademicEvaluationAutoJob(input = {}) {
  const user = currentUser();
  const existing = activeAcademicEvaluationAutoJob(user.id);
  if (existing) throw new HttpError(409, "自动完成评估任务正在运行，请等待完成或先停止。");

  const now = nowIso();
  const job = {
    id: randomUUID(),
    userId: user.id,
    status: "queued",
    requestedAt: now,
    startedAt: null,
    finishedAt: null,
    updatedAt: now,
    total: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
    currentIndex: 0,
    current: null,
    finalPendingCount: null,
    waitRemainingSeconds: 0,
    nextActionAt: null,
    entries: [],
    cancelRequested: false,
    error: null,
    subjectiveText: normalizeAcademicEvaluationAutoText(input.subjectiveText)
  };
  academicEvaluationAutoJobs.set(user.id, job);
  scheduleAcademicEvaluationAutoJob(job, user);
  return academicEvaluationAutoJobSnapshot(job);
}

function stopAcademicEvaluationAutoJob() {
  const job = academicEvaluationAutoJobs.get(currentUserId());
  if (!job || !activeAcademicEvaluationAutoStatus(job.status)) return academicEvaluationAutoJobSnapshot(job);
  job.cancelRequested = true;
  job.status = "canceling";
  job.waitRemainingSeconds = 0;
  touchAcademicEvaluationAutoJob(job);
  return academicEvaluationAutoJobSnapshot(job);
}

function academicGpaRow(type, rawValue) {
  const label = normalizeHtmlText(type);
  const value = normalizeHtmlText(rawValue);
  const numberMatch = value.match(/\d+(?:\.\d+)?/);
  return {
    type: label,
    value,
    numericValue: numberMatch ? Number(numberMatch[0]) : null
  };
}

function appendAcademicGpaRow(rows, seen, type, value) {
  const row = academicGpaRow(type, value);
  if (!row.type || !/GPA/i.test(row.type) || row.type === "GPA类型") return;
  if (seen.has(row.type)) return;
  seen.add(row.type);
  rows.push(row);
}

function finalizeAcademicGpaRows(rows, finalUrl) {
  rows.sort((a, b) => {
    const ai = ACADEMIC_GPA_LABELS.indexOf(a.type);
    const bi = ACADEMIC_GPA_LABELS.indexOf(b.type);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const byType = Object.fromEntries(rows.map((row) => [row.type, row]));
  const main = byType.GPA || rows.find((row) => row.value) || null;
  return {
    source: finalUrl,
    generatedAt: new Date().toISOString(),
    main,
    rows,
    byType,
    stats: {
      total: rows.length,
      available: rows.filter((row) => row.value).length
    }
  };
}

function parseAcademicGpaPayload(payload, finalUrl) {
  const rows = [];
  const seen = new Set();
  const visit = (value) => {
    if (Array.isArray(value)) {
      if (value.length >= 2 && !Array.isArray(value[0]) && value[0] !== null && typeof value[0] !== "object" && /GPA/i.test(String(value[0] || ""))) {
        const row = academicGpaRow(value[0], value[1]);
        const rank = normalizeHtmlText(value[2]);
        const calculatedAt = normalizeHtmlText(value[3]);
        if (rank) row.rank = rank;
        if (calculatedAt) row.calculatedAt = calculatedAt;
        appendAcademicGpaRow(rows, seen, row.type, row.value);
        const stored = rows.find((item) => item.type === row.type);
        if (stored) {
          if (row.rank) stored.rank = row.rank;
          if (row.calculatedAt) stored.calculatedAt = row.calculatedAt;
        }
        return;
      }
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;

    const entries = Object.entries(value);
    const typeEntry = entries.find(([key, item]) => /GPA|gpa|类型|名称|name|type/i.test(key) && /GPA/i.test(String(item || "")));
    const valueEntry = entries.find(([key, item]) => /GPA值|gpaValue|value|score|绩点|jd/i.test(key) && String(item ?? "").trim() !== typeEntry?.[1]);
    if (typeEntry && valueEntry) {
      appendAcademicGpaRow(rows, seen, typeEntry[1], valueEntry[1]);
    }

    entries.forEach(([, item]) => visit(item));
  };
  visit(payload);
  return finalizeAcademicGpaRows(rows, finalUrl);
}

async function getAcademicGpa() {
  const { payload, finalUrl } = await fetchAcademicGpaPayload();
  const parsed = parseAcademicGpaPayload(payload, finalUrl);
  if (!parsed.rows.length) {
    throw new HttpError(502, "教务系统暂时没有返回 GPA 成绩表。");
  }
  return {
    ...parsed,
    live: true
  };
}

function expandHtmlTable($, table) {
  const carry = [];
  const rows = [];

  $(table).find("tr").each((_, tr) => {
    const row = [];
    let col = 0;
    const fillCarried = () => {
      while (carry[col]) {
        row[col] = carry[col].value;
        carry[col].left -= 1;
        if (carry[col].left <= 0) delete carry[col];
        col += 1;
      }
    };

    fillCarried();
    $(tr).children("th,td").each((__, cell) => {
      fillCarried();
      const value = normalizeHtmlText($(cell).text());
      const rowSpan = Math.max(1, Number($(cell).attr("rowspan")) || 1);
      const colSpan = Math.max(1, Number($(cell).attr("colspan")) || 1);
      for (let offset = 0; offset < colSpan; offset += 1) {
        row[col + offset] = value;
        if (rowSpan > 1) carry[col + offset] = { value, left: rowSpan - 1 };
      }
      col += colSpan;
    });
    fillCarried();
    rows.push(row);
  });

  return rows;
}

const DETAIL_COURSE_HEADERS = ["课程号", "课程名", "教师", "选课状态", "时间", "地点"];
const ARRANGED_COURSE_HEADERS = ["课程号", "课程名", "周次", "星期", "开始节次", "持续节次", "校区", "教学楼", "教室"];

function findCourseResultTableInfo($) {
  let detail = null;
  let arranged = null;

  $("table").each((_, table) => {
    const matrix = expandHtmlTable($, table);
    const limit = Math.min(matrix.length, 8);

    for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
      const headers = (matrix[rowIndex] || []).map(normalizeHtmlText);
      const nonEmptyHeaders = headers.filter(Boolean);
      const info = { table, matrix, headers, headerRowIndex: rowIndex };

      if (DETAIL_COURSE_HEADERS.every((header) => nonEmptyHeaders.includes(header))) {
        detail = { ...info, type: "detail" };
        return false;
      }
      if (!arranged && ARRANGED_COURSE_HEADERS.every((header) => nonEmptyHeaders.includes(header))) {
        arranged = { ...info, type: "arranged" };
      }
    }

    return undefined;
  });

  return detail || arranged;
}

function parseChineseSectionNumber(text) {
  const normalized = String(text || "").trim();
  if (/^\d+$/.test(normalized)) return Number(normalized);
  const digits = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (normalized === "十") return 10;
  if (normalized.startsWith("十")) return 10 + (digits[normalized.at(-1)] || 0);
  if (normalized.includes("十")) {
    const [left, right] = normalized.split("十");
    return (digits[left] || 0) * 10 + (digits[right] || 0);
  }
  return digits[normalized] || null;
}

function parseSectionTimes($) {
  const rows = new Map(DEFAULT_SECTION_TIMES.map((item) => [item.section, item]));
  $("#courseTable").find("th").each((_, cell) => {
    const text = normalizeHtmlText($(cell).text());
    const match = text.match(/第(.+?)小节\((\d{1,2}:\d{2})-(\d{1,2}:\d{2})\)/);
    if (!match) return;
    const section = parseChineseSectionNumber(match[1]);
    if (!section) return;
    rows.set(section, {
      section,
      label: `第${match[1]}小节`,
      start: match[2],
      end: match[3]
    });
  });
  return Array.from(rows.values()).sort((a, b) => a.section - b.section);
}

function parseSectionRange(text) {
  const match = String(text || "").match(/(\d+)\s*(?:[-~至—]\s*(\d+))?\s*节/);
  if (!match) return null;
  const startSection = Number(match[1]);
  const endSection = Number(match[2] || match[1]);
  if (!Number.isFinite(startSection) || !Number.isFinite(endSection)) return null;
  return {
    startSection: Math.min(startSection, endSection),
    endSection: Math.max(startSection, endSection)
  };
}

function expandWeekText(text) {
  const source = String(text || "");
  const normalized = source.replace(/第/g, "");
  let weeks = [];
  const range = normalized.match(/(\d+)\s*[-~至—]\s*(\d+)\s*周/);
  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    for (let week = Math.min(start, end); week <= Math.max(start, end); week += 1) weeks.push(week);
  } else {
    weeks = Array.from(normalized.matchAll(/(\d+)\s*周/g), (match) => Number(match[1]));
  }

  if (/单/.test(source)) weeks = weeks.filter((week) => week % 2 === 1);
  if (/双/.test(source)) weeks = weeks.filter((week) => week % 2 === 0);
  return [...new Set(weeks)].filter(Number.isFinite);
}

function parseCourseTime(text) {
  const parts = String(text || "").split(">>").map(normalizeHtmlText).filter(Boolean);
  const weekText = parts.find((part) => part.includes("周")) || "";
  const dayName = parts.find((part) => WEEKDAYS.includes(part)) || "";
  const sectionText = parts.find((part) => part.includes("节")) || "";
  const sectionRange = parseSectionRange(sectionText);
  const day = WEEKDAYS.indexOf(dayName) + 1;
  if (!day || !sectionRange) return null;

  return {
    weekText,
    weeks: expandWeekText(weekText),
    day,
    dayName,
    sectionText,
    ...sectionRange
  };
}

function parseCourseLocation(text) {
  const parts = String(text || "").split(">>").map(normalizeHtmlText).filter(Boolean);
  return {
    campus: parts[0] || "",
    building: parts[1] || "",
    room: parts.slice(2).join(" ") || "",
    display: parts.length ? parts.join(" ") : normalizeHtmlText(text)
  };
}

function sectionTimeRange(sectionTimes, startSection, endSection) {
  const bySection = new Map(sectionTimes.map((item) => [item.section, item]));
  const start = bySection.get(startSection)?.start || "";
  const end = bySection.get(endSection)?.end || "";
  return start && end ? `${start}-${end}` : "";
}

function stableTone(text) {
  let hash = 0;
  for (const char of String(text || "")) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 10;
}

function tableRowsAfterHeader(tableInfo) {
  return tableInfo.matrix
    .slice(tableInfo.headerRowIndex + 1)
    .filter((row) => row.some((cell) => normalizeHtmlText(cell)));
}

function recordFromHeaders(headers, row) {
  const record = {};
  headers.forEach((header, col) => {
    const key = normalizeHtmlText(header);
    if (key && record[key] === undefined) record[key] = normalizeHtmlText(row[col]);
  });
  return record;
}

function looksLikeCourseTimeText(value) {
  return /(?:星期[一二三四五六日天]|周|节)/.test(normalizeHtmlText(value));
}

function looksLikeLocationText(value) {
  return /(?:校区|教学楼|教[一二三四五六七八九十\d]|实验楼|图书馆|楼|室|馆|\d{3,})/.test(normalizeHtmlText(value));
}

function isDetailBaseRecord(record) {
  const code = normalizeHtmlText(record["课程号"]);
  const name = normalizeHtmlText(record["课程名"]);
  if (looksLikeCourseTimeText(code) || looksLikeCourseTimeText(name)) return false;
  if (code && /[A-Za-z0-9]/.test(code)) return true;
  return Boolean(name && !looksLikeLocationText(name));
}

function normalizeDetailRecord(row, record, lastBaseRecord) {
  if (isDetailBaseRecord(record)) {
    return { record, baseRecord: { ...record } };
  }
  if (!lastBaseRecord) return { record, baseRecord: lastBaseRecord };

  const cells = row.map(normalizeHtmlText).filter(Boolean);
  const directTime = record["时间"] || cells.find(looksLikeCourseTimeText) || "";
  const directLocation = record["地点"]
    || cells.find((cell) => cell !== directTime && !looksLikeCourseTimeText(cell))
    || "";

  return {
    record: {
      ...lastBaseRecord,
      时间: directTime || lastBaseRecord["时间"] || "",
      地点: directLocation || lastBaseRecord["地点"] || ""
    },
    baseRecord: lastBaseRecord
  };
}

function weekdayFromValue(value) {
  const text = normalizeHtmlText(value).replace(/^周/, "星期");
  const directIndex = WEEKDAYS.indexOf(text);
  if (directIndex >= 0) return { day: directIndex + 1, dayName: WEEKDAYS[directIndex] };

  const digit = text.match(/^[1-7]$/);
  if (digit) return { day: Number(digit[0]), dayName: WEEKDAYS[Number(digit[0]) - 1] };

  const chinese = text.match(/[一二三四五六日天]/);
  if (!chinese) return null;
  const day = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 }[chinese[0]];
  return { day, dayName: WEEKDAYS[day - 1] };
}

function positiveNumberFromText(value) {
  const text = normalizeHtmlText(value);
  const digit = text.match(/\d+/);
  if (digit) return Number(digit[0]);
  return parseChineseSectionNumber(text);
}

function parseArrangedCourseTime(record) {
  const weekday = weekdayFromValue(record["星期"]);
  const startSection = positiveNumberFromText(record["开始节次"]);
  const duration = positiveNumberFromText(record["持续节次"]) || 1;
  if (!weekday || !startSection) return null;

  const rawWeekText = normalizeHtmlText(record["周次"]);
  const weekText = rawWeekText && !rawWeekText.includes("周") ? `${rawWeekText}周` : rawWeekText;
  const endSection = startSection + Math.max(1, duration) - 1;
  return {
    weekText,
    weeks: expandWeekText(weekText),
    day: weekday.day,
    dayName: weekday.dayName,
    sectionText: startSection === endSection ? `${startSection}节` : `${startSection}-${endSection}节`,
    startSection,
    endSection
  };
}

function buildAcademicCourse(record, parsedTime, location, sectionTimes, index, sourceType) {
  const name = record["课程名"] || record["课程名称"] || "未命名课程";
  const sectionNo = record["课序号"] || "";
  const teacher = String(record["教师"] || "").replace(/\*/g, "").trim();
  const timeRange = sectionTimeRange(sectionTimes, parsedTime.startSection, parsedTime.endSection);
  const id = [
    sourceType,
    record["课程号"],
    sectionNo,
    parsedTime.day,
    parsedTime.startSection,
    parsedTime.endSection,
    parsedTime.weekText,
    location.display,
    index
  ].join("|");

  return {
    id,
    courseCode: record["课程号"] || "",
    courseName: name,
    sectionNo,
    credits: record["学分"] || "",
    courseProperty: record["课程属性"] || "",
    category: record["课程类别"] || "",
    examType: record["考试类型"] || "",
    teacher,
    studyMode: record["修读方式"] || "",
    status: record["选课状态"] || "",
    weekText: parsedTime.weekText,
    weeks: parsedTime.weeks,
    day: parsedTime.day,
    dayName: parsedTime.dayName,
    sectionText: parsedTime.sectionText,
    startSection: parsedTime.startSection,
    endSection: parsedTime.endSection,
    duration: parsedTime.endSection - parsedTime.startSection + 1,
    timeRange,
    location,
    sourceType,
    tone: stableTone(name)
  };
}

function parseDetailCourseRows(tableInfo, sectionTimes) {
  const courses = [];
  let lastBaseRecord = null;

  tableRowsAfterHeader(tableInfo).forEach((row, index) => {
    const rawRecord = recordFromHeaders(tableInfo.headers, row);
    const normalized = normalizeDetailRecord(row, rawRecord, lastBaseRecord);
    lastBaseRecord = normalized.baseRecord;

    const parsedTime = parseCourseTime(normalized.record["时间"]);
    if (!parsedTime) return;

    const location = parseCourseLocation(normalized.record["地点"]);
    courses.push(buildAcademicCourse(normalized.record, parsedTime, location, sectionTimes, index, tableInfo.type));
  });

  return courses;
}

function parseArrangedCourseRows(tableInfo, sectionTimes) {
  const courses = [];

  tableRowsAfterHeader(tableInfo).forEach((row, index) => {
    const record = recordFromHeaders(tableInfo.headers, row);
    const parsedTime = parseArrangedCourseTime(record);
    if (!parsedTime) return;

    const location = parseCourseLocation([record["校区"], record["教学楼"], record["教室"]].filter(Boolean).join(">>"));
    courses.push(buildAcademicCourse(record, parsedTime, location, sectionTimes, index, tableInfo.type));
  });

  return courses;
}

function extractAcademicMeta($) {
  const bodyText = normalizeHtmlText($("body").text());
  const termMatch = bodyText.match(/选课管理\s*[（(]([^）)]+)[）)]/);
  const calendarMatch = bodyText.match(/\d{4}-\d{4}\s*[春夏秋冬]\s*第\d+周\s*星期[一二三四五六日]/);
  return {
    termText: termMatch?.[1] || "",
    currentCalendarText: calendarMatch?.[0] || ""
  };
}

function parseAcademicTimetable(html, finalUrl = JWXS_TIMETABLE_URL, sourceConfig = ACADEMIC_TIMETABLE_SOURCES.selection) {
  const $ = cheerio.load(html);
  const tableInfo = findCourseResultTableInfo($);
  if (!tableInfo) throw new HttpError(502, `没有在教务页面找到${sourceConfig.label}课程表。`);

  const sectionTimes = parseSectionTimes($);
  const courses = tableInfo.type === "arranged"
    ? parseArrangedCourseRows(tableInfo, sectionTimes)
    : parseDetailCourseRows(tableInfo, sectionTimes);

  courses.sort((a, b) => a.day - b.day || a.startSection - b.startSection || a.endSection - b.endSection || a.courseName.localeCompare(b.courseName, "zh-CN"));
  const courseNames = new Set(courses.map((item) => item.courseName));
  const locations = new Set(courses.map((item) => item.location.display).filter(Boolean));
  const meta = extractAcademicMeta($);
  const termInfo = academicTermFromCalendar(meta.currentCalendarText);
  return {
    ...meta,
    sourceKey: sourceConfig.key,
    sourceLabel: sourceConfig.label,
    termInfo,
    termText: academicTermLabel(termInfo, sourceConfig.label, meta.termText),
    source: finalUrl,
    generatedAt: new Date().toISOString(),
    days: WEEKDAYS.map((name, index) => ({ day: index + 1, name })),
    sectionTimes,
    courses,
    stats: {
      arrangedSessions: courses.length,
      courses: courseNames.size,
      locations: locations.size
    }
  };
}

function academicCourseRecords(payload) {
  const source = payload?.xkxx;
  const blocks = Array.isArray(source) ? source : (source && typeof source === "object" ? [source] : []);
  const records = [];
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    for (const value of Object.values(block)) {
      if (value && typeof value === "object" && (value.courseName || value.timeAndPlaceList !== undefined)) {
        records.push(value);
      }
    }
  }
  return records;
}

function semesterSeasonName(semester) {
  const value = String(semester || "");
  if (value === "1") return "秋";
  if (value === "2") return "春";
  return value ? `第${value}学期` : "";
}

function academicTermFromPlan(planNumber) {
  const match = String(planNumber || "").match(/^(\d{4})-(\d{4})-(\d+)/);
  if (!match) return null;
  const [, startYear, endYear, semester] = match;
  const season = semesterSeasonName(semester);
  return {
    academicYear: `${startYear}-${endYear}`,
    startYear,
    endYear,
    semester,
    season,
    label: `${startYear}-${endYear}学年${season}`
  };
}

function academicTermFromCalendar(text) {
  const match = String(text || "").match(/(\d{4})-(\d{4})\s*([春夏秋冬])/);
  if (!match) return null;
  const [, startYear, endYear, season] = match;
  const semester = season === "秋" ? "1" : season === "春" ? "2" : "";
  return {
    academicYear: `${startYear}-${endYear}`,
    startYear,
    endYear,
    semester,
    season,
    label: `${startYear}-${endYear}学年${season}`
  };
}

function academicTermFromRecords(records, currentCalendarText = "") {
  const plan = records.find((record) => record?.id?.executiveEducationPlanNumber)?.id?.executiveEducationPlanNumber;
  return academicTermFromPlan(plan) || academicTermFromCalendar(currentCalendarText);
}

function academicTermLabel(termInfo, sourceLabel, fallback = "") {
  if (termInfo?.label) return `${termInfo.label} · ${sourceLabel}`;
  return fallback && !/已安排的理论课|选课管理/.test(fallback) ? `${fallback} · ${sourceLabel}` : sourceLabel;
}

function weeksFromClassWeek(classWeek) {
  return Array.from(String(classWeek || ""), (char, index) => (char === "1" ? index + 1 : null)).filter(Boolean);
}

function compressWeeks(weeks) {
  const sorted = [...new Set(weeks)].filter(Number.isFinite).sort((a, b) => a - b);
  const ranges = [];
  for (const week of sorted) {
    const last = ranges.at(-1);
    if (last && week === last.end + 1) last.end = week;
    else ranges.push({ start: week, end: week });
  }
  return ranges.map((range) => (range.start === range.end ? `第${range.start}周` : `${range.start}-${range.end}周`)).join("、");
}

function termTextFromExecutivePlan(planNumber) {
  return academicTermFromPlan(planNumber)?.label || "";
}

function parseAcademicCurriculumPayload(payload, {
  pageHtml = "",
  source = JWXS_CURRICULUM_URL,
  sourceConfig = ACADEMIC_TIMETABLE_SOURCES.selection
} = {}) {
  const $ = cheerio.load(pageHtml || "");
  const meta = extractAcademicMeta($);
  const sectionTimes = pageHtml ? parseSectionTimes($) : [...DEFAULT_SECTION_TIMES];
  const records = academicCourseRecords(payload);
  const courses = [];
  const unarrangedCourses = [];

  records.forEach((record, recordIndex) => {
    const placements = Array.isArray(record.timeAndPlaceList) ? record.timeAndPlaceList : [];
    if (!placements.length) {
      unarrangedCourses.push({
        courseCode: record.id?.coureNumber || "",
        courseName: record.courseName || "未命名课程",
        sectionNo: record.id?.coureSequenceNumber || "",
        credits: record.unit ?? "",
        teacher: String(record.attendClassTeacher || "").replace(/\*/g, "").trim(),
        status: record.selectCourseStatusName || "",
        reason: "学校未返回具体上课时间"
      });
      return;
    }

    placements.forEach((place, placeIndex) => {
      const startSection = Number(place.classSessions);
      const duration = Number(place.continuingSession) || 1;
      const day = Number(place.classDay);
      if (!Number.isFinite(startSection) || !Number.isFinite(day) || day < 1 || day > WEEKDAYS.length) return;

      const endSection = startSection + Math.max(1, duration) - 1;
      const weekText = normalizeHtmlText(place.weekDescription) || compressWeeks(weeksFromClassWeek(place.classWeek));
      const weeks = expandWeekText(weekText);
      const parsedTime = {
        weekText,
        weeks: weeks.length ? weeks : weeksFromClassWeek(place.classWeek),
        day,
        dayName: WEEKDAYS[day - 1],
        sectionText: startSection === endSection ? `${startSection}节` : `${startSection}-${endSection}节`,
        startSection,
        endSection
      };
      const normalizedRecord = {
        "课程号": record.id?.coureNumber || place.coureNumber || "",
        "课程名": record.courseName || place.coureName || "未命名课程",
        "课序号": record.id?.coureSequenceNumber || place.coureSequenceNumber || "",
        "学分": record.unit ?? "",
        "课程属性": record.coursePropertiesName || place.coursePropertiesName || "",
        "课程类别": record.courseCategoryName || "",
        "考试类型": record.examTypeName || "",
        "教师": record.attendClassTeacher || place.courseTeacher || "",
        "修读方式": record.studyModeName || "",
        "选课状态": record.selectCourseStatusName || ""
      };
      const location = parseCourseLocation([place.campusName, place.teachingBuildingName, place.classroomName].filter(Boolean).join(">>"));
      courses.push(buildAcademicCourse(normalizedRecord, parsedTime, location, sectionTimes, `${recordIndex}-${placeIndex}`, "curriculum"));
    });
  });

  courses.sort((a, b) => a.day - b.day || a.startSection - b.startSection || a.endSection - b.endSection || a.courseName.localeCompare(b.courseName, "zh-CN"));
  const locations = new Set(courses.map((item) => item.location.display).filter(Boolean));
  const firstPlan = records.find((record) => record.id?.executiveEducationPlanNumber)?.id?.executiveEducationPlanNumber;
  const termInfo = academicTermFromRecords(records, meta.currentCalendarText);
  return {
    ...meta,
    sourceKey: sourceConfig.key,
    sourceLabel: sourceConfig.label,
    termInfo,
    termText: academicTermLabel(termInfo, sourceConfig.label, meta.termText || termTextFromExecutivePlan(firstPlan)),
    source,
    generatedAt: new Date().toISOString(),
    days: WEEKDAYS.map((name, index) => ({ day: index + 1, name })),
    sectionTimes,
    courses,
    unarrangedCourses,
    stats: {
      arrangedSessions: courses.length,
      courses: records.length || new Set(courses.map((item) => item.courseName)).size,
      locations: locations.size,
      totalCredits: payload?.allUnits ?? null,
      unarrangedCourses: unarrangedCourses.length
    }
  };
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

function normalizeFreeClassroomSections(value) {
  const source = String(value || "").split(/[,\s，、]+/);
  const sections = source
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 1 && item <= 12);
  const unique = [...new Set(sections)].sort((a, b) => a - b);
  return unique.length ? unique : [11, 12];
}

function freeClassroomDayLabel(dayplus) {
  const date = new Date();
  date.setDate(date.getDate() + dayplus);
  const weekday = WEEKDAYS[(date.getDay() + 6) % 7];
  return {
    date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    weekday,
    label: dayplus === 0 ? "今天" : dayplus === 1 ? "明天" : "后天"
  };
}

function freeClassroomBuildingOptions() {
  return [
    { value: "study", name: "自习常用楼", numbers: NEW_CAMPUS_BUILDINGS.filter((building) => building.study).map((building) => building.number) },
    { value: "all", name: "全部新校区", numbers: NEW_CAMPUS_BUILDINGS.map((building) => building.number) },
    ...NEW_CAMPUS_BUILDINGS.filter((building) => building.study).map((building) => ({
      value: building.number,
      name: building.name,
      numbers: [building.number]
    }))
  ];
}

function resolveFreeClassroomBuilding(value) {
  const raw = String(value || "study");
  if (raw === "all") {
    return {
      value: "all",
      name: "全部新校区",
      position: "00_n",
      allowedNumbers: new Set(NEW_CAMPUS_BUILDINGS.map((building) => building.number))
    };
  }
  if (NEW_CAMPUS_BUILDING_BY_NUMBER.has(raw)) {
    const building = NEW_CAMPUS_BUILDING_BY_NUMBER.get(raw);
    return {
      value: building.number,
      name: building.name,
      position: `00_${building.number}`,
      allowedNumbers: new Set([building.number])
    };
  }
  return {
    value: "study",
    name: "自习常用楼",
    position: "00_n",
    allowedNumbers: new Set(NEW_CAMPUS_BUILDINGS.filter((building) => building.study).map((building) => building.number))
  };
}

function freeClassroomQueryFromSearch(searchParams) {
  const dayplus = clampInteger(searchParams.get("dayplus"), 0, 2, 0);
  const sections = normalizeFreeClassroomSections(searchParams.get("sections"));
  const building = resolveFreeClassroomBuilding(searchParams.get("building"));
  return {
    campusNumber: "00",
    campusName: "新校区",
    dayplus,
    ...freeClassroomDayLabel(dayplus),
    sections,
    sectionText: sections.join(","),
    building
  };
}

function naturalRoomCompare(a, b) {
  return String(a.room).localeCompare(String(b.room), "zh-CN", { numeric: true, sensitivity: "base" });
}

function normalizeFreeClassroomPayload(payload, query) {
  const rawBuildings = Array.isArray(payload?.spareroomObjList) ? payload.spareroomObjList : [];
  const buildings = [];

  for (const rawBuilding of rawBuildings) {
    const number = String(rawBuilding?.acmcBuilding || "");
    if (!query.building.allowedNumbers.has(number)) continue;

    const roomByName = new Map();
    const rawRooms = Array.isArray(rawBuilding?.claroom) ? rawBuilding.claroom : [];
    for (const rawRoom of rawRooms) {
      const room = normalizeHtmlText(rawRoom?.classroom);
      if (!room) continue;
      const current = roomByName.get(room) || {
        room,
        floor: normalizeHtmlText(rawRoom?.szlc),
        seats: 0,
        hits: 0
      };
      const seats = Number(rawRoom?.classNumberOfSeats);
      if (Number.isFinite(seats)) current.seats = Math.max(current.seats, seats);
      current.hits += 1;
      roomByName.set(room, current);
    }

    const rooms = Array.from(roomByName.values())
      .sort(naturalRoomCompare);
    if (!rooms.length) continue;

    const buildingName = rawBuilding?.acmcBuildingName || NEW_CAMPUS_BUILDING_BY_NUMBER.get(number)?.name || number;
    buildings.push({
      number,
      name: buildingName,
      rooms,
      roomCount: rooms.length,
      seats: rooms.reduce((sum, room) => sum + (room.seats > 0 ? room.seats : 0), 0)
    });
  }

  buildings.sort((a, b) => {
    const ai = NEW_CAMPUS_BUILDINGS.findIndex((building) => building.number === a.number);
    const bi = NEW_CAMPUS_BUILDINGS.findIndex((building) => building.number === b.number);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a.name.localeCompare(b.name, "zh-CN");
  });

  return {
    source: `${JWXS_FREE_CLASSROOM_TODAY_URL}/${query.sectionText}`,
    generatedAt: new Date().toISOString(),
    campusName: query.campusName,
    dayplus: query.dayplus,
    date: query.date,
    weekday: query.weekday,
    dayLabel: query.label,
    sections: query.sections,
    sectionText: query.sectionText,
    sectionTimes: DEFAULT_SECTION_TIMES,
    building: {
      value: query.building.value,
      name: query.building.name
    },
    buildingOptions: freeClassroomBuildingOptions(),
    buildings,
    stats: {
      buildings: buildings.length,
      rooms: buildings.reduce((sum, building) => sum + building.roomCount, 0),
      seats: buildings.reduce((sum, building) => sum + building.seats, 0)
    }
  };
}

async function postFreeClassroomContext(jar, query) {
  const form = new URLSearchParams({
    position: query.building.position,
    xqm: query.campusName
  });
  const response = await fetchWithJar(JWXS_FREE_CLASSROOM_TODAY_URL, {
    jar,
    method: "POST",
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "content-type": "application/x-www-form-urlencoded",
      origin: JWXS_ORIGIN,
      referer: JWXS_FREE_CLASSROOM_INDEX_URL
    },
    body: form.toString()
  });
  const html = await readUpstreamText(response);
  if (response.status >= 300 && response.status < 400) {
    throw new HttpError(401, "教务空教室页面返回登录跳转，会话可能已过期。", {
      location: response.headers.get("location")
    });
  }
  if (response.status >= 400) {
    throw new HttpError(response.status, `教务空教室页面返回 HTTP ${response.status}`);
  }
  if (looksLikeAcademicLoginHtml(html, JWXS_FREE_CLASSROOM_TODAY_URL)) {
    throw new HttpError(401, "教务系统会话已过期，请重新登录学校账号。");
  }
  if (extractWebvpnVerifyUrl(html, JWXS_FREE_CLASSROOM_TODAY_URL)) {
    throw new HttpError(502, "教务系统 WebVPN 校验未完成，请稍后重试。");
  }
  return html;
}

async function requestFreeClassroomPayload(jar, query) {
  const targetUrl = `${JWXS_FREE_CLASSROOM_TODAY_URL}/${query.sectionText}?dayplus=${query.dayplus}`;
  const response = await fetchWithJar(targetUrl, {
    jar,
    method: "GET",
    headers: {
      accept: "application/json,text/javascript,*/*;q=0.01",
      referer: JWXS_FREE_CLASSROOM_TODAY_URL,
      "x-requested-with": "XMLHttpRequest"
    }
  });
  const text = await readUpstreamText(response);
  if (response.status >= 300 && response.status < 400) {
    throw new HttpError(401, "教务空教室接口返回登录跳转，会话可能已过期。", {
      location: response.headers.get("location")
    });
  }
  if (response.status >= 400) {
    throw new HttpError(response.status, `教务空教室接口返回 HTTP ${response.status}`, {
      sample: normalizeHtmlText(text).slice(0, 240)
    });
  }
  if (looksLikeAcademicLoginHtml(text, targetUrl)) {
    throw new HttpError(401, "教务系统会话已过期，请重新登录学校账号。");
  }
  try {
    return parseJsonLike(text);
  } catch {
    throw new HttpError(502, "教务空教室接口返回的 JSON 结构不符合预期。", {
      sample: normalizeHtmlText(text).slice(0, 240)
    });
  }
}

async function getFreeClassrooms(query) {
  await fetchAcademicTimetableHtml();
  let jar = await readSessionJar();
  try {
    await requestAcademicHtmlWithSimpleRedirects(jar, JWXS_FREE_CLASSROOM_INDEX_URL, { referer: JWXS_ORIGIN });
    await postFreeClassroomContext(jar, query);
    const payload = await requestFreeClassroomPayload(jar, query);
    await saveSessionJar(jar);
    return normalizeFreeClassroomPayload(payload, query);
  } catch (error) {
    if (error.status !== 401) throw error;
    await activateAcademicSession(jar);
    jar = await readSessionJar();
    await postFreeClassroomContext(jar, query);
    const payload = await requestFreeClassroomPayload(jar, query);
    await saveSessionJar(jar);
    return normalizeFreeClassroomPayload(payload, query);
  }
}

async function readAcademicTimetableCache(source = ACADEMIC_TIMETABLE_SOURCES.current) {
  const row = db.prepare(`
    SELECT cache_json FROM academic_caches
    WHERE user_id = ? AND source_key = ?
  `).get(currentUserId(), source.key);
  if (!row) return null;
  try {
    const cached = sensitiveJson.decode(row.cache_json);
    if (cached.sourceKey === source.key) return cached;
    if (!cached.sourceKey && source.key === "selection" && String(cached.source || "").includes("/thisSemesterCurriculum/callback")) {
      return { ...cached, sourceKey: source.key, sourceLabel: source.label };
    }
    return null;
  } catch (error) {
    if (String(row.cache_json || "").startsWith("enc:v1:")) throw error;
    return null;
  }
}

async function saveAcademicTimetableCache(data, source = ACADEMIC_TIMETABLE_SOURCES.current) {
  db.prepare(`
    INSERT INTO academic_caches (user_id, source_key, cache_json, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, source_key) DO UPDATE SET
      cache_json = excluded.cache_json,
      updated_at = excluded.updated_at
  `).run(currentUserId(), source.key, sensitiveJson.encode(data), nowIso());
}

async function getAcademicTimetable(source = ACADEMIC_TIMETABLE_SOURCES.current) {
  try {
    const page = await fetchAcademicTimetableHtml(source);
    let parsed;
    try {
      const curriculum = await fetchAcademicCurriculumPayload(source);
      parsed = parseAcademicCurriculumPayload(curriculum.payload, {
        pageHtml: page.html,
        source: curriculum.finalUrl,
        sourceConfig: source
      });
    } catch (jsonError) {
      parsed = parseAcademicTimetable(page.html, page.finalUrl, source);
      if (!parsed.courses.length) throw jsonError;
    }
    parsed = {
      ...parsed,
      live: true
    };
    await saveAcademicTimetableCache(parsed, source);
    return parsed;
  } catch (error) {
    const cached = await readAcademicTimetableCache(source);
    if (cached) {
      return {
        ...cached,
        live: false,
        staleReason: error.message || "教务系统实时同步失败"
      };
    }
    throw error;
  }
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

function looksLikePortalLogin(text, finalUrl = "") {
  const sample = String(text || "").slice(0, 5000);
  return finalUrl.includes("/cas/login")
    || /cas\/login|统一身份认证|name=["']execution["']|id=["']authcode["']|id=["']fm1["']/.test(sample);
}

async function requestPortalHtml(jar, url = MY_USERCENTER_HOME_URL, { referer = MY_ORIGIN } = {}) {
  const { response, url: finalUrl } = await followRedirectsWithJar(url, jar, {
    method: "GET",
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      referer
    }
  });
  const html = await readUpstreamText(response);
  if (looksLikePortalLogin(html, finalUrl)) {
    throw new HttpError(401, PORTAL_LOGIN_REQUIRED_MESSAGE, {
      endpoint: new URL(url).pathname,
      finalUrl
    });
  }
  if (response.status >= 400) {
    throw new HttpError(response.status, `用户中心页面返回 HTTP ${response.status}`, {
      endpoint: new URL(url).pathname,
      sample: normalizeHtmlText(html).slice(0, 240)
    });
  }
  return { html, finalUrl };
}

function portalPayloadResult(payload) {
  return payload?.result && typeof payload.result === "object" ? payload.result : payload;
}

function firstPortalDataItem(payload) {
  const result = portalPayloadResult(payload);
  if (Array.isArray(result?.data)) return result.data[0] || null;
  if (Array.isArray(payload?.data)) return payload.data[0] || null;
  if (Array.isArray(result)) return result[0] || null;
  return result?.data ?? payload?.data ?? result ?? null;
}

function portalFailureCode(value) {
  return value !== undefined && value !== null && value !== "" && value !== 0 && value !== "0";
}

function normalizePortalError(payload, fallback) {
  return payload?.errorMsg
    || payload?.message
    || payload?.msg
    || payload?.result?.errorMsg
    || payload?.result?.message
    || payload?.result?.msg
    || fallback;
}

function imageDataUrl(value, fallbackMime = "image/png") {
  const text = String(value || "").trim();
  if (!text) return null;
  if (/^data:/i.test(text) || /^https?:\/\//i.test(text)) return text;
  const mime = text.startsWith("/9j/") ? "image/jpeg" : fallbackMime;
  if (text.startsWith("/9j/")) return `data:${mime};base64,${text}`;
  if (text.startsWith("/")) return new URL(text, MY_ORIGIN).href;
  return `data:${mime};base64,${text}`;
}

function normalizeIdentityProfile(info = {}) {
  const field = (value) => {
    const text = String(value ?? "").trim();
    return text || null;
  };
  return {
    name: field(info.name),
    code: field(info.code),
    category: field(info.category),
    categoryName: field(info.categoryName),
    statusName: field(info.statusName),
    orgName: field(info.orgName),
    enterGrade: field(info.enterGrade),
    campus: field(info.campus),
    mobile: field(info.mobile),
    gender: field(info.gender),
    photoUrl: imageDataUrl(info.photo)
  };
}

function identityFaceOfficialServiceUrl() {
  const targetUrl = new URL(MY_FACE_INFO_CALLBACK_URL);
  targetUrl.searchParams.set("isFrame", "true");
  targetUrl.searchParams.set("timeStamp", String(Date.now()));
  return targetUrl.href;
}

function identityFaceOfficialUrl(targetUrl = identityFaceOfficialServiceUrl()) {
  const url = new URL(targetUrl);
  url.hash = "/faceinfo";
  return url.href;
}

async function getIdentityFaceOfficialLink() {
  const jar = await readSessionJar();
  if (!cookieHeaderFor(jar, `${CAS_ORIGIN}/cas/login`)) {
    throw new HttpError(401, "统一身份认证会话已过期，请在本系统重新登录学校账号后再打开官方采集页。");
  }

  try {
    const serviceUrl = identityFaceOfficialServiceUrl();
    const ticketUrl = await getCasTicketRedirect({ jar, serviceUrl });
    jar.meta.cas ||= {};
    jar.meta.cas.lastError = null;
    await saveSessionJar(jar);
    return {
      url: identityFaceOfficialUrl(ticketUrl),
      autoLogin: true
    };
  } catch (error) {
    if (error?.status === 401) {
      jar.meta.cas ||= {};
      jar.meta.cas.lastError = "统一身份认证会话已过期，请在本系统重新登录学校账号后再打开官方采集页。";
      await saveSessionJar(jar).catch(() => {});
      throw new HttpError(401, jar.meta.cas.lastError);
    }
    throw error;
  }
}

function normalizeIdentityFaceConfig(config = {}) {
  const mode = String(config.mode ?? config.collectMode ?? "").trim();
  const labels = {
    "0": "摄像头采集",
    "1": "上传照片",
    "2": "摄像头采集 / 上传照片"
  };
  return {
    mode: mode || null,
    modeText: labels[mode] || (mode ? `模式 ${mode}` : "学校默认模式"),
    enabled: config.enable ?? config.enabled ?? config.faceEnable ?? null
  };
}

function normalizeIdentityFaceInfo(statusPayload, configPayload) {
  const statusItem = firstPortalDataItem(statusPayload) || {};
  const status = statusItem.vo || statusItem;
  const configItem = firstPortalDataItem(configPayload) || {};
  const config = configItem.vo || configItem;
  const statusHasFaceFields = status.humanStatus !== undefined
    || status.humanPhoto
    || status.facePhoto
    || status.photo;
  const configHasFaceFields = config.humanStatus !== undefined
    || config.humanPhoto
    || config.facePhoto
    || config.photo;
  const face = statusHasFaceFields ? status : (configHasFaceFields ? config : status);
  const rawStatus = face.humanStatus ?? face.status ?? face.faceStatus ?? face.auditStatus ?? null;
  const statusTextValue = String(rawStatus ?? "").trim();
  const photoUrl = imageDataUrl(
    face.humanPhoto || face.facePhoto || face.photo || face.image || face.img,
    "image/jpeg"
  );
  const collected = statusTextValue === "1"
    || statusTextValue.toLowerCase() === "true"
    || Boolean(photoUrl);

  return {
    collected,
    statusCode: rawStatus,
    statusText: collected ? "已采集" : "未采集",
    message: collected
      ? "已有人脸照片，可以使用学校提供的人脸识别服务。"
      : "学校暂未返回已采集的人脸照片。",
    photoUrl,
    config: normalizeIdentityFaceConfig(config),
    officialUrl: identityFaceOfficialUrl(),
    fetchedAt: new Date().toISOString()
  };
}

function parseIdentityCodeConfig(payload) {
  const item = firstPortalDataItem(payload) || {};
  let value = item.value ?? item.configValue ?? item;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      value = {};
    }
  }
  const validity = Number(value?.validityPeriod);
  return {
    enabled: value?.enabled !== false && value?.enabled !== "false",
    validitySeconds: Number.isFinite(validity) && validity > 0 ? Math.min(Math.max(validity, 5), 300) : 10
  };
}

function svgDataUrl(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

async function identityCodeImages(rawCode) {
  const code = String(rawCode || "");
  if (!code) throw new HttpError(502, "学校没有返回个人身份码。");
  const barcodeText = code.split("|")[0] || code;
  const qrSvg = await QRCode.toString(code, {
    type: "svg",
    margin: 1,
    width: 220,
    color: {
      dark: "#111827",
      light: "#ffffff"
    }
  });
  const barcodeSvg = bwipjs.toSVG({
    bcid: "code128",
    text: barcodeText,
    scale: 2,
    height: 24,
    includetext: false,
    paddingwidth: 8,
    paddingheight: 4,
    backgroundcolor: "FFFFFF"
  });
  return {
    qrImage: svgDataUrl(qrSvg),
    barcodeImage: svgDataUrl(barcodeSvg)
  };
}

async function activatePortalSession(jar, credentials = {}) {
  await loginCasService({
    jar,
    username: credentials.username,
    password: credentials.password,
    rememberMe: credentials.rememberMe ?? true,
    serviceUrl: MY_USERCENTER_HOME_URL
  });
  await requestPortalHtml(jar, MY_USERCENTER_HOME_URL);
  await requestPortalHtml(jar, MY_INFO_PAGE_URL, { referer: MY_USERCENTER_HOME_URL }).catch(() => null);
  if (!cookieHeaderFor(jar, MY_USERCENTER_HOME_URL)) {
    throw new HttpError(401, PORTAL_LOGIN_REQUIRED_MESSAGE);
  }
  jar.meta.portalCapturedAt = new Date().toISOString();
  jar.meta.cas ||= {};
  jar.meta.cas.lastError = null;
  jar.meta.portal ||= {};
  jar.meta.portal.lastError = null;
  await saveSessionJar(jar);
}

async function portalApiRequest(path, {
  method = "GET",
  data,
  referer = `${MY_ORIGIN}/yhzt/usercenter-front-web/home.html?isFrame=true`,
  jar: explicitJar,
  retryOnAuth = true
} = {}) {
  const jar = explicitJar || await readSessionJar();
  const upperMethod = method.toUpperCase();
  const targetUrl = new URL(path, MY_ORIGIN);
  if ((upperMethod === "GET" || upperMethod === "DELETE") && data && typeof data === "object") {
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined || value === null || value === "") continue;
      targetUrl.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
    }
  }

  const headers = {
    accept: "application/json, text/plain, */*",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    "cache-control": "no-cache",
    pragma: "no-cache",
    origin: MY_ORIGIN,
    referer,
    "x-requested-with": "XMLHttpRequest"
  };
  const body = upperMethod === "GET" || upperMethod === "DELETE" ? undefined : JSON.stringify(data || {});
  if (body) headers["content-type"] = "application/json;charset=UTF-8";

  const response = await fetchWithJar(targetUrl.href, {
    jar,
    method: upperMethod,
    headers,
    body,
    redirect: "manual",
    timeoutMs: REQUEST_TIMEOUT_MS
  });
  const text = await readUpstreamText(response);
  const location = response.headers.get("location") || "";

  if ((response.status >= 300 && response.status < 400) || looksLikePortalLogin(text, location || targetUrl.href)) {
    if (!retryOnAuth) {
      throw new HttpError(401, PORTAL_LOGIN_REQUIRED_MESSAGE, {
        endpoint: targetUrl.pathname,
        location
      });
    }
    try {
      await activatePortalSession(jar, {});
    } catch (error) {
      throw new HttpError(401, PORTAL_LOGIN_REQUIRED_MESSAGE, {
        endpoint: targetUrl.pathname,
        cause: error.message
      });
    }
    return portalApiRequest(path, { method, data, referer, jar, retryOnAuth: false });
  }

  if (response.status >= 400) {
    throw new HttpError(response.status, `用户中心接口返回 HTTP ${response.status}`, {
      endpoint: targetUrl.pathname,
      sample: normalizeHtmlText(text).slice(0, 240)
    });
  }

  let payload;
  try {
    payload = parseJsonLike(text || "{}");
  } catch {
    throw new HttpError(502, "用户中心接口返回的 JSON 结构不符合预期。", {
      endpoint: targetUrl.pathname,
      sample: normalizeHtmlText(text).slice(0, 240)
    });
  }

  if (portalFailureCode(payload?.resultCode) || portalFailureCode(payload?.code) || payload?.success === false) {
    const status = payload?.resultCode === 401 || payload?.resultCode === 403 || payload?.code === 401 || payload?.code === 403 ? 401 : 502;
    throw new HttpError(status, normalizePortalError(payload, "用户中心接口返回失败。"), {
      endpoint: targetUrl.pathname
    });
  }

  jar.meta.portalCapturedAt = new Date().toISOString();
  jar.meta.portal ||= {};
  jar.meta.portal.lastError = null;
  return payload;
}

async function getIdentityCodeConfig(jar) {
  const requestOptions = {
    method: "POST",
    data: { code: ["IdentityQrCode"] },
    jar
  };
  const payload = await portalApiRequest("/ids/v1/config/list", requestOptions)
    .catch((error) => {
      if (error?.status === 401) throw error;
      return portalApiRequest("/pcen/v1/open/configList", requestOptions);
    });
  return parseIdentityCodeConfig(payload);
}

async function getIdentityProfileBundle(jar) {
  const [humanResult, backgroundResult, configResult] = await Promise.allSettled([
    portalApiRequest("/pcen/v1/human/currHumanInfo", { method: "POST", data: {}, jar }),
    portalApiRequest("/pcen/v1/human/background/idcode", { method: "GET", jar }),
    getIdentityCodeConfig(jar)
  ]);

  if (humanResult.status === "rejected") throw humanResult.reason;

  const humanItem = firstPortalDataItem(humanResult.value) || {};
  const humanInfo = humanItem.vo || humanItem;
  const background = backgroundResult.status === "fulfilled" ? (firstPortalDataItem(backgroundResult.value) || {}) : {};
  const codeConfig = configResult.status === "fulfilled" ? configResult.value : { enabled: true, validitySeconds: 10 };

  return {
    profile: normalizeIdentityProfile(humanInfo),
    background: {
      imageUrl: imageDataUrl(background.backgroundImg || background.image || background.img),
      color: background.backgroundColor || background.color || null
    },
    codeConfig,
    fetchedAt: new Date().toISOString()
  };
}

async function getIdentityDynamicCode(jar, validitySeconds = 10) {
  const payload = await portalApiRequest("/pcen/v1/human/idcode", {
    method: "POST",
    data: {},
    jar
  });
  const item = firstPortalDataItem(payload) || {};
  const rawCode = item.code;
  const generatedAt = new Date();
  const images = await identityCodeImages(rawCode);
  return {
    ...images,
    generatedAt: generatedAt.toISOString(),
    expiresAt: new Date(generatedAt.getTime() + validitySeconds * 1000).toISOString(),
    validitySeconds,
    status: "active"
  };
}

function canTryPortalSession(jar) {
  return Boolean(
    cookieHeaderFor(jar, MY_USERCENTER_HOME_URL)
    || cookieHeaderFor(jar, MY_INFO_PAGE_URL)
    || cookieHeaderFor(jar, `${CAS_ORIGIN}/cas/login`)
  );
}

async function getIdentityCard() {
  const jar = await readSessionJar();
  if (!canTryPortalSession(jar)) {
    const stored = storedSessionSummary(jar);
    throw new HttpError(401, stored.hasStoredSession
      ? PORTAL_LOGIN_REQUIRED_MESSAGE
      : "还没有连接学校账号，请先登录。");
  }

  try {
    const bundle = await getIdentityProfileBundle(jar);
    const code = bundle.codeConfig.enabled
      ? await getIdentityDynamicCode(jar, bundle.codeConfig.validitySeconds).catch((error) => ({ error: error.message }))
      : { error: "学校当前未开放个人身份码。" };
    await saveSessionJar(jar);
    return {
      ...bundle,
      code,
      status: portalSessionSummary(jar)
    };
  } catch (error) {
    jar.meta.portal ||= {};
    jar.meta.portal.lastError = error.message || "用户中心同步失败。";
    await saveSessionJar(jar);
    throw error;
  }
}

async function getIdentityFaceInfo() {
  const jar = await readSessionJar();
  if (!canTryPortalSession(jar)) {
    const stored = storedSessionSummary(jar);
    throw new HttpError(401, stored.hasStoredSession
      ? PORTAL_LOGIN_REQUIRED_MESSAGE
      : "还没有连接学校账号，请先登录。");
  }

  try {
    const [statusResult, configResult] = await Promise.allSettled([
      portalApiRequest("/imp/_web/_apps/selfservice/api/face/uploadStatus.rst", {
        method: "GET",
        jar,
        referer: MY_USERCENTER_HOME_URL
      }),
      portalApiRequest("/imp/_web/_apps/selfservice/api/face/config.rst", {
        method: "GET",
        jar,
        referer: MY_USERCENTER_HOME_URL
      })
    ]);
    if (statusResult.status === "rejected") throw statusResult.reason;
    const configPayload = configResult.status === "fulfilled" ? configResult.value : {};
    const info = normalizeIdentityFaceInfo(statusResult.value, configPayload);
    await saveSessionJar(jar);
    return info;
  } catch (error) {
    jar.meta.portal ||= {};
    jar.meta.portal.lastError = error.message || "人脸信息同步失败。";
    await saveSessionJar(jar);
    throw error;
  }
}

async function refreshIdentityCodeOnly() {
  const jar = await readSessionJar();
  if (!canTryPortalSession(jar)) {
    const stored = storedSessionSummary(jar);
    throw new HttpError(401, stored.hasStoredSession
      ? PORTAL_LOGIN_REQUIRED_MESSAGE
      : "还没有连接学校账号，请先登录。");
  }
  const config = await getIdentityCodeConfig(jar).catch(() => ({ enabled: true, validitySeconds: 10 }));
  if (!config.enabled) throw new HttpError(403, "学校当前未开放个人身份码。");
  try {
    const code = await getIdentityDynamicCode(jar, config.validitySeconds);
    await saveSessionJar(jar);
    return code;
  } catch (error) {
    jar.meta.portal ||= {};
    jar.meta.portal.lastError = error.message || "个人身份码刷新失败。";
    await saveSessionJar(jar);
    throw error;
  }
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

async function handleApi(req, res, url) {
  try {
    if (url.pathname === "/api/app-auth/status") {
      json(res, 200, { ok: true, data: appAuthStatus(req) });
      return;
    }
    if (url.pathname === "/api/app-auth/login" && req.method === "POST") {
      if (!APP_AUTH_REQUIRED) {
        json(res, 200, { ok: true, data: appAuthStatus(req) });
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
      const { csrfToken: _csrfToken, ...healthAuth } = appAuthStatus(req);
      json(res, 200, {
        ok: true,
        service: "hgu-campus-hub",
        appAuth: healthAuth
      });
      return;
    }
    if (url.pathname === "/api/ready") {
      db.prepare("SELECT 1 AS ready").get();
      json(res, 200, { ok: true, service: "hgu-campus-hub", ready: true });
      return;
    }

    const appSession = APP_AUTH_REQUIRED ? requireAppAccess(req) : getAppSession(req);
    const contextUser = findUserById(appSession.user?.id);
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
      revokeSystemUserSessions(currentUserId());
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
      const refreshedUser = findUserById(currentUserId());
      const issued = issueAppSessionHeaders(refreshedUser, req);
      logger.info("audit_password_changed", { actorUserId: currentUserId() });
      json(res, 200, { ok: true, data: issued.session }, issued.headers);
      return;
    }

    if (url.pathname === "/api/users" && req.method === "GET") {
      requireAdminUser();
      json(res, 200, { ok: true, data: listSystemUsers() });
      return;
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
      return;
    }
    if (url.pathname === "/api/invites" && req.method === "GET") {
      requireAdminUser();
      json(res, 200, { ok: true, data: listInvites() });
      return;
    }
    if (url.pathname === "/api/invites" && req.method === "POST") {
      requireAdminUser();
      const body = await readBodyJson(req);
      const invite = createInvite({
        role: body.role,
        note: body.note,
        expiresInDays: body.expiresInDays,
        actorId: currentUserId()
      });
      logger.info("audit_invite_created", { actorUserId: currentUserId(), inviteId: invite.id, role: invite.role });
      json(res, 201, { ok: true, data: invite });
      return;
    }
    const inviteActionMatch = url.pathname.match(/^\/api\/invites\/([^/]+)$/);
    if (inviteActionMatch && req.method === "PATCH") {
      requireAdminUser();
      const body = await readBodyJson(req);
      if (body.revoked !== true) throw new HttpError(400, "无效的邀请码操作。");
      const invite = revokeInvite({ id: decodeURIComponent(inviteActionMatch[1]) });
      logger.info("audit_invite_revoked", { actorUserId: currentUserId(), inviteId: invite.id });
      json(res, 200, { ok: true, data: invite });
      return;
    }
    if (inviteActionMatch && req.method === "DELETE") {
      requireAdminUser();
      const invite = deleteInvite({ id: decodeURIComponent(inviteActionMatch[1]) });
      logger.info("audit_invite_deleted", { actorUserId: currentUserId(), inviteId: invite.id });
      json(res, 200, { ok: true, data: invite });
      return;
    }
    const userActionMatch = url.pathname.match(/^\/api\/users\/([^/]+)(?:\/(password))?$/);
    if (userActionMatch) {
      requireAdminUser();
      const targetUserId = decodeURIComponent(userActionMatch[1]);
      const subAction = userActionMatch[2] || "";
      if (subAction === "password" && req.method === "POST") {
        const body = await readBodyJson(req);
        const user = await resetSystemUserPassword({ id: targetUserId, password: body.password });
        logger.info("audit_user_password_reset", { actorUserId: currentUserId(), targetUserId: user.id });
        json(res, 200, { ok: true, data: user });
        return;
      }
      if (!subAction && req.method === "PATCH") {
        const body = await readBodyJson(req);
        const user = setSystemUserDisabled({
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
        return;
      }
      if (!subAction && req.method === "DELETE") {
        const user = deleteSystemUser({ id: targetUserId, actorId: currentUserId() });
        logger.info("audit_user_deleted", { actorUserId: currentUserId(), targetUserId: user.id });
        json(res, 200, { ok: true, data: user });
        return;
      }
    }

    if (url.pathname === "/api/auth/status") {
      json(res, 200, { ok: true, data: await sessionStatus() });
      return;
    }
    if (url.pathname === "/api/auth/login" && req.method === "POST") {
      const body = await readBodyJson(req);
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
        data = await loginWithCas(body);
        schoolLoginLimiter.reset(currentUserId());
        logger.info("audit_school_account_connected", { actorUserId: currentUserId() });
      } catch (error) {
        schoolLoginLimiter.recordFailure(currentUserId());
        throw error;
      }
      json(res, 200, { ok: true, data });
      return;
    }
    if (url.pathname === "/api/auth/logout" && req.method === "POST") {
      await clearSessionJar();
      logger.info("audit_school_account_disconnected", { actorUserId: currentUserId() });
      json(res, 200, { ok: true, data: await sessionStatus() });
      return;
    }
    if (url.pathname === "/api/auth/validate" && req.method === "POST") {
      const view = await getViewData();
      const jar = await readSessionJar();
      jar.meta.account = view.account || jar.meta.account || null;
      jar.meta.ownerName = view.ownerName || jar.meta.ownerName || null;
      jar.meta.lastValidatedAt = new Date().toISOString();
      await saveSessionJar(jar);
      json(res, 200, { ok: true, data: { view, status: await sessionStatus() } });
      return;
    }

    if (url.pathname === "/api/energy/view") {
      json(res, 200, { ok: true, data: await getViewData() });
      return;
    }
    if (url.pathname === "/api/energy/wallet") {
      json(res, 200, { ok: true, data: await getWallet() });
      return;
    }
    if (url.pathname === "/api/energy/bill/month") {
      const time = url.searchParams.get("time") || defaultMonth();
      json(res, 200, { ok: true, data: await getMonthBill(time), time });
      return;
    }
    if (url.pathname === "/api/energy/bill/yesterday") {
      json(res, 200, { ok: true, data: await getYesterdayBill() });
      return;
    }
    if (url.pathname === "/api/energy/meters") {
      json(res, 200, { ok: true, data: await getMeters() });
      return;
    }
    if (url.pathname === "/api/energy/summary") {
      const time = url.searchParams.get("time") || defaultMonth();
      json(res, 200, { ok: true, data: await getSummary(time) });
      return;
    }
    if (url.pathname === "/api/energy/recharge-link") {
      json(res, 200, { ok: true, data: await getEnergyRechargeLink() });
      return;
    }

    if (url.pathname === "/api/campus/summary") {
      const query = campusQueryFromSearch(url.searchParams);
      json(res, 200, { ok: true, data: await withCampusSessionLock(() => getCampusSummary(query)) });
      return;
    }
    if (url.pathname === "/api/campus/card") {
      const query = campusQueryFromSearch(url.searchParams);
      json(res, 200, { ok: true, data: await withCampusSessionLock(() => getCampusCard(query)) });
      return;
    }
    if (url.pathname === "/api/campus/water") {
      const query = campusQueryFromSearch(url.searchParams);
      json(res, 200, { ok: true, data: await withCampusSessionLock(() => getCampusWater(query)) });
      return;
    }
    if (url.pathname === "/api/campus/accommodation") {
      json(res, 200, { ok: true, data: await withCampusSessionLock(() => getCampusAccommodation()) });
      return;
    }
    if (url.pathname === "/api/campus/water-code/refresh" && req.method === "POST") {
      json(res, 200, { ok: true, data: await withCampusSessionLock(() => refreshCampusWaterCode()) });
      return;
    }
    if (url.pathname === "/api/campus/recharge-link") {
      json(res, 200, { ok: true, data: await withCampusSessionLock(() => getCampusRechargeLink()) });
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

    if (url.pathname === "/api/academic/timetable") {
      const source = academicTimetableSourceFromSearch(url.searchParams);
      json(res, 200, { ok: true, data: await withAcademicSessionLock(() => getAcademicTimetable(source)) });
      return;
    }
    if (url.pathname === "/api/academic/gpa") {
      json(res, 200, { ok: true, data: await withAcademicSessionLock(() => getAcademicGpa()) });
      return;
    }
    if (url.pathname === "/api/academic/free-classrooms") {
      const query = freeClassroomQueryFromSearch(url.searchParams);
      json(res, 200, { ok: true, data: await withAcademicSessionLock(() => getFreeClassrooms(query)) });
      return;
    }
    if (url.pathname === "/api/academic/evaluations" && req.method === "GET") {
      json(res, 200, { ok: true, data: await withAcademicSessionLock(() => getAcademicEvaluations()) });
      return;
    }
    if (url.pathname === "/api/academic/evaluations/auto" && req.method === "GET") {
      json(res, 200, { ok: true, data: academicEvaluationAutoStatus() });
      return;
    }
    if (url.pathname === "/api/academic/evaluations/auto/start" && req.method === "POST") {
      const body = await readBodyJson(req);
      const result = startAcademicEvaluationAutoJob(body);
      logger.info("audit_academic_evaluation_auto_started", { actorUserId: currentUserId(), jobId: result.id });
      json(res, 202, { ok: true, data: result });
      return;
    }
    if (url.pathname === "/api/academic/evaluations/auto/stop" && req.method === "POST") {
      const result = stopAcademicEvaluationAutoJob();
      logger.info("audit_academic_evaluation_auto_stop_requested", { actorUserId: currentUserId(), jobId: result.id || null });
      json(res, 200, { ok: true, data: result });
      return;
    }
    const evaluationMatch = url.pathname.match(/^\/api\/academic\/evaluations\/([^/]+)(?:\/(submit))?$/);
    if (evaluationMatch && req.method === "GET" && !evaluationMatch[2]) {
      const lessonId = decodeURIComponent(evaluationMatch[1]);
      json(res, 200, { ok: true, data: await withAcademicSessionLock(() => getAcademicEvaluationDraft(lessonId)) });
      return;
    }
    if (evaluationMatch && req.method === "POST" && evaluationMatch[2] === "submit") {
      const body = await readBodyJson(req);
      const result = await withAcademicSessionLock(() => submitAcademicEvaluation(body));
      logger.info("audit_academic_evaluation_submitted", { actorUserId: currentUserId() });
      json(res, 200, { ok: true, data: result });
      return;
    }

    throw new HttpError(404, "接口不存在。");
  } catch (error) {
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
}

const serveStatic = createStaticAssetHandler({
  publicDir,
  production: NODE_ENV === "production",
  securityHeaders,
  getRequestId: () => userContextStorage.getStore()?.requestId || "",
  json
});

let academicAutoRefreshRunning = false;
let academicRefreshStartTimer = null;
let academicRefreshInterval = null;

async function hasAcademicRefreshSession() {
  const jar = await readSessionJar();
  return Boolean(
    cookieHeaderFor(jar, ACADEMIC_TIMETABLE_SOURCES.current.payloadUrl)
    || cookieHeaderFor(jar, `${CAS_ORIGIN}/cas/login`)
  );
}

async function refreshAcademicTimetableInBackground(reason) {
  if (academicAutoRefreshRunning) return;
  academicAutoRefreshRunning = true;
  try {
    const users = db.prepare("SELECT * FROM users WHERE disabled = 0 ORDER BY created_at ASC").all();
    for (const user of users) {
      await userContextStorage.run({ requestId: `job-${randomUUID()}`, user }, async () => {
        if (!(await hasAcademicRefreshSession())) return;
        try {
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
        } catch (error) {
          logger.warn("academic_refresh_failed", { reason, userId: user.id, error });
        }
      });
    }
  } finally {
    academicAutoRefreshRunning = false;
  }
}

function startAcademicAutoRefresh() {
  if (!Number.isFinite(ACADEMIC_AUTO_REFRESH_MS) || ACADEMIC_AUTO_REFRESH_MS <= 0) return;
  academicRefreshStartTimer = setTimeout(
    () => refreshAcademicTimetableInBackground("startup"),
    Math.max(0, ACADEMIC_AUTO_REFRESH_START_DELAY_MS)
  );
  academicRefreshInterval = setInterval(() => refreshAcademicTimetableInBackground("interval"), ACADEMIC_AUTO_REFRESH_MS);
}

const server = createServer((req, res) => {
  const requestId = randomUUID();
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
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("service_stopping", { signal });
  if (academicRefreshStartTimer) clearTimeout(academicRefreshStartTimer);
  if (academicRefreshInterval) clearInterval(academicRefreshInterval);
  const forceTimer = setTimeout(() => {
    logger.error("service_shutdown_timeout", { signal });
    server.closeAllConnections?.();
  }, 10_000);
  forceTimer.unref();
  server.close(() => {
    clearTimeout(forceTimer);
    db.close();
    logger.info("service_stopped", { signal });
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
