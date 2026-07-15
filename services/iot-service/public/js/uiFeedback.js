(function (global) {
  'use strict';

  const TOAST_DEDUPE_MS = 2000;
  const TOAST_LIMIT = 5;
  const TOAST_SHOW_DELAY_MS = 30;
  const TOAST_HIDE_DELAY_MS = 3500;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalizeButtons(buttons) {
    return (Array.isArray(buttons) ? buttons : [buttons]).filter(Boolean);
  }

  function resolveValue(value) {
    return typeof value === 'function' ? value() : value;
  }

  function createToastManager({ container } = {}) {
    const recentToasts = new Map();

    function showToast(title, desc = '', type = 'info') {
      if (!container) return;

      const key = `${title}:${desc}`;
      const now = Date.now();
      if (recentToasts.has(key) && now - recentToasts.get(key) < TOAST_DEDUPE_MS) {
        return;
      }

      recentToasts.set(key, now);
      setTimeout(() => recentToasts.delete(key), TOAST_DEDUPE_MS);

      const currentToasts = container.querySelectorAll('.toast');
      if (currentToasts.length >= TOAST_LIMIT) {
        currentToasts[0].remove();
      }

      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      toast.innerHTML = `
        <div class="toast-content">
          <strong>${escapeHtml(title)}</strong>
          ${desc ? `<span>${escapeHtml(desc)}</span>` : ''}
        </div>
      `;

      container.appendChild(toast);

      setTimeout(() => {
        toast.classList.add('show');
      }, TOAST_SHOW_DELAY_MS);

      setTimeout(() => {
        if (toast.parentNode) {
          toast.classList.remove('show');
          toast.classList.add('fade-out');
          toast.addEventListener('transitionend', () => {
            toast.remove();
          });
        }
      }, TOAST_HIDE_DELAY_MS);
    }

    return { showToast };
  }

  function createDialogManager(elements = {}) {
    function showDialog({ title = '提示', message = '', type = 'info', showInput = false, inputValue = '' }) {
      return new Promise((resolve) => {
        const {
          modal,
          iconArea,
          titleEl,
          messageEl,
          inputWrapper,
          inputEl,
          cancelBtn,
          confirmBtn
        } = elements;

        if (!modal || !titleEl || !messageEl || !cancelBtn || !confirmBtn) {
          resolve(null);
          return;
        }

        titleEl.textContent = title;
        messageEl.textContent = message;

        if (iconArea) {
          if (type === 'danger') {
            iconArea.innerHTML = '<svg class="dialog-icon-shield" viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
          } else {
            iconArea.innerHTML = '<svg class="dialog-icon-info" viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
          }
        }

        confirmBtn.className = type === 'danger' ? 'button button-danger' : 'button button-primary';

        if (inputWrapper && inputEl) {
          inputWrapper.classList.toggle('hidden', !showInput);
          inputEl.value = showInput ? inputValue : '';
        }

        cancelBtn.style.display = type === 'alert' ? 'none' : 'block';
        modal.classList.remove('hidden');

        setTimeout(() => {
          if (showInput && inputEl) {
            inputEl.focus();
          } else {
            confirmBtn.focus();
          }
        }, 50);

        function cleanup(value) {
          modal.classList.add('hidden');
          confirmBtn.removeEventListener('click', onConfirm);
          cancelBtn.removeEventListener('click', onCancel);
          document.removeEventListener('keydown', onKeyDown);
          resolve(value);
        }

        function onConfirm() {
          cleanup(showInput && inputEl ? inputEl.value : true);
        }

        function onCancel() {
          cleanup(showInput ? null : false);
        }

        function onKeyDown(event) {
          if (event.key === 'Escape' && type !== 'alert') {
            event.preventDefault();
            onCancel();
          }

          if (event.key === 'Enter') {
            event.preventDefault();
            onConfirm();
          }
        }

        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
        document.addEventListener('keydown', onKeyDown);
      });
    }

    return {
      alert: (title, message) => showDialog({ title, message, type: 'alert', showInput: false }),
      confirm: (title, message, isDanger = true) =>
        showDialog({ title, message, type: isDanger ? 'danger' : 'info', showInput: false }),
      prompt: (title, message, defaultValue = '') =>
        showDialog({ title, message, type: 'info', showInput: true, inputValue: defaultValue })
    };
  }

  function createActionLockManager({ locks = new Set(), isPrivateLocked = () => false, loginButton = null } = {}) {
    function isLocked(key) {
      return locks.has(key);
    }

    function begin(key, buttons = []) {
      if (isLocked(key)) {
        return false;
      }

      locks.add(key);

      normalizeButtons(buttons).forEach((button) => {
        button.dataset.previousDisabled = button.disabled ? 'true' : 'false';
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
      });

      return true;
    }

    function end(key, buttons = []) {
      locks.delete(key);

      const privateLocked = Boolean(resolveValue(isPrivateLocked));
      const loginButtonElement = resolveValue(loginButton);

      normalizeButtons(buttons).forEach((button) => {
        const wasDisabled = button.dataset.previousDisabled === 'true';
        button.disabled = wasDisabled || (privateLocked && button !== loginButtonElement);
        button.removeAttribute('aria-busy');
        delete button.dataset.previousDisabled;
      });
    }

    return { begin, end, isLocked };
  }

  global.MqttApiUi = {
    createActionLockManager,
    createDialogManager,
    createToastManager
  };
})(window);
