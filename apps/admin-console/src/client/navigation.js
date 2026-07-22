export const NAV_GROUPS = Object.freeze([
  {
    id: 'overview',
    label: '运行总览',
    defaultView: 'all',
    views: [{ id: 'all', label: '运行总览' }],
  },
  {
    id: 'services',
    label: '服务目录',
    defaultView: 'miniapp',
    views: [
      { id: 'miniapp', label: '应用' },
      { id: 'service', label: '基础服务' },
    ],
  },
  {
    id: 'observability',
    label: '可观测性',
    defaultView: 'monitoring',
    views: [
      { id: 'monitoring', label: '监控趋势' },
      { id: 'incidents', label: '告警事件' },
      { id: 'diagnostics', label: '链路诊断' },
    ],
    externalAction: { href: '/status', label: '公开状态页' },
  },
  {
    id: 'execution',
    label: '执行中心',
    defaultView: 'tasks',
    views: [
      { id: 'tasks', label: '任务中心' },
      { id: 'releases', label: '发布管理' },
      { id: 'configuration', label: '配置变更' },
      { id: 'backup', label: '数据灾备' },
    ],
  },
  {
    id: 'capabilities',
    label: '平台能力',
    defaultView: 'notification',
    views: [
      { id: 'notification', label: '通知服务' },
      { id: 'automation', label: '自动化' },
    ],
  },
  {
    id: 'security',
    label: '安全中心',
    defaultView: 'security',
    views: [{ id: 'security', label: '安全中心' }],
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
