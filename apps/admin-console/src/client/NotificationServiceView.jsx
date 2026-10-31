import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BellRing,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileText,
  Image as ImageIcon,
  Inbox,
  LoaderCircle,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  ServerCog,
  ShieldCheck,
  Smartphone,
  Terminal,
  Upload,
  UserRound,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { requestJson } from './api.js';
import NotificationApiAccess from './NotificationApiAccess.jsx';
import { ConfirmDialog, SegmentedTabs, SelectControl } from './UiControls.jsx';

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'success', label: '发送成功' },
  { value: 'failed', label: '发送失败' },
  { value: 'pending', label: '发送中' },
];
const CALLER_OPTIONS = [
  { value: '', label: '全部调用方' },
  { value: 'admin-console', label: '统一控制台' },
  { value: 'platform-api', label: '平台网关' },
  { value: 'core-api', label: '核心服务' },
  { value: 'external-api', label: '外部 API' },
  { value: 'cmcc-inbound', label: '新消息自动回复' },
];
const TYPE_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'text', label: '文本（兼容微信）' },
  { value: 'markdown', label: 'Markdown（仅企业微信）' },
  { value: 'textcard', label: '文本卡片' },
  { value: 'news', label: '图文' },
  { value: 'image', label: '图片（新消息）' },
  { value: 'audio', label: '音频（新消息）' },
  { value: 'video', label: '视频（新消息）' },
  { value: 'file', label: '文件（新消息）' },
];
const TARGET_OPTIONS = [
  { value: '', label: '全部目标' },
  { value: 'user', label: '企业微信用户' },
  { value: 'party', label: '部门' },
  { value: 'tag', label: '标签' },
  { value: 'all', label: '全员' },
  { value: 'phone', label: '手机号（新消息）' },
];
const TEST_CHANNEL_OPTIONS = [
  { value: 'wecom', label: '企业微信' },
  { value: 'app', label: 'Android App' },
];
const CMCC_MEDIA_OPTIONS = [
  { value: 'IMAGE', label: '图片 IMAGE' },
  { value: 'AUDIO', label: '音频 AUDIO' },
  { value: 'VIDEO', label: '视频 VIDEO' },
  { value: 'FILE', label: '文件 FILE' },
  { value: 'TEXT', label: '文本文件 TEXT' },
];
const CMCC_COMMAND_MATCH_OPTIONS = [
  { value: 'prefix', label: '前缀匹配' },
  { value: 'exact', label: '完全一致' },
  { value: 'contains', label: '包含关键字' },
  { value: 'regex', label: '正则表达式' },
];
const CMCC_REPLY_STATUS_OPTIONS = [
  { value: '', label: '全部回复状态' },
  { value: 'sent', label: '已自动回复' },
  { value: 'failed', label: '回复失败' },
  { value: 'skipped', label: '未匹配规则' },
];
const CMCC_MEDIA_FILTER_OPTIONS = [
  { value: '', label: '全部上行类型' },
  { value: 'IMAGE', label: '图片' },
  { value: 'AUDIO', label: '音频' },
  { value: 'VIDEO', label: '视频' },
  { value: 'FILE', label: '文件' },
];
const EMPTY_CMCC_COMMAND_FORM = { key: '', name: '', description: '', matchType: 'prefix', pattern: '', reply: '', enabled: true };
const APP_PRIORITY_OPTIONS = [
  { value: 'normal', label: '普通' },
  { value: 'high', label: '重要' },
  { value: 'critical', label: '紧急' },
  { value: 'low', label: '低优先级' },
];
const EMPTY_APP_OVERVIEW = {
  userId: '',
  total: 0,
  unread: 0,
  devices: { total: 0, pollOnly: 0, pushReady: 0, lastSeenAt: null },
  registeredUsers: [],
  items: [],
};

function roleAtLeast(role, required) {
  return ({ viewer: 1, operator: 2, super_admin: 3 }[role] || 0) >= ({ viewer: 1, operator: 2, super_admin: 3 }[required] || 0);
}

function formatDateTime(value) {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '--' : date.toLocaleString('zh-CN', { hour12: false });
}

function callerLabel(value) {
  return {
    'admin-console': '统一控制台',
    'platform-api': '平台网关',
    'core-api': '核心服务',
    'external-api': '外部 API',
    'cmcc-inbound': '新消息自动回复',
  }[value] || value || '--';
}

function typeLabel(value) {
  return {
    text: '文本（兼容微信）',
    markdown: 'Markdown（仅企业微信）',
    textcard: '文本卡片',
    news: '图文',
    image: '图片（新消息）',
    audio: '音频（新消息）',
    video: '视频（新消息）',
    file: '文件（新消息）',
  }[value] || value || '--';
}

function cmccMediaLabel(value) {
  return { IMAGE: '图片', AUDIO: '音频', VIDEO: '视频', FILE: '文件', TEXT: '文本文件' }[value] || value || '--';
}

function cmccReplyStatusMeta(value) {
  return {
    sent: { label: '已自动回复', state: 'success' },
    failed: { label: '回复失败', state: 'failed' },
    skipped: { label: '未匹配规则', state: 'pending' },
  }[value] || { label: value || '--', state: 'pending' };
}

function cmccMatchTypeLabel(value) {
  return { prefix: '前缀匹配', exact: '完全一致', contains: '包含关键字', regex: '正则表达式' }[value] || value || '--';
}

function priorityLabel(value) {
  return { low: '低优先级', normal: '普通', high: '重要', critical: '紧急' }[value] || value || '--';
}

function maskPhoneValue(value) {
  const digits = String(value || '');
  return /^\d{11}$/.test(digits) ? `${digits.slice(0, 3)}****${digits.slice(7)}` : digits;
}

function targetLabel(delivery) {
  const prefix = { user: '用户', party: '部门', tag: '标签', all: '全员', phone: '手机号' }[delivery.targetType] || '目标';
  if (delivery.targetType === 'all') return prefix;
  const value = delivery.targetType === 'phone' ? maskPhoneValue(delivery.targetValue) : delivery.targetValue;
  return `${prefix} ${value || '--'}`;
}

const DELIVERY_META = {
  success: { label: '成功', tone: 'ok' },
  failed: { label: '失败', tone: 'danger' },
  pending: { label: '发送中', tone: 'info' },
};

function DeliveryTag({ value }) {
  const meta = DELIVERY_META[value] || { label: value || '--', tone: 'neutral' };
  return <span className={`tag tone-${meta.tone}`}>{meta.label}</span>;
}

function ReadTag({ readAt }) {
  return <span className={`tag tone-${readAt ? 'ok' : 'neutral'}`}>{readAt ? '已读' : '未读'}</span>;
}

function Feedback({ error, message }) {
  if (!error && !message) return null;
  return (
    <div className={`alert ${error ? 'is-error' : 'is-ok'}`} role={error ? 'alert' : 'status'}>
      {error ? <CircleAlert size={15} /> : <CheckCircle2 size={15} />}
      <span>{error || message}</span>
    </div>
  );
}

function StatusRow({ ready, label, detail }) {
  return (
    <div className={`status-row ${ready ? 'is-ok' : 'is-warn'}`}>
      <span className="status-row-icon" aria-hidden="true">{ready ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}</span>
      <span className="cell-stack"><strong>{label}</strong><small>{detail}</small></span>
    </div>
  );
}

export default function NotificationServiceView({ session }) {
  const [tab, setTab] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [deliveries, setDeliveries] = useState({ items: [], page: 1, pageSize: 20, total: 0 });
  const [filters, setFilters] = useState({ status: '', caller: '', msgType: '', targetType: '' });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    channel: 'wecom',
    msgType: 'text',
    touser: '',
    appUserId: '',
    appTitle: 'Android App 通知测试',
    appPriority: 'high',
    content: '',
    cmccContent: '',
    cmccTitle: '中国移动新消息测试',
  });
  const [appFilter, setAppFilter] = useState('');
  const [appOverviewUser, setAppOverviewUser] = useState('');
  const [appOverview, setAppOverview] = useState(EMPTY_APP_OVERVIEW);
  const [templates, setTemplates] = useState([]);
  const [jobs, setJobs] = useState({ items: [], page: 1, pageSize: 20, total: 0 });
  const [templateForm, setTemplateForm] = useState({ key: '', name: '', description: '', msgType: 'text', content: '', enabled: true });
  const [jobForm, setJobForm] = useState({ templateKey: '', touser: '', scheduledAt: '', dedupeKey: '', variables: '{}' });
  const [preferenceForm, setPreferenceForm] = useState({ targetId: '', enabled: true, quietStart: '22:00', quietEnd: '07:00' });
  const [cmccMessages, setCmccMessages] = useState({ items: [], page: 1, pageSize: 20, total: 0 });
  const [cmccFilters, setCmccFilters] = useState({ mediaType: '', replyStatus: '' });
  const [cmccCommands, setCmccCommands] = useState([]);
  const [cmccMediaForm, setCmccMediaForm] = useState({ mediaType: 'IMAGE', content: '', mediaUrl: '', fileBase64: '', fileName: '', mimeType: '' });
  const [cmccCommandForm, setCmccCommandForm] = useState(EMPTY_CMCC_COMMAND_FORM);
  const [pendingAction, setPendingAction] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const canOperate = roleAtLeast(session.user?.role, 'operator');
  const canManageCommands = session.user?.role === 'super_admin';

  const load = useCallback(async ({ quiet = false, appUser = appOverviewUser } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: '20' });
      const appQuery = new URLSearchParams({ limit: '12' });
      for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
      if (appUser) appQuery.set('userId', appUser);
      const cmccQuery = new URLSearchParams({ page: '1', pageSize: '20' });
      for (const [key, value] of Object.entries(cmccFilters)) if (value) cmccQuery.set(key, value);
      const [overviewResult, deliveryResult, templateResult, jobResult, appResult, cmccMessageResult, cmccCommandResult] = await Promise.all([
        requestJson('/api/notifications/overview'),
        requestJson(`/api/notifications/deliveries?${query}`),
        requestJson('/api/notifications/templates'),
        requestJson('/api/notifications/jobs?page=1&pageSize=20'),
        requestJson(`/api/notifications/app/overview?${appQuery}`),
        requestJson(`/api/notifications/cmcc/messages?${cmccQuery}`),
        requestJson('/api/notifications/cmcc/commands'),
      ]);
      setOverview(overviewResult);
      setDeliveries(deliveryResult);
      setTemplates(templateResult.items || []);
      setJobs(jobResult);
      setAppOverview(appResult || EMPTY_APP_OVERVIEW);
      setCmccMessages(cmccMessageResult);
      setCmccCommands(cmccCommandResult.items || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [appOverviewUser, cmccFilters, filters, page]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(deliveries.total / deliveries.pageSize));
  const history = overview?.history || {};
  const cmcc = overview?.cmcc || {};
  const cmccStatus = cmcc.status || {};
  const cmccStats = cmccStatus.stats || {};
  const cmccInbound = cmcc.inbound || {};
  const cmccTargetMasked = cmcc.sessionSenderMasked || cmcc.recipientMasked || '';
  const cmccSessionActive = Boolean(cmcc.sessionSenderMasked);
  const recent = deliveries.items.slice(0, 5);
  const isAppTest = form.channel === 'app';
  const contentLimit = isAppTest ? 500 : form.msgType === 'markdown' ? 4096 : 2048;
  const canSubmitTest = isAppTest
    ? Boolean(canOperate && appOverview.registeredUsers?.some((user) => user.userId === form.appUserId.trim()) && form.appTitle.trim() && form.content.trim())
    : Boolean(canOperate && form.touser.trim() && form.touser.trim() !== '@all' && !form.touser.includes('|') && form.content.trim());
  const preview = useMemo(() => form.content.trim() || '消息预览', [form.content]);
  const appDevices = appOverview?.devices || EMPTY_APP_OVERVIEW.devices;
  const appItems = appOverview?.items || [];
  const registeredAppUsers = appOverview.registeredUsers || [];
  const appUserOptions = useMemo(() => [
    { value: '', label: registeredAppUsers.length ? '选择已注册用户' : '暂无已注册用户', disabled: true },
    ...registeredAppUsers.map((user) => ({
      value: user.userId,
      label: `${user.userId} · ${user.pushReady > 0 ? '原生推送' : '收件箱轮询'}`,
    })),
  ], [registeredAppUsers]);
  const appFilterOptions = useMemo(() => [
    { value: '', label: '全部平台用户' },
    ...appUserOptions.slice(1),
  ], [appUserOptions]);
  const defaultAppUserId = appOverviewUser || registeredAppUsers[0]?.userId || '';
  const appScopeLabel = appOverviewUser ? `用户 ${appOverviewUser}` : '全部平台用户';

  function updateFilter(key, value) {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function applyAppFilter() {
    const normalized = appFilter.trim();
    if (normalized === appOverviewUser) {
      load({ quiet: true, appUser: normalized });
      return;
    }
    setAppOverviewUser(normalized);
  }

  async function confirmAction() {
    const action = pendingAction;
    if (!action) return;
    const actionIsAppTest = action.type === 'test' && form.channel === 'app';
    setSubmitting(true);
    setError('');
    setMessage('');
    let nextAppUser = null;
    try {
      if (action.type === 'cmcc-probe') {
        await requestJson('/api/notifications/cmcc/probe', { method: 'POST' });
        setMessage('新消息网关握手成功，通道可用于发送');
      } else if (action.type === 'cmcc-test') {
        await requestJson('/api/notifications/cmcc/test', {
          method: 'POST',
          body: JSON.stringify({ title: form.cmccTitle.trim(), content: form.cmccContent.trim() }),
        });
        setMessage('新消息测试已提交到网关');
        setForm((current) => ({ ...current, cmccContent: '' }));
      } else if (action.type === 'test') {
        if (actionIsAppTest) {
          const userId = form.appUserId.trim();
          nextAppUser = userId;
          await requestJson('/api/notifications/app/test', {
            method: 'POST',
            body: JSON.stringify({
              userId,
              title: form.appTitle.trim(),
              summary: form.content.trim(),
              priority: form.appPriority,
            }),
          });
          const appQuery = new URLSearchParams({ userId, limit: '12' });
          setAppFilter(userId);
          setAppOverviewUser(userId);
          setAppOverview(await requestJson(`/api/notifications/app/overview?${appQuery}`));
          setMessage('Android App 测试通知已写入收件箱');
        } else {
          await requestJson('/api/notifications/test', {
            method: 'POST',
            body: JSON.stringify({ msgType: form.msgType, touser: form.touser.trim(), content: form.content.trim() }),
          });
          setMessage('企业微信测试通知已发送');
        }
        setForm((current) => ({ ...current, content: '' }));
      } else if (action.type === 'retry') {
        await requestJson(`/api/notifications/deliveries/${encodeURIComponent(action.delivery.id)}/retry`, { method: 'POST' });
        setMessage('失败通知已重新发送');
      } else if (action.type === 'cancel-job') {
        await requestJson(`/api/notifications/jobs/${encodeURIComponent(action.job.id)}/cancel`, { method: 'POST' });
        setMessage('计划任务已取消');
      } else if (action.type === 'delete-template') {
        await requestJson(`/api/notifications/templates/${encodeURIComponent(action.template.key)}`, { method: 'DELETE' });
        setMessage('通知模板已删除');
      } else if (action.type === 'delete-cmcc-command') {
        await requestJson(`/api/notifications/cmcc/commands/${encodeURIComponent(action.command.key)}`, { method: 'DELETE' });
        setMessage('新消息指令规则已删除');
      }
      setPendingAction(null);
      if (action.type === 'test') setTab(actionIsAppTest ? 'app' : 'records');
      if (action.type === 'retry') setTab('records');
      if (action.type === 'cancel-job') setTab('jobs');
      if (action.type === 'delete-template') setTab('templates');
      if (action.type === 'delete-cmcc-command') setTab('cmccCommands');
      await load({ quiet: true, ...(nextAppUser === null ? {} : { appUser: nextAppUser }) });
    } catch (requestError) {
      setPendingAction(null);
      setError(requestError.message);
      if (['cmcc-probe', 'cmcc-test'].includes(action.type)) await load({ quiet: true });
    } finally {
      setSubmitting(false);
    }
  }

  async function saveTemplate() {
    setSubmitting(true); setError(''); setMessage('');
    try {
      await requestJson(`/api/notifications/templates/${encodeURIComponent(templateForm.key.trim())}`, {
        method: 'PUT', body: JSON.stringify(templateForm),
      });
      setMessage('通知模板已保存');
      setTemplateForm({ key: '', name: '', description: '', msgType: 'text', content: '', enabled: true });
      await load({ quiet: true });
    } catch (requestError) { setError(requestError.message); }
    finally { setSubmitting(false); }
  }

  async function scheduleJob() {
    setSubmitting(true); setError(''); setMessage('');
    try {
      const variables = JSON.parse(jobForm.variables || '{}');
      await requestJson('/api/notifications/jobs', {
        method: 'POST',
        body: JSON.stringify({
          templateKey: jobForm.templateKey,
          target: { touser: jobForm.touser.trim() },
          variables,
          ...(jobForm.scheduledAt ? { scheduledAt: new Date(jobForm.scheduledAt).toISOString() } : {}),
          ...(jobForm.dedupeKey.trim() ? { dedupeKey: jobForm.dedupeKey.trim() } : {}),
        }),
      });
      setMessage('通知任务已创建');
      setJobForm({ ...jobForm, touser: '', scheduledAt: '', dedupeKey: '', variables: '{}' });
      await load({ quiet: true });
    } catch (requestError) { setError(requestError instanceof SyntaxError ? '模板变量必须是有效 JSON。' : requestError.message); }
    finally { setSubmitting(false); }
  }

  async function loadPreference() {
    if (!preferenceForm.targetId.trim()) return;
    setError('');
    try {
      const result = await requestJson(`/api/notifications/preferences/${encodeURIComponent(preferenceForm.targetId.trim())}`);
      const preference = result.preference || {};
      setPreferenceForm((current) => ({ ...current, enabled: preference.enabled ?? true, quietStart: preference.quietHours?.start || '22:00', quietEnd: preference.quietHours?.end || '07:00' }));
      setMessage(preference.targetId ? '已读取接收偏好' : '该用户尚未设置偏好');
    } catch (requestError) { setError(requestError.message); }
  }

  async function savePreference() {
    setSubmitting(true); setError(''); setMessage('');
    try {
      await requestJson(`/api/notifications/preferences/${encodeURIComponent(preferenceForm.targetId.trim())}`, {
        method: 'PUT', body: JSON.stringify({ enabled: preferenceForm.enabled, quietHours: { start: preferenceForm.quietStart, end: preferenceForm.quietEnd }, timezoneOffsetMinutes: 480 }),
      });
      setMessage('接收偏好已保存');
    } catch (requestError) { setError(requestError.message); }
    finally { setSubmitting(false); }
  }

  async function sendCmccMedia() {
    setSubmitting(true); setError(''); setMessage('');
    try {
      const result = await requestJson('/api/notifications/cmcc/media', {
        method: 'POST',
        body: JSON.stringify({
          mediaType: cmccMediaForm.mediaType,
          content: cmccMediaForm.content.trim(),
          ...(cmccMediaForm.mediaUrl.trim() ? { mediaUrl: cmccMediaForm.mediaUrl.trim() } : {}),
          ...(cmccMediaForm.fileBase64
            ? {
              fileBase64: cmccMediaForm.fileBase64,
              fileName: cmccMediaForm.fileName || 'cmcc-media.bin',
              ...(cmccMediaForm.mimeType ? { mimeType: cmccMediaForm.mimeType } : {}),
            }
            : {}),
        }),
      });
      setMessage(`富媒体消息已提交到网关，投递目标 ${result.targetMasked || '--'}`);
      setCmccMediaForm({ mediaType: cmccMediaForm.mediaType, content: '', mediaUrl: '', fileBase64: '', fileName: '', mimeType: '' });
      await load({ quiet: true });
    } catch (requestError) { setError(requestError.message); }
    finally { setSubmitting(false); }
  }

  function handleCmccFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      setError('上传文件不能超过 6MB，较大的素材请改用媒体地址。');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const encoded = String(reader.result || '');
      const base64 = encoded.includes(',') ? encoded.slice(encoded.indexOf(',') + 1) : encoded;
      setCmccMediaForm((current) => ({
        ...current,
        fileBase64: base64,
        fileName: file.name,
        mimeType: file.type || current.mimeType,
        mediaUrl: '',
      }));
      setError('');
    };
    reader.onerror = () => setError('读取本地文件失败。');
    reader.readAsDataURL(file);
  }

  async function saveCmccCommand() {
    setSubmitting(true); setError(''); setMessage('');
    try {
      await requestJson(`/api/notifications/cmcc/commands/${encodeURIComponent(cmccCommandForm.key.trim())}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: cmccCommandForm.name.trim(),
          description: cmccCommandForm.description.trim(),
          matchType: cmccCommandForm.matchType,
          pattern: cmccCommandForm.pattern.trim(),
          reply: cmccCommandForm.reply.trim(),
          enabled: cmccCommandForm.enabled,
        }),
      });
      setMessage('新消息指令规则已保存');
      setCmccCommandForm(EMPTY_CMCC_COMMAND_FORM);
      await load({ quiet: true });
    } catch (requestError) { setError(requestError.message); }
    finally { setSubmitting(false); }
  }

  if (loading && !overview) {
    return <section className="page-view notify-page"><div className="ops-loading"><LoaderCircle className="spin" size={20} />正在读取通知服务</div></section>;
  }

  const primaryTab = ['records', 'test'].includes(tab)
    ? 'records'
    : ['jobs', 'templates'].includes(tab) ? 'jobs'
      : ['cmcc', 'cmccInbox', 'cmccMedia', 'cmccCommands'].includes(tab) ? 'cmcc' : tab;
  const panelLabelledBy = ['records', 'test'].includes(tab)
    ? `notify-primary-tab-records notify-send-tab-${tab}`
    : ['jobs', 'templates'].includes(tab)
      ? `notify-primary-tab-jobs notify-orchestration-tab-${tab}`
      : ['cmcc', 'cmccInbox', 'cmccMedia', 'cmccCommands'].includes(tab)
        ? `notify-primary-tab-cmcc notify-cmcc-tab-${tab}`
        : `notify-primary-tab-${primaryTab}`;
  const confirmTitle = pendingAction?.type === 'retry' ? '重试失败通知'
    : pendingAction?.type === 'cancel-job' ? '取消计划任务'
      : pendingAction?.type === 'delete-template' ? '删除通知模板'
        : pendingAction?.type === 'delete-cmcc-command' ? '删除新消息指令规则'
          : pendingAction?.type === 'cmcc-probe' ? '连接新消息网关'
            : pendingAction?.type === 'cmcc-test' ? '发送新消息测试' : '发送测试通知';
  const confirmDescription = pendingAction?.type === 'retry' ? '将使用原始加密载荷重新发送。'
    : pendingAction?.type === 'cancel-job' ? '取消后该任务不会再自动发送。'
      : pendingAction?.type === 'delete-template' ? '删除后不能再用此模板创建任务。'
        : pendingAction?.type === 'delete-cmcc-command' ? '删除后手机发送该内容将不再收到自动应答。'
          : pendingAction?.type === 'cmcc-probe' ? '将与中国移动新消息网关建立 WebSocket 连接并完成认证，不会向手机发送消息。'
            : pendingAction?.type === 'cmcc-test' ? '确认向固定接收号码发送一条纯文本新消息。'
              : form.channel === 'app' ? '确认向指定 Android App 平台用户写入测试通知。' : '确认向指定企业微信用户发送此消息。';
  const confirmDetail = pendingAction?.type === 'retry' ? targetLabel(pendingAction.delivery)
    : pendingAction?.type === 'cancel-job' ? pendingAction.job?.id
      : pendingAction?.type === 'delete-template' ? pendingAction.template?.name
        : pendingAction?.type === 'delete-cmcc-command' ? `${pendingAction.command?.name || ''} · ${pendingAction.command?.pattern || ''}`
          : pendingAction?.type === 'cmcc-probe' ? (cmcc.wsUrl || '--')
            : pendingAction?.type === 'cmcc-test' ? `${cmcc.recipientMasked || '--'} · ${[form.cmccTitle.trim(), form.cmccContent.trim()].filter(Boolean).join(' / ').slice(0, 60)}`
              : form.channel === 'app'
                ? `${form.appUserId.trim()} · ${priorityLabel(form.appPriority)}`
                : `${form.touser.trim()} · ${typeLabel(form.msgType)}`;

  return (
    <section className="page-view" aria-label="统一通知服务控制中心">
      <div className="view-stack">
        <div className="toolbar notify-tabs">
          <SegmentedTabs
            ariaLabel="通知服务视图"
            idPrefix="notify-primary-tab"
            panelId="notify-view-panel"
            items={[
              { id: 'overview', label: '概览' },
              { id: 'records', label: '发送' },
              { id: 'app', label: 'App 通知' },
              { id: 'cmcc', label: '新消息' },
              { id: 'jobs', label: '编排' },
              { id: 'preferences', label: '接收偏好' },
              { id: 'api', label: 'API 接入' },
            ]}
            value={primaryTab}
            onChange={setTab}
          />
          {tab !== 'api' && (
            <div className="toolbar-end">
              <button className="btn btn-secondary btn-sm" type="button" title="刷新通知数据" aria-label="刷新通知数据" disabled={refreshing} onClick={() => load({ quiet: true })}>
                <RefreshCw className={refreshing ? 'spin' : ''} size={15} />刷新
              </button>
            </div>
          )}
        </div>
        {['records', 'test'].includes(tab) && <SegmentedTabs className="segmented notify-context-tabs" ariaLabel="发送视图" idPrefix="notify-send-tab" panelId="notify-view-panel" items={[{ id: 'records', label: '发送记录' }, { id: 'test', label: '发送测试' }]} value={tab} onChange={setTab} />}
        {['jobs', 'templates'].includes(tab) && <SegmentedTabs className="segmented notify-context-tabs" ariaLabel="编排视图" idPrefix="notify-orchestration-tab" panelId="notify-view-panel" items={[{ id: 'jobs', label: '计划任务' }, { id: 'templates', label: '消息模板' }]} value={tab} onChange={setTab} />}
        {['cmcc', 'cmccInbox', 'cmccMedia', 'cmccCommands'].includes(tab) && <SegmentedTabs className="segmented notify-context-tabs" ariaLabel="新消息视图" idPrefix="notify-cmcc-tab" panelId="notify-view-panel" items={[{ id: 'cmcc', label: '通道与文本' }, { id: 'cmccInbox', label: '上行消息' }, { id: 'cmccMedia', label: '富媒体' }, { id: 'cmccCommands', label: '指令规则' }]} value={tab} onChange={setTab} />}
        <Feedback error={error} message={message} />

        <div className="notify-view-panel" id="notify-view-panel" role="tabpanel" aria-labelledby={panelLabelledBy}>

        {tab === 'overview' && (
          <>
            <div className="stat-strip">
              <article className="stat-card">
                <span className="stat-icon tone-info"><Activity size={17} /></span>
                <div>
                  <span className="stat-label">24 小时成功率</span>
                  <strong className="stat-figure">{history.successRate == null ? '--' : `${history.successRate}%`}</strong>
                  <small className="stat-foot">{history.total || 0} 次发送</small>
                </div>
              </article>
              <article className="stat-card">
                <span className="stat-icon tone-ok"><CheckCircle2 size={17} /></span>
                <div>
                  <span className="stat-label">发送成功</span>
                  <strong className="stat-figure">{history.success || 0}</strong>
                  <small className="stat-foot">最近 24 小时</small>
                </div>
              </article>
              <article className="stat-card">
                <span className="stat-icon tone-warn"><CircleAlert size={17} /></span>
                <div>
                  <span className="stat-label">发送失败</span>
                  <strong className="stat-figure">{history.failed || 0}</strong>
                  <small className="stat-foot">{history.pending || 0} 次处理中</small>
                </div>
              </article>
              <article className="stat-card">
                <span className="stat-icon tone-violet"><Clock3 size={17} /></span>
                <div>
                  <span className="stat-label">P95 耗时</span>
                  <strong className="stat-figure">{history.p95DurationMs == null ? '--' : history.p95DurationMs}</strong>
                  <small className="stat-foot">{history.p95DurationMs == null ? '暂无数据' : '毫秒'}</small>
                </div>
              </article>
            </div>

            <div className="split">
              <section className="panel">
                <div className="panel-head">
                  <div className="panel-title"><ServerCog size={15} aria-hidden="true" />通道与存储</div>
                  <span className="panel-meta">连接状态</span>
                </div>
                <div className="panel-body">
                  <div className="status-list">
                    <StatusRow ready={overview?.configured} label="通知服务" detail={overview?.configured ? '管理连接已建立' : '尚未配置管理连接'} />
                    <StatusRow ready={overview?.storageHealthy} label="发送台账" detail={overview?.storageHealthy ? `保留 ${overview.retentionDays} 天` : '存储连接异常'} />
                    <StatusRow ready={overview?.wecom?.corpIdConfigured && overview?.wecom?.secretConfigured} label="企业微信应用" detail={overview?.wecom?.agentId ? `AgentId ${overview.wecom.agentId}` : '应用凭据未配置'} />
                    <StatusRow ready={Boolean(cmcc.configured && cmccStatus.ready)} label="中国移动新消息" detail={cmcc.configured ? `${cmcc.recipientMasked || '--'} · ${cmccStatus.ready ? '连接就绪' : '未连接'}` : '凭据未配置'} />
                    <StatusRow ready={true} label="Android App 收件箱" detail={`${appOverview.total || 0} 条通知 · ${appOverview.unread || 0} 条未读`} />
                    <StatusRow ready={appDevices.total > 0} label="App 设备注册" detail={`${appDevices.total || 0} 台设备 · ${appDevices.pushReady || 0} 台可推送 · ${appDevices.pollOnly || 0} 台轮询`} />
                    <StatusRow ready={true} label="敏感数据" detail="服务端托管" />
                  </div>
                </div>
              </section>

              <aside className="split-side">
                <section className="panel panel-flush">
                  <div className="panel-head">
                    <div className="panel-title"><BellRing size={15} aria-hidden="true" />最新发送</div>
                    <span className="panel-meta">最近活动</span>
                  </div>
                  <div className="data-list">
                    {recent.length ? recent.map((delivery) => (
                      <button className="data-row col-recent" type="button" key={delivery.id} onClick={() => setTab('records')}>
                        <DeliveryTag value={delivery.status} />
                        <span className="cell-stack">
                          <strong>{targetLabel(delivery)}</strong>
                          <small>{callerLabel(delivery.caller)} · {formatDateTime(delivery.startedAt)}</small>
                        </span>
                      </button>
                    )) : <div className="data-list-empty"><span>暂无发送记录</span></div>}
                  </div>
                </section>
              </aside>
            </div>

            <div className="notify-channel-grid">
              <button className="channel-card" type="button" onClick={() => setTab('records')}>
                <span className="stat-icon tone-info"><Send size={15} /></span>
                <span className="cell-stack"><strong>企业微信通知</strong><small>{overview?.wecom?.agentId ? `AgentId ${overview.wecom.agentId}` : '应用凭据未配置'} · 查看发送台账</small></span>
              </button>
              <button className="channel-card" type="button" onClick={() => setTab('app')}>
                <span className="stat-icon tone-violet"><Smartphone size={15} /></span>
                <span className="cell-stack"><strong>Android App 通知</strong><small>{appDevices.total || 0} 台设备 · {appOverview.unread || 0} 条未读 · 打开收件箱</small></span>
              </button>
              <button className="channel-card" type="button" onClick={() => setTab('preferences')}>
                <span className="stat-icon tone-ok"><UserRound size={15} /></span>
                <span className="cell-stack"><strong>接收偏好</strong><small>平台用户免打扰与接收开关统一维护</small></span>
              </button>
              <button className="channel-card" type="button" onClick={() => setTab('cmcc')}>
                <span className="stat-icon tone-warn"><Zap size={15} /></span>
                <span className="cell-stack"><strong>中国移动新消息</strong><small>{cmcc.configured ? `${cmcc.recipientMasked || '--'} · ${cmccStatus.ready ? '连接就绪' : '未连接'}` : '通道未配置'} · 控制与测试</small></span>
              </button>
            </div>
          </>
        )}

        {tab === 'records' && (
          <section className="panel panel-flush">
            <div className="panel-head">
              <div className="panel-title"><Send size={15} aria-hidden="true" />发送台账<span className="panel-meta">{deliveries.total} 条</span></div>
              <div className="notify-filters">
                <SelectControl ariaLabel="按发送状态筛选" value={filters.status} onChange={(value) => updateFilter('status', value)} options={STATUS_OPTIONS} />
                <SelectControl ariaLabel="按调用方筛选" value={filters.caller} onChange={(value) => updateFilter('caller', value)} options={CALLER_OPTIONS} />
                <SelectControl ariaLabel="按消息类型筛选" value={filters.msgType} onChange={(value) => updateFilter('msgType', value)} options={TYPE_OPTIONS} />
                <SelectControl ariaLabel="按发送目标筛选" value={filters.targetType} onChange={(value) => updateFilter('targetType', value)} options={TARGET_OPTIONS} />
              </div>
            </div>
            <div className="data-list">
              <div className="data-head col-delivery" aria-hidden="true">
                <span>时间</span><span>结果</span><span>调用方</span><span>类型</span><span>发送目标</span><span className="cell-num">耗时</span><span />
              </div>
              {deliveries.items.length ? deliveries.items.map((delivery) => (
                <div className="data-row col-delivery" key={delivery.id}>
                  <span className="panel-meta">{formatDateTime(delivery.startedAt)}</span>
                  <DeliveryTag value={delivery.status} />
                  <span className="cell-truncate">{callerLabel(delivery.caller)}</span>
                  <span className="cell-truncate">{typeLabel(delivery.msgType)}</span>
                  <span className="cell-stack">
                    <strong>{targetLabel(delivery)}</strong>
                    {delivery.errorMessage && <small title={delivery.errorMessage}>{delivery.wecomCode ? `企业微信 ${delivery.wecomCode}` : delivery.errorCode}</small>}
                  </span>
                  <span className="cell-num">{Number.isFinite(delivery.durationMs) ? `${delivery.durationMs} ms` : '--'}</span>
                  <button className="icon-action" type="button" title={delivery.retryable && delivery.status === 'failed' ? '重试此通知' : '此记录不可重试'} aria-label="重试此通知" disabled={!canOperate || !delivery.retryable || delivery.status !== 'failed'} onClick={() => setPendingAction({ type: 'retry', delivery })}><RotateCcw size={15} /></button>
                </div>
              )) : <div className="data-list-empty"><span>当前筛选条件下没有发送记录</span></div>}
            </div>
            <footer className="table-foot">
              <span className="panel-meta">第 {deliveries.page} / {totalPages} 页</span>
              <div className="inline-actions">
                <button className="btn btn-secondary btn-sm" type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>上一页</button>
                <button className="btn btn-secondary btn-sm" type="button" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>下一页</button>
              </div>
            </footer>
          </section>
        )}

        {tab === 'app' && (
          <div className="split notify-app-layout">
            <div className="split-main">
              <section className="panel panel-flush">
                <div className="panel-head">
                  <div className="panel-title"><Smartphone size={15} aria-hidden="true" />{appScopeLabel}收件箱</div>
                  <div className="notify-filters">
                    <SelectControl ariaLabel="App 通知查看用户" value={appFilter} options={appFilterOptions} onChange={setAppFilter} />
                    <button className="btn btn-secondary btn-sm" type="button" disabled={refreshing} onClick={applyAppFilter}>读取</button>
                  </div>
                </div>
                <div className="data-list">
                  <div className="data-head col-app" aria-hidden="true"><span>状态</span><span>通知</span><span>接收范围</span></div>
                  {appItems.length ? appItems.map((item) => (
                    <div className="data-row col-app" key={`${item.recipientId || 'app'}-${item.id}`}>
                      <ReadTag readAt={item.readAt} />
                      <span className="cell-stack">
                        <strong>{item.title || item.category || item.id}</strong>
                        <small>{item.summary || item.category || '无摘要'}</small>
                      </span>
                      <span className="cell-stack">
                        <strong>{item.recipientId || appOverview.userId || '--'}</strong>
                        <small>{priorityLabel(item.priority)} · {item.category || '--'} · {formatDateTime(item.createdAt)}</small>
                      </span>
                    </div>
                  )) : <div className="data-list-empty"><span>当前范围没有 App 通知</span></div>}
                </div>
              </section>
            </div>
            <aside className="split-side">
              <section className="panel">
                <div className="panel-head">
                  <div className="panel-title"><Smartphone size={15} aria-hidden="true" />App 通道状态</div>
                  <span className="panel-meta">设备能力</span>
                </div>
                <div className="panel-body">
                  <div className="status-list">
                    <StatusRow ready={appDevices.total > 0} label="设备注册" detail={`${appDevices.total || 0} 台有效设备`} />
                    <StatusRow ready={appDevices.pushReady > 0} label="原生推送" detail={`${appDevices.pushReady || 0} 台设备具备推送令牌`} />
                    <StatusRow ready={appDevices.pollOnly > 0} label="轮询兜底" detail={`${appDevices.pollOnly || 0} 台设备使用 App 内收件箱轮询`} />
                  </div>
                  <button className="btn btn-primary btn-block notify-send-button" type="button" disabled={!defaultAppUserId} onClick={() => { setForm((current) => ({ ...current, channel: 'app', appUserId: defaultAppUserId })); setTab('test'); }}><Send size={15} />发送 App 测试</button>
                </div>
              </section>
            </aside>
          </div>
        )}

        {tab === 'cmcc' && (
          <div className="split">
            <section className="panel">
              <div className="panel-head">
                <div className="panel-title"><Zap size={15} aria-hidden="true" />通道状态</div>
                <span className={`tag tone-${cmccStatus.ready ? 'ok' : cmcc.configured ? 'warn' : 'neutral'}`}>{cmccStatus.ready ? '连接就绪' : cmcc.configured ? '未连接' : '未配置'}</span>
              </div>
              <div className="panel-body">
                <div className="status-list">
                  <StatusRow ready={Boolean(cmcc.configured)} label="通道凭据" detail={cmcc.configured ? `接收号码 ${cmcc.recipientMasked}` : '未配置 CMCC_API_KEY 与 CMCC_RECIPIENT'} />
                  <StatusRow ready={Boolean(cmcc.wsUrl)} label="网关地址" detail={cmcc.wsUrl || '未配置'} />
                  <StatusRow ready={Boolean(cmccStatus.ready)} label="WebSocket 连接" detail={cmccStatus.ready ? '已认证，可发送' : cmccStatus.connected ? '已连接，等待认证' : '未连接'} />
                  <StatusRow ready={!cmccStatus.lastError} label="最近错误" detail={cmccStatus.lastError ? `${cmccStatus.lastError.code} · ${formatDateTime(cmccStatus.lastError.at)}` : '暂无'} />
                </div>
                <div className="stat-chips">
                  <span>已提交 <strong>{cmccStats.sent || 0}</strong></span>
                  <span>富媒体 <strong>{cmccStats.mediaSent || 0}</strong></span>
                  <span>上行 <strong>{cmccStats.received || 0}</strong></span>
                  <span>失败 <strong>{cmccStats.failed || 0}</strong></span>
                  <span>重连 <strong>{cmccStats.reconnects || 0}</strong></span>
                </div>
                <div className="inline-actions">
                  <button className="btn btn-secondary btn-sm" type="button" disabled={!canOperate || !cmcc.configured || submitting} onClick={() => setPendingAction({ type: 'cmcc-probe' })}><ShieldCheck size={15} />连接自检</button>
                  <button className="btn btn-secondary btn-sm" type="button" disabled={!canOperate} onClick={() => setTab('cmccInbox')}><Inbox size={15} />上行消息 {cmccInbound.total ? `(${cmccInbound.total})` : ''}</button>
                  <button className="btn btn-secondary btn-sm" type="button" disabled={!canOperate} onClick={() => setTab('cmccMedia')}><ImageIcon size={15} />富媒体发送</button>
                  <button className="btn btn-secondary btn-sm" type="button" disabled={!canOperate} onClick={() => setTab('cmccCommands')}><Terminal size={15} />指令规则</button>
                  <button className="btn btn-secondary btn-sm" type="button" disabled={!canOperate} onClick={() => { updateFilter('targetType', 'phone'); setTab('records'); }}><FileText size={15} />查看发送记录</button>
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <div className="panel-title"><Send size={15} aria-hidden="true" />发送新消息</div>
                <span className="panel-meta">下行测试</span>
              </div>
              <div className="panel-body">
                <div className="form-stack">
                  <label className="config-field"><span>接收号码</span><input value={cmcc.recipientMasked || '未配置'} readOnly /></label>
                  <label className="config-field">
                    <span>消息标题</span>
                    <input value={form.cmccTitle} maxLength={60} placeholder="留空则只发送正文" onChange={(event) => setForm({ ...form, cmccTitle: event.target.value })} />
                    <small>{form.cmccTitle.trim() ? '标题与正文各自成行下发' : '已留空：只发送正文'}</small>
                  </label>
                  <label className="config-field">
                    <span>消息内容</span>
                    <textarea rows={7} maxLength={2048} value={form.cmccContent} placeholder="输入测试内容，将转为纯文本发送" onChange={(event) => setForm({ ...form, cmccContent: event.target.value })} />
                    <small>{form.cmccContent.length} / 2048 字符</small>
                  </label>
                </div>
                <button className="btn btn-primary btn-block notify-send-button" type="button" disabled={!canOperate || !cmcc.configured || !form.cmccContent.trim() || submitting} onClick={() => setPendingAction({ type: 'cmcc-test' })}><Send size={15} />发送测试</button>
                <div className="note-block">
                  <span>文本下行</span>
                  <ul>
                    <li>文本帧支持指定接收号码，未指定时优先回复最近一次上行会话</li>
                    <li>内容会先剥离 Markdown 标记，超过 2048 字按网关上限截断</li>
                    <li>网关不回投递回执，成功仅代表已提交到网关</li>
                    <li>固定测试号码为 CMCC_RECIPIENT，控制台不提供改号能力</li>
                  </ul>
                </div>
              </div>
            </section>
          </div>
        )}

        {tab === 'cmccInbox' && (
          <div className="split">
            <section className="panel">
              <div className="panel-head">
                <div className="panel-title"><Inbox size={15} aria-hidden="true" />手机上行消息</div>
                <span className="panel-meta">上行接收</span>
              </div>
              <div className="panel-body">
                <div className="form-stack">
                  <div className="config-field"><span>上行类型</span><SelectControl ariaLabel="上行消息类型" value={cmccFilters.mediaType} options={CMCC_MEDIA_FILTER_OPTIONS} onChange={(value) => setCmccFilters({ ...cmccFilters, mediaType: value })} /></div>
                  <div className="config-field"><span>自动回复</span><SelectControl ariaLabel="自动回复状态" value={cmccFilters.replyStatus} options={CMCC_REPLY_STATUS_OPTIONS} onChange={(value) => setCmccFilters({ ...cmccFilters, replyStatus: value })} /></div>
                </div>
                <div className="stat-chips">
                  <span>共 <strong>{cmccInbound.total || 0}</strong> 条</span>
                  <span>24 小时 <strong>{cmccInbound.last24h || 0}</strong> 条</span>
                  <span>已自动回复 <strong>{cmccInbound.replied || 0}</strong> 条</span>
                </div>
                <div className="status-list">
                  <StatusRow ready={cmccSessionActive} label="上行会话" detail={cmccSessionActive ? `最近发送方 ${cmccTargetMasked}` : '尚未收到上行消息'} />
                  <StatusRow ready={Boolean(cmcc.configured && cmcc.replyEnabled)} label="指令自动回复" detail={cmcc.configured ? (cmcc.replyEnabled ? '已开启' : '已通过 CMCC_REPLY_ENABLED 关闭') : '通道未配置'} />
                </div>
                <div className="note-block">
                  <span>说明</span>
                  <ul>
                    <li>网关通过 WebSocket 直接推送上行文本与富媒体，无需额外配置回调地址</li>
                    <li>需要服务常驻连接；断线后客户端按退避策略自动重连</li>
                    <li>上行富媒体只记录网关给出的 mediaUrl，控制台不会下载到本地</li>
                  </ul>
                </div>
              </div>
            </section>

            <section className="panel panel-flush">
              <div className="panel-head">
                <div className="panel-title"><MessageSquare size={15} aria-hidden="true" />上行记录</div>
                <span className="panel-meta">{cmccMessages.total || 0} 条</span>
              </div>
              <div className="data-list">
                {cmccMessages.items?.length ? cmccMessages.items.map((item) => {
                  const replyMeta = cmccReplyStatusMeta(item.replyStatus);
                  return (
                    <div className="data-row col-inbox" key={item.id}>
                      <span className="cell-stack">
                        <strong>{maskPhoneValue(item.from) || '未知号码'} · {item.mediaType ? cmccMediaLabel(item.mediaType) : '文本'}</strong>
                        <small>{formatDateTime(item.receivedAt)}{item.mediaFileName ? ` · ${item.mediaFileName}` : ''}</small>
                        <small className="cell-body">{item.content || (item.mediaUrl ? `媒体地址 ${item.mediaUrl}` : '无文本内容')}</small>
                        {item.replyContent ? <small>自动回复：{item.replyContent}</small> : null}
                        {item.replyError ? <small>回复失败：{item.replyError}</small> : null}
                      </span>
                      <span className={`tag tone-${replyMeta.state === 'success' ? 'ok' : replyMeta.state === 'failed' ? 'danger' : 'neutral'}`}>{replyMeta.label}</span>
                    </div>
                  );
                }) : <div className="data-list-empty"><span>暂无上行消息，可让手机向该通道发送一条短信或富媒体消息</span></div>}
              </div>
            </section>
          </div>
        )}

        {tab === 'cmccMedia' && (
          <div className="split">
            <section className="panel">
              <div className="panel-head">
                <div className="panel-title"><ImageIcon size={15} aria-hidden="true" />发送富媒体</div>
                <span className="panel-meta">图片 / 音频 / 视频 / 文件</span>
              </div>
              <div className="panel-body">
                <div className="form-stack">
                  <div className="config-field"><span>媒体类型</span><SelectControl ariaLabel="富媒体类型" value={cmccMediaForm.mediaType} options={CMCC_MEDIA_OPTIONS} onChange={(value) => setCmccMediaForm({ ...cmccMediaForm, mediaType: value })} /></div>
                  <label className="config-field"><span>媒体地址</span><input value={cmccMediaForm.mediaUrl} maxLength={2048} placeholder="https:// 可公网访问的素材地址" onChange={(event) => setCmccMediaForm({ ...cmccMediaForm, mediaUrl: event.target.value, fileBase64: '', fileName: '' })} /></label>
                  <label className="config-field">
                    <span>或上传本地文件</span>
                    <input type="file" onChange={handleCmccFile} />
                    <small>{cmccMediaForm.fileName ? `已选择 ${cmccMediaForm.fileName}${cmccMediaForm.mimeType ? ` · ${cmccMediaForm.mimeType}` : ''}` : '单文件上限 6MB，上传后由网关返回 mediaUrl'}</small>
                  </label>
                  <label className="config-field"><span>文字说明</span><textarea rows={4} maxLength={1024} value={cmccMediaForm.content} placeholder="随媒体一起下发的纯文本说明，可留空" onChange={(event) => setCmccMediaForm({ ...cmccMediaForm, content: event.target.value })} /></label>
                </div>
                <button className="btn btn-primary btn-block notify-send-button" type="button" disabled={!canOperate || !cmcc.configured || submitting || (!cmccMediaForm.mediaUrl.trim() && !cmccMediaForm.fileBase64)} onClick={sendCmccMedia}><Upload size={15} />发送富媒体</button>
                <div className="note-block">
                  <span>能力与限制</span>
                  <ul>
                    <li>网关富媒体帧没有 to 字段，只会投递给最近一次上行会话</li>
                    <li>当前投递目标：{cmccTargetMasked || '--'}{cmccSessionActive ? '（最近上行发送方）' : '（固定号码，尚未收到上行消息）'}</li>
                    <li>上传走网关 POST {'{uploadUrl}'}/upload，成功码 10200，返回 data 即 mediaUrl</li>
                    <li>通道不提供按钮、卡片、菜单与快捷回复，交互只能靠文本指令</li>
                  </ul>
                </div>
              </div>
            </section>

            <section className="panel panel-flush">
              <div className="panel-head">
                <div className="panel-title"><ImageIcon size={15} aria-hidden="true" />最近下发</div>
                <span className="panel-meta">富媒体记录</span>
              </div>
              <div className="data-list">
                {deliveries.items.filter((item) => ['image', 'audio', 'video', 'file'].includes(item.msgType)).slice(0, 6).map((item) => (
                  <div className="data-row col-media" key={item.id}>
                    <span className="cell-stack">
                      <strong>{typeLabel(item.msgType)} → {targetLabel(item)}</strong>
                      <small>{formatDateTime(item.startedAt)}</small>
                    </span>
                    <DeliveryTag value={item.status} />
                  </div>
                ))}
                {!deliveries.items.some((item) => ['image', 'audio', 'video', 'file'].includes(item.msgType)) && <div className="data-list-empty"><span>暂无富媒体发送记录</span></div>}
              </div>
            </section>
          </div>
        )}

        {tab === 'cmccCommands' && (
          <div className="split">
            <section className="panel">
              <div className="panel-head">
                <div className="panel-title"><Terminal size={15} aria-hidden="true" />{cmccCommandForm.key ? '编辑指令规则' : '新建指令规则'}</div>
                <span className="panel-meta">短信指令</span>
              </div>
              <div className="panel-body">
                <div className="form-stack">
                  <label className="config-field"><span>规则标识</span><input value={cmccCommandForm.key} maxLength={64} disabled={Boolean(cmccCommands.some((item) => item.key === cmccCommandForm.key))} onChange={(event) => setCmccCommandForm({ ...cmccCommandForm, key: event.target.value })} /></label>
                  <label className="config-field"><span>指令名称</span><input value={cmccCommandForm.name} maxLength={80} onChange={(event) => setCmccCommandForm({ ...cmccCommandForm, name: event.target.value })} /></label>
                  <label className="config-field"><span>说明</span><input value={cmccCommandForm.description} maxLength={160} placeholder="会出现在 /help 帮助回复中" onChange={(event) => setCmccCommandForm({ ...cmccCommandForm, description: event.target.value })} /></label>
                  <div className="config-field"><span>匹配方式</span><SelectControl ariaLabel="指令匹配方式" value={cmccCommandForm.matchType} options={CMCC_COMMAND_MATCH_OPTIONS} onChange={(value) => setCmccCommandForm({ ...cmccCommandForm, matchType: value })} /></div>
                  <label className="config-field"><span>触发内容</span><input value={cmccCommandForm.pattern} maxLength={160} placeholder="例如 /status 或 查询" onChange={(event) => setCmccCommandForm({ ...cmccCommandForm, pattern: event.target.value })} /></label>
                  <label className="config-field">
                    <span>自动回复</span>
                    <textarea rows={5} maxLength={2048} value={cmccCommandForm.reply} placeholder="支持 {{from}}、{{text}}、{{date}} 占位符" onChange={(event) => setCmccCommandForm({ ...cmccCommandForm, reply: event.target.value })} />
                    <small>{cmccCommandForm.reply.length} / 2048 字符</small>
                  </label>
                  <label className="config-toggle">
                    <span><strong>启用规则</strong><small>关闭后不参与自动回复匹配</small></span>
                    <input type="checkbox" checked={cmccCommandForm.enabled} onChange={(event) => setCmccCommandForm({ ...cmccCommandForm, enabled: event.target.checked })} />
                  </label>
                </div>
                <button className="btn btn-primary btn-block notify-send-button" type="button" disabled={!canManageCommands || !cmccCommandForm.key.trim() || !cmccCommandForm.name.trim() || !cmccCommandForm.pattern.trim() || !cmccCommandForm.reply.trim() || submitting} onClick={saveCmccCommand}><Save size={15} />保存指令</button>
                {!canManageCommands && (
                  <div className="note-block"><span>权限</span><ul><li>指令规则会触发自动外发，因此仅超级管理员可维护</li></ul></div>
                )}
              </div>
            </section>

            <section className="panel panel-flush">
              <div className="panel-head">
                <div className="panel-title"><Terminal size={15} aria-hidden="true" />指令库</div>
                <span className="panel-meta">{cmccCommands.length} 条规则</span>
              </div>
              <div className="data-list">
                {cmccCommands.length ? cmccCommands.map((command) => (
                  <div className="data-row col-template" key={command.key}>
                    <button className="row-pick" type="button" onClick={() => setCmccCommandForm({ ...EMPTY_CMCC_COMMAND_FORM, ...command })}>
                      <strong>{command.name}</strong>
                      <small>{command.key} · {cmccMatchTypeLabel(command.matchType)} · {command.pattern}</small>
                    </button>
                    <span className={`tag tone-${command.enabled ? 'ok' : 'neutral'}`}>{command.enabled ? '启用' : '停用'}</span>
                    <button className="icon-action danger" type="button" title="删除指令规则" aria-label={`删除指令规则 ${command.name}`} disabled={!canManageCommands} onClick={() => setPendingAction({ type: 'delete-cmcc-command', command })}><X size={15} /></button>
                  </div>
                )) : <div className="data-list-empty"><span>暂无指令规则，未命中规则时手机发送 /help 可获取帮助文本</span></div>}
              </div>
            </section>
          </div>
        )}

        {tab === 'test' && (
          <div className="split">
            <section className="panel">
              <div className="panel-head">
                <div className="panel-title"><ShieldCheck size={15} aria-hidden="true" />发送测试通知</div>
                <span className="panel-meta">单用户验证</span>
              </div>
              <div className="panel-body">
                <div className="form-stack">
                  <div className="config-field"><span>通知渠道</span><SelectControl ariaLabel="测试通知渠道" value={form.channel} onChange={(value) => setForm({ ...form, channel: value, content: form.content.slice(0, value === 'app' ? 500 : form.msgType === 'markdown' ? 4096 : 2048) })} options={TEST_CHANNEL_OPTIONS} /></div>
                  {!isAppTest && <div className="config-field"><span>消息类型</span><SelectControl ariaLabel="测试消息类型" value={form.msgType} onChange={(value) => setForm({ ...form, msgType: value, content: form.content.slice(0, value === 'markdown' ? 4096 : 2048) })} options={TYPE_OPTIONS.filter((option) => ['text', 'markdown'].includes(option.value))} /></div>}
                  {isAppTest
                    ? (
                      <>
                        <div className="config-field"><span>接收用户</span><SelectControl ariaLabel="App 通知接收用户" value={form.appUserId} options={appUserOptions} onChange={(value) => setForm({ ...form, appUserId: value })} /></div>
                        <label className="config-field"><span>通知标题</span><input value={form.appTitle} maxLength={120} onChange={(event) => setForm({ ...form, appTitle: event.target.value })} /></label>
                        <div className="config-field"><span>优先级</span><SelectControl ariaLabel="App 通知优先级" value={form.appPriority} onChange={(value) => setForm({ ...form, appPriority: value })} options={APP_PRIORITY_OPTIONS} /></div>
                      </>
                    )
                    : (
                      <label className="config-field">
                        <span>企业微信用户 ID</span>
                        <span className="input-shell"><UserRound size={15} aria-hidden="true" /><input value={form.touser} maxLength={64} autoComplete="off" placeholder="例如 zhangsan" onChange={(event) => setForm({ ...form, touser: event.target.value })} /></span>
                      </label>
                    )}
                  <label className="config-field">
                    <span>消息内容</span>
                    <textarea value={form.content} maxLength={contentLimit} rows={8} placeholder="输入测试消息" onChange={(event) => setForm({ ...form, content: event.target.value })} />
                    <small>{form.content.length} / {contentLimit}</small>
                  </label>
                </div>
                <button className="btn btn-primary btn-block notify-send-button" type="button" disabled={!canSubmitTest} onClick={() => setPendingAction({ type: 'test' })}><Send size={15} />发送测试</button>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <div className="panel-title">{isAppTest ? <Smartphone size={15} aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}消息预览</div>
                <span className="panel-meta">{isAppTest ? 'Android App' : '企业微信'}</span>
              </div>
              <div className="panel-body">
                <div className="message-preview">
                  <span>{isAppTest ? `${priorityLabel(form.appPriority)} · App 收件箱卡片` : form.msgType === 'markdown' ? 'Markdown（仅企业微信）' : '文本消息（兼容微信）'}</span>
                  {isAppTest && <strong>{form.appTitle.trim() || 'Android App 通知测试'}</strong>}
                  <pre>{preview}</pre>
                  <small>发送给 {isAppTest ? form.appUserId.trim() || '未选择平台用户' : form.touser.trim() || '未选择用户'}</small>
                </div>
              </div>
            </section>
          </div>
        )}

        {tab === 'jobs' && (
          <div className="split">
            <section className="panel">
              <div className="panel-head">
                <div className="panel-title"><CalendarClock size={15} aria-hidden="true" />安排通知</div>
                <span className="panel-meta">编排</span>
              </div>
              <div className="panel-body">
                <div className="form-stack">
                  <div className="config-field"><span>消息模板</span><SelectControl ariaLabel="消息模板" value={jobForm.templateKey} onChange={(value) => setJobForm({ ...jobForm, templateKey: value })} options={[{ value: '', label: '选择模板' }, ...templates.filter((item) => item.enabled).map((item) => ({ value: item.key, label: item.name }))]} /></div>
                  <label className="config-field"><span>企业微信用户 ID</span><input value={jobForm.touser} maxLength={64} onChange={(event) => setJobForm({ ...jobForm, touser: event.target.value })} /></label>
                  <label className="config-field"><span>计划时间</span><input type="datetime-local" value={jobForm.scheduledAt} onChange={(event) => setJobForm({ ...jobForm, scheduledAt: event.target.value })} /></label>
                  <label className="config-field"><span>去重键</span><input value={jobForm.dedupeKey} maxLength={160} onChange={(event) => setJobForm({ ...jobForm, dedupeKey: event.target.value })} /></label>
                  <label className="config-field"><span>模板变量 JSON</span><textarea rows={5} value={jobForm.variables} onChange={(event) => setJobForm({ ...jobForm, variables: event.target.value })} /></label>
                </div>
                <button className="btn btn-primary btn-block notify-send-button" type="button" disabled={!canOperate || !jobForm.templateKey || !jobForm.touser.trim() || submitting} onClick={scheduleJob}><CalendarClock size={15} />创建任务</button>
              </div>
            </section>

            <section className="panel panel-flush">
              <div className="panel-head">
                <div className="panel-title"><Activity size={15} aria-hidden="true" />任务队列</div>
                <span className="panel-meta">{jobs.total || 0} 个任务</span>
              </div>
              <div className="data-list">
                {jobs.items?.length ? jobs.items.map((job) => (
                  <div className="data-row col-template" key={job.id}>
                    <span className="cell-stack">
                      <strong>{job.templateKey || typeLabel(job.msgType)}</strong>
                      <small>{targetLabel(job)} · {formatDateTime(job.scheduledAt)}</small>
                    </span>
                    <span className={`tag tone-${['scheduled', 'retrying', 'queued'].includes(job.status) ? 'info' : job.status === 'failed' ? 'danger' : 'ok'}`}>{job.status}</span>
                    <button className="icon-action danger" type="button" title="取消任务" aria-label="取消任务" disabled={!canOperate || !['scheduled', 'retrying'].includes(job.status)} onClick={() => setPendingAction({ type: 'cancel-job', job })}><X size={15} /></button>
                  </div>
                )) : <div className="data-list-empty"><span>暂无计划任务</span></div>}
              </div>
            </section>
          </div>
        )}

        {tab === 'templates' && (
          <div className="split">
            <section className="panel">
              <div className="panel-head">
                <div className="panel-title"><FileText size={15} aria-hidden="true" />编辑消息模板</div>
                <span className="panel-meta">模板</span>
              </div>
              <div className="panel-body">
                <div className="form-stack">
                  <label className="config-field"><span>模板标识</span><input value={templateForm.key} maxLength={80} disabled={Boolean(templates.some((item) => item.key === templateForm.key))} onChange={(event) => setTemplateForm({ ...templateForm, key: event.target.value })} /></label>
                  <label className="config-field"><span>显示名称</span><input value={templateForm.name} maxLength={100} onChange={(event) => setTemplateForm({ ...templateForm, name: event.target.value })} /></label>
                  <div className="config-field"><span>消息类型</span><SelectControl ariaLabel="模板消息类型" value={templateForm.msgType} onChange={(value) => setTemplateForm({ ...templateForm, msgType: value })} options={TYPE_OPTIONS.filter((item) => ['text', 'markdown'].includes(item.value))} /></div>
                  <label className="config-field"><span>内容</span><textarea rows={8} value={templateForm.content} maxLength={4096} onChange={(event) => setTemplateForm({ ...templateForm, content: event.target.value })} /></label>
                  <label className="config-toggle">
                    <span><strong>启用模板</strong><small>停用后不可用于计划任务</small></span>
                    <input type="checkbox" checked={templateForm.enabled} onChange={(event) => setTemplateForm({ ...templateForm, enabled: event.target.checked })} />
                  </label>
                </div>
                <button className="btn btn-primary btn-block notify-send-button" type="button" disabled={session.user?.role !== 'super_admin' || !templateForm.key.trim() || !templateForm.name.trim() || !templateForm.content.trim() || submitting} onClick={saveTemplate}><Save size={15} />保存模板</button>
              </div>
            </section>

            <section className="panel panel-flush">
              <div className="panel-head">
                <div className="panel-title"><FileText size={15} aria-hidden="true" />模板库</div>
                <span className="panel-meta">{templates.length} 个模板</span>
              </div>
              <div className="data-list">
                {templates.length ? templates.map((template) => (
                  <div className="data-row col-template" key={template.key}>
                    <button className="row-pick" type="button" onClick={() => setTemplateForm({ ...template })}>
                      <strong>{template.name}</strong>
                      <small>{template.key} · {typeLabel(template.msgType)}</small>
                    </button>
                    <span className={`tag tone-${template.enabled ? 'ok' : 'neutral'}`}>{template.enabled ? '启用' : '停用'}</span>
                    <button className="icon-action danger" type="button" title="删除模板" aria-label={`删除模板 ${template.name}`} disabled={session.user?.role !== 'super_admin'} onClick={() => setPendingAction({ type: 'delete-template', template })}><X size={15} /></button>
                  </div>
                )) : <div className="data-list-empty"><span>暂无模板</span></div>}
              </div>
            </section>
          </div>
        )}

        {tab === 'preferences' && (
          <section className="panel">
            <div className="panel-head">
              <div className="panel-title"><UserRound size={15} aria-hidden="true" />接收偏好与免打扰</div>
              <span className="panel-meta">用户策略</span>
            </div>
            <div className="panel-body">
              <div className="preference-form">
                <label className="config-field"><span>平台用户 ID</span><input value={preferenceForm.targetId} maxLength={64} onChange={(event) => setPreferenceForm({ ...preferenceForm, targetId: event.target.value })} /></label>
                <button className="btn btn-secondary" type="button" disabled={!canOperate || !preferenceForm.targetId.trim()} onClick={loadPreference}>读取</button>
                <label className="config-toggle">
                  <span><strong>允许接收</strong><small>关闭后不再下发任何通知</small></span>
                  <input type="checkbox" checked={preferenceForm.enabled} onChange={(event) => setPreferenceForm({ ...preferenceForm, enabled: event.target.checked })} />
                </label>
                <label className="config-field"><span>免打扰开始</span><input type="time" value={preferenceForm.quietStart} onChange={(event) => setPreferenceForm({ ...preferenceForm, quietStart: event.target.value })} /></label>
                <label className="config-field"><span>免打扰结束</span><input type="time" value={preferenceForm.quietEnd} onChange={(event) => setPreferenceForm({ ...preferenceForm, quietEnd: event.target.value })} /></label>
                <button className="btn btn-primary" type="button" disabled={!canOperate || !preferenceForm.targetId.trim() || submitting} onClick={savePreference}><Save size={15} />保存偏好</button>
              </div>
            </div>
          </section>
        )}

        {tab === 'api' && <NotificationApiAccess session={session} onError={setError} onMessage={setMessage} />}

        </div>
      </div>
      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={confirmTitle}
        description={confirmDescription}
        detail={confirmDetail}
        confirmLabel={pendingAction?.type === 'retry' ? '确认重试' : pendingAction?.type === 'cancel-job' ? '确认取消' : ['delete-template', 'delete-cmcc-command'].includes(pendingAction?.type) ? '确认删除' : pendingAction?.type === 'cmcc-probe' ? '开始自检' : '确认发送'}
        tone="primary"
        busy={submitting}
        onCancel={() => !submitting && setPendingAction(null)}
        onConfirm={confirmAction}
      />
    </section>
  );
}
