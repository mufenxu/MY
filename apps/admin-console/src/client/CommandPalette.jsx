import {
  ChevronRight,
  Copy,
  LoaderCircle,
  Search,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NAV_GROUPS, resolveConsoleView } from './navigation.js';
import { requestJson } from './api.js';

const COMMAND_TYPE_LABELS = {
  service: '服务',
  incident: '问题',
  task: '待办',
  release: '更新',
  configuration: '设置',
  navigation: '功能',
};

const COMMAND_SHORTCUTS = NAV_GROUPS
  .filter((group) => group.visible !== false)
  .flatMap((group) => group.views.map((view) => ({
    id: `navigation:${view.id}`,
    entityId: '',
    type: 'navigation',
    title: view.label,
    subtitle: group.label,
    view: view.id,
  })));
const DISCOVERABLE_VIEW_IDS = new Set([
  ...COMMAND_SHORTCUTS.map((item) => item.view),
  'backup',
]);

function commandTargetUrl(view, entityId) {
  const url = new URL(window.location.href);
  const resolvedView = resolveConsoleView(view);
  if (resolvedView === 'all') url.searchParams.delete('view');
  else url.searchParams.set('view', resolvedView);
  if (entityId) url.searchParams.set('entity', entityId);
  else url.searchParams.delete('entity');
  return url.toString();
}

export function CommandPalette({ open, onClose, onNavigate }) {
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const requestRef = useRef(null);

  const normalizedQuery = query.trim();
  const items = normalizedQuery.length >= 2
    ? (data?.results || []).filter((item) => !item.view || DISCOVERABLE_VIEW_IDS.has(item.view))
    : COMMAND_SHORTCUTS;

  useEffect(() => {
    if (!open) return undefined;
    window.requestAnimationFrame(() => inputRef.current?.focus());
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open || normalizedQuery.length < 2) {
      requestRef.current?.abort();
      requestRef.current = null;
      setData(null);
      setLoading(false);
      setError('');
      setActiveIndex(0);
      return undefined;
    }
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    setLoading(true);
    setError('');
    const timer = window.setTimeout(async () => {
      try {
        const search = new URLSearchParams({ q: normalizedQuery, limit: '20' });
        const result = await requestJson(`/api/operations/search?${search}`, { signal: controller.signal });
        if (requestRef.current === controller) {
          setData(result);
          setActiveIndex(0);
        }
      } catch (requestError) {
        if (requestRef.current === controller && requestError.code !== 'REQUEST_ABORTED') setError(requestError.message);
      } finally {
        if (requestRef.current === controller) {
          requestRef.current = null;
          setLoading(false);
        }
      }
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      if (requestRef.current === controller) requestRef.current = null;
    };
  }, [normalizedQuery, open]);

  if (!open) return null;

  function openItem(item) {
    onNavigate(resolveConsoleView(item.view), item.entityId || null);
  }

  async function copyItemLink(item) {
    setError('');
    setMessage('');
    try {
      await navigator.clipboard.writeText(commandTargetUrl(item.view, item.entityId));
      setMessage('链接已复制');
    } catch {
      setError('无法复制链接，请先授予浏览器剪贴板权限。');
    }
  }

  function handleInputKeyDown(event) {
    if (event.key === 'ArrowDown' && items.length) {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % items.length);
    } else if (event.key === 'ArrowUp' && items.length) {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + items.length) % items.length);
    } else if (event.key === 'Enter' && items[activeIndex]) {
      event.preventDefault();
      openItem(items[activeIndex]);
    }
  }

  const unavailableSources = (data?.sources || []).filter((source) => !source.available).length;
  return (
    <div className="command-palette-backdrop" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-label="功能搜索">
        <header>
          <Search size={20} />
          <input
            ref={inputRef}
            type="search"
            value={query}
            maxLength={80}
            placeholder="搜索服务、问题或功能"
            aria-label="搜索内容"
            aria-controls="command-palette-results"
            aria-activedescendant={items[activeIndex] ? `command-option-${activeIndex}` : undefined}
            onChange={(event) => { setQuery(event.target.value); setMessage(''); }}
            onKeyDown={handleInputKeyDown}
          />
          {loading && <LoaderCircle className="spin" size={18} aria-label="正在检索" />}
          <button type="button" className="icon-action" onClick={onClose} aria-label="关闭全局检索"><X size={18} /></button>
        </header>
        {(error || message || unavailableSources > 0) && (
          <div className={`command-palette-feedback ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>
            {error || message || '部分内容暂时无法查询，已显示可用结果。'}
          </div>
        )}
        <div id="command-palette-results" className="command-palette-results" role="listbox" aria-label={normalizedQuery.length >= 2 ? '搜索结果' : '常用功能'}>
          {items.map((item, index) => (
            <div
              id={`command-option-${index}`}
              className={`command-result ${index === activeIndex ? 'active' : ''}`}
              role="option"
              aria-selected={index === activeIndex}
              key={item.id}
              onPointerEnter={() => setActiveIndex(index)}
            >
              <button type="button" className="command-result-main" onClick={() => openItem(item)}>
                <span className="command-result-type">{COMMAND_TYPE_LABELS[item.type] || item.type}</span>
                <span><strong>{item.title}</strong><small>{item.subtitle || item.entityId || '打开功能'}</small></span>
                {item.status && <span className="command-result-status">{item.status}</span>}
                <ChevronRight size={17} />
              </button>
              <button type="button" className="icon-action" onClick={() => copyItemLink(item)} aria-label={`复制${item.title}链接`} title="复制链接"><Copy size={16} /></button>
            </div>
          ))}
          {!loading && normalizedQuery.length >= 2 && data && items.length === 0 && <div className="command-palette-empty">没有找到匹配内容</div>}
        </div>
      </section>
    </div>
  );
}
