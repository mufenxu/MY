import { createHash } from "node:crypto";

const DAY_MS = 24 * 60 * 60 * 1000;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DEFAULT_WINDOW_PAST_DAYS = 90;
const DEFAULT_WINDOW_FUTURE_DAYS = 180;

function mondayOnOrAfter(year, monthIndex, day) {
  const date = new Date(Date.UTC(year, monthIndex, day));
  const dayOfWeek = date.getUTCDay();
  const offset = (8 - dayOfWeek) % 7;
  return localEpochDay({ year, month: monthIndex + 1, day }) + offset;
}

function inferredTermStartEpochDay(termInfo) {
  const startYear = Number(termInfo?.startYear);
  const endYear = Number(termInfo?.endYear);
  const semester = String(termInfo?.semester || "");
  const season = String(termInfo?.season || "");
  if (semester === "1" || season === "秋") {
    return Number.isFinite(startYear) ? mondayOnOrAfter(startYear, 8, 1) : null;
  }
  if (semester === "2" || season === "春") {
    return Number.isFinite(endYear) ? mondayOnOrAfter(endYear, 1, 20) : null;
  }
  return null;
}

function parseTime(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

function shanghaiDateParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day)
  };
}

function localEpochDay({ year, month, day }) {
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

function dateFromLocalEpochDay(epochDay, time) {
  return new Date((epochDay * DAY_MS) + (time.hours * 60 + time.minutes) * 60_000 - SHANGHAI_OFFSET_MS);
}

function currentAcademicWeek(timetable, { now = new Date() } = {}) {
  const text = `${timetable?.currentCalendarText || ""} ${timetable?.termText || ""}`;
  const match = /第\s*(\d+)\s*周/.exec(text);
  if (match) return Number(match[1]);

  const termStart = inferredTermStartEpochDay(timetable?.termInfo);
  if (!Number.isFinite(termStart)) return 0;
  const currentEpochDay = localEpochDay(shanghaiDateParts(now));
  return Math.max(1, Math.floor((currentEpochDay - termStart) / 7) + 1);
}

function courseTimeRange(course, sectionTimes = []) {
  const direct = String(course?.timeRange || "").match(/(\d{1,2}:\d{2})\s*[-~至]\s*(\d{1,2}:\d{2})/);
  if (direct) {
    const start = parseTime(direct[1]);
    const end = parseTime(direct[2]);
    if (start && end) return { start, end };
  }

  const bySection = new Map(sectionTimes.map((item) => [Number(item.section), item]));
  const first = bySection.get(Number(course?.startSection));
  const last = bySection.get(Number(course?.endSection || course?.startSection));
  const start = parseTime(first?.start);
  const end = parseTime(last?.end);
  return start && end ? { start, end } : null;
}

function courseWeeks(course, fallbackWeek) {
  const values = Array.isArray(course?.weeks) ? course.weeks : [];
  const weeks = [...new Set(values.map(Number).filter((week) => Number.isInteger(week) && week > 0))];
  return weeks.length ? weeks : (fallbackWeek > 0 ? [fallbackWeek] : []);
}

export function buildCourseOccurrences(timetable, {
  now = new Date(),
  from = new Date(now.getTime() - DEFAULT_WINDOW_PAST_DAYS * DAY_MS),
  to = new Date(now.getTime() + DEFAULT_WINDOW_FUTURE_DAYS * DAY_MS)
} = {}) {
  const currentWeek = currentAcademicWeek(timetable, { now });
  if (!currentWeek) return [];

  const currentEpochDay = localEpochDay(shanghaiDateParts(now));
  const utcDay = new Date(currentEpochDay * DAY_MS).getUTCDay();
  const currentMonday = currentEpochDay - ((utcDay + 6) % 7);
  const sectionTimes = Array.isArray(timetable?.sectionTimes) ? timetable.sectionTimes : [];
  const courses = Array.isArray(timetable?.courses) ? timetable.courses : [];
  const occurrences = [];

  for (const course of courses) {
    const day = Number(course?.day);
    const time = courseTimeRange(course, sectionTimes);
    if (!Number.isInteger(day) || day < 1 || day > 7 || !time) continue;

    for (const week of courseWeeks(course, currentWeek)) {
      const eventEpochDay = currentMonday + ((week - currentWeek) * 7) + day - 1;
      const startAt = dateFromLocalEpochDay(eventEpochDay, time.start);
      const endAt = dateFromLocalEpochDay(eventEpochDay, time.end);
      if (endAt < from || startAt > to) continue;
      const identity = [
        course.courseCode,
        course.sectionNo,
        course.courseName,
        week,
        day,
        course.startSection,
        course.endSection
      ].join("|");
      occurrences.push({
        id: createHash("sha256").update(identity).digest("hex").slice(0, 32),
        courseName: String(course.courseName || "未命名课程"),
        teacher: String(course.teacher || ""),
        location: String(course.location?.display || course.location || ""),
        sectionText: String(course.sectionText || ""),
        week,
        day,
        startAt,
        endAt
      });
    }
  }

  return occurrences.sort((left, right) => left.startAt - right.startAt || left.courseName.localeCompare(right.courseName, "zh-CN"));
}

function escapeIcs(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function icsTimestamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function foldIcsLine(line) {
  const characters = [...line];
  const lines = [];
  while (characters.length > 73) {
    lines.push(characters.splice(0, 73).join(""));
  }
  lines.push(characters.join(""));
  return lines.join("\r\n ");
}

export function renderAcademicCalendar(timetable, { now = new Date(), calendarName = "我的课程表" } = {}) {
  const events = buildCourseOccurrences(timetable, { now });
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "PRODID:-//MY Platform//Campus Calendar//ZH-CN",
    `X-WR-CALNAME:${escapeIcs(calendarName)}`,
    "X-WR-TIMEZONE:Asia/Shanghai"
  ];

  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.id}@campus.my-platform`,
      `DTSTAMP:${icsTimestamp(now)}`,
      `DTSTART:${icsTimestamp(event.startAt)}`,
      `DTEND:${icsTimestamp(event.endAt)}`,
      `SUMMARY:${escapeIcs(event.courseName)}`,
      `LOCATION:${escapeIcs(event.location)}`,
      `DESCRIPTION:${escapeIcs([event.teacher, `第${event.week}周`, event.sectionText].filter(Boolean).join(" · "))}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

export { currentAcademicWeek };
