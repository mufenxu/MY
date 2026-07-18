import React, { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Switch, Typography, Spin, Tag, Space, Button, message, Statistic } from 'antd';
import {
    CloudOutlined,
    ThunderboltOutlined,
    ReloadOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    ExclamationCircleOutlined
} from '@ant-design/icons';
import api from '../utils/api';

const { Title, Text } = Typography;

// IoT控制配置
const IOT_CONFIG = {
    topic: 'home/esp8266/relay/set',
    clientId: 'admin-web-relay',
    qos: 1,
    payload: {
        on: 'ON',
        off: 'OFF'
    }
};

const StatusIndicator = ({ connected, label }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {connected ? (
            <CheckCircleOutlined style={{ color: '#5CC9A7', fontSize: 16 }} />
        ) : (
            <CloseCircleOutlined style={{ color: '#E31A1A', fontSize: 16 }} />
        )}
        <Text style={{ color: connected ? '#5CC9A7' : '#E31A1A', fontWeight: 500 }}>
            {label}
        </Text>
    </div>
);

const DataCard = ({ title, value, unit, icon, color, loading }) => (
    <Card
        style={{
            borderRadius: 20,
            background: `linear-gradient(135deg, ${color}10 0%, ${color}25 100%)`,
            border: `1px solid ${color}30`,
            height: '100%'
        }}
        bodyStyle={{ padding: '28px', textAlign: 'center' }}
    >
        <div style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: `linear-gradient(135deg, ${color}30 0%, ${color}50 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px'
        }}>
            {React.cloneElement(icon, { style: { fontSize: 28, color } })}
        </div>
        <Text style={{ color: '#8C98A9', fontSize: 14, fontWeight: 500 }}>{title}</Text>
        <div style={{ marginTop: 8 }}>
            {loading ? (
                <Spin size="small" />
            ) : (
                <span style={{ fontSize: 42, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {value}
                    <span style={{ fontSize: 18, color: '#8C98A9', marginLeft: 4 }}>{unit}</span>
                </span>
            )}
        </div>
    </Card>
);

const IotMonitor = () => {
    const [data, setData] = useState({
        temperature: '--',
        humidity: '--',
        relayOn: false,
        mqttConnected: false,
        deviceOnline: false,
        subscribed: false,
        lastUpdated: null
    });
    const [loading, setLoading] = useState(true);
    const [switching, setSwitching] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);

    const fetchData = useCallback(async (signal) => {
        try {
            const response = await api.get('/iot/info', { signal });
            if (response.data.success && response.data.data) {
                const d = response.data.data;
                setData({
                    temperature: d.temp !== undefined ? d.temp.toFixed(1) : '--',
                    humidity: d.hum !== undefined ? Math.round(d.hum) : '--',
                    relayOn: d.relayStatus === 'ON',
                    mqttConnected: d.mqttConnected === true,
                    deviceOnline: d.deviceOnline === true,
                    subscribed: d.subscribed === true,
                    lastUpdated: d.timestamp || Date.now()
                });
            }
        } catch (error) {
            if (error.code !== 'ERR_CANCELED') console.error('获取IoT数据失败:', error);
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, []);

    useEffect(() => {
        let stopped = false;
        let timer = 0;
        let controller = null;
        const poll = async () => {
            controller = new AbortController();
            await fetchData(controller.signal);
            if (!stopped && autoRefresh) timer = window.setTimeout(poll, 5000);
        };
        void poll();

        return () => {
            stopped = true;
            window.clearTimeout(timer);
            controller?.abort();
        };
    }, [fetchData, autoRefresh]);

    const handleRelaySwitch = async (checked) => {
        if (switching) return;

        const prevState = data.relayOn;
        setSwitching(true);
        setData(prev => ({ ...prev, relayOn: checked }));

        try {
            const response = await api.post('/iot/control', {
                topic: IOT_CONFIG.topic,
                payload: checked ? IOT_CONFIG.payload.on : IOT_CONFIG.payload.off,
                qos: IOT_CONFIG.qos,
                clientid: IOT_CONFIG.clientId
            });

            if (response.data.success) {
                message.success(checked ? '继电器已开启' : '继电器已关闭');
            } else {
                throw new Error('控制失败');
            }
        } catch (error) {
            console.error('控制失败:', error);
            message.error('控制失败，请稍后重试');
            setData(prev => ({ ...prev, relayOn: prevState }));
        } finally {
            setSwitching(false);
        }
    };

    const formatTime = (timestamp) => {
        if (!timestamp) return '--';
        const date = new Date(timestamp);
        const now = new Date();
        const diff = Math.floor((now - date) / 1000);

        if (diff < 60) return `${diff}秒前`;
        if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
        return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    };

    const getOverallStatus = () => {
        if (!data.mqttConnected || !data.subscribed) {
            return { status: 'error', text: '系统连接异常', color: '#E31A1A' };
        }
        if (!data.deviceOnline) {
            return { status: 'warning', text: '设备离线', color: '#FFB547' };
        }
        return { status: 'success', text: '运行正常', color: '#5CC9A7' };
    };

    const overallStatus = getOverallStatus();

    return (
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            {/* 状态概览 */}
            <Card
                style={{
                    borderRadius: 20,
                    border: 'none',
                    boxShadow: 'var(--card-shadow)',
                    marginBottom: 20
                }}
                bodyStyle={{ padding: '24px' }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                    <Space size="large" wrap>
                        <Tag
                            color={overallStatus.color}
                            style={{ fontSize: 14, padding: '6px 16px', borderRadius: 8 }}
                        >
                            {overallStatus.status === 'success' && <CheckCircleOutlined style={{ marginRight: 6 }} />}
                            {overallStatus.status === 'warning' && <ExclamationCircleOutlined style={{ marginRight: 6 }} />}
                            {overallStatus.status === 'error' && <CloseCircleOutlined style={{ marginRight: 6 }} />}
                            {overallStatus.text}
                        </Tag>
                        <StatusIndicator connected={data.mqttConnected} label={data.mqttConnected ? 'MQTT已连接' : 'MQTT断开'} />
                        <StatusIndicator connected={data.deviceOnline} label={data.deviceOnline ? '设备在线' : '设备离线'} />
                        <Text type="secondary">更新于: {formatTime(data.lastUpdated)}</Text>
                    </Space>
                    <Space>
                        <Button
                            icon={<ReloadOutlined spin={loading} />}
                            onClick={() => { setLoading(true); fetchData(); }}
                        >
                            刷新
                        </Button>
                        <Switch
                            checked={autoRefresh}
                            onChange={setAutoRefresh}
                            checkedChildren="自动刷新"
                            unCheckedChildren="手动刷新"
                        />
                    </Space>
                </div>
            </Card>

            {/* 温湿度数据 */}
            <Row gutter={[20, 20]}>
                <Col xs={24} md={12}>
                    <DataCard
                        title="当前温度"
                        value={data.temperature}
                        unit="°C"
                        icon={<CloudOutlined />}
                        color="#4A7CF7"
                        loading={loading}
                    />
                </Col>
                <Col xs={24} md={12}>
                    <DataCard
                        title="当前湿度"
                        value={data.humidity}
                        unit="%"
                        icon={<CloudOutlined />}
                        color="#5CC9A7"
                        loading={loading}
                    />
                </Col>
            </Row>

            {/* 设备控制 */}
            <Card
                style={{
                    borderRadius: 20,
                    border: 'none',
                    boxShadow: 'var(--card-shadow)',
                    marginTop: 20
                }}
                bodyStyle={{ padding: '32px' }}
            >
                <Title level={5} style={{ marginBottom: 24, color: 'var(--text-primary)' }}>
                    <ThunderboltOutlined style={{ marginRight: 8 }} />
                    设备控制
                </Title>
                <Row gutter={[20, 20]} align="middle">
                    <Col xs={24} md={12}>
                        <Card
                            style={{
                                borderRadius: 16,
                                background: data.relayOn ? 'linear-gradient(135deg, #4A7CF710 0%, #4A7CF725 100%)' : '#F5F7FB',
                                border: data.relayOn ? '2px solid #4A7CF740' : '2px solid transparent',
                                transition: 'all 0.3s ease'
                            }}
                            bodyStyle={{ padding: '24px', textAlign: 'center' }}
                        >
                            <div style={{
                                width: 80,
                                height: 80,
                                borderRadius: 40,
                                background: data.relayOn
                                    ? 'linear-gradient(135deg, #4A7CF7 0%, #6B9BFF 100%)'
                                    : 'linear-gradient(135deg, #8C98A9 0%, #E9EDF7 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: '0 auto 20px',
                                boxShadow: data.relayOn ? '0 10px 30px rgba(67, 24, 255, 0.3)' : 'none',
                                transition: 'all 0.3s ease'
                            }}>
                                <ThunderboltOutlined style={{ fontSize: 36, color: '#fff' }} />
                            </div>
                            <Title level={4} style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>
                                继电器
                            </Title>
                            <Tag color={data.relayOn ? 'green' : 'default'} style={{ marginBottom: 16 }}>
                                {data.relayOn ? '已开启' : '已关闭'}
                            </Tag>
                            <div>
                                <Switch
                                    checked={data.relayOn}
                                    onChange={handleRelaySwitch}
                                    loading={switching}
                                    disabled={!data.deviceOnline}
                                    style={{
                                        transform: 'scale(1.5)',
                                        background: data.relayOn ? '#4A7CF7' : undefined
                                    }}
                                />
                            </div>
                            {!data.deviceOnline && (
                                <Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 12 }}>
                                    设备离线，无法控制
                                </Text>
                            )}
                        </Card>
                    </Col>
                    <Col xs={24} md={12}>
                        <Card
                            style={{
                                borderRadius: 16,
                                background: 'var(--bg-color)',
                                border: 'none'
                            }}
                            bodyStyle={{ padding: '24px' }}
                        >
                            <Title level={5} style={{ marginBottom: 16, color: 'var(--text-primary)' }}>设备信息</Title>
                            <Space direction="vertical" style={{ width: '100%' }} size="middle">
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Text type="secondary">MQTT连接</Text>
                                    <Tag color={data.mqttConnected ? 'green' : 'red'}>
                                        {data.mqttConnected ? '已连接' : '断开'}
                                    </Tag>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Text type="secondary">主题订阅</Text>
                                    <Tag color={data.subscribed ? 'green' : 'red'}>
                                        {data.subscribed ? '已订阅' : '未订阅'}
                                    </Tag>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Text type="secondary">设备状态</Text>
                                    <Tag color={data.deviceOnline ? 'green' : 'orange'}>
                                        {data.deviceOnline ? '在线' : '离线'}
                                    </Tag>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Text type="secondary">继电器状态</Text>
                                    <Tag color={data.relayOn ? 'blue' : 'default'}>
                                        {data.relayOn ? 'ON' : 'OFF'}
                                    </Tag>
                                </div>
                            </Space>
                        </Card>
                    </Col>
                </Row>
            </Card>
        </div>
    );
};

export default IotMonitor;
