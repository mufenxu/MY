// MY Platform Official Website - Dynamic Floating Island & Responsive Motion Engine

document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
  initQuantumCanvas();
  init3DTiltCards();
  initPlatformStatus();
});

function initThemeToggle() {
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;

  function updateLabel() {
    const isDark = document.documentElement.dataset.theme === 'dark';
    const label = isDark ? '切换至浅色模式' : '切换至深色模式';
    toggle.setAttribute('aria-label', label);
    toggle.setAttribute('title', label);
  }

  toggle.addEventListener('click', () => {
    const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nextTheme;
    try {
      localStorage.setItem('my-official-theme', nextTheme);
    } catch {
      // 受限浏览器环境下仍允许本次切换生效。
    }
    updateLabel();
  });

  updateLabel();
}

// Interactive Particle Background
function initQuantumCanvas() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);
  let animationFrame = 0;
  let particles = createParticles();

  function createParticles() {
    const densityCount = Math.floor((width * height) / 22000);
    const particleCount = Math.min(Math.max(densityCount, 18), window.innerWidth < 768 ? 28 : 48);
    return Array.from({ length: particleCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.65,
      vy: (Math.random() - 0.5) * 0.65,
      radius: Math.random() * 1.6 + 1.2,
      color: Math.random() > 0.4 ? 'rgba(217, 119, 36, 0.4)' : 'rgba(139, 92, 246, 0.3)',
    }));
  }

  function handleResize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    particles = createParticles();
    if (motionQuery.matches) drawFrame(false);
  }

  window.addEventListener('resize', handleResize, { passive: true });

  const mouse = { x: null, y: null, radius: 180 };

  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  }, { passive: true });

  window.addEventListener('mouseleave', () => {
    mouse.x = null;
    mouse.y = null;
  });

  function drawFrame(moveParticles = true) {
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (moveParticles) {
        p.x += p.vx;
        p.y += p.vy;
      }

      if (p.x < 0 || p.x > width) p.vx *= -1;
      if (p.y < 0 || p.y > height) p.vy *= -1;

      if (mouse.x !== null && mouse.y !== null) {
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const distSquared = dx * dx + dy * dy;

        if (distSquared > 0 && distSquared < mouse.radius * mouse.radius) {
          const dist = Math.sqrt(distSquared);
          const force = (mouse.radius - dist) / mouse.radius;
          p.x -= (dx / dist) * force * 3;
          p.y -= (dy / dist) * force * 3;
        }
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();

      for (let j = i + 1; j < particles.length; j++) {
        const p2 = particles[j];
        const dx = p.x - p2.x;
        const dy = p.y - p2.y;
        const distSquared = dx * dx + dy * dy;

        if (distSquared < 19600) {
          const dist = Math.sqrt(distSquared);
          const alpha = (1 - dist / 140) * 0.25;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = `rgba(217, 119, 36, ${alpha})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

  }

  function animate() {
    drawFrame();
    animationFrame = requestAnimationFrame(animate);
  }

  function syncAnimation() {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    if (document.hidden || motionQuery.matches) {
      drawFrame(false);
      return;
    }
    animate();
  }

  document.addEventListener('visibilitychange', syncAnimation);
  motionQuery.addEventListener('change', syncAnimation);
  syncAnimation();
}

// 3D Perspective Tilt Cards
function init3DTiltCards() {
  const cards = document.querySelectorAll('.tilt-card, .tilt-element');

  cards.forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      if (window.innerWidth < 768) return; // 移动端禁用视角旋转

      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const rotateX = ((y - centerY) / centerY) * -10;
      const rotateY = ((x - centerX) / centerX) * 10;

      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
    });
  });
}

async function initPlatformStatus() {
  const card = document.querySelector('#platform-status .preview-3d-card');
  const statusLabel = document.getElementById('platform-status-label');
  const statusValue = document.getElementById('platform-status-value');
  const statusUpdated = document.getElementById('platform-status-updated');
  const healthyCount = document.getElementById('healthy-service-count');
  const totalCount = document.getElementById('total-service-count');
  const incidentCount = document.getElementById('active-incident-count');
  if (!card || !statusLabel || !statusValue) return;

  const stateMeta = {
    operational: { label: '运行正常', detail: '所有已监测服务正常' },
    degraded: { label: '部分异常', detail: '部分服务需要关注' },
    outage: { label: '服务中断', detail: '关键服务当前不可用' },
    unknown: { label: '待确认', detail: '最新探测数据不完整' },
  };

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch('/api/public/status', {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`status request failed: ${response.status}`);

    const payload = await response.json();
    const meta = stateMeta[payload.overall] || stateMeta.unknown;
    const services = Array.isArray(payload.services) ? payload.services : [];
    const monitored = services.filter((service) => service.state !== 'unmonitored');
    const healthy = monitored.filter((service) => service.state === 'healthy' && !service.stale);
    const incidents = Array.isArray(payload.incidents) ? payload.incidents : [];

    card.dataset.status = payload.overall in stateMeta ? payload.overall : 'unknown';
    statusLabel.textContent = meta.detail;
    statusValue.textContent = meta.label;
    healthyCount.textContent = String(healthy.length);
    totalCount.textContent = String(monitored.length);
    incidentCount.textContent = String(incidents.length);

    const generatedAt = Date.parse(payload.generatedAt);
    statusUpdated.textContent = Number.isFinite(generatedAt)
      ? `更新于 ${new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(generatedAt)}`
      : '已获取最新公开状态';
  } catch {
    card.dataset.status = 'unknown';
    statusLabel.textContent = '公开状态暂时无法获取';
    statusValue.textContent = '待确认';
    statusUpdated.textContent = '请稍后重试或查看原始状态接口';
  } finally {
    window.clearTimeout(timeout);
  }
}
