export function isPlainInternalNavigation(event, url) {
  const target = String(url || '');
  return target.startsWith('/')
    && !target.startsWith('//')
    && event.button === 0
    && !event.altKey
    && !event.ctrlKey
    && !event.metaKey
    && !event.shiftKey;
}
