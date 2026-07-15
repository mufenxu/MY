import React, { useState, useEffect, useCallback } from 'react';
import { Card, Switch, Form, Input, Button, message, Typography, Space, Divider, Alert, Row, Col } from 'antd';
import { SafetyCertificateOutlined, SaveOutlined, KeyOutlined, GlobalOutlined } from '@ant-design/icons';
import api from '../utils/api';

const { Text, Link } = Typography;

const TurnstileSettings = () => {
    const [form] = Form.useForm();
    const [, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

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
        loadConfig();
    }, [loadConfig]);

    const onFinish = async (values) => {
        setSaving(true);
        try {
            // 1. 保存开关和 Site Key 到 AppConfig
            const appConfigRes = await api.post('/settings/app-config', {
                key: 'turnstile_config',
                value: {
                    enabled: values.enabled,
                    siteKey: values.siteKey
                },
                remark: 'Cloudflare Turnstile 人机验证配置'
            });

            // 2. 如果用户输入了新的 Secret Key (不是那个 8 个星号的占位符)，则保存到 SecretService
            if (values.secretKey && values.secretKey !== '********') {
                await api.post('/secrets/update', {
                    key: 'TURNSTILE_SECRET_KEY',
                    value: values.secretKey
                });
            }

            if (appConfigRes.data.success) {
                message.success('人机验证配置已保存');
                loadConfig();
            }
        } catch {
            message.error('保存失败');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card 
            title={<span><SafetyCertificateOutlined style={{ marginRight: 8, color: '#4A7CF7' }} />人机验证 (Cloudflare Turnstile)</span>} 
            bordered={false}
            style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
        >
            <Alert
                className="turnstile-security-alert"
                message="人机验证安全提示"
                description={
                    <span>
                        通过集成 Cloudflare Turnstile 可以有效防御大规模暴力破解。您需要前往 <Link href="https://dash.cloudflare.com/" target="_blank">Cloudflare 控制台</Link> 获取相关凭据。
                    </span>
                }
                type="info"
                showIcon
                style={{ marginBottom: 32, borderRadius: 12 }}
            />

            <Form
                form={form}
                layout="vertical"
                onFinish={onFinish}
                initialValues={{ enabled: false }}
            >
                <div style={{ background: 'var(--bg-color)', padding: '24px', borderRadius: 20, marginBottom: 32, border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <Text strong style={{ fontSize: 16, display: 'block', marginBottom: 4 }}>启用登录人机挑战</Text>
                            <Text type="secondary" style={{ fontSize: 13 }}>开启后，管理后台登录页面将强制要求完成 Cloudflare Turnstile 验证</Text>
                        </div>
                        <Form.Item 
                            name="enabled" 
                            valuePropName="checked"
                            style={{ marginBottom: 0 }}
                        >
                            <Switch size="large" />
                        </Form.Item>
                    </div>
                </div>

                <Form.Item noStyle shouldUpdate={(prev, curr) => prev.enabled !== curr.enabled}>
                    {({ getFieldValue }) => (
                        <div style={{ display: getFieldValue('enabled') ? 'block' : 'none' }} className="fade-in">
                            <Row gutter={24}>
                                <Col xs={24} md={12}>
                                    <Form.Item 
                                        name="siteKey" 
                                        label={<span><GlobalOutlined style={{ marginRight: 8, color: '#4A7CF7' }} /> Site Key (前端显示凭据)</span>}
                                        rules={[{ required: getFieldValue('enabled'), message: '请输入 Site Key' }]}
                                    >
                                        <Input placeholder="0x4AAAAAA..." />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} md={12}>
                                    <Form.Item 
                                        name="secretKey" 
                                        label={<span><KeyOutlined style={{ marginRight: 8, color: '#4A7CF7' }} /> Secret Key (后端验证私钥)</span>}
                                        rules={[{ required: getFieldValue('enabled'), message: '请输入 Secret Key' }]}
                                    >
                                        <Input.Password placeholder="请输入 Cloudflare 提供的私钥" />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: -8, marginBottom: 24 }}>
                                * 出于安全考虑，保存后 Secret Key 将以掩码形式显示。
                            </Text>
                        </div>
                    )}
                </Form.Item>

                <Divider style={{ margin: '24px 0' }} />

                <div style={{ textAlign: 'left' }}>
                    <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving} size="large" style={{ minWidth: 120 }}>
                        保存配置
                    </Button>
                </div>
            </Form>
        </Card>
    );
};

export default TurnstileSettings;
