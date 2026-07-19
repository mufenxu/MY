import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, ChevronDown, LoaderCircle, ShieldCheck, X } from 'lucide-react';

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function SelectControl({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [menuStyle, setMenuStyle] = useState({});
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const optionRefs = useRef([]);
  const listboxId = useId();
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selectedOption = options[selectedIndex] || options[0];

  function updateMenuPosition() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 12;
    const estimatedHeight = Math.min(288, options.length * 44 + 16);
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
    const availableAbove = rect.top - viewportPadding;
    const openAbove = availableBelow < estimatedHeight && availableAbove > availableBelow;
    const width = Math.max(rect.width, 180);
    const left = clamp(rect.left, viewportPadding, Math.max(viewportPadding, window.innerWidth - width - viewportPadding));

    setMenuStyle({
      left,
      minWidth: width,
      maxWidth: Math.max(180, window.innerWidth - viewportPadding * 2),
      ...(openAbove
        ? { bottom: window.innerHeight - rect.top + 8, top: 'auto' }
        : { top: rect.bottom + 8, bottom: 'auto' }),
    });
  }

  useLayoutEffect(() => {
    if (!open) return undefined;
    updateMenuPosition();
    const nextIndex = Math.max(0, options.findIndex((option) => option.value === value));
    setHighlighted(nextIndex);
    const frame = window.requestAnimationFrame(() => optionRefs.current[nextIndex]?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open, options.length, value]);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (triggerRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
    }

    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open, options.length]);

  function closeMenu({ restoreFocus = false } = {}) {
    setOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function selectOption(option) {
    if (option.disabled) return;
    onChange(option.value);
    closeMenu({ restoreFocus: true });
  }

  function moveHighlight(direction) {
    if (!options.length) return;
    let next = highlighted;
    for (let step = 0; step < options.length; step += 1) {
      next = (next + direction + options.length) % options.length;
      if (!options[next].disabled) break;
    }
    setHighlighted(next);
    optionRefs.current[next]?.focus();
  }

  function handleTriggerKeyDown(event) {
    if (disabled) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
    }
  }

  function handleMenuKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveHighlight(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveHighlight(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      const next = options.findIndex((option) => !option.disabled);
      if (next >= 0) {
        setHighlighted(next);
        optionRefs.current[next]?.focus();
      }
    } else if (event.key === 'End') {
      event.preventDefault();
      const next = options.findLastIndex((option) => !option.disabled);
      if (next >= 0) {
        setHighlighted(next);
        optionRefs.current[next]?.focus();
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu({ restoreFocus: true });
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectOption(options[highlighted]);
    }
  }

  const menu = open && createPortal(
    <div
      ref={menuRef}
      id={listboxId}
      className="select-menu"
      role="listbox"
      aria-label={ariaLabel}
      style={menuStyle}
      onKeyDown={handleMenuKeyDown}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            ref={(node) => { optionRefs.current[index] = node; }}
            className={`select-option ${selected ? 'selected' : ''}`}
            key={String(option.value)}
            type="button"
            role="option"
            aria-selected={selected}
            disabled={option.disabled}
            tabIndex={highlighted === index ? 0 : -1}
            onMouseEnter={() => setHighlighted(index)}
            onClick={() => selectOption(option)}
          >
            <span>{option.label}</span>
            <Check size={17} aria-hidden="true" />
          </button>
        );
      })}
    </div>,
    document.body,
  );

  return (
    <div className={`select-control ${open ? 'open' : ''} ${disabled ? 'disabled' : ''} ${className}`.trim()}>
      <button
        ref={triggerRef}
        className="select-trigger"
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onKeyDown={handleTriggerKeyDown}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selectedOption?.label || '请选择'}</span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>
      {menu}
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  detail,
  confirmLabel = '确认',
  cancelLabel = '取消',
  tone = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    const appShell = document.querySelector('.app-shell');
    const shellWasInert = appShell?.hasAttribute('inert');
    appShell?.setAttribute('inert', '');
    const frame = window.requestAnimationFrame(() => cancelRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(frame);
      if (!shellWasInert) appShell?.removeAttribute('inert');
      previousFocus?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  function handleKeyDown(event) {
    if (event.key === 'Escape' && !busy) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll('button:not(:disabled)') || []);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const Icon = tone === 'danger' ? AlertTriangle : ShieldCheck;
  return createPortal(
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        ref={dialogRef}
        className={`confirm-dialog tone-${tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
      >
        <header className="confirm-dialog-header">
          <span className="confirm-dialog-icon"><Icon size={22} /></span>
          <button className="confirm-dialog-close" type="button" aria-label="关闭弹窗" disabled={busy} onClick={onCancel}><X size={19} /></button>
        </header>
        <div className="confirm-dialog-copy">
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{description}</p>
          {detail && <div className="confirm-dialog-detail">{detail}</div>}
        </div>
        <footer className="confirm-dialog-actions">
          <button ref={cancelRef} className="dialog-button secondary" type="button" disabled={busy} onClick={onCancel}>{cancelLabel}</button>
          <button className={`dialog-button ${tone === 'danger' ? 'danger' : 'primary'}`} type="button" disabled={busy} onClick={onConfirm}>
            {busy && <LoaderCircle className="spin" size={17} />}
            {busy ? '正在处理' : confirmLabel}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
