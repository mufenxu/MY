(function (global) {
  'use strict';

  function noop() {}

  function createDeveloperGuide(options = {}) {
    const {
      guideSelector = '.developer-guide-panel',
      tabButtonSelector = '.doc-tab-btn',
      tabContentSelector = '.doc-tab-content',
      copyButtonSelector = '.copy-code-btn',
      localhostOrigin = 'http://localhost:22102',
      showToast = noop
    } = options;

    let initialized = false;

    function replaceOrigin() {
      const guidePanel = document.querySelector(guideSelector);
      if (!guidePanel) return;

      const origin = window.location.origin;
      const managedPath = Boolean(window.MqttApiClient?.APP_BASE_PATH);
      const localApiBase = `${localhostOrigin}/api`;
      const publicApiBase = managedPath ? `${origin}/api/iot` : `${origin}/api`;
      guidePanel.querySelectorAll('pre code').forEach((codeElement) => {
        if (codeElement.innerHTML.includes(localApiBase)) {
          codeElement.innerHTML = codeElement.innerHTML.replace(
            new RegExp(localApiBase.replace(/\./g, '\\.'), 'g'),
            publicApiBase
          );
        }
      });

      if (managedPath) {
        guidePanel.querySelectorAll('.api-path').forEach((pathElement) => {
          pathElement.textContent = pathElement.textContent.replace(/^\/api/, '/api/iot');
        });
      }

      const docsLink = guidePanel.querySelector('[data-api-docs-link]');
      if (docsLink) docsLink.href = managedPath ? '/api/iot/api-docs' : '/api-docs';
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
