import { getThemePreference, setTheme, subscribeTheme } from './theme.js';

const choices = [
  { value: 'light', label: '浅色', icon: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>' },
  { value: 'dark', label: '深色', icon: '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.463.402.807a6.25 6.25 0 0 0 8.268 8.268c.344-.215.829-.004.803.397"/>' },
  { value: 'system', label: '跟随系统', icon: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>' },
];
let menuSequence = 0;

const icon = (choice, className = '') => `<svg class="theme-menu__icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${choice.icon}</svg>`;

/** 原生顶层弹出层避免被后台滚动容器和登录卡片裁切。 */
export function mountThemeMenu(container) {
  const menuId = `my-theme-menu-${++menuSequence}`;
  container.innerHTML = `<button type="button" class="theme-menu__button" popovertarget="${menuId}" aria-controls="${menuId}" aria-haspopup="menu" aria-expanded="false">${icon(choices[0], 'theme-menu__sun')}${icon(choices[1], 'theme-menu__moon')}</button><div class="theme-menu__popover" id="${menuId}" popover="auto" role="menu" aria-label="外观主题">${choices.map(choice => `<button type="button" class="theme-menu__option" role="menuitemradio" aria-checked="false" aria-label="${choice.label}" title="${choice.label}" data-theme="${choice.value}">${icon(choice)}</button>`).join('')}</div>`;
  const trigger = container.querySelector('.theme-menu__button');
  const menu = container.querySelector('.theme-menu__popover');
  const buttons = Array.from(menu.querySelectorAll('.theme-menu__option'));
  const controller = new AbortController();
  const { signal } = controller;

  function syncTheme() {
    const preference = getThemePreference();
    const label = choices.find(choice => choice.value === preference).label;
    trigger.setAttribute('aria-label', `外观：${label}，打开主题菜单`);
    trigger.title = `外观：${label}`;
    buttons.forEach(button => {
      button.setAttribute('aria-checked', String(button.dataset.theme === preference));
    });
  }

  function close() {
    if (menu.matches(':popover-open')) menu.hidePopover();
  }

  function position() {
    const rect = trigger.getBoundingClientRect();
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const below = rect.bottom + 8;
    menu.style.left = `${Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))}px`;
    menu.style.top = `${Math.max(8, below + height <= window.innerHeight - 8 ? below : rect.top - height - 8)}px`;
  }

  menu.addEventListener('toggle', event => {
    const open = event.newState === 'open';
    trigger.setAttribute('aria-expanded', String(open));
    if (open) {
      position();
      buttons.find(button => button.getAttribute('aria-checked') === 'true').focus();
    }
  }, { signal });

  menu.addEventListener('click', event => {
    const button = event.target.closest('.theme-menu__option');
    if (!button) return;
    setTheme(button.dataset.theme);
    close();
    trigger.focus();
  }, { signal });

  trigger.addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    menu.showPopover();
  }, { signal });

  menu.addEventListener('keydown', event => {
    if (event.key === 'Tab') { close(); return; }
    const next = ['ArrowRight', 'ArrowDown'].includes(event.key);
    const previous = ['ArrowLeft', 'ArrowUp'].includes(event.key);
    if (!next && !previous && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const current = buttons.indexOf(document.activeElement);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (current + (next ? 1 : -1) + buttons.length) % buttons.length;
    buttons[index].focus();
  }, { signal });

  window.addEventListener('resize', close, { signal });
  window.addEventListener('scroll', close, { signal, capture: true });
  const unsubscribe = subscribeTheme(syncTheme);
  syncTheme();

  return () => {
    controller.abort();
    unsubscribe();
    container.replaceChildren();
  };
}
