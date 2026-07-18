import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Form, Input, Button, Card, message, Typography, Tabs, QRCode, Spin } from 'antd';
import { UserOutlined, LockOutlined, ReloadOutlined, ScanOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { createSequentialPoller } from '../utils/sequentialPoller';
import { Turnstile } from '@marsidev/react-turnstile';
import './Login.css';

const { Title, Text } = Typography;

// --- Animal Components ---

const Panda = ({ isTypingPassword, usernameLength }) => {
    const eyeOffset = Math.min(Math.max((usernameLength - 10) * 0.8, -6), 6);
    
    return (
        <div className="animal-container animal-panda">
            <svg viewBox="0 -10 100 110" style={{ width: '100%', height: '100%' }}>
                {/* Ears */}
                <circle cx="25" cy="20" r="14" fill="#2D3748" />
                <circle cx="75" cy="20" r="14" fill="#2D3748" />
                
                {/* Face */}
                <circle cx="50" cy="50" r="45" fill="white" stroke="#E2E8F0" strokeWidth="1" />
                
                {/* Eye Patches */}
                <ellipse cx="32" cy="48" rx="12" ry="14" fill="#2D3748" transform="rotate(-10 32 48)" />
                <ellipse cx="68" cy="48" rx="12" ry="14" fill="#2D3748" transform="rotate(10 68 48)" />
                
                {/* Eyes */}
                {!isTypingPassword ? (
                    <g transform={`translate(${eyeOffset}, 2)`}>
                        <circle cx="32" cy="48" r="4.5" fill="white" />
                        <circle cx="68" cy="48" r="4.5" fill="white" />
                        <circle cx="32" cy="48" r="2" fill="black" />
                        <circle cx="68" cy="48" r="2" fill="black" />
                    </g>
                ) : (
                    <g transform="translate(0, 2)">
                        <path d="M28 48 Q32 44 36 48" stroke="white" strokeWidth="2" fill="none" />
                        <path d="M64 48 Q68 44 72 48" stroke="white" strokeWidth="2" fill="none" />
                    </g>
                )}
                
                {/* Nose & Mouth */}
                <path d="M47 62 Q50 65 53 62" fill="#2D3748" />
                <path d="M45 72 Q50 76 55 72" stroke="#CBD5E0" strokeWidth="1.5" fill="none" />
                
                {/* Paws (Covering eyes) */}
                <g className="panda-paw" style={{ 
                    transform: isTypingPassword ? 'translateY(-25px)' : 'translateY(10px)',
                    opacity: isTypingPassword ? 1 : 0 
                }}>
                    <circle cx="28" cy="85" r="10" fill="#2D3748" />
                    <circle cx="72" cy="85" r="10" fill="#2D3748" />
                    <circle cx="28" cy="85" r="4" fill="#4A5568" />
                    <circle cx="72" cy="85" r="4" fill="#4A5568" />
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
                {/* Ears */}
                <path d="M20 40 L10 10 L40 30 Z" fill="#ED8936" />
                <path d="M80 40 L90 10 L60 30 Z" fill="#ED8936" />
                
                {/* Face */}
                <path d="M10 50 Q10 90 50 90 Q90 90 90 50 Q90 30 50 30 Q10 30 10 50" fill="#F6AD55" />
                <path d="M30 90 Q50 60 70 90" fill="white" />
                
                {/* Eyes */}
                {!isTypingPassword ? (
                    <g transform={`translate(${lookAngle}, 0)`}>
                        <circle cx="35" cy="55" r="3" fill="#2D3748" />
                        <circle cx="65" cy="55" r="3" fill="#2D3748" />
                    </g>
                ) : (
                    <g>
                        <line x1="32" y1="55" x2="38" y2="55" stroke="#2D3748" strokeWidth="2" />
                        <line x1="62" y1="55" x2="68" y2="55" stroke="#2D3748" strokeWidth="2" />
                    </g>
                )}
                
                {/* Nose */}
                <circle cx="50" cy="68" r="2.5" fill="#2D3748" />
            </svg>
        </div>
    );
};

const Rabbit = ({ isTypingPassword, usernameLength }) => {
    const lookShift = Math.min(Math.max((usernameLength - 10) * 0.6, -5), 5);
    
    return (
        <div className="animal-container animal-rabbit">
            <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
                {/* Ears */}
                <ellipse cx="35" cy="15" rx="6" ry="15" fill="#E2E8F0" />
                <ellipse cx="65" cy="15" rx="6" ry="15" fill="#E2E8F0" />
                <ellipse cx="35" cy="15" rx="3" ry="10" fill="#FED7E2" />
                <ellipse cx="65" cy="15" rx="3" ry="10" fill="#FED7E2" />
                
                {/* Face */}
                <circle cx="50" cy="55" r="35" fill="white" stroke="#EDF2F7" strokeWidth="1" />
                
                {/* Eyes */}
                {!isTypingPassword ? (
                    <g transform={`translate(${lookShift}, 0)`}>
                        <circle cx="40" cy="55" r="2.5" fill="#2D3748" />
                        <circle cx="60" cy="55" r="2.5" fill="#2D3748" />
                    </g>
                ) : (
                    <g>
                        <path d="M38 58 Q40 54 42 58" stroke="#2D3748" strokeWidth="1.5" fill="none" />
                        <path d="M58 58 Q60 54 62 58" stroke="#2D3748" strokeWidth="1.5" fill="none" />
                    </g>
                )}
                
                {/* Nose */}
                <circle cx="50" cy="62" r="2" fill="#FBB6CE" />
            </svg>
        </div>
    );
};

// --- Main Login Component ---

const Login = () => {
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const [turnstileConfig, setTurnstileConfig] = useState({ enabled: false, siteKey: '' });
    const [captchaToken, setCaptchaToken] = useState(null);
    const turnstileRef = useRef(null);
    
    // Animal Reaction States
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
                localStorage.setItem('token', res.data.token);
                localStorage.removeItem('refreshToken');
                localStorage.setItem('user', JSON.stringify(res.data.user));
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
        <div className="login-container">
            {/* Left Side - Interaction Area */}
            <div className={`login-form-side ${isPasswordFocused ? 'is-typing-password' : 'is-typing-username'}`}>
                <div className="login-card-wrapper">
                    {/* Animal Observers */}
                    <div className="peeking-animals">
                        <Fox isTypingPassword={isPasswordFocused} usernameLength={usernameLength} />
                        <Panda isTypingPassword={isPasswordFocused} usernameLength={usernameLength} />
                        <Rabbit isTypingPassword={isPasswordFocused} usernameLength={usernameLength} />
                    </div>

                    <Card className="glass-effect" style={{ borderRadius: 24 }}>
                        <div style={{ marginBottom: 30, textAlign: 'center' }}>
                            <Title level={2} style={{ color: 'var(--text-primary)', marginBottom: 8, fontWeight: 800 }}>
                                欢迎回来
                            </Title>
                            <Text style={{ color: '#8C98A9', fontSize: 16 }}>
                                请扫描或输入您的凭据
                            </Text>
                        </div>

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
                                                label={<span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>用户名</span>}
                                                name="username"
                                                rules={[{ required: true, message: '请输入用户名!' }]}
                                            >
                                                <Input
                                                    prefix={<UserOutlined style={{ color: '#8C98A9' }} />}
                                                    placeholder="请输入用户名"
                                                    onChange={(e) => setUsernameLength(e.target.value.length)}
                                                    onFocus={() => setIsPasswordFocused(false)}
                                                    style={{ height: 52 }}
                                                />
                                            </Form.Item>

                                            <Form.Item
                                                label={<span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>密码</span>}
                                                name="password"
                                                rules={[{ required: true, message: '请输入密码!' }]}
                                            >
                                                <Input.Password
                                                    prefix={<LockOutlined style={{ color: '#8C98A9' }} />}
                                                    placeholder="请输入密码"
                                                    onFocus={() => setIsPasswordFocused(true)}
                                                    onBlur={() => setIsPasswordFocused(false)}
                                                    style={{ height: 52 }}
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

                                            <Form.Item style={{ marginTop: 20 }}>
                                                <Button
                                                    type="primary"
                                                    htmlType="submit"
                                                    loading={loading}
                                                    block
                                                    size="large"
                                                >
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
                    </Card>
                </div>
                
                <div style={{ marginTop: 40, opacity: 0.5 }}>
                    <Text>© 2026 Mufenxu. All rights reserved.</Text>
                </div>
            </div>

            {/* Right Side - Branding */}
            <div className="login-brand-side">
                <div className="brand-content">
                    <Title level={1} style={{ 
                        color: '#fff', 
                        fontSize: 56, 
                        fontWeight: 800, 
                        marginBottom: 16, 
                        letterSpacing: '-0.02em',
                        lineHeight: 1.1
                    }}>
                        Mufenxu
                    </Title>
                    <div style={{ 
                        width: 48, 
                        height: 4, 
                        background: 'linear-gradient(90deg, #4A7CF7, #6AD2FF)', 
                        marginBottom: 32, 
                        borderRadius: 2 
                    }} />
                    
                    <div style={{ marginBottom: 40 }}>
                        <Title level={3} style={{ 
                            color: 'rgba(255, 255, 255, 0.95)', 
                            fontWeight: 600, 
                            marginBottom: 12,
                            fontSize: 24
                        }}>
                            星轨轻具坊管理后台
                        </Title>
                        <Text style={{ 
                            color: 'rgba(255, 255, 255, 0.6)', 
                            fontSize: 18, 
                            lineHeight: 1.6,
                            display: 'block'
                        }}>
                            为创意与效率而生的数字化管理工作台，<br />
                            让每一个细节都触手可及。
                        </Text>
                    </div>

                    <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: '1fr 1fr', 
                        gap: '24px',
                        marginTop: 48
                    }}>
                        <div>
                            <Text style={{ color: '#fff', fontWeight: 700, fontSize: 20, display: 'block' }}>01</Text>
                            <Text style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.1em' }}>高效协作</Text>
                        </div>
                        <div>
                            <Text style={{ color: '#fff', fontWeight: 700, fontSize: 20, display: 'block' }}>02</Text>
                            <Text style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.1em' }}>实时监控</Text>
                        </div>
                    </div>
                </div>
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
            if (res.data.accessToken) {
                localStorage.setItem('token', res.data.accessToken);
                localStorage.removeItem('refreshToken');
                if (res.data.user) localStorage.setItem('user', JSON.stringify(res.data.user));
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
                const { status, tempAuthCode } = res.data;
                if (status === 'scanned') setStatus('scanned');
                else if (status === 'confirmed') {
                    setStatus('confirmed');
                    handleExchange(tempAuthCode);
                    return false;
                } else if (status === 'expired') {
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
            case 'loading': return '正在生成中...';
            case 'waiting': return qrMode === 'wxacode' ? '请使用微信扫一扫登录' : '请使用小程序扫码登录';
            case 'scanned': return '已扫码，请在手机上确认';
            case 'confirmed': return '登录成功，正在跳转...';
            case 'expired': return '二维码已过期，点击刷新';
            default: return '';
        }
    };

    const handleModeSwitch = () => {
        setQrMode(prev => prev === 'wxacode' ? 'classic' : 'wxacode');
    };

    // 判断是否应该显示 wxacode 图片（wxacode 模式且有图片数据）
    const showWxacode = qrMode === 'wxacode' && wxacodeImg;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0' }}>
            <div style={{
                position: 'relative',
                padding: 16,
                background: 'var(--component-bg)',
                borderRadius: 20,
                boxShadow: '0 10px 25px rgba(0,0,0,0.05)',
                border: '1px solid #F0F2F5'
            }}>
                {status === 'loading' && <Spin size="large" style={{ padding: 60 }} />}
                {status !== 'loading' && qrToken && showWxacode && (
                    <div style={{ position: 'relative' }}>
                        <img
                            src={wxacodeImg}
                            alt="微信小程序码"
                            className="wxacode-image"
                            style={{ opacity: (status === 'expired' || status === 'scanned') ? 0.3 : 1 }}
                        />
                        {status === 'expired' && (
                            <button type="button" className="qr-expired-overlay" onClick={fetchQRCode} aria-label="刷新登录二维码">
                                <ReloadOutlined style={{ fontSize: 32, color: '#4A7CF7', marginBottom: 8 }} />
                                <Text strong style={{ fontSize: 14, color: '#4A7CF7' }}>点击刷新</Text>
                            </button>
                        )}
                    </div>
                )}
                {status !== 'loading' && qrToken && !showWxacode && (
                    <div style={{ opacity: (status === 'expired' || status === 'scanned') ? 0.3 : 1 }}>
                        <QRCode
                            value={`miniprogram://auth/scan?t=${qrToken}`}
                            size={180}
                            bordered={false}
                            status={status === 'expired' ? 'expired' : 'active'}
                            onRefresh={fetchQRCode}
                        />
                    </div>
                )}
                {status === 'scanned' && (
                    <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexDirection: 'column', background: 'rgba(255,255,255,0.7)', borderRadius: 20
                    }}>
                        <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
                        <Text strong style={{ fontSize: 16 }}>已扫码成功</Text>
                    </div>
                )}
            </div>
            <Text type="secondary" style={{ marginTop: 24, fontSize: 15, fontWeight: 500 }}>
                {getStatusText()}
            </Text>
            <button type="button" className="scan-mode-toggle" onClick={handleModeSwitch}>
                {qrMode === 'wxacode' ? '使用小程序内扫码' : '使用微信扫一扫'}
            </button>
        </div>
    );
};

export default Login;
