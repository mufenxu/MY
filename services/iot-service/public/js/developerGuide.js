(function (global) {
  'use strict';

  function noop() {}

  function createDeveloperGuide(options = {}) {
    const {
      guideSelector = '.developer-guide-panel',
      tabButtonSelector = '.doc-tab-btn',
      tabContentSelector = '.doc-tab-content',
      copyButtonSelector = '.copy-code-btn',
      localhostOrigin = 'http://localhost:4066',
      showToast = noop
    } = options;

    let initialized = false;

    function replaceOrigin() {
      const guidePanel = document.querySelector(guideSelector);
      if (!guidePanel) return;

      const origin = window.location.origin;
      guidePanel.querySelectorAll('pre code').forEach((codeElement) => {
        if (codeElement.innerHTML.includes(localhostOrigin)) {
          codeElement.innerHTML = codeElement.innerHTML.replace(new RegExp(localhostOrigin.replace(/\./g, '\\.'), 'g'), origin);
        }
      });
    }

    function bindTabs() {
      const tabButtons = document.querySelectorAll(tabButtonSelector);

      tabButtons.forEach((button) => {
        button.addEventListener('click', () => {
          tabButtons.forEach((item) => item.classList.remove('active'));
          button.classList.add('active');

          const language = button.dataset.lang;
          document.querySelectorAll(tabContentSelector).forEach((content) => {
            content.classList.add('hidden');
          });

          const targetContent = document.getElementById(`doc-content-${language}`);
          if (targetContent) {
            targetContent.classList.remove('hidden');
          }
        });
      });
    }

    function bindCopyButtons() {
      document.querySelectorAll(copyButtonSelector).forEach((button) => {
        button.addEventListener('click', async () => {
          const targetId = button.dataset.target;
          const codeElement = document.getElementById(targetId);
          if (!codeElement) return;

          const textToCopy = codeElement.textContent.trim();

          try {
            await navigator.clipboard.writeText(textToCopy);
            showCopiedState(button);
          } catch (error) {
            showToast('复制失败', '请手动选择代码并复制。', 'error');
          }
        });
      });
    }

    function showCopiedState(button) {
      const originalText = button.textContent;
      button.textContent = '已复制';
      button.style.background = 'var(--primary)';
      button.style.color = '#ffffff';
      button.style.borderColor = 'var(--primary)';

      setTimeout(() => {
        button.textContent = originalText;
        button.style.background = '';
        button.style.color = '';
        button.style.borderColor = '';
      }, 1500);
    }

    function init() {
      if (initialized) return;
      initialized = true;

      replaceOrigin();
      bindTabs();
      bindCopyButtons();
    }

    return { init };
  }

  global.MqttApiDeveloperGuide = {
    createDeveloperGuide
  };
})(window);
