let feedbackApis = null;

export function bindFeedbackApis(apis) {
  feedbackApis = apis;
}

function callMessage(method, args) {
  const handler = feedbackApis?.message?.[method];
  if (typeof handler !== 'function') return undefined;
  return handler(...args);
}

export const message = new Proxy({}, {
  get(_target, property) {
    return (...args) => callMessage(property, args);
  },
});
