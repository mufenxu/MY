(function (global) {
  'use strict';

  const DESKTOP_BREAKPOINT = 992;
  const RESIZE_DEBOUNCE_MS = 250;
  const SWIPE_CLOSE_DISTANCE = 50;
  const SWIPE_VERTICAL_TOLERANCE = 30;

  function createLayoutController(options = {}) {
    const {
      sidebar,
      sidebarOverlay,
      mobileMenuToggle,
      mainContent,
      subnavSelector = '.custom-subnav-item'
    } = options;

    let resizeDebounceTimer = null;
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;

    function setMobileSidebarOpen(isOpen) {
      const active = Boolean(isOpen);

      if (sidebar) {
        if (!sidebar.id) {
          sidebar.id = 'sidebar-navigation';
        }
        sidebar.classList.toggle('active', active);
      }

      if (sidebarOverlay) {
        sidebarOverlay.classList.toggle('active', active);
      }

      if (mobileMenuToggle) {
        mobileMenuToggle.setAttribute('aria-expanded', String(active));
        mobileMenuToggle.setAttribute('aria-controls', 'sidebar-navigation');
      }

      document.body.classList.toggle('sidebar-open', active);
    }

    function bindMobileSidebar() {
      if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', () => {
          const nextState = !(sidebar && sidebar.classList.contains('active'));
          setMobileSidebarOpen(nextState);
        });
      }

      if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', () => {
          setMobileSidebarOpen(false);
        });
      }

      if (mainContent) {
        mainContent.addEventListener('click', () => {
          if (sidebar && sidebar.classList.contains('active')) {
            setMobileSidebarOpen(false);
          }
        });
      }

      window.addEventListener('resize', () => {
        clearTimeout(resizeDebounceTimer);
        resizeDebounceTimer = setTimeout(() => {
          if (window.innerWidth > DESKTOP_BREAKPOINT) {
            setMobileSidebarOpen(false);
          }
        }, RESIZE_DEBOUNCE_MS);
      });
    }

    function bindSubnav() {
      document.querySelectorAll(subnavSelector).forEach((item) => {
        item.addEventListener('click', () => {
          const subtabId = item.dataset.subtab;
          const container = item.closest('.custom-layout-with-subnav');
          if (!container) return;

          container.querySelectorAll(subnavSelector).forEach((button) => {
            button.classList.toggle('active', button === item);
          });

          container.querySelectorAll('.subtab-content').forEach((pane) => {
            const isMatch = pane.id.endsWith(subtabId) || pane.id.includes(`-subtab-${subtabId}`);
            pane.classList.toggle('hidden', !isMatch);
          });
        });
      });
    }

    function bindSwipeToClose() {
      if (!sidebar || !sidebarOverlay) return;

      function handleTouchStart(event) {
        startX = event.touches[0].clientX;
        startY = event.touches[0].clientY;
        currentX = startX;
        currentY = startY;
      }

      function handleTouchMove(event) {
        currentX = event.touches[0].clientX;
        currentY = event.touches[0].clientY;
      }

      function handleTouchEnd() {
        const deltaX = startX - currentX;
        const deltaY = Math.abs(startY - currentY);

        if (deltaX > SWIPE_CLOSE_DISTANCE && deltaY < SWIPE_VERTICAL_TOLERANCE && sidebar.classList.contains('active')) {
          setMobileSidebarOpen(false);
        }
      }

      [sidebar, sidebarOverlay].forEach((target) => {
        target.addEventListener('touchstart', handleTouchStart, { passive: true });
        target.addEventListener('touchmove', handleTouchMove, { passive: true });
        target.addEventListener('touchend', handleTouchEnd, { passive: true });
      });
    }

    function init() {
      bindMobileSidebar();
      bindSubnav();
      bindSwipeToClose();
      setMobileSidebarOpen(false);
    }

    return {
      init,
      setMobileSidebarOpen
    };
  }

  global.MqttApiLayout = {
    createLayoutController
  };
})(window);
