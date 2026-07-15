"use strict";

const adminList = document.querySelector("#adminUserList");
const adminFilters = {
  search: document.querySelector("#adminUserSearchInput"),
  role: document.querySelector("#adminUserRoleFilter"),
  status: document.querySelector("#adminUserStatusFilter"),
  clear: document.querySelector("#adminUserFilterClear"),
  empty: document.querySelector("#adminUserFilterEmpty"),
  count: document.querySelector("#adminUserCountText")
};

const adminStats = {
  total: document.querySelector("#adminTotalStat"),
  enabled: document.querySelector("#adminEnabledStat"),
  admin: document.querySelector("#adminAdminStat"),
  unbound: document.querySelector("#adminUnboundStat")
};

function adminRows() {
  return adminList ? [...adminList.querySelectorAll(".admin-user-row")] : [];
}

function adminRowRole(row) {
  return row.querySelector(".admin-user-main span")?.textContent.includes("管理员") ? "admin" : "user";
}

function updateAdminDirectory() {
  const rows = adminRows();
  const query = adminFilters.search?.value.trim().toLocaleLowerCase() || "";
  const role = adminFilters.role?.value || "all";
  const status = adminFilters.status?.value || "all";
  let visible = 0;

  for (const row of rows) {
    const disabled = row.classList.contains("disabled");
    const matches = (!query || row.textContent.toLocaleLowerCase().includes(query))
      && (role === "all" || adminRowRole(row) === role)
      && (status === "all" || (status === "disabled") === disabled);
    row.hidden = !matches;
    if (matches) visible += 1;
  }

  const filtering = Boolean(query || role !== "all" || status !== "all");
  if (adminFilters.count) {
    adminFilters.count.textContent = filtering ? `显示 ${visible} / 共 ${rows.length}` : `${rows.length} 个账号`;
  }
  if (adminFilters.clear) adminFilters.clear.hidden = !filtering;
  if (adminFilters.empty) adminFilters.empty.hidden = !rows.length || visible > 0;

  const disabledCount = rows.filter((row) => row.classList.contains("disabled")).length;
  const adminCount = rows.filter((row) => adminRowRole(row) === "admin").length;
  const unboundCount = rows.filter((row) => row.querySelector(".admin-user-meta")?.textContent.includes("未绑定学号/工号")).length;
  if (adminStats.total) adminStats.total.textContent = rows.length;
  if (adminStats.enabled) adminStats.enabled.textContent = rows.length - disabledCount;
  if (adminStats.admin) adminStats.admin.textContent = adminCount;
  if (adminStats.unbound) adminStats.unbound.textContent = unboundCount;
}

adminFilters.search?.addEventListener("input", updateAdminDirectory);
adminFilters.role?.addEventListener("change", updateAdminDirectory);
adminFilters.status?.addEventListener("change", updateAdminDirectory);
adminFilters.clear?.addEventListener("click", () => {
  adminFilters.search.value = "";
  adminFilters.role.value = "all";
  adminFilters.status.value = "all";
  adminFilters.role.dispatchEvent(new Event("change"));
  adminFilters.status.dispatchEvent(new Event("change"));
  adminFilters.search.focus();
});

if (adminList) new MutationObserver(updateAdminDirectory).observe(adminList, { childList: true });
updateAdminDirectory();
