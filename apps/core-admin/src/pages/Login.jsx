import { useState, useEffect, useRef, useCallback } from 'react';
import { Form, Input, Button, Tabs, QRCode, Spin } from 'antd';
import { UserOutlined, LockOutlined, ReloadOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router';
import api from '../utils/api';
import { createSequentialPoller } from '../utils/sequentialPoller';
import { Turnstile } from '@marsidev/react-turnstile';
import './Login.css';
import { message } from '../utils/feedback';

// --- 三只探头的小动物：看输入、眯眼、躲到卡片后面 ---

const Panda = ({ isTypingPassword, usernameLength }) => {
    const eyeOffset = Math.min(Math.max((usernameLength - 10) * 0.8, -6), 6);

    return (
        <div className="animal-container animal-panda">
            <svg viewBox="0 -10 100 110" style={{ width: '100%', height: '100%' }}>
                <circle cx="25" cy="20" r="14" fill="var(--animal-ink)" />
                <circle cx="75" cy="20" r="14" fill="var(--animal-ink)" />

                <circle cx="50" cy="50" r="45" fill="var(--animal-face)" stroke="var(--animal-line)" strokeWidth="1" />

                <ellipse cx="32" cy="48" rx="12" ry="14" fill="var(--animal-ink)" transform="rotate(-10 32 48)" />
                <ellipse cx="68" cy="48" rx="12" ry="14" fill="var(--animal-ink)" transform="rotate(10 68 48)" />

                {!isTypingPassword ? (
                    <g transform={`translate(${eyeOffset}, 2)`}>
                        <circle cx="32" cy="48" r="4.5" fill="var(--animal-face)" />
                        <circle cx="68" cy="48" r="4.5" fill="var(--animal-face)" />
                        <circle cx="32" cy="48" r="2" fill="var(--animal-pupil)" />
                        <circle cx="68" cy="48" r="2" fill="var(--animal-pupil)" />
                    </g>
                ) : (
                    <g transform="translate(0, 2)">
                        <path d="M28 48 Q32 44 36 48" stroke="var(--animal-face)" strokeWidth="2" fill="none" />
                        <path d="M64 48 Q68 44 72 48" stroke="var(--animal-face)" strokeWidth="2" fill="none" />
                    </g>
                )}

                <path d="M47 62 Q50 65 53 62" fill="var(--animal-ink)" />
                <path d="M45 72 Q50 76 55 72" stroke="var(--animal-line)" strokeWidth="1.5" fill="none" />

                <g
                    className="panda-paw"
                    style={{
                        transform: isTypingPassword ? 'translateY(-25px)' : 'translateY(10px)',
                        opacity: isTypingPassword ? 1 : 0
                    }}
                >
                    <circle cx="28" cy="85" r="10" fill="var(--animal-ink)" />
                    <circle cx="72" cy="85" r="10" fill="var(--animal-ink)" />
                    <circle cx="28" cy="85" r="4" fill="var(--animal-ink-soft)" />
                    <circle cx="72" cy="85" r="4" fill="var(--animal-ink-soft)" />
                </g>
            </svg>
        </div>
    );
};

const Fox = ({ isTypingPassword, usernameLength }) => {
    const lookAngle = Math.min(Math.max((usernameLength - 10) * 1, -8), 8);

    return (
        <div className="animal-container animal-fox">
            <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
                <path d="M20 40 L10 10 L40 30 Z" fill="var(--animal-amber)" />
                <path d="M80 40 L90 10 L60 30 Z" fill="var(--animal-amber)" />

                <path d="M10 50 Q10 90 50 90 Q90 90 90 50 Q90 30 50 30 Q10 30 10 50" fill="var(--animal-amber)" />
                <path d="M30 90 Q50 60 70 90" fill="var(--animal-face)" />

                {!isTypingPassword ? (
                    <g transform={`translate(${lookAngle}, 0)`}>
                        <circle cx="35" cy="55" r="3" fill="var(--animal-ink)" />
                        <circle cx="65" cy="55" r="3" fill="var(--animal-ink)" />
                    </g>
                ) : (
                    <g>
                        <line x1="32" y1="55" x2="38" y2="55" stroke="var(--animal-ink)" strokeWidth="2" />
                        <line x1="62" y1="55" x2="68" y2="55" stroke="var(--animal-ink)" strokeWidth="2" />
                    </g>
                )}

                <circle cx="50" cy="68" r="2.5" fill="var(--animal-ink)" />
            </svg>
        </div>
    );
};

const Rabbit = ({ isTypingPassword, usernameLength }) => {
    const lookShift = Math.min(Math.max((usernameLength - 10) * 0.6, -5), 5);

    return (
        <div className="animal-container animal-rabbit">
            <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
                <ellipse cx="35" cy="15" rx="6" ry="15" fill="var(--animal-line)" />
                <ellipse cx="65" cy="15" rx="6" ry="15" fill="var(--animal-line)" />
                <ellipse cx="35" cy="15" rx="3" ry="10" fill="var(--animal-blush)" />
                <ellipse cx="65" cy="15" rx="3" ry="10" fill="var(--animal-blush)" />

                <circle cx="50" cy="55" r="35" fill="var(--animal-face)" stroke="var(--animal-line)" strokeWidth="1" />

                {!isTypingPassword ? (
                    <g transform={`translate(${lookShift}, 0)`}>
                        <circle cx="40" cy="55" r="2.5" fill="var(--animal-ink)" />
                        <circle cx="60" cy="55" r="2.5" fill="var(--animal-ink)" />
                    </g>
                ) : (
                    <g>
                        <path d="M38 58 Q40 54 42 58" stroke="var(--animal-ink)" strokeWidth="1.5" fill="none" />
                        <path d="M58 58 Q60 54 62 58" stroke="var(--animal-ink)" strokeWidth="1.5" fill="none" />
                    </g>
                )}

                <circle cx="50" cy="62" r="2" fill="var(--animal-blush)" />
            </svg>
        </div>
    );
};

// --- 登录页 ---

const Login = () => {
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const [turnstileConfig, setTurnstileConfig] = useState({ enabled: false, siteKey: '' });
    const [captchaToken, setCaptchaToken] = useState(null);
    const turnstileRef = useRef(null);

    const [isPasswordFocused, setIsPasswordFocused] = useState(false);
    const [usernameLength, setUsernameLength] = useState(0);

    useEffect(() => {
        const loadTurnstileConfig = async () => {
            try {
                const res = await api.get('/mp/config/turnstile_config');
                if (res.data.success && res.data.result) {
                    setTurnstileConfig(res.data.result);
                }
            } catch (err) {
                console.error('Failed to load turnstile config:', err);
            }
        };
        loadTurnstileConfig();
    }, []);

    const onFinish = async (values) => {
        if (turnstileConfig.enabled && !captchaToken) {
            message.warning('请先完成人机验证');
            return;
        }
        setLoading(true);
        try {
            const res = await api.post('/auth/login', { ...values, captchaToken });
            if (res.data.success) {
                localStorage.removeItem('token');
                localStorage.removeItem('refreshToken');
                localStorage.setItem('user', JSON.stringify(res.data.user));
                window.dispatchEvent(new Event('core-auth-changed'));
                message.success('登录成功');
                navigate('/dashboard');
            }
        } catch (err) {
            console.error('Login error details:', err.response?.data || err.message);
            const errorMsg = err.response?.data?.error || err.response?.data?.message || '登录失败，请检查网络';
            message.error(errorMsg);

            if (err.response?.status === 403) {
                setCaptchaToken(null);
                turnstileRef.current?.reset();
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-shell">
            <div className="login-aurora" aria-hidden="true">
                <span className="login-glow login-glow-a" />
                <span className="login-glow login-glow-b" />
            </div>

            <div className={`login-panel ${isPasswordFocused ? 'is-typing-password' : 'is-typing-username'}`}>
                <div className="peeking-animals" aria-hidden="true">
                    <Fox isTypingPassword={isPasswordFocused} usernameLength={usernameLength} />
                    <Panda isTypingPassword={isPasswordFocused} usernameLength={usernameLength} />
                    <Rabbit isTypingPassword={isPasswordFocused} usernameLength={usernameLength} />
                </div>

                <section className="login-card">
                    <header className="login-head">
                        <h1>欢迎回来</h1>
                        <p>请扫描或输入您的凭据</p>
                    </header>

                    <Tabs
                        defaultActiveKey="account"
                        centered
                        className="login-tabs"
                        items={[
                            {
                                key: 'account',
                                label: '账号登录',
                                children: (
                                    <Form
                                        name="login"
                                        onFinish={onFinish}
                                        size="large"
                                        layout="vertical"
                                        className="fade-in"
                                    >
                                        <Form.Item
                                            label="用户名"
                                            name="username"
                                            rules={[{ required: true, message: '请输入用户名!' }]}
                                        >
                                            <Input
                                                prefix={<UserOutlined style={{ color: 'var(--ink-faint)' }} />}
                                                placeholder="请输入用户名"
                                                onChange={(event) => setUsernameLength(event.target.value.length)}
                                                onFocus={() => setIsPasswordFocused(false)}
                                            />
                                        </Form.Item>

                                        <Form.Item
                                            label="密码"
                                            name="password"
                                            rules={[{ required: true, message: '请输入密码!' }]}
                                        >
                                            <Input.Password
                                                prefix={<LockOutlined style={{ color: 'var(--ink-faint)' }} />}
                                                placeholder="请输入密码"
                                                onFocus={() => setIsPasswordFocused(true)}
                                                onBlur={() => setIsPasswordFocused(false)}
                                            />
                                        </Form.Item>

                                        {turnstileConfig.enabled && turnstileConfig.siteKey && (
                                            <div className="turnstile-container">
                                                <Turnstile
                                                    ref={turnstileRef}
                                                    siteKey={turnstileConfig.siteKey}
                                                    onSuccess={(token) => setCaptchaToken(token)}
                                                    onExpire={() => setCaptchaToken(null)}
                                                    onError={() => setCaptchaToken(null)}
                                                />
                                            </div>
                                        )}

                                        <Form.Item style={{ marginTop: 18, marginBottom: 4 }}>
                                            <Button type="primary" htmlType="submit" loading={loading} block size="large">
                                                即刻登录
                                            </Button>
                                        </Form.Item>
                                    </Form>
                                )
                            },
                            {
                                key: 'scan',
                                label: '扫码登录',
                                children: <ScanLogin navigate={navigate} />
                            }
                        ]}
                    />
                </section>

                <p className="login-legal">© 2026 Mufenxu. All rights reserved.</p>
            </div>
        </div>
    );
};

const ScanLogin = ({ navigate }) => {
    const [qrToken, setQrToken] = useState('');
    const [status, setStatus] = useState('loading');
    const timerRef = useRef(null);
    const createRequestRef = useRef(null);
    const [qrMode, setQrMode] = useState('wxacode'); // 'wxacode' | 'classic'
    const [wxacodeImg, setWxacodeImg] = useState('');

    const handleExchange = useCallback(async (code) => {
        try {
            const res = await api.post('/auth/token/exchange-admin', { tempAuthCode: code });
            if (res.data.user) {
                localStorage.removeItem('token');
                localStorage.removeItem('refreshToken');
                if (res.data.user) localStorage.setItem('user', JSON.stringify(res.data.user));
                window.dispatchEvent(new Event('core-auth-changed'));
                sessionStorage.removeItem('active_qr_token');
                message.success('扫码登录成功');
                navigate('/dashboard');
            }
        } catch {
            setStatus('expired');
        }
    }, [navigate]);

    const startPolling = useCallback((token) => {
        const startTime = Date.now();
        timerRef.current?.stop();
        timerRef.current = createSequentialPoller(async (signal) => {
            if (Date.now() - startTime > 5 * 60 * 1000) {
                setStatus('expired');
                message.warning('登录二维码已超时，请刷新重试');
                return false;
            }
            const res = await api.get(`/auth/qrcode/status?qrToken=${token}`, { signal });
            const { status: nextStatus, tempAuthCode } = res.data;
            if (nextStatus === 'scanned') setStatus('scanned');
            else if (nextStatus === 'confirmed') {
                setStatus('confirmed');
                handleExchange(tempAuthCode);
                return false;
            } else if (nextStatus === 'expired') {
                setStatus('expired');
                return false;
            }
            return true;
        }, { interval: 2000, onError: () => true });
        timerRef.current.start();
    }, [handleExchange]);

    const fetchQRCode = useCallback(async () => {
        createRequestRef.current?.abort();
        const controller = new AbortController();
        createRequestRef.current = controller;

        try {
            timerRef.current?.stop();
            const oldToken = sessionStorage.getItem('active_qr_token');
            setQrToken('');
            setWxacodeImg('');
            setStatus('loading');

            if (qrMode === 'wxacode') {
                // 微信扫一扫模式：获取小程序码
                try {
                    const res = await api.post('/auth/qrcode/create-wxacode', { appId: 'admin-dashboard', oldToken }, {
                        signal: controller.signal,
                    });
                    if (controller.signal.aborted) return;
                    if (res.data && res.data.qrToken && res.data.wxacodeBase64) {
                        setQrToken(res.data.qrToken);
                        setWxacodeImg(res.data.wxacodeBase64);
                        sessionStorage.setItem('active_qr_token', res.data.qrToken);
                        setStatus('waiting');
                        startPolling(res.data.qrToken);
                    } else if (res.data && res.data.qrToken) {
                        // fallback：接口成功但没有 wxacodeBase64，降级展示传统 QRCode
                        setQrToken(res.data.qrToken);
                        sessionStorage.setItem('active_qr_token', res.data.qrToken);
                        setStatus('waiting');
                        startPolling(res.data.qrToken);
                    } else {
                        setStatus('expired');
                    }
                } catch (error) {
                    if (controller.signal.aborted || error.code === 'ERR_CANCELED') return;
                    // wxacode 接口失败，降级到传统模式
                    const res = await api.post('/auth/qrcode/create', { appId: 'admin-dashboard', oldToken }, {
                        signal: controller.signal,
                    });
                    if (controller.signal.aborted) return;
                    if (res.data && res.data.qrToken) {
                        setQrToken(res.data.qrToken);
                        sessionStorage.setItem('active_qr_token', res.data.qrToken);
                        setStatus('waiting');
                        startPolling(res.data.qrToken);
                    } else {
                        setStatus('expired');
                    }
                }
            } else {
                // 传统模式：小程序内扫码
                const res = await api.post('/auth/qrcode/create', { appId: 'admin-dashboard', oldToken }, {
                    signal: controller.signal,
                });
                if (controller.signal.aborted) return;
                if (res.data && res.data.qrToken) {
                    setQrToken(res.data.qrToken);
                    sessionStorage.setItem('active_qr_token', res.data.qrToken);
                    setStatus('waiting');
                    startPolling(res.data.qrToken);
                } else {
                    setStatus('expired');
                }
            }
        } catch (error) {
            if (controller.signal.aborted || error.code === 'ERR_CANCELED') return;
            setStatus('expired');
        } finally {
            if (createRequestRef.current === controller) {
                createRequestRef.current = null;
            }
        }
    }, [startPolling, qrMode]);

    useEffect(() => {
        const kickoffTimer = setTimeout(() => {
            fetchQRCode();
        }, 0);
        return () => {
            clearTimeout(kickoffTimer);
            timerRef.current?.stop();
            createRequestRef.current?.abort();
        };
    }, [fetchQRCode]);

    const getStatusText = () => {
        switch (status) {
            case 'loading': return '正在生成中…';
            case 'waiting': return qrMode === 'wxacode' ? '请使用微信扫一扫登录' : '请使用小程序扫码登录';
            case 'scanned': return '已扫码，请在手机上确认';
            case 'confirmed': return '登录成功，正在跳转…';
            case 'expired': return '二维码已过期，点击刷新';
            default: return '';
        }
    };

    const handleModeSwitch = () => {
        setQrMode(prev => prev === 'wxacode' ? 'classic' : 'wxacode');
    };

    const showWxacode = qrMode === 'wxacode' && wxacodeImg;
    const dimmed = status === 'expired' || status === 'scanned';

    return (
        <div className="scan-panel">
            <div className="scan-frame">
                {status === 'loading' && <Spin size="large" style={{ padding: 56 }} />}

                {status !== 'loading' && qrToken && showWxacode && (
                    <div className="scan-code">
                        <img
                            src={wxacodeImg}
                            alt="微信小程序码"
                            className="wxacode-image"
                            style={{ opacity: dimmed ? 0.28 : 1 }}
                        />
                        {status === 'expired' && (
                            <button
                                type="button"
                                className="qr-expired-overlay"
                                onClick={fetchQRCode}
                                aria-label="刷新登录二维码"
                            >
                                <ReloadOutlined style={{ fontSize: 26, marginBottom: 6 }} />
                                <span>点击刷新</span>
                            </button>
                        )}
                    </div>
                )}

                {status !== 'loading' && qrToken && !showWxacode && (
                    <div style={{ opacity: dimmed ? 0.28 : 1 }}>
                        <QRCode
                            value={`miniprogram://auth/scan?t=${qrToken}`}
                            size={176}
                            bordered={false}
                            status={status === 'expired' ? 'expired' : 'active'}
                            onRefresh={fetchQRCode}
                        />
                    </div>
                )}

                {status === 'scanned' && (
                    <div className="scan-overlay">
                        <CheckCircleOutlined style={{ fontSize: 40, color: 'var(--leaf-text)', marginBottom: 10 }} />
                        <strong>已扫码成功</strong>
                    </div>
                )}
            </div>

            <p className="scan-status">{getStatusText()}</p>

            <button type="button" className="btn btn-text scan-mode-toggle" onClick={handleModeSwitch}>
                {qrMode === 'wxacode' ? '使用小程序内扫码' : '使用微信扫一扫'}
            </button>
        </div>
    );
};

export default Login;
