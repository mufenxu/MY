import React, { useState, useEffect, useRef } from 'react';
import { Card, Switch, Button, message, List, Typography, Space, Divider, Select } from 'antd';
import { SaveOutlined, AppstoreOutlined, UserOutlined, SafetyCertificateOutlined, TeamOutlined } from '@ant-design/icons';
import api from '../utils/api';

const { Text } = Typography;
const { Option } = Select;

const features = [
    { key: 'resources', name: '资源管理', icon: '💻' },
    { key: 'bmi', name: 'BMI计算器', icon: '⚖️' },
    { key: 'todo', name: '待办清单', icon: '📝' },
    { key: 'ct8', name: 'CT8管理', icon: '☁️' },
    { key: 'smart_control', name: '智能控制', icon: '🔌' },
    { key: 'heat_pump', name: '空气能', icon: '🔥' },
    { key: 'daily_news', name: '近日趣事', icon: '📰' },

    { key: 'course_order', name: '订单处理', icon: '🛒' },
];

const normalizeConfig = (loadedConfig = {}) => {
    const normalized = {};
    features.forEach(f => {
        const item = loadedConfig[f.key];
        if (typeof item === 'boolean') {
            normalized[f.key] = { enabled: item, minRole: 'user' };
        } else if (item) {
            normalized[f.key] = {
                enabled: item.enabled !== false,
                minRole: item.minRole || 'user'
            };
        } else {
            normalized[f.key] = { enabled: true, minRole: 'user' };
        }
    });
    return normalized;
};

const FeatureVisibilityConfig = () => {
    const [config, setConfig] = useState({});
    const configRef = useRef({});
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        setLoading(true);
        try {
            const res = await api.get('/settings/app-config/feature_visibility', {
                params: { _: Date.now() },
                headers: {
                    'Cache-Control': 'no-cache',
                    Pragma: 'no-cache',
                },
            });
            const nextConfig = normalizeConfig(res.data.success && res.data.result ? res.data.result : {});
            configRef.current = nextConfig;
            setConfig(nextConfig);
        } catch {
            message.error('加载功能配置失败');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdate = (key, field, value) => {
        setConfig(prev => {
            const nextConfig = {
                ...prev,
                [key]: {
                    ...prev[key],
                    [field]: value
                }
            };
            configRef.current = nextConfig;
            return nextConfig;
        });
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const nextConfig = normalizeConfig(configRef.current);
            const res = await api.post('/settings/app-config', {
                key: 'feature_visibility',
                value: nextConfig,
                remark: '小程序首页功能卡片显示控制（含角色控制）'
            });
            if (res.data.success) {
                const savedConfig = normalizeConfig(res.data.result || nextConfig);
                configRef.current = savedConfig;
                setConfig(savedConfig);
                message.success('功能配置已保存');
            } else {
                message.error(res.data.error || '保存失败');
            }
        } catch {
            message.error('保存失败');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card 
            title={<span><AppstoreOutlined style={{ marginRight: 8 }} />小程序首页功能管理</span>} 
            bordered={false}
            extra={<Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving} disabled={loading} size="large">保存配置</Button>}
        >
            <div style={{ marginBottom: 16 }}>
                <Text type="secondary">配置各功能的全局开关和可见角色：</Text>
                <ul>
                    <li><Text type="secondary"><b>所有人</b>：注册用户登录后均可见。</Text></li>
                    <li><Text type="secondary"><b>管理员/超级管理员</b>：仅限指定角色或拥有该功能特权的个人可见。</Text></li>
                </ul>
            </div>
            <Divider />
            <List
                loading={loading}
                grid={{ gutter: 16, xs: 1, sm: 2, md: 2, lg: 3, xl: 3, xxl: 4 }}
                dataSource={features}
                renderItem={item => (
                    <List.Item>
                        <Card hoverable size="small" style={{ borderRadius: 12, border: '1px solid var(--border-color)' }}>
                            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Space>
                                    <span style={{ fontSize: '24px' }}>{item.icon}</span>
                                    <Text strong style={{ fontSize: '16px' }}>{item.name}</Text>
                                </Space>
                                <Switch 
                                    checked={config[item.key]?.enabled !== false} 
                                    onChange={(checked) => handleUpdate(item.key, 'enabled', checked)} 
                                />
                            </div>
                            <Select 
                                disabled={config[item.key]?.enabled === false}
                                style={{ width: '100%' }} 
                                value={config[item.key]?.minRole || 'user'}
                                onChange={(val) => handleUpdate(item.key, 'minRole', val)}
                                size="middle"
                            >
                                <Option value="user">所有人可见 <TeamOutlined style={{ color: '#52c41a' }} /></Option>
                                <Option value="admin">仅限管理员可见 <UserOutlined style={{ color: '#1890ff' }} /></Option>
                                <Option value="super_admin">仅限超级管理员 <SafetyCertificateOutlined style={{ color: '#722ed1' }} /></Option>
                            </Select>
                        </Card>
                    </List.Item>
                )}
            />
        </Card>
    );
};

export default FeatureVisibilityConfig;
