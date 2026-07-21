// MY Platform Official Website - Dynamic Floating Island & Responsive Motion Engine

document.addEventListener('DOMContentLoaded', () => {
  initQuantumCanvas();
  init3DTiltCards();
  initNumberCounters();
  initFloatingNavbar();
  initMobileDrawer();
});

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

// Number Counter Animation
function initNumberCounters() {
  const counters = document.querySelectorAll('.counter');
  if (!counters.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const counter = entry.target;
          const target = parseFloat(counter.getAttribute('data-target'));
          const duration = 2000;
          const isDecimal = target % 1 !== 0;
          const stepTime = 30;
          const steps = duration / stepTime;
          let current = 0;
          const increment = target / steps;

          const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
              counter.innerText = isDecimal ? target.toFixed(2) : Math.floor(target).toLocaleString();
              clearInterval(timer);
            } else {
              counter.innerText = isDecimal ? current.toFixed(2) : Math.floor(current).toLocaleString();
            }
          }, stepTime);

          observer.unobserve(counter);
        }
      });
    },
    { threshold: 0.5 }
  );

  counters.forEach((counter) => observer.observe(counter));
}

// Floating Dynamic Island Menu & Scroll
function initFloatingNavbar() {
  const navbar = document.getElementById('navbar');
  const menu = document.getElementById('nav-menu');
  const indicator = document.getElementById('menu-indicator');
  const items = document.querySelectorAll('.menu-item');

  function updateIndicator(target) {
    if (!indicator || !target || !menu || window.innerWidth < 1024) return;
    const rect = target.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    indicator.style.width = `${rect.width}px`;
    indicator.style.left = `${rect.left - menuRect.left}px`;
  }

  setTimeout(() => {
    const activeItem = document.querySelector('.menu-item.active');
    if (activeItem) updateIndicator(activeItem);
  }, 100);

  items.forEach((item) => {
    item.addEventListener('mouseenter', () => updateIndicator(item));
    item.addEventListener('click', function (e) {
      e.preventDefault();
      items.forEach((i) => i.classList.remove('active'));
      this.classList.add('active');
      updateIndicator(this);

      const targetId = this.getAttribute('href');
      if (targetId && targetId.startsWith('#')) {
        const targetElem = document.querySelector(targetId);
        if (targetElem) {
          targetElem.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
  });

  menu?.addEventListener('mouseleave', () => {
    const currentActive = document.querySelector('.menu-item.active');
    if (currentActive) updateIndicator(currentActive);
  });

  window.addEventListener('scroll', () => {
    if (window.scrollY > 30) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });
}

// Mobile Drawer Interaction
function initMobileDrawer() {
  const toggleBtn = document.getElementById('mobile-toggle');
  const drawer = document.getElementById('mobile-drawer');
  const navLinks = document.querySelectorAll('.mobile-nav-link');

  if (!toggleBtn || !drawer) return;

  toggleBtn.addEventListener('click', () => {
    toggleBtn.classList.toggle('active');
    drawer.classList.toggle('open');
  });

  navLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      toggleBtn.classList.remove('active');
      drawer.classList.remove('open');

      const targetId = link.getAttribute('href');
      if (targetId && targetId.startsWith('#')) {
        const targetElem = document.querySelector(targetId);
        if (targetElem) {
          targetElem.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
  });
}
