(function (global) {
  'use strict';

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function createFormEnhancements() {
    let selectGlobalClickBound = false;

    function initCustomSelects() {
      document.querySelectorAll('select').forEach((select) => {
        if (select.closest('.custom-select-container')) {
          return;
        }
        setupCustomSelect(select);
      });

      bindSelectGlobalClick();
    }

    function setupCustomSelect(select) {
      let container = select.nextElementSibling;

      if (container && container.classList.contains('custom-select-container') && container.dataset.selectId === select.id) {
        refreshCustomSelect(select, container);
        return;
      }

      select.classList.add('custom-select-hidden');
      select.style.display = 'none';

      container = document.createElement('div');
      container.className = 'custom-select-container';
      container.dataset.selectId = select.id;

      const trigger = document.createElement('div');
      trigger.className = 'custom-select-trigger';
      // 原生 select 被隐藏后，触发器要自己承担键盘与读屏语义。
      trigger.tabIndex = 0;
      trigger.setAttribute('role', 'button');
      trigger.setAttribute('aria-haspopup', 'listbox');
      trigger.setAttribute('aria-expanded', 'false');

      const span = document.createElement('span');
      const selectedOption = select.options[select.selectedIndex] || select.options[0];
      span.textContent = selectedOption ? selectedOption.textContent : '';

      const arrowSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      arrowSvg.setAttribute('viewBox', '0 0 24 24');
      arrowSvg.innerHTML = '<path d="M7 10l5 5 5-5z" fill="currentColor"/>';

      const optionsBox = document.createElement('div');
      optionsBox.className = 'custom-select-options hidden';

      trigger.appendChild(span);
      trigger.appendChild(arrowSvg);
      container.appendChild(trigger);
      container.appendChild(optionsBox);
      select.parentNode.insertBefore(container, select.nextSibling);

      trigger.addEventListener('click', (event) => {
        event.stopPropagation();

        document.querySelectorAll('.custom-select-options').forEach((box) => {
          if (box !== optionsBox) {
            box.classList.add('hidden');
            box.previousElementSibling.classList.remove('open');
          }
        });

        const isOpen = !optionsBox.classList.contains('hidden');
        optionsBox.classList.toggle('hidden', isOpen);
        trigger.classList.toggle('open', !isOpen);
        trigger.setAttribute('aria-expanded', String(!isOpen));
      });

      // 键盘：回车/空格展开或收起，上下键像原生下拉框一样直接切换选项，Esc 收起。
      trigger.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          trigger.click();
        } else if (event.key === 'Escape') {
          optionsBox.classList.add('hidden');
          trigger.classList.remove('open');
          trigger.setAttribute('aria-expanded', 'false');
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const next = select.selectedIndex + (event.key === 'ArrowDown' ? 1 : -1);
          if (next < 0 || next >= select.options.length) return;
          select.selectedIndex = next;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });

      refreshCustomSelect(select, container);
      bindSelectGlobalClick();
      keepCustomSelectInSync(select, container);
    }

    // 自定义层只是原生 <select> 的一层外观，原生控件才是数据来源。
    // 业务代码会直接改它（重写 <option>、给 value 赋值、form.reset()、切换 hidden），
    // 这些都不触发 change 事件，所以要在这里主动跟随，否则界面显示的和实际选中的会不一致。
    function keepCustomSelectInSync(select, container) {
      const sync = () => {
        if (!container.isConnected) return;
        refreshCustomSelect(select, container);
        container.classList.toggle('hidden', select.classList.contains('hidden'));
      };

      // 选项被重写、hidden 类被切换
      new MutationObserver(sync).observe(select, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['class']
      });

      // 程序化赋值：在实例上包一层原型的 value / selectedIndex 访问器
      ['value', 'selectedIndex'].forEach((property) => {
        const descriptor = Object.getOwnPropertyDescriptor(global.HTMLSelectElement.prototype, property);
        if (!descriptor || !descriptor.set) return;
        Object.defineProperty(select, property, {
          configurable: true,
          enumerable: descriptor.enumerable,
          get() {
            return descriptor.get.call(this);
          },
          set(next) {
            descriptor.set.call(this, next);
            sync();
          }
        });
      });

      // form.reset() 在 reset 事件之后才真正还原取值
      if (select.form) {
        select.form.addEventListener('reset', () => global.setTimeout(sync, 0));
      }

      sync();
    }

    function refreshCustomSelect(select, container) {
      const optionsBox = container.querySelector('.custom-select-options');
      const triggerSpan = container.querySelector('.custom-select-trigger span');
      const options = Array.from(select.options);
      const selectedOption = select.options[select.selectedIndex] || select.options[0];

      // 内容没变就不重建：实时消息会频繁触发刷新，重建会把用户正展开的列表打断。
      const signature = JSON.stringify([select.selectedIndex, options.map((option) => [option.value, option.textContent])]);
      if (container.dataset.signature === signature) return;
      container.dataset.signature = signature;

      triggerSpan.textContent = selectedOption ? selectedOption.textContent : '';
      optionsBox.innerHTML = options.map((option, index) => `
        <div class="custom-select-option ${select.selectedIndex === index ? 'active' : ''}" data-value="${escapeHtml(option.value)}" data-idx="${index}">
          ${escapeHtml(option.textContent)}
        </div>
      `).join('');

      bindCustomSelectOptionsEvents(select, container);
    }

    function bindCustomSelectOptionsEvents(select, container) {
      const optionsBox = container.querySelector('.custom-select-options');

      optionsBox.querySelectorAll('.custom-select-option').forEach((item) => {
        item.addEventListener('click', (event) => {
          event.stopPropagation();

          const index = Number.parseInt(item.dataset.idx, 10);
          optionsBox.classList.add('hidden');
          container.querySelector('.custom-select-trigger').classList.remove('open');
          // 赋值会经由 keepCustomSelectInSync 重建选项列表并更新显示文本。
          select.selectedIndex = index;
          // 原生 change 事件会冒泡；不冒泡的话，挂在父容器上的事件委托收不到。
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
    }

    function bindSelectGlobalClick() {
      if (selectGlobalClickBound) return;
      selectGlobalClickBound = true;

      window.addEventListener('click', (event) => {
        if (event.target && event.target.classList && event.target.classList.contains('custom-select-hidden')) {
          return;
        }

        document.querySelectorAll('.custom-select-options').forEach((box) => {
          if (box.parentNode && box.parentNode.contains(event.target)) {
            return;
          }
          box.classList.add('hidden');
          box.previousElementSibling.classList.remove('open');
        });
      });
    }

    function bindSecretFieldToggle(input, clearToggle) {
      if (!input || !clearToggle) return;

      input.addEventListener('input', () => {
        if (input.value) {
          clearToggle.checked = false;
        }
      });

      clearToggle.addEventListener('change', () => {
        if (clearToggle.checked) {
          input.value = '';
        }
      });
    }

    function initCustomFormValidations() {
      document.querySelectorAll('input, select, textarea').forEach((input) => {
        input.addEventListener('invalid', () => {
          if (input.validity.valueMissing) {
            input.setCustomValidity('此项为必填项，请输入有效内容。');
          } else if (input.validity.patternMismatch) {
            input.setCustomValidity('输入格式不符合要求，仅限英文字母、数字、下划线及中划线。');
          } else if (input.validity.typeMismatch) {
            input.setCustomValidity('请输入符合规范的格式。');
          } else if (input.validity.rangeUnderflow) {
            input.setCustomValidity(`数值过小，必须大于等于 ${input.min}。`);
          } else if (input.validity.rangeOverflow) {
            input.setCustomValidity(`数值过大，必须小于等于 ${input.max}。`);
          }
        });

        input.addEventListener('input', () => {
          input.setCustomValidity('');
        });
      });
    }

    return {
      bindSecretFieldToggle,
      initCustomFormValidations,
      initCustomSelects,
      setupCustomSelect
    };
  }

  global.MqttApiFormEnhancements = {
    createFormEnhancements
  };
})(window);
