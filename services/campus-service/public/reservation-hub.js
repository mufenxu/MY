"use strict";

// 「预约」入口的统一外壳：一个导航项 + 两级页签（研讨间 / 图书馆座位）。
// 各子页签的实现分别放在 libroom-page.js、libroom-records-page.js、
// libroom-auto-page.js、library-seat-page.js，只往对应的面板容器里挂载内容。
(function initReservationHub() {
  const nav = document.querySelector(".quick-nav");
  const main = document.querySelector(".main-content");
  if (!nav || !main) return;

  // 旧版本或重复执行可能留下多余的导航项/面板，先归一到「只有一个入口」。
  const navLinks = [...nav.querySelectorAll('a[href="#reservation"]')];
  navLinks.slice(1).forEach((node) => node.remove());
  const existingSections = [...document.querySelectorAll("#reservation")];
  existingSections.slice(1).forEach((node) => node.remove());

  // 已经由本脚本初始化过（脚本被引入两次）就直接返回。
  if (existingSections[0] && existingSections[0].querySelector(".resv-switch")) return;
  // 旧版本留下的残缺面板直接淘汰，按当前结构重建。
  if (existingSections[0]) {
    existingSections[0].remove();
    navLinks[0]?.remove();
  }

  if (!document.querySelector("link[data-resv-hub]")) {
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "./reservation-hub.css?v=20261107-hub-v2";
    stylesheet.dataset.resvHub = "1";
    document.head.append(stylesheet);
  }

  if (!navLinks[0]?.isConnected) {
    const link = document.createElement("a");
    link.href = "#reservation";
    link.innerHTML = '<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v17H5zM8 2v4M16 2v4M8 10h8M8 14h5"/></svg><span>预约</span>';
    nav.insertBefore(link, nav.querySelector('a[href="#campus"]') || null);
  }

  const section = document.createElement("section");
  section.id = "reservation";
  section.className = "app-section resv-section";
  section.innerHTML = `
    <div class="section-head">
      <div>
        <p class="eyebrow">校园空间</p>
        <h2>预约中心</h2>
        <p>研讨间与图书馆座位统一在这里办理，提交结果以学校预约系统记录为准。</p>
      </div>
      <button id="resvReloadButton" class="ghost" type="button">刷新数据</button>
    </div>
    <div class="resv-switch" role="tablist" aria-label="预约类型">
      <button type="button" role="tab" data-resv-view="libroom" aria-selected="true">研讨间</button>
      <button type="button" role="tab" data-resv-view="seat" aria-selected="false" tabindex="-1">图书馆座位</button>
    </div>
    <div id="resvLibroomView" class="resv-view" data-resv-root="libroom">
      <div class="resv-tabs" role="tablist" aria-label="研讨间功能">
        <button type="button" role="tab" data-resv-tab="book" aria-selected="true">单次预约</button>
        <button type="button" role="tab" data-resv-tab="records" aria-selected="false" tabindex="-1">已约空间</button>
        <button type="button" role="tab" data-resv-tab="auto" aria-selected="false" tabindex="-1">自动任务</button>
      </div>
      <div id="resvLibroomBook" class="resv-tabpanel" role="tabpanel" data-resv-panel="book"></div>
      <div id="resvLibroomRecords" class="resv-tabpanel" role="tabpanel" data-resv-panel="records" hidden></div>
      <div id="resvLibroomAuto" class="resv-tabpanel" role="tabpanel" data-resv-panel="auto" hidden></div>
    </div>
    <div id="resvSeatView" class="resv-view" data-resv-root="seat" hidden>
      <div class="resv-tabs" role="tablist" aria-label="图书馆座位功能">
        <button type="button" role="tab" data-resv-tab="query" aria-selected="true">查询座位</button>
        <button type="button" role="tab" data-resv-tab="records" aria-selected="false" tabindex="-1">我的预约</button>
        <button type="button" role="tab" data-resv-tab="waitlist" aria-selected="false" tabindex="-1">候补预约</button>
      </div>
      <div id="resvSeatQuery" class="resv-tabpanel" role="tabpanel" data-resv-panel="query"></div>
      <div id="resvSeatRecords" class="resv-tabpanel" role="tabpanel" data-resv-panel="records" hidden></div>
      <div id="resvSeatWaitlist" class="resv-tabpanel" role="tabpanel" data-resv-panel="waitlist" hidden></div>
    </div>`;
  main.append(section);

  const views = {
    libroom: { root: section.querySelector("#resvLibroomView"), tabs: ["book", "records", "auto"], tab: "book" },
    seat: { root: section.querySelector("#resvSeatView"), tabs: ["query", "records", "waitlist"], tab: "query" }
  };
  let view = "libroom";

  function isRoute() {
    return window.location.hash === "#reservation";
  }

  function activate(nextView, nextTab, reason = "manual") {
    if (!views[nextView]) nextView = "libroom";
    const config = views[nextView];
    if (nextTab && config.tabs.includes(nextTab)) config.tab = nextTab;
    view = nextView;

    Object.entries(views).forEach(([key, item]) => {
      item.root.hidden = key !== nextView;
    });
    section.querySelectorAll("[data-resv-view]").forEach((button) => {
      const active = button.dataset.resvView === nextView;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.tabIndex = active ? 0 : -1;
    });
    config.root.querySelectorAll("[data-resv-tab]").forEach((button) => {
      const active = button.dataset.resvTab === config.tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.tabIndex = active ? 0 : -1;
    });
    config.root.querySelectorAll("[data-resv-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.resvPanel !== config.tab;
    });

    document.dispatchEvent(new CustomEvent("resv:activate", {
      detail: { view: nextView, tab: config.tab, route: isRoute(), reason }
    }));
  }

  section.querySelectorAll("[data-resv-view]").forEach((button) => {
    button.addEventListener("click", () => activate(button.dataset.resvView, "", "view"));
  });
  section.querySelectorAll("[data-resv-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const root = button.closest("[data-resv-root]");
      activate(root?.dataset.resvRoot || "libroom", button.dataset.resvTab, "tab");
    });
  });
  section.querySelector("#resvReloadButton").addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent("resv:refresh", { detail: { view, tab: views[view].tab } }));
  });

  window.HguReservation = Object.freeze({
    activate,
    state: () => ({ view, tab: views[view].tab }),
    isRoute
  });

  function route() {
    if (isRoute()) activate(view, views[view].tab, "route");
  }
  window.addEventListener("hashchange", route);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", route);
  else route();
})();
