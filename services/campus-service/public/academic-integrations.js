"use strict";

(function attachAcademicIntegrations(global) {
  function create({ nodes, state, api, appBase, copyText, confirmDialog, setNotice }) {
    function calendarUrl(calendar) {
      if (!calendar?.enabled) return "";
      const path = appBase ? calendar.platformPath : calendar.path;
      return path ? new URL(path, global.location.origin).href : "";
    }

    function render() {
      if (!nodes.academicIntegrationStatus) return;
      const settings = state.academicIntegrations || {};
      const calendar = settings.calendar || {};
      const reminder = settings.reminder || {};
      const url = calendarUrl(calendar);
      nodes.academicCalendarUrlInput.value = url;
      nodes.academicCalendarRotateButton.textContent = calendar.enabled ? "更新订阅地址" : "生成订阅";
      nodes.academicCalendarCopyButton.disabled = !url;
      nodes.academicCalendarDisableButton.disabled = !calendar.enabled;
      nodes.academicReminderEnabledInput.checked = Boolean(reminder.enabled);
      nodes.academicReminderRecipientInput.value = reminder.recipientId || "";
      nodes.academicReminderLeadSelect.value = String(reminder.leadMinutes || 15);

      if (!state.academicIntegrations) {
        nodes.academicIntegrationStatus.textContent = "尚未读取设置";
      } else if (!reminder.deliveryConfigured) {
        nodes.academicIntegrationStatus.textContent = "日历可用 · 通知服务未配置";
      } else {
        const enabled = [calendar.enabled ? "日历" : "", reminder.enabled ? "提醒" : ""].filter(Boolean);
        nodes.academicIntegrationStatus.textContent = enabled.length ? `${enabled.join("、")}已启用` : "尚未启用";
      }
    }

    async function load() {
      try {
        state.academicIntegrations = await api("/api/academic/integrations");
      } catch (error) {
        console.warn("Load academic integrations failed", error);
        state.academicIntegrations = null;
      }
      render();
    }

    async function copy(successMessage = "课程日历订阅地址已复制。") {
      const url = nodes.academicCalendarUrlInput.value.trim();
      if (url) await copyText(url, successMessage);
    }

    async function rotate() {
      if (state.academicIntegrations?.calendar?.enabled) {
        const confirmed = await confirmDialog({
          title: "更新课程日历地址",
          message: "更新后旧地址会立即失效，已订阅的设备需要改用新地址。",
          confirmText: "更新地址"
        });
        if (!confirmed) return;
      }
      nodes.academicCalendarRotateButton.disabled = true;
      try {
        state.academicIntegrations = await api("/api/academic/calendar/rotate", { method: "POST" });
        render();
        await copy("订阅地址已生成并复制。");
      } catch (error) {
        setNotice(error.message || "课程日历地址生成失败。", "error");
      } finally {
        nodes.academicCalendarRotateButton.disabled = false;
      }
    }

    async function disable() {
      const confirmed = await confirmDialog({
        title: "停用课程日历订阅",
        message: "所有使用当前地址的日历将无法继续更新课程安排。",
        confirmText: "停用订阅",
        tone: "danger"
      });
      if (!confirmed) return;
      nodes.academicCalendarDisableButton.disabled = true;
      try {
        state.academicIntegrations = await api("/api/academic/calendar", { method: "DELETE" });
        setNotice("课程日历订阅已停用。", "ok");
      } catch (error) {
        setNotice(error.message || "停用课程日历失败。", "error");
      } finally {
        render();
      }
    }

    async function saveReminder() {
      const body = {
        enabled: nodes.academicReminderEnabledInput.checked,
        recipientId: nodes.academicReminderRecipientInput.value.trim(),
        leadMinutes: Number(nodes.academicReminderLeadSelect.value)
      };
      nodes.academicReminderSaveButton.disabled = true;
      try {
        const reminder = await api("/api/academic/reminder", { method: "PUT", body });
        state.academicIntegrations = { ...(state.academicIntegrations || {}), reminder };
        render();
        setNotice(body.enabled ? "课前提醒已启用。" : "课前提醒已停用。", "ok");
      } catch (error) {
        setNotice(error.message || "课前提醒设置保存失败。", "error");
      } finally {
        nodes.academicReminderSaveButton.disabled = false;
      }
    }

    return { copy, disable, load, render, rotate, saveReminder };
  }

  global.HguAcademicIntegrations = Object.freeze({ create });
})(window);
