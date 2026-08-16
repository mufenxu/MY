export const NAV_GROUPS = Object.freeze([
  {
    id: 'overview',
    label: '首页',
    defaultView: 'all',
    views: [{ id: 'all', label: '首页' }],
  },
  {
    id: 'services',
    label: '服务',
    defaultView: 'miniapp',
    views: [
      { id: 'miniapp', label: '业务入口' },
      { id: 'service', label: '服务状态' },
      // 保留历史名称，避免外部应用深链和现有接入文档失效。
      { id: 'external-apps', label: '外部应用' },
    ],
  },
  {
    id: 'observability',
    label: '运行情况',
    defaultView: 'monitoring',
    views: [
      { id: 'monitoring', label: '运行趋势' },
      { id: 'incidents', label: '问题处理' },
      { id: 'diagnostics', label: '连接检查' },
    ],
  },
  {
    id: 'execution',
    // 保留旧入口，避免历史链接失效；单人日常不需要在侧栏展示审批/发布工具。
    visible: false,
    label: '工作工具',
    defaultView: 'tasks',
    views: [
      { id: 'tasks', label: '待办任务' },
      { id: 'releases', label: '更新记录' },
      { id: 'configuration', label: '运行设置' },
      { id: 'backup', label: '备份恢复' },
    ],
  },
  {
    id: 'capabilities',
    label: '工具',
    defaultView: 'notification',
    views: [
      { id: 'notification', label: '消息通知' },
      { id: 'automation', label: '自动任务' },
    ],
  },
  {
    id: 'security',
    // 单人也需要修改密码、管理 MFA 和撤销会话，因此保留一个清晰的设置入口。
    label: '设置',
    defaultView: 'security',
    views: [{ id: 'security', label: '账号安全' }],
  },
]);

const VIEW_GROUPS = new Map(
  NAV_GROUPS.flatMap((group) => group.views.map((view) => [view.id, group])),
);

export function getNavigationGroup(viewId) {
  return VIEW_GROUPS.get(viewId) || NAV_GROUPS[0];
}

export function resolveConsoleView(viewId) {
  return VIEW_GROUPS.has(viewId) ? viewId : NAV_GROUPS[0].defaultView;
}

export function isPlainInternalNavigation(event, url) {
  const target = String(url || '');
  return target.startsWith('/')
    && !target.startsWith('//')
    && event.button === 0
    && !event.altKey
    && !event.ctrlKey
    && !event.metaKey
    && !event.shiftKey;
}
