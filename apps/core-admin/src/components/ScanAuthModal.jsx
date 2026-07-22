import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Modal, Spin, QRCode, Button, Typography } from 'antd';
import { CheckCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../utils/api';
import { createSequentialPoller } from '../utils/sequentialPoller';
import { message } from '../utils/feedback';

const { Text } = Typography;

const ScanAuthModal = ({ open, onCancel, onSuccess, title = "安全验证" }) => {
    const [qrToken, setQrToken] = useState('');
    const [status, setStatus] = useState('loading'); // loading, waiting, scanned, confirmed, expired
    const timerRef = useRef(null);
    const createRequestRef = useRef(null);
    const successTimerRef = useRef(null);

    const startPolling = useCallback((token) => {
        const startTime = Date.now();
        timerRef.current?.stop();
        timerRef.current = createSequentialPoller(async (signal) => {
            if (Date.now() - startTime > 5 * 60 * 1000) {
                setStatus('expired');
                message.warning('验证二维码已超时，请重新获取');
                return false;
            }
                const res = await api.get(`/auth/qrcode/status?qrToken=${token}`, { signal });
                const { status: qrStatus } = res.data;

                if (qrStatus === 'scanned') {
                    setStatus('scanned');
                } else if (qrStatus === 'confirmed') {
                    setStatus('confirmed');
                    window.clearTimeout(successTimerRef.current);
                    successTimerRef.current = window.setTimeout(() => {
                        onSuccess();
                    }, 500);
                    return false;
                } else if (qrStatus === 'expired') {
                    setStatus('expired');
                    return false;
                }
                return true;
        }, { interval: 2000, onError: () => true });
        timerRef.current.start();
    }, [onSuccess]);

    const fetchQRCode = useCallback(async () => {
        createRequestRef.current?.abort();
        const controller = new AbortController();
        createRequestRef.current = controller;
        window.clearTimeout(successTimerRef.current);

        try {
            timerRef.current?.stop();
            setQrToken('');
            setStatus('loading');

            const res = await api.post('/auth/qrcode/create', {
                appId: 'admin-action-auth'
            }, { signal: controller.signal });

            if (controller.signal.aborted) return;

            if (res.data && res.data.qrToken) {
                setQrToken(res.data.qrToken);
                setStatus('waiting');
                startPolling(res.data.qrToken);
            } else {
                message.error('获取二维码失败');
                setStatus('expired');
            }
        } catch (err) {
            if (controller.signal.aborted || err.code === 'ERR_CANCELED') return;
            console.error(err);
            setStatus('expired');
        } finally {
            if (createRequestRef.current === controller) {
                createRequestRef.current = null;
            }
        }
    }, [startPolling]);

    useEffect(() => {
        let kickoffTimer = null;
        let resetTimer = null;
        if (open) {
            kickoffTimer = setTimeout(() => {
                fetchQRCode();
            }, 0);
        } else {
            timerRef.current?.stop();
            resetTimer = setTimeout(() => {
                setStatus('loading');
                setQrToken('');
            }, 0);
        }
        return () => {
            if (kickoffTimer) clearTimeout(kickoffTimer);
            if (resetTimer) clearTimeout(resetTimer);
            timerRef.current?.stop();
            createRequestRef.current?.abort();
            window.clearTimeout(successTimerRef.current);
        };
    }, [open, fetchQRCode]);

    const getStatusText = () => {
        switch (status) {
            case 'loading': return '正在生成二维码...';
            case 'waiting': return '请使用星轨轻具坊小程序扫码验证';
            case 'scanned': return '已扫码，请在手机上确认';
            case 'confirmed': return '验证成功';
            case 'expired': return '二维码已过期，点击刷新';
            default: return '';
        }
    };

    return (
        <Modal
            title={title}
            open={open}
            onCancel={onCancel}
            footer={null}
            destroyOnClose
            centered
            width={320}
        >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0' }}>
                <div style={{
                    position: 'relative',
                    padding: 10,
                    background: 'var(--component-bg)',
                    borderRadius: 8,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                    marginBottom: 16
                }}>
                    {status === 'loading' && <Spin size="large" style={{ padding: 40 }} />}

                    {status !== 'loading' && qrToken && (
                        <div style={{ opacity: status === 'expired' || status === 'scanned' || status === 'confirmed' ? 0.3 : 1 }}>
                            <QRCode
                                value={`miniprogram://auth/scan?t=${qrToken}`}
                                size={200}
                                status={status === 'expired' ? 'expired' : 'active'}
                                onRefresh={fetchQRCode}
                            />
                        </div>
                    )}

                    {(status === 'scanned' || status === 'confirmed') && (
                        <div style={{
                            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexDirection: 'column',
                            background: 'rgba(255,255,255,0.85)'
                        }}>
                            <CheckCircleOutlined style={{ fontSize: 40, color: '#52c41a', marginBottom: 10 }} />
                            <Text strong>{status === 'scanned' ? '等待确认' : '验证成功'}</Text>
                        </div>
                    )}

                    {status === 'expired' && (
                        <div style={{
                            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer'
                        }} onClick={fetchQRCode}>
                            <Button type="primary" shape="round" icon={<ReloadOutlined />}>刷新</Button>
                        </div>
                    )}
                </div>

                <Text type="secondary" style={{ textAlign: 'center' }}>
                    {getStatusText()}
                </Text>
            </div>
        </Modal>
    );
};

export default ScanAuthModal;
