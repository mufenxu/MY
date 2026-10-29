import test from 'node:test';
import assert from 'node:assert/strict';

import { useWechatBinding } from '../src/features/wechat-binding/useWechatBinding.js';

const API_BASE = 'https://scan.example.test';

function flush() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

/** sessionStorage 替身：Node 里没有 Web Storage。 */
function createStorage(initial = {}) {
    const entries = new Map(Object.entries(initial));
    return {
        getItem(key) {
            return entries.has(key) ? entries.get(key) : null;
        },
        setItem(key, value) {
            entries.set(key, String(value));
        },
        removeItem(key) {
            entries.delete(key);
        },
        snapshot() {
            return Object.fromEntries(entries);
        },
    };
}

/** 记录提示调用，避免触发 element-plus 的 DOM 渲染。 */
function createMessageSpy() {
    const calls = [];
    const record = (kind) => (text) => calls.push({ kind, text });
    return {
        calls,
        info: record('info'),
        success: record('success'),
        warning: record('warning'),
        error: record('error'),
        kinds() {
            return calls.map((call) => call.kind);
        },
    };
}

/**
 * createSequentialPoller 替身：只保存 task 与 options，由用例手动驱动，
 * 这样轮询节奏完全可控（真实实现依赖 window.setTimeout）。
 */
function createPollerStub() {
    const state = { task: null, options: null, starts: 0, stops: 0 };
    return {
        state,
        factory(task, options) {
            state.task = task;
            state.options = options;
            return {
                start() {
                    state.starts += 1;
                },
                stop() {
                    state.stops += 1;
                },
            };
        },
    };
}

function mockResponse(payload, { ok = true } = {}) {
    return { ok, json: async () => payload };
}

function createSubject({
    isConsoleMode = false,
    scanEnabled = true,
    fetchHandler = null,
    bindResult = { data: { code: 0 } },
    unbindResult = { data: { code: 0 } },
    unbindError = null,
    renderQrcode = async () => {},
} = {}) {
    const message = createMessageSpy();
    const poller = createPollerStub();
    const fetchCalls = [];
    const apiCalls = { bind: [], unbind: 0 };
    const refresh = { count: 0 };
    const rendered = [];

    const fetchWithTimeout = (url, init) => {
        fetchCalls.push({ url, init });
        return fetchHandler(url, init, fetchCalls.length);
    };

    const adminApi = {
        async bindWechat(tempAuthCode) {
            apiCalls.bind.push(tempAuthCode);
            return bindResult;
        },
        async unbindWechat() {
            apiCalls.unbind += 1;
            if (unbindError) throw unbindError;
            return unbindResult;
        },
    };

    const subject = useWechatBinding({
        adminApi,
        isConsoleMode,
        getScanLoginConfig: () => ({ enabled: scanEnabled, apiBase: API_BASE }),
        renderQrcodeToElement: async (el, content, size) => {
            rendered.push({ el, content, size });
            return renderQrcode(el, content, size);
        },
        refreshUserInfo: async () => {
            refresh.count += 1;
        },
        message,
        messageBox: {
            async confirm() {
                return 'confirm';
            },
        },
        fetchWithTimeout,
        createSequentialPoller: poller.factory,
    });

    return { subject, message, poller, fetchCalls, apiCalls, refresh, rendered };
}

function withDom(run, initialStorage = {}) {
    const previous = { document: globalThis.document, sessionStorage: globalThis.sessionStorage };
    const element = { innerHTML: 'stale' };
    const storage = createStorage(initialStorage);
    globalThis.document = { getElementById: () => element };
    globalThis.sessionStorage = storage;
    return Promise.resolve(run({ element, storage })).finally(() => {
        globalThis.document = previous.document;
        globalThis.sessionStorage = previous.sessionStorage;
    });
}

test('the dialog starts closed with a pending status and no tokens', () => {
    const { subject } = createSubject({ fetchHandler: async () => mockResponse({ code: 0 }) });

    assert.deepEqual(subject.bindDialog, {
        visible: false,
        qrToken: '',
        pollToken: '',
        statusText: '正在获取二维码...',
    });
});

test('console mode never opens the dialog and sends no request', async () => {
    await withDom(async () => {
        const { subject, message, fetchCalls } = createSubject({
            isConsoleMode: { value: true },
            fetchHandler: async () => mockResponse({ code: 0 }),
        });

        subject.openBindDialog();

        assert.equal(subject.bindDialog.visible, false);
        assert.deepEqual(message.kinds(), ['info']);
        assert.equal(fetchCalls.length, 0);
    });
});

test('a disabled scan config warns and leaves the dialog closed', async () => {
    await withDom(async () => {
        const { subject, message, fetchCalls } = createSubject({
            scanEnabled: false,
            fetchHandler: async () => mockResponse({ code: 0 }),
        });

        subject.openBindDialog();

        assert.equal(subject.bindDialog.visible, false);
        assert.deepEqual(message.kinds(), ['warning']);
        assert.equal(fetchCalls.length, 0);
    });
});

test('creating a QR posts the admin_bind intent, stores both tokens and starts polling', async () => {
    await withDom(async ({ storage }) => {
        const { subject, poller, fetchCalls, rendered } = createSubject({
            fetchHandler: async () => mockResponse({
                code: 0,
                data: { qrToken: 'qr-1', pollToken: 'poll-1' },
            }),
        });

        subject.openBindDialog();
        await flush();

        assert.equal(fetchCalls.length, 1);
        assert.equal(fetchCalls[0].url, `${API_BASE}/qrcode/create`);
        assert.equal(fetchCalls[0].init.method, 'POST');
        assert.deepEqual(JSON.parse(fetchCalls[0].init.body), { intent: 'admin_bind' });

        assert.equal(subject.bindDialog.visible, true);
        assert.equal(subject.bindDialog.qrToken, 'qr-1');
        assert.equal(subject.bindDialog.pollToken, 'poll-1');
        assert.deepEqual(storage.snapshot(), { bind_qr_token: 'qr-1', bind_qr_poll_token: 'poll-1' });
        assert.equal(subject.bindDialog.statusText, '请在小程序“我的 -> 扫码登录电脑端”中扫码');

        assert.equal(poller.state.starts, 1);
        assert.equal(poller.state.options.interval, 2000);

        assert.equal(rendered.length, 1);
        assert.equal(rendered[0].content, 'miniprogram-login://scan?qrToken=qr-1');
        assert.equal(rendered[0].size, 180);
    });
});

test('an existing token is forwarded as oldQrToken so the server can retire it', async () => {
    await withDom(async ({ storage }) => {
        const { subject, fetchCalls } = createSubject({
            fetchHandler: async () => mockResponse({
                code: 0,
                data: { qrToken: 'qr-2', pollToken: 'poll-2' },
            }),
        });

        subject.openBindDialog();
        await flush();

        assert.deepEqual(JSON.parse(fetchCalls[0].init.body), {
            intent: 'admin_bind',
            oldQrToken: 'stale-token',
        });
        assert.deepEqual(storage.snapshot(), {
            bind_qr_token: 'qr-2',
            bind_qr_poll_token: 'poll-2',
        });
    }, { bind_qr_token: 'stale-token' });
});

test('a rejected create surfaces the server message instead of a generic one', async () => {
    await withDom(async () => {
        const { subject, poller } = createSubject({
            fetchHandler: async () => mockResponse({ code: 4001, message: '扫码服务维护中' }),
        });

        subject.openBindDialog();
        await flush();

        assert.equal(subject.bindDialog.statusText, '二维码获取失败: 扫码服务维护中');
        assert.equal(subject.bindDialog.qrToken, '');
        assert.equal(poller.state.starts, 0);
    });
});

test('a network failure on create falls back to a retry hint', async () => {
    await withDom(async () => {
        const { subject } = createSubject({
            fetchHandler: async () => {
                throw new Error('offline');
            },
        });

        subject.openBindDialog();
        await flush();

        assert.equal(subject.bindDialog.statusText, '网络请求失败，请稍后重试');
    });
});

test('closing the dialog while the create request is in flight discards the response', async () => {
    await withDom(async ({ storage }) => {
        let release;
        const pending = new Promise((resolve) => {
            release = () => resolve(mockResponse({
                code: 0,
                data: { qrToken: 'qr-late', pollToken: 'poll-late' },
            }));
        });
        const { subject, poller, rendered } = createSubject({
            fetchHandler: () => pending,
        });

        subject.openBindDialog();
        await flush();

        subject.stopBindRequests();
        release();
        await flush();

        assert.equal(subject.bindDialog.qrToken, '');
        assert.equal(subject.bindDialog.pollToken, '');
        assert.deepEqual(storage.snapshot(), {});
        assert.equal(poller.state.starts, 0);
        assert.equal(rendered.length, 0);
    });
});

test('a failed QR render reports the Chinese retry hint', async () => {
    await withDom(async () => {
        const { subject } = createSubject({
            fetchHandler: async () => mockResponse({
                code: 0,
                data: { qrToken: 'qr-3', pollToken: 'poll-3' },
            }),
            renderQrcode: async () => {
                throw new Error('canvas unavailable');
            },
        });

        subject.openBindDialog();
        await flush();

        assert.equal(subject.bindDialog.statusText, '二维码生成失败，请刷新后重试');
    });
});

test('a scanned QR keeps polling and prompts for confirmation on the phone', async () => {
    await withDom(async () => {
        const { subject, poller } = createSubject({
            fetchHandler: async (url) => (url.includes('/qrcode/create')
                ? mockResponse({ code: 0, data: { qrToken: 'qr-4', pollToken: 'poll-4' } })
                : mockResponse({ code: 0, data: { status: 'scanned' } })),
        });

        subject.openBindDialog();
        await flush();

        const shouldContinue = await poller.state.task(new AbortController().signal);

        assert.equal(shouldContinue, true);
        assert.equal(subject.bindDialog.statusText, '已扫码，请在手机确认');
    });
});

test('a confirmed QR binds the account, closes the dialog and clears stored tokens', async () => {
    await withDom(async ({ storage }) => {
        const { subject, poller, apiCalls, refresh, message } = createSubject({
            fetchHandler: async (url) => (url.includes('/qrcode/create')
                ? mockResponse({ code: 0, data: { qrToken: 'qr-5', pollToken: 'poll-5' } })
                : mockResponse({ code: 0, data: { status: 'confirmed', tempAuthCode: 'temp-5' } })),
        });

        subject.openBindDialog();
        await flush();

        const shouldContinue = await poller.state.task(new AbortController().signal);

        assert.equal(shouldContinue, false);
        assert.deepEqual(apiCalls.bind, ['temp-5']);
        assert.equal(subject.bindDialog.visible, false);
        assert.deepEqual(storage.snapshot(), {});
        assert.equal(refresh.count, 1);
        assert.deepEqual(message.calls.at(-1), { kind: 'success', text: '绑定成功' });
    });
});

test('a rejected bind keeps the dialog open and shows the server reason', async () => {
    await withDom(async () => {
        const { subject, poller, message, refresh } = createSubject({
            fetchHandler: async (url) => (url.includes('/qrcode/create')
                ? mockResponse({ code: 0, data: { qrToken: 'qr-6', pollToken: 'poll-6' } })
                : mockResponse({ code: 0, data: { status: 'confirmed', tempAuthCode: 'temp-6' } })),
            bindResult: { data: { code: 4090, message: '该微信已绑定其他账号' } },
        });

        subject.openBindDialog();
        await flush();
        await poller.state.task(new AbortController().signal);

        assert.equal(subject.bindDialog.visible, true);
        assert.equal(subject.bindDialog.statusText, '该微信已绑定其他账号');
        assert.equal(refresh.count, 0);
        assert.deepEqual(message.calls.at(-1), { kind: 'error', text: '该微信已绑定其他账号' });
    });
});

test('an expired QR stops polling and asks for a refresh', async () => {
    await withDom(async ({ storage }) => {
        const { subject, poller } = createSubject({
            fetchHandler: async (url) => (url.includes('/qrcode/create')
                ? mockResponse({ code: 0, data: { qrToken: 'qr-7', pollToken: 'poll-7' } })
                : mockResponse({ code: 0, data: { status: 'expired' } })),
        });

        subject.openBindDialog();
        await flush();

        const shouldContinue = await poller.state.task(new AbortController().signal);

        assert.equal(shouldContinue, false);
        assert.equal(subject.bindDialog.statusText, '二维码已过期，请刷新');
        assert.deepEqual(storage.snapshot(), {});
    });
});

test('three consecutive polling failures stop the loop with a retry hint', async () => {
    await withDom(async () => {
        const { subject, poller } = createSubject({
            fetchHandler: async (url) => (url.includes('/qrcode/create')
                ? mockResponse({ code: 0, data: { qrToken: 'qr-8', pollToken: 'poll-8' } })
                : mockResponse({ code: 500, message: '状态服务异常' }, { ok: false })),
        });

        subject.openBindDialog();
        await flush();

        await assert.rejects(() => poller.state.task(new AbortController().signal), /状态服务异常/);
        assert.equal(poller.state.options.onError(), true);
        assert.equal(poller.state.options.onError(), true);
        assert.equal(poller.state.options.onError(), false);
        assert.equal(subject.bindDialog.statusText, '二维码状态获取失败，请刷新后重试');
    });
});

test('a successful poll resets the failure counter', async () => {
    await withDom(async () => {
        let failed = true;
        const { subject, poller } = createSubject({
            fetchHandler: async (url) => {
                if (url.includes('/qrcode/create')) {
                    return mockResponse({ code: 0, data: { qrToken: 'qr-9', pollToken: 'poll-9' } });
                }
                return failed
                    ? mockResponse({ code: 500 }, { ok: false })
                    : mockResponse({ code: 0, data: { status: 'waiting' } });
            },
        });

        subject.openBindDialog();
        await flush();

        await assert.rejects(() => poller.state.task(new AbortController().signal));
        assert.equal(poller.state.options.onError(), true);
        await assert.rejects(() => poller.state.task(new AbortController().signal));
        assert.equal(poller.state.options.onError(), true);

        failed = false;
        assert.equal(await poller.state.task(new AbortController().signal), true);

        failed = true;
        await assert.rejects(() => poller.state.task(new AbortController().signal));
        assert.equal(poller.state.options.onError(), true);
        assert.notEqual(subject.bindDialog.statusText, '二维码状态获取失败，请刷新后重试');
    });
});

test('unbinding asks for confirmation and refreshes the user on success', async () => {
    await withDom(async () => {
        const { subject, apiCalls, refresh, message } = createSubject({
            fetchHandler: async () => mockResponse({ code: 0 }),
        });

        await subject.unbindWechat();

        assert.equal(apiCalls.unbind, 1);
        assert.equal(refresh.count, 1);
        assert.deepEqual(message.calls.at(-1), { kind: 'success', text: '解绑成功' });
    });
});

test('console mode skips the unbind confirmation entirely', async () => {
    await withDom(async () => {
        let confirmations = 0;
        const message = createMessageSpy();
        const subject = useWechatBinding({
            adminApi: { unbindWechat: async () => ({ data: { code: 0 } }) },
            isConsoleMode: true,
            getScanLoginConfig: () => ({ enabled: true, apiBase: API_BASE }),
            message,
            messageBox: {
                async confirm() {
                    confirmations += 1;
                },
            },
            fetchWithTimeout: async () => mockResponse({ code: 0 }),
            createSequentialPoller: () => ({ start() {}, stop() {} }),
        });

        await subject.unbindWechat();

        assert.equal(confirmations, 0);
        assert.deepEqual(message.calls, []);
    });
});

test('cancelling the unbind confirmation stays silent', async () => {
    await withDom(async () => {
        const message = createMessageSpy();
        let unbindCalls = 0;
        const subject = useWechatBinding({
            adminApi: {
                async unbindWechat() {
                    unbindCalls += 1;
                    return { data: { code: 0 } };
                },
            },
            isConsoleMode: false,
            getScanLoginConfig: () => ({ enabled: true, apiBase: API_BASE }),
            message,
            messageBox: {
                async confirm() {
                    throw 'cancel';
                },
            },
            fetchWithTimeout: async () => mockResponse({ code: 0 }),
            createSequentialPoller: () => ({ start() {}, stop() {} }),
        });

        await subject.unbindWechat();

        assert.equal(unbindCalls, 0);
        assert.deepEqual(message.calls, []);
    });
});

// 已知缺口（记录而非认可）：HTTP 200 + code !== 0 时，解绑既不提示也不刷新，
// 而全局拦截器只处理 HTTP 错误码。若将来补上提示，本用例应随之更新。
test('a non-zero unbind code is currently silent', async () => {
    await withDom(async () => {
        const { subject, message, refresh } = createSubject({
            fetchHandler: async () => mockResponse({ code: 0 }),
            unbindResult: { data: { code: 5000, message: '解绑通道异常' } },
        });

        await subject.unbindWechat();

        assert.equal(refresh.count, 0);
        assert.deepEqual(message.calls, []);
    });
});

test('a network failure while unbinding reports an error', async () => {
    await withDom(async () => {
        const { subject, message } = createSubject({
            fetchHandler: async () => mockResponse({ code: 0 }),
            unbindError: new Error('offline'),
        });

        await subject.unbindWechat();

        assert.deepEqual(message.calls.at(-1), { kind: 'error', text: '解绑失败' });
    });
});

test('stopping requests also stops an active poller', async () => {
    await withDom(async () => {
        const { subject, poller } = createSubject({
            fetchHandler: async () => mockResponse({
                code: 0,
                data: { qrToken: 'qr-10', pollToken: 'poll-10' },
            }),
        });

        subject.openBindDialog();
        await flush();
        assert.equal(poller.state.starts, 1);

        subject.stopBindRequests();

        assert.equal(poller.state.stops, 1);
    });
});
