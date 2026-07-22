"use strict";

(function attachHguFormatters(global) {
function formatValue(value) {
  if (value === undefined || value === null || value === "") return "--";
  return String(value);
}

function formatCardDealTime(item = {}, group = {}) {
  const direct = item.accDate || item.operTime || item.date || item.createTime;
  if (direct && /\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(String(direct))) return String(direct);
  const monthText = String(item.yearMonth || group.month || "").replace(/\D/g, "");
  const dayText = String(item.dealDate || item.day || "").replace(/\D/g, "");
  const timeText = item.dealTime || item.time || "";
  if (monthText.length >= 6 && dayText) {
    const date = `${monthText.slice(0, 4)}-${monthText.slice(4, 6)}-${dayText.padStart(2, "0")}`;
    return `${date}${timeText ? ` ${timeText}` : ""}`;
  }
  return timeText || direct || group.month || "--";
}

function firstMatchingValue(groups, keys, fallback) {
  for (const group of groups) {
    for (const row of group) {
      if (keys.some((key) => row.key.includes(key))) return formatValue(row.value);
    }
  }
  return fallback;
}

function currentMonth(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function defaultSectionTimes() {
  return [
    { section: 1, start: "08:00", end: "08:45" },
    { section: 2, start: "08:50", end: "09:35" },
    { section: 3, start: "09:50", end: "10:35" },
    { section: 4, start: "10:40", end: "11:25" },
    { section: 5, start: "11:30", end: "12:15" },
    { section: 6, start: "14:00", end: "14:45" },
    { section: 7, start: "14:50", end: "15:35" },
    { section: 8, start: "15:50", end: "16:35" },
    { section: 9, start: "16:40", end: "17:25" },
    { section: 10, start: "17:30", end: "18:15" },
    { section: 11, start: "19:00", end: "19:45" },
    { section: 12, start: "19:50", end: "20:35" }
  ];
}

function minutesFromTime(value) {
  const [hour, minute] = String(value || "00:00").split(":").map(Number);
  return (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0);
}

function defaultFreeRoomSections(now = new Date()) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes <= minutesFromTime("09:35")) return [1, 2];
  if (minutes <= minutesFromTime("12:15")) return [3, 4, 5];
  if (minutes <= minutesFromTime("15:35")) return [6, 7];
  if (minutes <= minutesFromTime("18:15")) return [8, 9, 10];
  return [11, 12];
}

function freeSectionPreset(name, now = new Date()) {
  if (name === "morning") return [1, 2, 3, 4, 5];
  if (name === "afternoon") return [6, 7, 8, 9, 10];
  if (name === "evening") return [11, 12];
  return defaultFreeRoomSections(now);
}

function freeSectionRangeText(sections, sectionTimes = defaultSectionTimes()) {
  const list = [...new Set((sections || []).map(Number).filter((item) => item >= 1 && item <= 12))].sort((a, b) => a - b);
  if (!list.length) return "--";
  const bySection = new Map(sectionTimes.map((item) => [Number(item.section), item]));
  const first = bySection.get(list[0]);
  const last = bySection.get(list[list.length - 1]);
  const range = first?.start && last?.end ? ` · ${first.start}-${last.end}` : "";
  return `第${list.join(",")}节${range}`;
}

function formatSyncTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function compactDormitory(value) {
  const text = String(value || "").trim();
  if (!text || text === "--") return "";
  const parts = text.split(/[-－—]/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 4) return parts.slice(-4).join(" · ");
  if (parts.length >= 2) return parts.slice(-2).join(" · ");
  return text;
}

function numberText(value, digits = 2) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : formatValue(value);
}

function money(value) {
  if (value === undefined || value === null || value === "") return "--";
  const number = Number(value);
  return Number.isFinite(number) ? `¥${number.toFixed(2)}` : String(value);
}

function balanceRemark(flag) {
  if (flag === -1) return "已欠费";
  if (flag === 0) return "余额不足";
  if (flag === 1) return "余额正常";
  return "等待同步";
}

function unitFor(catCode) {
  if (catCode === "水表" || catCode === "气表") return "m³";
  if (catCode === "蒸汽表") return "t";
  if (catCode === "时间泵") return "℃";
  return "kWh";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function empty(text) {
  return `<div class="empty">${escapeHtml(text)}</div>`;
}

global.HguFormatters = Object.freeze({
  balanceRemark,
  compactDormitory,
  currentMonth,
  defaultFreeRoomSections,
  defaultSectionTimes,
  empty,
  escapeHtml,
  firstMatchingValue,
  formatCardDealTime,
  formatSyncTime,
  formatValue,
  freeSectionPreset,
  freeSectionRangeText,
  minutesFromTime,
  money,
  numberText,
  unitFor
});
})(globalThis);
