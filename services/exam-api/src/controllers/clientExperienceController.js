const ALLOWED_EVENTS = new Set([
    'page_load',
    'ui_error',
    'unhandled_error',
    'unhandled_rejection',
    'request_failure',
]);

function normalizeRoute(value) {
    const route = String(value || 'app').split(/[?#]/, 1)[0].trim().slice(0, 120);
    if (!route || !/^[A-Za-z0-9_/:.-]+$/.test(route)) return 'unknown';
    return route
        .split('/')
        .map((segment) => (/^(?:\d{4,}|[0-9a-f]{12,}|[A-Za-z0-9_-]{32,})$/i.test(segment) ? ':id' : segment))
        .join('/')
        .slice(0, 80);
}

exports.record = (req, res) => {
    const event = String(req.body?.event || '');
    const outcome = String(req.body?.outcome || 'error');
    if (!ALLOWED_EVENTS.has(event) || !['ok', 'error', 'timeout', 'aborted'].includes(outcome)) {
        return res.status(400).json({ code: 400, message: 'Invalid client experience event' });
    }
    const duration = Number(req.body?.durationMs);
    const fingerprint = /^[0-9a-f]{8,16}$/i.test(String(req.body?.fingerprint || ''))
        ? String(req.body.fingerprint).toLowerCase()
        : 'none';
    console.info(JSON.stringify({
        event: 'client_experience',
        application: 'exam-miniapp',
        experienceEvent: event,
        outcome,
        route: normalizeRoute(req.body?.route),
        fingerprint,
        durationMs: Number.isFinite(duration) && duration >= 0 ? Math.min(Math.round(duration), 300000) : null,
        requestId: req.id,
    }));
    return res.status(202).json({ code: 0, data: { accepted: true }, message: 'accepted' });
};
