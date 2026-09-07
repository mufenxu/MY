import {
  ACADEMIC_TIMETABLE_SOURCES,
  DAY_MS,
  JWXS_CURRICULUM_URL,
  JWXS_FREE_CLASSROOM_TODAY_URL,
  JWXS_TIMETABLE_URL
} from "./academic-config.js";
import * as cheerio from "cheerio";
import { HttpError } from "./http.js";

const ACADEMIC_GPA_LABELS = ["GPA", "核心课GPA", "必修课GPA", "学位课GPA"];

const WEEKDAYS = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"];

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

function shanghaiDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function compactAcademicDate(value) {
  const match = String(value || "").match(/^(\d{4})(\d{2})(\d{2})$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function academicDateOffset(startDate, endDate) {
  const epochDay = (value) => {
    const [year, month, day] = value.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  const start = epochDay(startDate);
  const end = epochDay(endDate);
  return Number.isFinite(start) && Number.isFinite(end) ? Math.floor((end - start) / DAY_MS) : null;
}

function parseSchoolCalendarEvents(html) {
  const match = String(html || "").match(/var\s+cal\s*=\s*'([\s\S]*?)';\s*var\s+obj/);
  if (!match) return [];
  let payload = match[1];
  try {
    payload = JSON.parse(payload);
  } catch {
    try {
      payload = JSON.parse(payload.replaceAll("\\'", "'"));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(payload)) return [];
  return payload.map((item) => ({
    startDate: compactAcademicDate(item?.ksrq) || String(item?.ksrq || "").slice(0, 10),
    endDate: compactAcademicDate(item?.jsrq) || String(item?.jsrq || "").slice(0, 10),
    label: normalizeHtmlText(item?.nr)
  })).filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.startDate)
    && /^\d{4}-\d{2}-\d{2}$/.test(item.endDate)
    && item.label);
}

function parseAcademicSchoolCalendar(html, statusPayload = {}, { now = new Date() } = {}) {
  const source = String(html || "");
  const yearMatch = source.match(/var\s+xnxq\s*=\s*["']([^"']+)["']/);
  const seasonMatch = source.match(/var\s+xqm\s*=\s*["']([^"']+)["']/);
  const startMatch = source.match(/var\s+rq\s*=\s*["'](\d{8})["']/);
  const weeksMatch = source.match(/var\s+skzc\s*=\s*["'](\d+)["']/);
  const weekFirstMatch = source.match(/var\s+weekFirst\s*=\s*["'](\d+)["']/);
  if (!yearMatch || !startMatch) return null;

  const academicYear = yearMatch[1];
  const season = seasonMatch?.[1] || "";
  const termStartDate = compactAcademicDate(startMatch[1]);
  const teachingWeeks = Number(weeksMatch?.[1] || 0) || null;
  const weekFirst = Number(weekFirstMatch?.[1] || 1) || 1;
  const termEndDate = termStartDate && teachingWeeks
    ? new Date(`${termStartDate}T00:00:00+08:00`).getTime() + (teachingWeeks * 7 - 1) * DAY_MS
    : null;
  const termEndKey = termEndDate ? shanghaiDateKey(new Date(termEndDate)) : "";
  const today = shanghaiDateKey(now);
  const offset = academicDateOffset(termStartDate, today);
  const currentWeek = offset !== null && offset >= 0 && (!teachingWeeks || offset < teachingWeeks * 7)
    ? Math.floor(offset / 7) + 1
    : null;
  const events = parseSchoolCalendarEvents(source);
  const activeEvent = events.find((item) => item.startDate <= today && today <= item.endDate) || null;
  const statusCode = String(statusPayload?.retString || "").trim();
  const eventIsHoliday = Boolean(activeEvent && /假|节|休/.test(activeEvent.label) && !/补班/.test(activeEvent.label));
  const isHoliday = statusCode === "0" || eventIsHoliday || currentWeek === null;
  return {
    academicYear,
    season,
    termLabel: `${academicYear}学年(${season || ""})`,
    termStartDate,
    termEndDate: termEndKey,
    teachingWeeks,
    weekFirst,
    currentWeek,
    isHoliday,
    statusText: isHoliday ? "假期" : (currentWeek ? `第${currentWeek}教学周` : "校历"),
    statusCode,
    activeEvent,
    events
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

export { normalizeHtmlText, parseAcademicGpaPayload, parseAcademicSchoolCalendar, parseAcademicTimetable, parseAcademicCurriculumPayload, freeClassroomQueryFromSearch, normalizeFreeClassroomPayload };
