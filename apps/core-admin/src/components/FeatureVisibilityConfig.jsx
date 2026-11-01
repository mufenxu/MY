import { useState, useEffect, useRef } from 'react';
import { Switch, Select } from 'antd';
import { SaveOutlined, AppstoreOutlined, UserOutlined, SafetyCertificateOutlined, TeamOutlined } from '@ant-design/icons';
import api from '../utils/api';
import { message } from '../utils/feedback';

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

    useEffect(() => {
        const timerId = window.setTimeout(loadConfig, 0);
        return () => window.clearTimeout(timerId);
    }, []);

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
        <section className="panel">
            <div className="toolbar-row">
                <h2 className="panel-title">
                    <AppstoreOutlined />
                    小程序首页功能
                </h2>
                <span className="toolbar-spacer" />
                <span className="toolbar-count">共 {features.length} 项</span>
                <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={handleSave}
                    disabled={saving || loading}
                >
                    <SaveOutlined />
                    {saving ? '保存中…' : '保存配置'}
                </button>
            </div>

            <div className="panel-body">
                <p className="settings-note">
                    配置各功能的全局开关和可见角色：「所有人」注册用户登录后均可见；「管理员 / 超级管理员」仅限指定角色，或拥有该功能特权的个人可见。
                </p>

                {loading ? (
                    <div className="ops-loading">正在加载功能配置…</div>
                ) : (
                    <div className="feature-grid">
                        {features.map(item => (
                            <div key={item.key} className="feature-tile">
                                <div className="feature-tile-head">
                                    <span className="feature-icon" aria-hidden="true">{item.icon}</span>
                                    <strong>{item.name}</strong>
                                    <Switch
                                        size="small"
                                        checked={config[item.key]?.enabled !== false}
                                        onChange={(checked) => handleUpdate(item.key, 'enabled', checked)}
                                        aria-label={`${item.name}开关`}
                                    />
                                </div>
                                <Select
                                    disabled={config[item.key]?.enabled === false}
                                    style={{ width: '100%' }}
                                    value={config[item.key]?.minRole || 'user'}
                                    onChange={(val) => handleUpdate(item.key, 'minRole', val)}
                                >
                                    <Option value="user">所有人可见 <TeamOutlined style={{ color: 'var(--leaf-text)' }} /></Option>
                                    <Option value="admin">仅限管理员 <UserOutlined style={{ color: 'var(--blue)' }} /></Option>
                                    <Option value="super_admin">仅限超级管理员 <SafetyCertificateOutlined style={{ color: 'var(--violet)' }} /></Option>
                                </Select>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
};

export default FeatureVisibilityConfig;
