import { useEffect, useRef, useState } from 'react';
import { Zap, Activity, ArrowUpRight } from 'lucide-react';

const CLUSTER_CONFIGS = [
  {
    id: 'miniapp',
    name: '综合小程序平台',
    code: 'MINIAPP_PLATFORM',
    color: { main: '#0284c7', light: '#38bdf8', glow: 'rgba(56, 189, 248, 0.4)' },
    angle: -0.7, // 左上
    radiusRatio: 0.76,
    calloutDir: { dx: -60, dy: -40, align: 'right' },
    stats: { latency: '35 ms', throughput: '850 次/秒', errors: 0 },
  },
  {
    id: 'dida',
    name: '地大智览平台',
    code: 'DIDA_INTELLIGENCE',
    color: { main: '#4f46e5', light: '#818cf8', glow: 'rgba(129, 140, 248, 0.4)' },
    angle: 0.6, // 右上
    radiusRatio: 0.78,
    calloutDir: { dx: 60, dy: -40, align: 'left' },
    stats: { latency: '42 ms', throughput: '1200 次/秒', errors: 1 },
  },
  {
    id: 'exam',
    name: '考试学习平台',
    code: 'EXAM_LEARNING_SYS',
    color: { main: '#ea580c', light: '#fb923c', glow: 'rgba(251, 146, 60, 0.4)' },
    angle: 2.1, // 右下
    radiusRatio: 0.74,
    calloutDir: { dx: 60, dy: 35, align: 'left' },
    stats: { latency: '38 ms', throughput: '640 次/秒', errors: 0 },
  },
  {
    id: 'wechat',
    name: '企业微信通知',
    code: 'WECHAT_NOTIFY_SVC',
    color: { main: '#059669', light: '#34d399', glow: 'rgba(52, 211, 153, 0.4)' },
    angle: 3.8, // 左下
    radiusRatio: 0.76,
    calloutDir: { dx: -60, dy: 35, align: 'right' },
    stats: { latency: '22 ms', throughput: '2100 次/秒', errors: 0 },
  },
  {
    id: 'ct8',
    name: 'CT8 自动化中心',
    code: 'CT8_AUTOMATION_HUB',
    color: { main: '#0891b2', light: '#22d3ee', glow: 'rgba(34, 211, 238, 0.4)' },
    angle: -2.2, // 左中上
    radiusRatio: 0.72,
    calloutDir: { dx: -70, dy: -25, align: 'right' },
    stats: { latency: '45 ms', throughput: '450 次/秒', errors: 0 },
  },
  {
    id: 'mqtt',
    name: 'MQTT 设备中枢',
    code: 'MQTT_IOT_GATEWAY',
    color: { main: '#9333ea', light: '#c084fc', glow: 'rgba(192, 132, 252, 0.4)' },
    angle: 1.3, // 右中
    radiusRatio: 0.72,
    calloutDir: { dx: 70, dy: 15, align: 'left' },
    stats: { latency: '18 ms', throughput: '3200 次/秒', errors: 0 },
  },
];

export function HolographicTopology({ services = [], theme = 'dark', onSelectService }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [layoutInfo, setLayoutInfo] = useState({
    width: 720,
    height: 420,
    centerX: 360,
    centerY: 220,
    cards: [],
    gateway: { x: 360, y: 220 },
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId = 0;

    let width = 0;
    let height = 0;
    let dpr = 1;

    // 高清 Retina 物理放大与逻辑还原适配，杜绝任何发虚模糊
    const handleResize = () => {
      if (!canvas.parentElement) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.max(window.devicePixelRatio || 1, 2);

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.resetTransform();
      ctx.scale(dpr, dpr);

      // 实时计算 DOM 卡片在画布容器内的绝对定位坐标，并存入 State
      const centerX = width / 2;
      const centerY = height / 2 + 12;
      
      const isMobile = width < 540;
      const Rx = width * (isMobile ? 0.30 : 0.38);
      const Ry = height * (isMobile ? 0.26 : 0.34);

      const cardW = isMobile ? 122 : 168;
      const cardH = isMobile ? 52 : 66;

      const computedCards = CLUSTER_CONFIGS.map((cfg) => {
        const cx = centerX + Math.cos(cfg.angle) * Rx * cfg.radiusRatio;
        const cy = centerY + Math.sin(cfg.angle) * Ry * cfg.radiusRatio;
        
        // 手机端将引线长度缩短
        const dir = { ...cfg.calloutDir };
        if (isMobile) {
          dir.dx = dir.dx * 0.45;
          dir.dy = dir.dy * 0.45;
        }

        const cornerX = cx + dir.dx;
        const cornerY = cy + dir.dy;

        let rawCardX = dir.align === 'right' ? cornerX - cardW : cornerX;
        let rawCardY = dir.dy > 0 ? cornerY : cornerY - cardH;

        // 边缘 Clamping 保护，防止卡片贴边溢出
        const clampedCardX = Math.max(8, Math.min(width - cardW - 8, rawCardX));
        const clampedCardY = Math.max(38, Math.min(height - cardH - 8, rawCardY));

        return {
          id: cfg.id,
          name: cfg.name,
          code: cfg.code,
          stats: cfg.stats,
          color: cfg.color,
          cx,
          cy,
          cornerX,
          cornerY,
          x: clampedCardX,
          y: clampedCardY,
          width: cardW,
          height: cardH,
        };
      });

      setLayoutInfo({
        width,
        height,
        centerX,
        centerY,
        cards: computedCards,
        gateway: {
          x: centerX,
          y: centerY,
        },
      });
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    // 为每个集群生成细密粒子
    const clusterDots = CLUSTER_CONFIGS.map(() => {
      const dots = [];
      const numDots = 18;
      for (let i = 0; i < numDots; i++) {
        dots.push({
          rOffset: Math.random() * 26 - 13,
          aOffset: Math.random() * 1.2 - 0.6,
          size: 2.2 + Math.random() * 2.8,
          alpha: 0.6 + Math.random() * 0.4,
          speed: (Math.random() - 0.5) * 0.015,
        });
      }
      return dots;
    });

    // 路径流光粒子
    const flowParticles = Array.from({ length: 32 }, () => ({
      clusterIndex: Math.floor(Math.random() * CLUSTER_CONFIGS.length),
      pathOffset: Math.random() * 0.35 - 0.175,
      progress: Math.random(),
      speed: 0.008 + Math.random() * 0.008,
    }));

    let frameCount = 0;

    const render = () => {
      frameCount++;
      ctx.clearRect(0, 0, width, height);

      const isDark = theme === 'dark';
      const centerX = width / 2;
      const centerY = height / 2 + 12;

      const isMobile = width < 540;
      const Rx = width * (isMobile ? 0.30 : 0.38);
      const Ry = height * (isMobile ? 0.26 : 0.34);

      // 1. 绘制 5 层巨幅同心椭圆星环
      const rings = [0.28, 0.46, 0.65, 0.84, 1.0];

      rings.forEach((rRatio, idx) => {
        const rx = Rx * rRatio;
        const ry = Ry * rRatio;

        ctx.save();
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, rx, ry, 0, 0, Math.PI * 2);

        ctx.strokeStyle = isDark
          ? `rgba(56, 189, 248, ${0.14 + idx * 0.05})`
          : `rgba(2, 132, 199, ${0.16 + idx * 0.06})`;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([6, 6]);
        ctx.stroke();
        ctx.setLineDash([]);

        // 星环文字刻度：星环 1 ~ 星环 5
        ctx.font = '600 10px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = isDark ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.75)';
        ctx.textAlign = 'center';
        ctx.fillText(`星环 ${idx + 1}`, centerX, centerY - ry - 4);
        ctx.fillText(`星环 ${idx + 1}`, centerX, centerY + ry + 12);
        ctx.restore();
      });

      // 2. 喷流数据弧线 (Paths)
      CLUSTER_CONFIGS.forEach((cfg) => {
        const targetX = centerX + Math.cos(cfg.angle) * Rx * cfg.radiusRatio;
        const targetY = centerY + Math.sin(cfg.angle) * Ry * cfg.radiusRatio;

        [-10, -5, 0, 5, 10].forEach((offset) => {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(centerX, centerY);

          const midX = (centerX + targetX) / 2 + offset * 1.5;
          const midY = (centerY + targetY) / 2 + offset * 1.5;
          const ctrlX = midX + Math.sin(cfg.angle) * offset * 2;
          const ctrlY = midY - Math.cos(cfg.angle) * offset * 2;

          ctx.quadraticCurveTo(ctrlX, ctrlY, targetX, targetY);

          const pathGrad = ctx.createLinearGradient(centerX, centerY, targetX, targetY);
          if (isDark) {
            pathGrad.addColorStop(0, 'rgba(56, 189, 248, 0.65)');
            pathGrad.addColorStop(1, cfg.color.glow);
          } else {
            pathGrad.addColorStop(0, 'rgba(2, 132, 199, 0.55)');
            pathGrad.addColorStop(1, cfg.color.glow);
          }

          ctx.strokeStyle = pathGrad;
          ctx.lineWidth = offset === 0 ? 1.8 : 0.9;
          ctx.stroke();
          ctx.restore();
        });
      });

      // 3. 路径粒子
      flowParticles.forEach((p) => {
        p.progress += p.speed;
        if (p.progress > 1) p.progress = 0;

        const cfg = CLUSTER_CONFIGS[p.clusterIndex];
        const targetX = centerX + Math.cos(cfg.angle) * Rx * cfg.radiusRatio;
        const targetY = centerY + Math.sin(cfg.angle) * Ry * cfg.radiusRatio;

        const t = p.progress;
        const midX = (centerX + targetX) / 2;
        const midY = (centerY + targetY) / 2;
        const ctrlX = midX + p.pathOffset * 30;
        const ctrlY = midY + p.pathOffset * 30;

        const curX = (1 - t) * (1 - t) * centerX + 2 * (1 - t) * t * ctrlX + t * t * targetX;
        const curY = (1 - t) * (1 - t) * centerY + 2 * (1 - t) * t * ctrlY + t * t * targetY;

        ctx.save();
        ctx.fillStyle = isDark ? '#ffffff' : cfg.color.light;
        ctx.shadowColor = cfg.color.light;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(curX, curY, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // 4. 中央全清太阳网关 (核心网关发光底层)
      ctx.save();
      const sunR = 30;

      const sunAura = ctx.createRadialGradient(centerX, centerY, 5, centerX, centerY, sunR * 3);
      if (isDark) {
        sunAura.addColorStop(0, 'rgba(56, 189, 248, 0.95)');
        sunAura.addColorStop(0.5, 'rgba(168, 85, 247, 0.4)');
        sunAura.addColorStop(1, 'rgba(0,0,0,0)');
      } else {
        sunAura.addColorStop(0, 'rgba(2, 132, 199, 0.9)');
        sunAura.addColorStop(0.5, 'rgba(79, 70, 229, 0.3)');
        sunAura.addColorStop(1, 'rgba(255,255,255,0)');
      }

      ctx.fillStyle = sunAura;
      ctx.beginPath();
      ctx.arc(centerX, centerY, sunR * 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowColor = isDark ? '#38bdf8' : '#0284c7';
      ctx.shadowBlur = 20;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(centerX, centerY, sunR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 5. 渲染 6 大微服务节点集群的星点与连线
      CLUSTER_CONFIGS.forEach((cfg, cIdx) => {
        const cx = centerX + Math.cos(cfg.angle) * Rx * cfg.radiusRatio;
        const cy = centerY + Math.sin(cfg.angle) * Ry * cfg.radiusRatio;
        const isHovered = hoveredId === cfg.id;

        const dots = clusterDots[cIdx];

        dots.forEach((d) => {
          d.aOffset += d.speed;
          const px = cx + Math.cos(d.aOffset) * (18 + d.rOffset);
          const py = cy + Math.sin(d.aOffset) * (14 + d.rOffset * 0.7);

          ctx.save();
          ctx.fillStyle = cfg.color.light;
          ctx.shadowColor = cfg.color.main;
          ctx.shadowBlur = isHovered ? 12 : 6;
          ctx.globalAlpha = d.alpha;
          ctx.beginPath();
          ctx.arc(px, py, isHovered ? d.size * 1.3 : d.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });

        // 绘制集群核心大亮点
        ctx.save();
        ctx.shadowColor = cfg.color.main;
        ctx.shadowBlur = isHovered ? 24 : 14;
        ctx.fillStyle = cfg.color.main;
        ctx.beginPath();
        ctx.arc(cx, cy, isHovered ? 10 : 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 绘制高科技引线 Leader Line（连接到 DOM 卡片的边缘）
        const dir = { ...cfg.calloutDir };
        if (isMobile) {
          dir.dx = dir.dx * 0.45;
          dir.dy = dir.dy * 0.45;
        }
        const cornerX = cx + dir.dx;
        const cornerY = cy + dir.dy;

        ctx.save();
        ctx.strokeStyle = isHovered
          ? (isDark ? '#38bdf8' : '#0284c7')
          : (isDark ? 'rgba(148, 163, 184, 0.55)' : 'rgba(100, 116, 139, 0.55)');
        ctx.lineWidth = isHovered ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cornerX, cy);
        ctx.lineTo(cornerX, cornerY);
        ctx.stroke();

        ctx.fillStyle = cfg.color.main;
        ctx.beginPath();
        ctx.arc(cornerX, cornerY, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [services, theme, hoveredId]);

  const handleCardClick = (cfgId, cfgName) => {
    if (onSelectService) {
      const matchedService = services.find(
        (s) => s.id === cfgId || s.name.includes(cfgName)
      ) || { id: cfgId, name: cfgName, adminUrl: '' };
      onSelectService(matchedService);
    }
  };

  return (
    <div
      ref={containerRef}
      className="holographic-topology-container galaxy-topology-view full-viewport-galaxy"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      {/* 1. 顶部纯中文标题控制栏 (100% 矢量 DOM 渲染) */}
      <div className="galaxy-top-controls">
        <div className="galaxy-title">
          <Zap size={16} />
          <span>微服务星系全息拓扑网</span>
        </div>
      </div>

      {/* 2. 动画 Canvas (仅用于流光星轨) */}
      <canvas ref={canvasRef} className="holographic-canvas" />

      {/* 3. 中央 API 网关原生 HTML Card (100% 极清文字) */}
      <div
        className="absolute-gateway-tag"
        style={{
          position: 'absolute',
          left: `${layoutInfo.gateway.x}px`,
          top: `${layoutInfo.gateway.y}px`,
          transform: 'translate(-50%, 38px)',
          zIndex: 6,
        }}
      >
        <div className="gateway-inner-title">全网核心网关</div>
        <div className="gateway-inner-stats">实时流量: 1.93k 次/秒</div>
      </div>

      <div
        className="absolute-gateway-sun-text"
        style={{
          position: 'absolute',
          left: `${layoutInfo.gateway.x}px`,
          top: `${layoutInfo.gateway.y}px`,
          transform: 'translate(-50%, -50%)',
          zIndex: 6,
          pointerEvents: 'none',
          fontFamily: 'system-ui, sans-serif',
          fontSize: '12.5px',
          fontWeight: '700',
          color: '#0284c7',
        }}
      >
        网关
      </div>

      {/* 4. 6 大微服务节点原生 HTML Card (100% 极清文字，防发虚) */}
      {layoutInfo.cards.map((card) => {
        const isHovered = hoveredId === card.id;
        return (
          <div
            key={card.id}
            className={`absolute-galaxy-card ${isHovered ? 'hovered' : ''}`}
            style={{
              position: 'absolute',
              left: `${card.x}px`,
              top: `${card.y}px`,
              width: `${card.width}px`,
              height: 'auto',
              borderColor: isHovered ? card.color.main : undefined,
              boxShadow: isHovered ? `0 6px 20px ${card.color.glow}` : undefined,
              zIndex: isHovered ? 10 : 7,
            }}
            onMouseEnter={() => setHoveredId(card.id)}
            onMouseLeave={() => setHoveredId(null)}
            onClick={() => handleCardClick(card.id, card.name)}
          >
            <div className="card-top-row">
              <strong className="card-service-name">{card.name}</strong>
            </div>
            <div className="card-middle-row">
              <span className="card-status-dot" style={{ backgroundColor: card.color.main }} />
              <span className="card-status-text" style={{ color: card.color.main }}>运行正常</span>
              <span className="card-uptime-rate">99.8%</span>
            </div>
            <div className="card-metrics-row">
              <span>响应: {card.stats.latency}</span>
              <span>吞吐: {card.stats.throughput}</span>
            </div>
            <div className="card-bottom-row">
              <span className="card-errors-num">错误: {card.stats.errors}</span>
            </div>
          </div>
        );
      })}

      {/* 5. 底部纯中文图例 (100% 矢量 DOM 渲染) */}
      <div className="galaxy-legend">
        <span className="legend-item"><i className="legend-dot core" /> 核心网关</span>
        <span className="legend-item"><i className="legend-dot nodes" /> 服务节点</span>
        <span className="legend-item"><i className="legend-dot paths" /> 链路路径</span>
        <span className="legend-item"><i className="legend-dot alerts" /> 告警事件</span>
      </div>
    </div>
  );
}
