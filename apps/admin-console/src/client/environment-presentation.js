const STATUS_META = Object.freeze({
  valid: { label: '配置有效', tone: 'healthy' },
  missing: { label: '缺少配置', tone: 'failed' },
  invalid: { label: '配置错误', tone: 'failed' },
  inactive: { label: '当前未启用', tone: 'muted' },
  unused: { label: '当前未使用', tone: 'muted' },
});

export function environmentStatusMeta(status) {
  return STATUS_META[status] || { label: status || '未知状态', tone: 'muted' };
}

export function environmentConclusion(summary = {}) {
  if (!summary.available) return '环境诊断暂不可用';
  const attention = Number(summary.missing || 0) + Number(summary.invalid || 0) + Number(summary.verificationFailed || 0);
  if (summary.state === 'attention') return `${attention} 项配置需要处理`;
  if (summary.state === 'restart_required') return `${Number(summary.restartRequired || 0)} 项配置等待服务重启`;
  return '环境配置正常';
}

export function filterEnvironmentVariables(variables, { query = '', group = 'all', status = 'all' } = {}) {
  const normalized = String(query || '').trim().toLocaleLowerCase('zh-CN');
  return (variables || []).filter((variable) => {
    const attention = ['missing', 'invalid'].includes(variable.status) || variable.verificationStatus === 'failed';
    const statusMatches = status === 'all' || variable.status === status || (status === 'attention' && attention)
      || (status === 'restart_required' && variable.runtimeStatus === 'restart_required');
    const groupMatches = group === 'all' || variable.group === group;
    const haystack = [variable.key, variable.description, variable.groupLabel, ...(variable.services || [])]
      .join(' ').toLocaleLowerCase('zh-CN');
    return statusMatches && groupMatches && (!normalized || haystack.includes(normalized));
  });
}
