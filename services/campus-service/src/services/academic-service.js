import {
  ACADEMIC_TIMETABLE_SOURCES,
  JWXS_ACADEMIC_STATUS_URL,
  JWXS_EVALUATION_INDEX_URL,
  JWXS_EVALUATION_LIST_URL,
  JWXS_EVALUATION_SAVE_URL,
  JWXS_FREE_CLASSROOM_INDEX_URL,
  JWXS_FREE_CLASSROOM_TODAY_URL,
  JWXS_GPA_HOME_URL,
  JWXS_GPA_MORE_URL,
  JWXS_LOGIN_URL,
  JWXS_ORIGIN,
  JWXS_SCHOOL_CALENDAR_URL,
  JWXS_TIMETABLE_URL
} from "../lib/academic-config.js";
import * as cheerio from "cheerio";
import { cookieHeaderFor, mergeSessionJars } from "../lib/session-jar.js";
import { HttpError } from "../lib/http.js";
import {
  normalizeFreeClassroomPayload,
  normalizeHtmlText,
  parseAcademicCurriculumPayload,
  parseAcademicGpaPayload,
  parseAcademicSchoolCalendar,
  parseAcademicTimetable
} from "../lib/academic-parsers.js";
import { randomUUID } from "node:crypto";

export function createAcademicService({
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
  isShuttingDown,
  userContextStorage,
  withAcademicSessionLock,
}) {
  const ACADEMIC_EVALUATION_DRAFT_TTL_MS = 15 * 60 * 1000;

  const ACADEMIC_EVALUATION_WAIT_MS = 46 * 1000;

  const ACADEMIC_EVALUATION_AUTO_SUBJECTIVE_TEXT = String(process.env.HGU_ACADEMIC_EVALUATION_AUTO_SUBJECTIVE_TEXT || "好").trim() || "好";

  const ACADEMIC_EVALUATION_AUTO_MAX_ACTIVE_JOBS = 20;

  const ACADEMIC_EVALUATION_AUTO_MAX_RETAINED_JOBS = 1_000;

  const ACADEMIC_EVALUATION_AUTO_MAX_COURSES = 100;

  const ACADEMIC_EVALUATION_AUTO_MAX_RUNTIME_MS = 90 * 60 * 1000;

  const ACADEMIC_EVALUATION_AUTO_JOB_TTL_MS = 24 * 60 * 60 * 1000;

  const academicEvaluationDrafts = new Map();

  const academicEvaluationAutoJobs = new Map();

  const academicEvaluationAutoTasks = new Set();

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

  async function fetchAcademicSchoolCalendarSnapshot() {
    const jar = await readSessionJar();
    let calendarPage = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      calendarPage = await requestAcademicHtmlWithSimpleRedirects(jar, JWXS_SCHOOL_CALENDAR_URL, {
        referer: JWXS_GPA_HOME_URL
      });
      const verifyUrl = extractWebvpnVerifyUrl(calendarPage.html, calendarPage.finalUrl);
      if (verifyUrl) {
        await ensureWebvpnSession(jar);
        await requestAcademicHtmlWithSimpleRedirects(jar, verifyUrl, { referer: calendarPage.finalUrl });
        continue;
      }
      if (looksLikeAcademicLoginHtml(calendarPage.html, calendarPage.finalUrl)) {
        await activateAcademicSession(jar);
        continue;
      }
      if (!/var\s+xnxq\s*=|var\s+rq\s*=/.test(calendarPage.html)) {
        throw new HttpError(502, "教务系统返回的校历页面结构不符合预期。", {
          finalUrl: calendarPage.finalUrl,
          sample: normalizeHtmlText(calendarPage.html).slice(0, 240)
        });
      }
      break;
    }

    if (!calendarPage || looksLikeAcademicLoginHtml(calendarPage.html, calendarPage.finalUrl)) {
      throw new HttpError(401, "教务系统会话已过期，请重新登录学校账号。");
    }

    let statusPayload = {};
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const page = await requestAcademicJsonOnce(jar, JWXS_ACADEMIC_STATUS_URL, { referer: JWXS_GPA_HOME_URL });
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
        throw new HttpError(page.response.status, `教务状态接口返回 HTTP ${page.response.status}`, {
          sample: normalizeHtmlText(page.text).slice(0, 240)
        });
      }
      try {
        statusPayload = parseJsonLike(page.text);
        break;
      } catch {
        throw new HttpError(502, "教务状态接口返回的 JSON 结构不符合预期。", {
          sample: normalizeHtmlText(page.text).slice(0, 240)
        });
      }
    }

    await saveSessionJar(jar);
    return parseAcademicSchoolCalendar(calendarPage.html, statusPayload);
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

  function purgeAcademicEvaluationAutoJobs(now = Date.now()) {
    for (const [userId, job] of academicEvaluationAutoJobs.entries()) {
      if (activeAcademicEvaluationAutoStatus(job.status)) continue;
      const updatedAt = Date.parse(job.updatedAt || job.finishedAt || job.requestedAt || "");
      if (!Number.isFinite(updatedAt) || now - updatedAt > ACADEMIC_EVALUATION_AUTO_JOB_TTL_MS) {
        academicEvaluationAutoJobs.delete(userId);
      }
    }

    if (academicEvaluationAutoJobs.size <= ACADEMIC_EVALUATION_AUTO_MAX_RETAINED_JOBS) return;
    const terminal = [...academicEvaluationAutoJobs.entries()]
      .filter(([, job]) => !activeAcademicEvaluationAutoStatus(job.status))
      .sort(([, a], [, b]) => Date.parse(a.updatedAt || "") - Date.parse(b.updatedAt || ""));
    while (academicEvaluationAutoJobs.size > ACADEMIC_EVALUATION_AUTO_MAX_RETAINED_JOBS && terminal.length) {
      academicEvaluationAutoJobs.delete(terminal.shift()[0]);
    }
  }

  function academicEvaluationAutoCapacitySnapshot() {
    purgeAcademicEvaluationAutoJobs();
    const jobs = [...academicEvaluationAutoJobs.values()];
    return {
      active: jobs.filter((job) => activeAcademicEvaluationAutoStatus(job.status)).length,
      retained: jobs.length,
      maxActive: ACADEMIC_EVALUATION_AUTO_MAX_ACTIVE_JOBS,
      maxRetained: ACADEMIC_EVALUATION_AUTO_MAX_RETAINED_JOBS,
      terminalTtlMs: ACADEMIC_EVALUATION_AUTO_JOB_TTL_MS,
      maxCoursesPerJob: ACADEMIC_EVALUATION_AUTO_MAX_COURSES,
      maxRuntimeMs: ACADEMIC_EVALUATION_AUTO_MAX_RUNTIME_MS
    };
  }

  function activeAcademicEvaluationAutoJob(userId) {
    purgeAcademicEvaluationAutoJobs();
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
      discoveredPendingCount: job.discoveredPendingCount ?? job.total,
      truncatedCount: job.truncatedCount || 0,
      deadlineAt: job.deadlineAt || null,
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
    purgeAcademicEvaluationAutoJobs();
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
      if (Date.now() >= job.deadlineMs) {
        job.status = "failed";
        job.error = "自动完成评估任务超过最大运行时长，已停止。";
        return false;
      }
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
    if (isShuttingDown()) return;
    try {
      const latest = await withAcademicSessionLock(() => getAcademicEvaluations());
      job.finalPendingCount = latest.pendingCount;
    } catch (error) {
      logger.warn("academic_evaluation_auto_final_refresh_failed", { userId: job.userId, jobId: job.id, error });
    }
  }

  async function runAcademicEvaluationAutoJob(job) {
    if (job.cancelRequested || isShuttingDown()) {
      job.status = "canceled";
      job.startedAt = nowIso();
      job.finishedAt = job.startedAt;
      touchAcademicEvaluationAutoJob(job);
      return;
    }
    job.status = "running";
    job.startedAt = nowIso();
    job.deadlineMs = Date.now() + ACADEMIC_EVALUATION_AUTO_MAX_RUNTIME_MS;
    job.deadlineAt = new Date(job.deadlineMs).toISOString();
    touchAcademicEvaluationAutoJob(job);

    const list = await withAcademicSessionLock(() => getAcademicEvaluations());
    const discoveredPending = (Array.isArray(list.records) ? list.records : []).filter((record) => !record.completed);
    const pending = discoveredPending.slice(0, ACADEMIC_EVALUATION_AUTO_MAX_COURSES);
    job.discoveredPendingCount = discoveredPending.length;
    job.truncatedCount = Math.max(0, discoveredPending.length - pending.length);
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
      if (Date.now() >= job.deadlineMs) {
        job.status = "failed";
        job.error = "自动完成评估任务超过最大运行时长，已停止。";
        entry.status = "failed";
        entry.message = job.error;
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
          entry.status = job.cancelRequested ? "canceled" : "failed";
          entry.message = job.cancelRequested ? "任务已停止。" : (job.error || "任务未能继续执行。");
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
    const task = new Promise((resolveTask) => {
      setImmediate(() => resolveTask(
        userContextStorage.run({ requestId: `evaluation-auto-${job.id}`, user }, () => runAcademicEvaluationAutoJob(job))
      ));
    });
    academicEvaluationAutoTasks.add(task);
    task.catch((error) => {
      job.status = job.cancelRequested ? "canceled" : "failed";
      job.error = error.message || "自动完成评估失败。";
      job.finishedAt = nowIso();
      touchAcademicEvaluationAutoJob(job);
      logger.warn("academic_evaluation_auto_failed", { userId: job.userId, jobId: job.id, error });
    }).finally(() => academicEvaluationAutoTasks.delete(task));
  }

  function startAcademicEvaluationAutoJob(input = {}) {
    const user = currentUser();
    const existing = activeAcademicEvaluationAutoJob(user.id);
    if (existing) return { ...academicEvaluationAutoJobSnapshot(existing), reused: true };
    const capacity = academicEvaluationAutoCapacitySnapshot();
    const replacesRetainedJob = academicEvaluationAutoJobs.has(user.id);
    if (capacity.active >= capacity.maxActive || (capacity.retained >= capacity.maxRetained && !replacesRetainedJob)) {
      throw new HttpError(503, "自动完成评估任务已达到容量上限，请稍后重试。", null, "EVALUATION_JOB_CAPACITY_EXCEEDED");
    }

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
      discoveredPendingCount: 0,
      truncatedCount: 0,
      deadlineAt: null,
      deadlineMs: 0,
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
    const row = await repository.getAcademicCache(currentUserId(), source.key);
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
    await repository.upsertAcademicCache(
      currentUserId(),
      source.key,
      sensitiveJson.encode(data),
      nowIso()
    );
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
      let schoolCalendar = null;
      try {
        schoolCalendar = await fetchAcademicSchoolCalendarSnapshot();
      } catch (calendarError) {
        logger.warn("academic_school_calendar_sync_failed", {
          userId: currentUserId(),
          error: calendarError
        });
      }
      const schoolCalendarText = schoolCalendar
        ? `${schoolCalendar.academicYear} ${schoolCalendar.season} ${schoolCalendar.currentWeek ? `第${schoolCalendar.currentWeek}周` : schoolCalendar.statusText}`
        : parsed.currentCalendarText;
      parsed = {
        ...parsed,
        currentCalendarText: schoolCalendarText,
        schoolCalendar,
        termInfo: parsed.termInfo && schoolCalendar
          ? {
            ...parsed.termInfo,
            startDate: schoolCalendar.termStartDate,
            endDate: schoolCalendar.termEndDate,
            teachingWeeks: schoolCalendar.teachingWeeks,
            weekFirst: schoolCalendar.weekFirst
          }
          : parsed.termInfo,
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
  return {
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
  };
}
