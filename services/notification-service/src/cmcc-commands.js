// 中国移动新消息通道只支持纯文本收发，没有按钮、卡片或回执，
// 因此「交互」只能靠上行文本匹配规则 + 自动回复文本实现。
const COMMAND_MATCH_TYPES = ['prefix', 'exact', 'contains', 'regex'];

function normalizeMatchType(value) {
  const type = String(value || '').trim().toLowerCase();
  return COMMAND_MATCH_TYPES.includes(type) ? type : 'prefix';
}

function compileMatcher(matchType, pattern) {
  if (matchType === 'exact') return (content) => content === pattern;
  if (matchType === 'contains') return (content) => content.includes(pattern);
  if (matchType === 'regex') {
    let expression;
    try {
      expression = new RegExp(pattern, 'i');
    } catch {
      return null;
    }
    return (content) => expression.test(content);
  }
  const lowered = pattern.toLowerCase();
  return (content) => content.toLowerCase().startsWith(lowered);
}

function matchCmccCommand(rules, text) {
  const content = String(text || '').trim();
  if (!content) return null;
  for (const rule of rules || []) {
    if (!rule || rule.enabled === false) continue;
    const pattern = String(rule.pattern || '').trim();
    if (!pattern) continue;
    const matcher = compileMatcher(normalizeMatchType(rule.matchType), pattern);
    if (matcher && matcher(content)) return rule;
  }
  return null;
}

function renderCommandReply(rule, inbound = {}) {
  const variables = {
    from: String(inbound.from || ''),
    text: String(inbound.content || ''),
    date: new Date().toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' }),
  };
  return String(rule?.reply || '').replace(/\{\{\s*(from|text|date)\s*\}\}/g, (_match, key) => variables[key]);
}

function isHelpRequest(text) {
  return /^\/(help|帮助|指令)(\s|$)/i.test(String(text || '').trim());
}

function buildHelpText(rules) {
  const lines = ['可用指令：'];
  for (const rule of rules || []) {
    if (!rule || rule.enabled === false || !String(rule.pattern || '').trim()) continue;
    const description = String(rule.description || rule.name || '').trim();
    lines.push(`· ${String(rule.pattern).trim()}${description ? ` — ${description}` : ''}`);
  }
  if (lines.length === 1) lines.push('（尚未配置指令规则）');
  lines.push('直接回复上述指令即可收到自动应答。');
  return lines.join('\n');
}

/** 返回命中的指令规则、自动回复内容；未命中时返回 null（不回复）。 */
function resolveCmccAutoReply(rules, inbound) {
  const rule = matchCmccCommand(rules, inbound?.content);
  if (rule) {
    const content = renderCommandReply(rule, inbound);
    return content ? { ruleId: rule.key || rule.id || '', content: content.slice(0, 2048) } : null;
  }
  if (isHelpRequest(inbound?.content)) return { ruleId: '', content: buildHelpText(rules).slice(0, 2048) };
  return null;
}

module.exports = {
  COMMAND_MATCH_TYPES,
  buildHelpText,
  matchCmccCommand,
  isHelpRequest,
  normalizeMatchType,
  renderCommandReply,
  resolveCmccAutoReply,
};
