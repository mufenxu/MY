import test from "node:test";
import assert from "node:assert/strict";
import { buildCourseOccurrences, renderAcademicCalendar } from "../src/lib/academic-calendar.js";

const timetable = {
  currentCalendarText: "2025-2026 春 第3周 星期二",
  sectionTimes: [
    { section: 1, start: "08:00", end: "08:45" },
    { section: 2, start: "08:50", end: "09:35" }
  ],
  courses: [{
    courseCode: "COURSE-1",
    sectionNo: "01",
    courseName: "数据结构",
    teacher: "张老师",
    day: 2,
    weeks: [3, 4],
    startSection: 1,
    endSection: 2,
    sectionText: "1-2节",
    location: { display: "综合楼 101" }
  }]
};

test("course occurrences use the current academic week as the calendar anchor", () => {
  const now = new Date("2026-03-17T04:00:00.000Z");
  const events = buildCourseOccurrences(timetable, { now });

  assert.equal(events.length, 2);
  assert.equal(events[0].startAt.toISOString(), "2026-03-17T00:00:00.000Z");
  assert.equal(events[0].endAt.toISOString(), "2026-03-17T01:35:00.000Z");
  assert.equal(events[1].startAt.toISOString(), "2026-03-24T00:00:00.000Z");
});

test("ICS output is stable, UTC based, and escapes course fields", () => {
  const now = new Date("2026-03-17T04:00:00.000Z");
  const calendar = renderAcademicCalendar({
    ...timetable,
    courses: [{ ...timetable.courses[0], courseName: "数据结构,实验" }]
  }, { now });

  assert.match(calendar, /BEGIN:VCALENDAR\r\n/);
  assert.match(calendar, /DTSTART:20260317T000000Z/);
  assert.match(calendar, /SUMMARY:数据结构\\,实验/);
  assert.match(calendar, /LOCATION:综合楼 101/);
  assert.match(calendar, /END:VCALENDAR\r\n$/);
});

test("calendar falls back to term info when the current week text is missing", () => {
  const now = new Date("2026-07-22T04:00:00.000Z");
  const calendar = renderAcademicCalendar({
    ...timetable,
    currentCalendarText: "",
    termText: "2025-2026学年春 · 本学期课表",
    termInfo: {
      academicYear: "2025-2026",
      startYear: "2025",
      endYear: "2026",
      semester: "2",
      season: "春",
      label: "2025-2026学年春"
    },
    courses: [{ ...timetable.courses[0], weeks: [18] }]
  }, { now });

  assert.match(calendar, /BEGIN:VEVENT\r\n/);
  assert.match(calendar, /DTSTART:20260623T000000Z/);
  assert.match(calendar, /SUMMARY:数据结构/);
});
