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
      });

      refreshCustomSelect(select, container);
      bindSelectGlobalClick();
    }

    function refreshCustomSelect(select, container) {
      const optionsBox = container.querySelector('.custom-select-options');
      const triggerSpan = container.querySelector('.custom-select-trigger span');
      const options = Array.from(select.options);
      const selectedOption = select.options[select.selectedIndex] || select.options[0];

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
      const triggerSpan = container.querySelector('.custom-select-trigger span');

      optionsBox.querySelectorAll('.custom-select-option').forEach((item) => {
        item.addEventListener('click', (event) => {
          event.stopPropagation();

          const index = Number.parseInt(item.dataset.idx, 10);
          select.selectedIndex = index;
          triggerSpan.textContent = item.textContent.trim();

          optionsBox.querySelectorAll('.custom-select-option').forEach((option) => option.classList.remove('active'));
          item.classList.add('active');
          optionsBox.classList.add('hidden');
          container.querySelector('.custom-select-trigger').classList.remove('open');
          select.dispatchEvent(new Event('change'));
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
