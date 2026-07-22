function memoStore(context) {
  if (!context) return null;
  context.requestMemo ||= new Map();
  return context.requestMemo;
}

export async function requestMemo(context, key, loader, { clone = (value) => value } = {}) {
  const store = memoStore(context);
  if (!store) return clone(await loader());

  if (!store.has(key)) {
    const pending = Promise.resolve().then(loader);
    store.set(key, pending);
    pending.catch(() => {
      if (store.get(key) === pending) store.delete(key);
    });
  }
  return clone(await store.get(key));
}

export function setRequestMemo(context, key, value) {
  const store = memoStore(context);
  if (store) store.set(key, Promise.resolve(value));
}

export function invalidateRequestMemo(context, keyPrefix = "") {
  const store = context?.requestMemo;
  if (!store) return;
  if (!keyPrefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (String(key).startsWith(keyPrefix)) store.delete(key);
  }
}
