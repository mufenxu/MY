import React, { lazy, Suspense, useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, List, Tag, Space, Spin, Typography, Button, Badge } from 'antd';
import {
    UserOutlined,
    TeamOutlined,
    BellOutlined,
    FileTextOutlined,
    RiseOutlined,
    SettingOutlined,
    AppstoreOutlined,
    ShoppingOutlined,
    ScanOutlined,
    ThunderboltOutlined,
    AreaChartOutlined,
    HistoryOutlined,
    FileSearchOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import UserAvatar from '../components/UserAvatar';
import { useResponsive } from '../hooks/useIsMobile';

const { Title, Text } = Typography;
const DashboardTrendChart = lazy(() => import('../components/DashboardTrendChart'));

const StatCard = ({ title, value, icon, color, subText, loading }) => (
    <Card
        style={{
            borderRadius: 24,
            background: 'var(--component-bg)',
            border: 'none',
            boxShadow: 'var(--card-shadow)',
            position: 'relative',
            overflow: 'visible'
        }}
        bodyStyle={{ padding: '24px' }}
    >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ zIndex: 2 }}>
                <Text style={{ color: '#A3AED0', fontSize: 14, fontWeight: 600 }}>{title}</Text>
                <div style={{ marginTop: 8 }}>
                    {loading ? (
                        <Spin size="small" />
                    ) : (
                        <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)', textShadow: '2px 2px 4px rgba(0,0,0,0.05)' }}>{value}</span>
                    )}
                </div>
                {subText && (
                    <Text style={{ color: '#A3AED0', fontSize: 12, marginTop: 4, display: 'block' }}>
                        {subText}
                    </Text>
                )}
            </div>
            <div style={{
                width: 60,
                height: 60,
                borderRadius: 20,
                background: color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `
                    0 15px 25px ${color}40,
                    inset 3px 3px 6px rgba(255, 255, 255, 0.4),
                    inset -3px -3px 6px rgba(0, 0, 0, 0.15)
                `,
                transform: 'translateZ(0)' // For smoother shadows
            }}>
                {React.cloneElement(icon, { style: { fontSize: 28, color: '#fff', filter: 'drop-shadow(2px 2px 2px rgba(0,0,0,0.2))' } })}
            </div>
        </div>
    </Card>
);

const QuickAction = ({ icon, title, onClick, color }) => (
    <button
        type="button"
        onClick={onClick}
        style={{
            cursor: 'pointer',
            width: '100%',
            minWidth: 0,
            minHeight: 88,
            padding: '12px 6px',
            borderRadius: 16,
            background: 'var(--component-bg)',
            border: 'none',
            font: 'inherit',
            textAlign: 'center',
            transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            boxShadow: 'var(--card-shadow)'
        }}
        onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = 'var(--hover-shadow)';
            const iconDiv = e.currentTarget.querySelector('.action-icon');
            if (iconDiv) {
                iconDiv.style.transform = 'scale(1.1)';
            }
        }}
        onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'var(--card-shadow)';
            const iconDiv = e.currentTarget.querySelector('.action-icon');
            if (iconDiv) {
                iconDiv.style.transform = 'scale(1)';
            }
        }}
    >
        <div 
            className="action-icon"
            style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                background: color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
                boxShadow: `
                    0 10px 15px ${color}30,
                    inset 2px 2px 4px rgba(255, 255, 255, 0.4),
                    inset -2px -2px 4px rgba(0, 0, 0, 0.15)
                `
            }}
        >
            {React.cloneElement(icon, { style: { fontSize: 22, color: '#fff', filter: 'drop-shadow(1px 1px 1px rgba(0,0,0,0.2))' } })}
        </div>
        <Text style={{ 
            color: 'var(--text-primary)', 
            fontWeight: 600, 
            fontSize: 13, 
            lineHeight: '18px',
            whiteSpace: 'normal',
            width: '100%',
            minHeight: 18,
            textShadow: '0 1px 1px rgba(0,0,0,0.1)'
        }}>{title}</Text>
    </button>
);

const Dashboard = () => {
    const [stats, setStats] = useState(null);
    const [news, setNews] = useState(null);
    const [loading, setLoading] = useState(true);
    const [newsLoading, setNewsLoading] = useState(false);
    const [showTrendChart, setShowTrendChart] = useState(false);
    const [statsError, setStatsError] = useState(false);
    const navigate = useNavigate();
    const { isMobile } = useResponsive();

    useEffect(() => {
        const reveal = () => setShowTrendChart(true);
        const idleId = 'requestIdleCallback' in window
            ? window.requestIdleCallback(reveal, { timeout: 1200 })
            : window.setTimeout(reveal, 250);

        return () => {
            if ('cancelIdleCallback' in window) window.cancelIdleCallback(idleId);
            else window.clearTimeout(idleId);
        };
    }, []);

    const fetchStats = async () => {
        try {
            setLoading(true);
            setStatsError(false);
            const response = await api.get('/stats/dashboard');
            if (response.data.success) {
                setStats(response.data.data);
            } else {
                setStatsError(true);
            }
        } catch (error) {
            console.error('获取统计数据失败:', error);
            setStatsError(true);
        } finally {
            setLoading(false);
        }
    };

    const fetchNews = async () => {
        try {
            setNewsLoading(true);
            const response = await api.get('/news/daily');
            setNews(response.data.data);
        } catch (error) {
            console.error('获取新闻失败:', error);
        } finally {
            setNewsLoading(false);
        }
    };

    useEffect(() => {
        const timerId = window.setTimeout(() => {
            fetchStats();
            fetchNews();
        }, 0);
        return () => window.clearTimeout(timerId);
    }, []);

    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return '刚刚';
        if (minutes < 60) return `${minutes}分钟前`;
        if (hours < 24) return `${hours}小时前`;
        if (days < 7) return `${days}天前`;
        return date.toLocaleDateString('zh-CN');
    };

    const quickActions = [
        { icon: <UserOutlined />, title: '用户管理', path: '/users', color: '#4A7CF7' },
        { icon: <ShoppingOutlined />, title: '网课订单', path: '/course-orders', color: '#5CC9A7' },
        { icon: <FileSearchOutlined />, title: '记录查询', path: '/query', color: '#2563EB' },
        { icon: <ScanOutlined />, title: '扫码管理', path: '/scan-management', color: '#7551FF' },
        { icon: <ThunderboltOutlined />, title: '空气能监控', path: '/air-energy', color: '#FFB547' },
        { icon: <BellOutlined />, title: '通知管理', path: '/notifications', color: '#FF5B5B' },
        { icon: <HistoryOutlined />, title: '审计日志', path: '/audit-logs', color: '#A3AED0' },
        { icon: <SettingOutlined />, title: '系统设置', path: '/settings', color: 'var(--text-primary)' }
    ];

    return (
        <div style={{ maxWidth: 1600, margin: '0 auto', padding: '0 2px' }}>
            {/* 顶层统计卡片 - 移动端2列，平板2列，电脑4列 */}
            <Row gutter={[isMobile ? 10 : 20, isMobile ? 10 : 20]}>
                <Col xs={12} sm={12} lg={6}>
                    <StatCard
                        title="用户总数"
                        value={statsError ? '--' : (stats?.users?.total ?? 0)}
                        icon={<TeamOutlined />}
                        color="#4A7CF7"
                        subText={statsError ? '数据暂不可用' : `活跃 ${stats?.users?.active ?? 0}`}
                        loading={loading}
                    />
                </Col>
                <Col xs={12} sm={12} lg={6}>
                    <StatCard
                        title="网课订单"
                        value={statsError ? '--' : (stats?.orders?.total ?? 0)}
                        icon={<ShoppingOutlined />}
                        color="#5CC9A7"
                        subText={statsError ? '数据暂不可用' : `待处理/进行中 ${stats?.orders?.active ?? 0}`}
                        loading={loading}
                    />
                </Col>
                <Col xs={12} sm={12} lg={6}>
                    <StatCard
                        title="扫码认证"
                        value={statsError ? '--' : (stats?.scans?.total ?? 0)}
                        icon={<ScanOutlined />}
                        color="#7551FF"
                        subText={statsError ? '数据暂不可用' : `今日通过 ${stats?.scans?.today ?? 0}`}
                        loading={loading}
                    />
                </Col>
                <Col xs={12} sm={12} lg={6}>
                    <StatCard
                        title="系统日志"
                        value={statsError ? '--' : (stats?.auditLogs?.total ?? 0)}
                        icon={<FileTextOutlined />}
                        color="#FFB547"
                        subText={statsError ? '数据暂不可用' : `今日新增 ${stats?.auditLogs?.today ?? 0}`}
                        loading={loading}
                    />
                </Col>
            </Row>

            {/* 中间核心区：趋势图 + 快捷入口 */}
            <Row gutter={[isMobile ? 10 : 20, isMobile ? 10 : 20]} style={{ marginTop: isMobile ? 12 : 20 }}>
                <Col xs={24} lg={16}>
                    <Card
                        style={{
                            borderRadius: 24,
                            background: 'var(--component-bg)',
                            border: 'none',
                            boxShadow: 'var(--card-shadow)',
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column'
                        }}
                        bodyStyle={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column' }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                            <div>
                                <Title level={5} style={{ margin: 0, color: 'var(--text-primary)' }}>业务增长趋势</Title>
                                <Text type="secondary" style={{ fontSize: 13 }}>过去 7 天的新增用户与订单统计</Text>
                            </div>
                            <Tag color="blue" icon={<AreaChartOutlined />}>最近一周</Tag>
                        </div>
                        <div style={{ flex: 1, minHeight: 320, width: '100%', minWidth: 0 }}>
                            {showTrendChart ? (
                                <Suspense fallback={<Spin style={{ width: '100%', paddingTop: 120 }} />}>
                                    <DashboardTrendChart data={stats?.trend || []} />
                                </Suspense>
                            ) : (
                                <Spin style={{ width: '100%', paddingTop: 120 }} />
                            )}
                        </div>
                    </Card>
                </Col>
                <Col xs={24} lg={8}>
                    <Card
                        style={{
                            borderRadius: 24,
                            background: 'var(--component-bg)',
                            border: 'none',
                            boxShadow: 'var(--card-shadow)',
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column'
                        }}
                        bodyStyle={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column' }}
                    >
                        <Title level={5} style={{ margin: '0 0 16px', color: 'var(--text-primary)' }}>快捷入口</Title>
                        <Row gutter={[10, 10]}>
                            {quickActions.map((action) => (
                                <Col xs={8} sm={6} md={4} lg={8} key={action.path}>
                                    <QuickAction
                                        icon={action.icon}
                                        title={action.title}
                                        color={action.color}
                                        onClick={() => navigate(action.path)}
                                    />
                                </Col>
                            ))}
                        </Row>
                        <div style={{ marginTop: 16 }}>
                            <div style={{ padding: 16, background: 'linear-gradient(135deg, #6B9BFF10 0%, #4A7CF710 100%)', borderRadius: 16 }}>
                                <Text strong style={{ color: '#4A7CF7', display: 'block', marginBottom: 4 }}>高效管理</Text>
                                <Text type="secondary" style={{ fontSize: 12 }}>点击上方图标可快速跳转至对应功能模块，提升操作效率。</Text>
                            </div>
                        </div>
                    </Card>
                </Col>
            </Row>

            {/* 底部详细区：每日简报、用户、日志 */}
            <Row gutter={[isMobile ? 10 : 20, isMobile ? 10 : 20]} style={{ marginTop: isMobile ? 12 : 20 }}>
                <Col xs={24} md={12} xl={8}>
                    <Card
                        title={
                            <Space>
                                <RiseOutlined style={{ color: '#4A7CF7' }} />
                                <Text strong style={{ color: 'var(--text-primary)' }}>每日简报</Text>
                            </Space>
                        }
                        style={{
                            borderRadius: 24,
                            background: 'var(--component-bg)',
                            border: 'none',
                            boxShadow: 'var(--card-shadow)',
                            height: '100%'
                        }}
                        bodyStyle={{ padding: '16px 24px' }}
                        extra={<Text type="secondary" style={{ fontSize: 12 }}>{news?.date || ''}</Text>}
                    >
                        <Spin spinning={newsLoading}>
                            <div style={{ maxHeight: 310, overflowY: 'auto', paddingRight: 8 }}>
                                {news?.news ? (
                                    <List
                                        dataSource={news.news.slice(0, 10)}
                                        split={false}
                                        renderItem={(item, index) => (
                                            <div key={index} style={{ marginBottom: 12, display: 'flex', gap: 10 }}>
                                                <Badge status="processing" color="#4A7CF7" style={{ marginTop: 8 }} />
                                                <Text style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>{item}</Text>
                                            </div>
                                        )}
                                    />
                                ) : (
                                    <div style={{ textAlign: 'center', padding: '40px 0' }}>
                                        <Text type="secondary">暂无资讯数据</Text>
                                    </div>
                                )}
                            </div>
                        </Spin>
                    </Card>
                </Col>
                <Col xs={24} md={12} xl={8}>
                    <Card
                        title={
                            <Space>
                                <UserOutlined style={{ color: '#5CC9A7' }} />
                                <Text strong style={{ color: 'var(--text-primary)' }}>最近注册用户</Text>
                            </Space>
                        }
                        style={{
                            borderRadius: 24,
                            background: 'var(--component-bg)',
                            border: 'none',
                            boxShadow: 'var(--card-shadow)',
                            height: '100%'
                        }}
                        bodyStyle={{ padding: '16px 24px' }}
                        extra={<Button type="link" onClick={() => navigate('/users')} style={{ padding: 0 }}>管理</Button>}
                    >
                        <List
                            loading={loading}
                            dataSource={stats?.recentUsers || []}
                            renderItem={(user) => (
                                <List.Item style={{ borderBottom: '1px solid #F5F7FB', padding: '10px 0' }}>
                                    <List.Item.Meta
                                        avatar={
                                            <UserAvatar
                                                seed={user.userId || user._id || user.deviceId}
                                                label={user.nickName || user.userId}
                                                avatarUrl={user.avatarUrl}
                                                style={{ border: '1px solid var(--border-color)' }}
                                                size={36}
                                            />
                                        }
                                        title={
                                            <Space>
                                                <Text strong style={{ fontSize: 13 }}>{user.nickName || '未设置昵称'}</Text>
                                                <Tag color={user.role === 'super_admin' ? 'purple' : user.role === 'admin' ? 'blue' : 'default'} style={{ fontSize: 10 }}>
                                                    {user.role === 'super_admin' ? '超管' : user.role === 'admin' ? '管理' : '用户'}
                                                </Tag>
                                            </Space>
                                        }
                                        description={
                                            <Text type="secondary" style={{ fontSize: 11 }}>
                                                {formatDate(user.createdAt)}
                                            </Text>
                                        }
                                    />
                                </List.Item>
                            )}
                            locale={{ emptyText: '暂无数据' }}
                        />
                    </Card>
                </Col>
                <Col xs={24} md={24} xl={8}>
                    <Card
                        title={
                            <Space>
                                <FileTextOutlined style={{ color: '#FFB547' }} />
                                <Text strong style={{ color: 'var(--text-primary)' }}>最近操作日志</Text>
                            </Space>
                        }
                        style={{
                            borderRadius: 24,
                            background: 'var(--component-bg)',
                            border: 'none',
                            boxShadow: 'var(--card-shadow)',
                            height: '100%'
                        }}
                        bodyStyle={{ padding: '16px 24px' }}
                        extra={
                            <Button type="link" onClick={() => navigate('/audit-logs')} style={{ padding: 0 }}>
                                查看更多
                            </Button>
                        }
                    >
                        <List
                            loading={loading}
                            dataSource={stats?.recentLogs || []}
                            size="small"
                            renderItem={(log) => (
                                <List.Item style={{ borderBottom: '1px solid #F5F7FB', padding: '8px 0' }}>
                                    <div style={{ width: '100%' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Space>
                                                <Tag color="blue" style={{ fontSize: 10 }}>{log.action}</Tag>
                                                <Text style={{ fontSize: 12, color: '#A3AED0' }}>{log.actorOpenid?.slice(-6) || 'System'}</Text>
                                            </Space>
                                            <Text type="secondary" style={{ fontSize: 11 }}>
                                                {formatDate(log.ts)}
                                            </Text>
                                        </div>
                                    </div>
                                </List.Item>
                            )}
                            locale={{ emptyText: '暂无日志' }}
                        />
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default Dashboard;
