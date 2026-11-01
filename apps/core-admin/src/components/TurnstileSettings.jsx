import { useState, useEffect, useCallback } from 'react';
import { Switch, Form, Input, Button, Row, Col } from 'antd';
import { SafetyCertificateOutlined, SaveOutlined, KeyOutlined, GlobalOutlined } from '@ant-design/icons';
import api from '../utils/api';
import ReauthenticationModal from './ReauthenticationModal';
import { establishSensitiveSession } from '../utils/reauth';
import { message } from '../utils/feedback';

const TurnstileSettings = () => {
    const [form] = Form.useForm();
    const [, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [reauthVisible, setReauthVisible] = useState(false);
    const [pendingValues, setPendingValues] = useState(null);

    const loadConfig = useCallback(async () => {
        setLoading(true);
        try {
            // 获取开关和 Site Key (来自 AppConfig)
            const res = await api.get('/settings/app-config/turnstile_config');

            // 获取 Secret Key 状态 (来自 SecretService)
            const secretRes = await api.get('/secrets');
            const secretData = secretRes.data.result.find(s => s.key === 'TURNSTILE_SECRET_KEY');

            if (res.data.success) {
                const config = res.data.result || { enabled: false, siteKey: '' };
                form.setFieldsValue({
                    enabled: config.enabled,
                    siteKey: config.siteKey,
                    // Secret Key 不回显完整值，只显示占位符或提示
                    secretKey: secretData?.hasDbRecord ? '********' : ''
                });
            }
        } catch {
            message.error('加载人机验证配置失败');
        } finally {
            setLoading(false);
        }
    }, [form]);

    useEffect(() => {
        const timerId = window.setTimeout(loadConfig, 0);
        return () => window.clearTimeout(timerId);
    }, [loadConfig]);

    const saveConfig = async (values, proof = {}) => {
        setSaving(true);
        try {
            // Update the secret before enabling a configuration that depends on it.
            if (values.secretKey && values.secretKey !== '********') {
                await api.post('/secrets/update', {
                    key: 'TURNSTILE_SECRET_KEY',
                    value: values.secretKey,
                    ...proof
                });
            }

            const appConfigRes = await api.post('/settings/app-config', {
                key: 'turnstile_config',
                value: {
                    enabled: values.enabled,
                    siteKey: values.siteKey
                },
                remark: 'Cloudflare Turnstile 人机验证配置',
                ...proof
            });

            if (appConfigRes.data.success) {
                message.success('人机验证配置已保存');
                setReauthVisible(false);
                setPendingValues(null);
                loadConfig();
            }
        } catch (error) {
            message.error(error.response?.data?.message || error.response?.data?.error || error.message || '保存失败');
        } finally {
            setSaving(false);
        }
    };

    const onFinish = async (values) => {
        setPendingValues(values);
        setReauthVisible(true);
    };

    const handleReauthentication = async (credentials) => {
        if (!pendingValues) return;
        setSaving(true);
        try {
            const proof = await establishSensitiveSession(credentials);
            await saveConfig(pendingValues, proof);
        } catch (error) {
            message.error(error.response?.data?.message || error.message || '二次验证失败');
            setSaving(false);
        }
    };

    return (
        <>
            <section className="panel">
                <div className="panel-head">
                    <h2 className="panel-title">
                        <SafetyCertificateOutlined />
                        人机验证
                    </h2>
                    <span className="panel-meta">Cloudflare Turnstile</span>
                </div>
                <div className="panel-body">
                    <div className="hint">
                        <strong>人机验证安全提示</strong>
                        <span>
                            通过 Cloudflare Turnstile 可以有效防御大规模暴力破解。凭据请前往{' '}
                            <a href="https://dash.cloudflare.com/" target="_blank" rel="noreferrer">Cloudflare 控制台</a>{' '}
                            获取。
                        </span>
                    </div>

                    <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ enabled: false }}>
                        <div className="toggle-block">
                            <span>
                                <strong>启用登录人机挑战</strong>
                                <span>开启后，登录页会强制要求完成 Cloudflare Turnstile 验证。</span>
                            </span>
                            <Form.Item name="enabled" valuePropName="checked" noStyle>
                                <Switch />
                            </Form.Item>
                        </div>

                        <Form.Item noStyle shouldUpdate={(prev, curr) => prev.enabled !== curr.enabled}>
                            {({ getFieldValue }) => (
                                <div style={{ display: getFieldValue('enabled') ? 'block' : 'none' }} className="fade-in">
                                    <Row gutter={16}>
                                        <Col xs={24} md={12}>
                                            <Form.Item
                                                name="siteKey"
                                                label={<span><GlobalOutlined style={{ marginRight: 6 }} />Site Key（前端凭据）</span>}
                                                rules={[{ required: getFieldValue('enabled'), message: '请输入 Site Key' }]}
                                            >
                                                <Input placeholder="0x4AAAAAA..." />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={12}>
                                            <Form.Item
                                                name="secretKey"
                                                label={<span><KeyOutlined style={{ marginRight: 6 }} />Secret Key（后端私钥）</span>}
                                                rules={[{ required: getFieldValue('enabled'), message: '请输入 Secret Key' }]}
                                            >
                                                <Input.Password placeholder="请输入 Cloudflare 提供的私钥" />
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                    <p className="settings-note" style={{ marginTop: -6 }}>
                                        * 出于安全考虑，保存后 Secret Key 只会以掩码形式显示。
                                    </p>
                                </div>
                            )}
                        </Form.Item>

                        <div className="form-actions">
                            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
                                保存配置
                            </Button>
                        </div>
                    </Form>
                </div>
            </section>

            <ReauthenticationModal
                open={reauthVisible}
                title="更新 Turnstile 密钥二次验证"
                confirmLoading={saving}
                onCancel={() => {
                    setReauthVisible(false);
                    setPendingValues(null);
                }}
                onConfirm={handleReauthentication}
            />
        </>
    );
};

export default TurnstileSettings;
