import { CircleAlert, CircleOff, Clock3, CheckCircle2 } from 'lucide-react';
import { STATE_META } from './shared.jsx';

const TAG_TONE = {
  healthy: 'ok',
  degraded: 'danger',
  offline: 'neutral',
  unmonitored: 'neutral',
};

const STATUS_ICON = {
  healthy: CheckCircle2,
  degraded: CircleAlert,
  offline: CircleOff,
  unmonitored: Clock3,
};

export function StatusTag({ state, label, className = '' }) {
  const meta = STATE_META[state] || STATE_META.unmonitored;
  const Icon = STATUS_ICON[state] || Clock3;
  return (
    <span className={`tag tone-${TAG_TONE[state] || 'neutral'} ${className}`.trim()}>
      <Icon size={11} aria-hidden="true" />
      {label || meta.label}
    </span>
  );
}

export function Metric({ label, value, unit, foot, size = 'm', tone = '', className = '', children }) {
  return (
    <div className={`metric metric-${size} ${tone ? `has-${tone}` : ''} ${className}`.trim()}>
      {label && <span className="metric-label">{label}</span>}
      <span className="metric-figure">
        {value}
        {unit && <span className="metric-unit">{unit}</span>}
      </span>
      {foot && <span className="metric-foot">{foot}</span>}
      {children}
    </div>
  );
}

export function Ruler({ value, max = 100, labels }) {
  const ratio = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  const marks = labels || [{ text: '0', at: 0 }, { text: String(max), at: max }];
  return (
    <div className="ruler" aria-hidden="true">
      <div className="ruler-ticks" />
      <div className="ruler-fill" style={{ width: `${ratio * 100}%` }} />
      <div className="ruler-marker" style={{ left: `${ratio * 100}%` }} />
      <div className="ruler-labels">
        {marks.map((mark, index) => {
          const position = Math.max(0, Math.min(100, max > 0 ? (mark.at / max) * 100 : 0));
          return (
            <span
              key={`${mark.text}-${index}`}
              style={{
                left: `${position}%`,
                translate: index === 0 ? '0 0' : position >= 96 ? '-100% 0' : '-50% 0',
              }}
            >
              {mark.text}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon = CheckCircle2, title, detail }) {
  return (
    <div className="empty">
      {Icon && <Icon size={22} aria-hidden="true" />}
      {title && <strong>{title}</strong>}
      {detail && <span>{detail}</span>}
    </div>
  );
}
