import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Modal, Spin, QRCode, Button, Typography, message } from 'antd';
import { CheckCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../utils/api';

const { Text } = Typography;

const ScanAuthModal = ({ open, onCancel, onSuccess, title = "安全验证" }) => {
    const [qrToken, setQrToken] = useState('');
    const [status, setStatus] = useState('loading'); // loading, waiting, scanned, confirmed, expired
    const timerRef = useRef(null);

    const startPolling = useCallback((token) => {
        const startTime = Date.now();
        timerRef.current = setInterval(async () => {
            if (Date.now() - startTime > 5 * 60 * 1000) {
                clearInterval(timerRef.current);
                setStatus('expired');
                message.warning('验证二维码已超时，请重新获取');
                return;
            }
            try {
                const res = await api.get(`/auth/qrcode/status?qrToken=${token}`);
                const { status: qrStatus } = res.data;

                if (qrStatus === 'scanned') {
                    setStatus('scanned');
                } else if (qrStatus === 'confirmed') {
                    clearInterval(timerRef.current);
                    setStatus('confirmed');
                    setTimeout(() => {
                        onSuccess();
                    }, 500);
                } else if (qrStatus === 'expired') {
                    clearInterval(timerRef.current);
                    setStatus('expired');
                }
            } catch (err) {
                console.error(err);
            }
        }, 2000);
    }, [onSuccess]);

    const fetchQRCode = useCallback(async () => {
        try {
            if (timerRef.current) clearInterval(timerRef.current);
            setQrToken('');
            setStatus('loading');

            const res = await api.post('/auth/qrcode/create', {
                appId: 'admin-action-auth'
            });

            if (res.data && res.data.qrToken) {
                setQrToken(res.data.qrToken);
                setStatus('waiting');
                startPolling(res.data.qrToken);
            } else {
                message.error('获取二维码失败');
                setStatus('expired');
            }
        } catch (err) {
            console.error(err);
            setStatus('expired');
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
            if (timerRef.current) clearInterval(timerRef.current);
            resetTimer = setTimeout(() => {
                setStatus('loading');
                setQrToken('');
            }, 0);
        }
        return () => {
            if (kickoffTimer) clearTimeout(kickoffTimer);
            if (resetTimer) clearTimeout(resetTimer);
            if (timerRef.current) clearInterval(timerRef.current);
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
