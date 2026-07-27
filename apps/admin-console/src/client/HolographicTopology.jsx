import {
  AppWindow,
  Bell,
  Bot,
  Boxes,
  CheckCircle2,
  CircleAlert,
  CircleOff,
  Clock3,
  GraduationCap,
  Network,
  Radio,
} from 'lucide-react';

const SERVICE_LAYOUT = [
  { id: 'ct8-automation', fallbackName: 'CT8 GitHub 自动化', side: 'left', row: 1, icon: Bot, tone: 'slate' },
  { id: 'notify', fallbackName: '企业微信通知', side: 'left', row: 2, icon: Bell, tone: 'green' },
  { id: 'exam', fallbackName: '考试学习平台', side: 'left', row: 3, icon: GraduationCap, tone: 'cyan' },
  { id: 'core', fallbackName: '综合小程序平台', side: 'right', row: 1, icon: Boxes, tone: 'blue' },
  { id: 'campus', fallbackName: '地大智览', side: 'right', row: 2, icon: AppWindow, tone: 'amber' },
  { id: 'mqtt', fallbackName: 'MQTT 设备平台', side: 'right', row: 3, icon: Radio, tone: 'purple' },
];

const STATE_META = {
  healthy: { label: '运行正常', shortLabel: '正常', icon: CheckCircle2 },
  degraded: { label: '响应异常', shortLabel: '异常', icon: CircleAlert },
  offline: { label: '暂不可用', shortLabel: '离线', icon: CircleOff },
  unmonitored: { label: '未接入监测', shortLabel: '未监测', icon: Clock3 },
};

function formatLatency(value) {
  return Number.isFinite(value) ? `${Math.round(value)} ms` : '--';
}

function formatCheckedAt(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function buildTopologyServices(services) {
  return SERVICE_LAYOUT.map((layout) => {
    const service = services.find((candidate) => candidate.id === layout.id);
    return {
      ...layout,
      ...(service || {}),
      id: layout.id,
      name: service?.name || layout.fallbackName,
      state: service?.state || 'unmonitored',
    };
  });
}

function ServiceNode({ service, onSelectService }) {
  const state = STATE_META[service.state] || STATE_META.unmonitored;
  const StateIcon = state.icon;
  const ServiceIcon = service.icon;
  const canOpen = Boolean(service.adminUrl && onSelectService);
  const className = `dependency-service-card is-${service.state} is-${service.side} row-${service.row}`;
  const content = (
    <>
      <span className={`dependency-service-icon tone-${service.tone}`} aria-hidden="true">
        <ServiceIcon size={16} />
      </span>
      <span className="dependency-service-copy">
        <strong title={service.name}>{service.name}</strong>
        <span className={`dependency-state is-${service.state}`}>
          <StateIcon size={11} />
          {state.label}
        </span>
      </span>
      <span className="dependency-service-metrics">
        <span><small>响应</small><strong>{formatLatency(service.latencyMs)}</strong></span>
        <span><small>HTTP</small><strong>{service.httpStatus || '--'}</strong></span>
        <span><small>检查</small><strong>{formatCheckedAt(service.checkedAt)}</strong></span>
      </span>
    </>
  );

  if (!canOpen) return <article className={className}>{content}</article>;

  return (
    <button
      className={className}
      type="button"
      onClick={() => onSelectService(service)}
      aria-label={`打开${service.name}`}
    >
      {content}
    </button>
  );
}

export function HolographicTopology({ services = [], monitoringEnabled = true, onSelectService }) {
  const topologyServices = buildTopologyServices(services);
  const total = topologyServices.length;
  const healthyCount = topologyServices.filter((service) => service.state === 'healthy').length;
  const attentionCount = topologyServices.filter((service) => ['degraded', 'offline'].includes(service.state)).length;
  const latencies = topologyServices.map((service) => service.latencyMs).filter(Number.isFinite);
  const averageLatency = latencies.length
    ? Math.round(latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length)
    : null;
  const gatewayState = topologyServices.some((service) => service.state === 'offline')
    ? 'offline'
    : topologyServices.some((service) => service.state === 'degraded')
      ? 'degraded'
      : topologyServices.every((service) => service.state === 'healthy')
        ? 'healthy'
        : 'unmonitored';
  const gatewayMeta = STATE_META[gatewayState];
  const GatewayStateIcon = gatewayMeta.icon;

  return (
    <section className="dependency-topology" aria-label="全网服务链路">
      <header className="dependency-topology-header">
        <div className="dependency-title-group">
          <span className="dependency-title-icon" aria-hidden="true"><Network size={17} /></span>
          <div>
            <h3>全网服务链路</h3>
            <p>核心网关与 {total} 个业务服务</p>
          </div>
        </div>
        <div className="dependency-summary" aria-label="服务链路摘要">
          <span className="dependency-summary-item">
            <small>服务可用</small>
            <strong className="is-healthy">{healthyCount} / {total}</strong>
          </span>
          <span className="dependency-summary-item">
            <small>平均响应</small>
            <strong>{formatLatency(averageLatency)}</strong>
          </span>
          <span className="dependency-summary-item">
            <small>需关注</small>
            <strong className={attentionCount > 0 ? 'has-attention' : ''}>{attentionCount}</strong>
          </span>
          <span className={`dependency-refresh-state ${monitoringEnabled ? 'is-active' : ''}`}>
            <i />
            {monitoringEnabled ? '自动轮询' : '轮询暂停'}
          </span>
        </div>
      </header>

      <div className="dependency-stage">
        <svg
          className="dependency-links"
          viewBox="0 0 1000 330"
          preserveAspectRatio="none"
          role="img"
          aria-label="核心网关与六个服务的依赖关系"
        >
          {topologyServices.map((service) => {
            const left = service.side === 'left';
            const y = [55, 165, 275][service.row - 1];
            const startX = left ? 196 : 804;
            const endX = left ? 432 : 568;
            const endY = 151 + (service.row - 2) * 14;
            const controlX = left ? 345 : 655;
            return (
              <path
                key={service.id}
                className={`dependency-link is-${service.state}`}
                d={`M ${startX} ${y} C ${controlX} ${y}, ${controlX} ${endY}, ${endX} ${endY}`}
              />
            );
          })}
        </svg>

        <div className="dependency-layout">
          {topologyServices.map((service) => (
            <ServiceNode key={service.id} service={service} onSelectService={onSelectService} />
          ))}

          <div className={`dependency-gateway is-${gatewayState}`}>
            <span className="dependency-gateway-kicker">PLATFORM GATEWAY</span>
            <strong>全网核心网关</strong>
            <span className="dependency-gateway-stat">
              {averageLatency === null ? '等待状态同步' : `${healthyCount} 个服务在线 · ${formatLatency(averageLatency)}`}
            </span>
            <span className={`dependency-gateway-state is-${gatewayState}`}>
              <GatewayStateIcon size={12} />
              {gatewayMeta.shortLabel}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
