import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
    Button,
    Card,
    Checkbox,
    Col,
    Empty,
    Input,
    Popconfirm,
    Row,
    Space,
    Spin,
    Statistic,
    Typography,
} from 'antd';
import {
    AreaChartOutlined,
    DeleteOutlined,
    FileSearchOutlined,
    FireOutlined,
    PlusOutlined,
    SettingOutlined,
    ShoppingOutlined,
    TeamOutlined,
    UserOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router';
import api from '../utils/api';
import { message } from '../utils/feedback';
import { useResponsive } from '../hooks/useIsMobile';

const { Title, Text } = Typography;
const DashboardTrendChart = lazy(() => import('../components/DashboardTrendChart'));
const getTimestamp = () => Date.now();

const StatCard = ({ title, value, note, icon, color, loading }) => (
    <Card bordered={false} style={{ borderRadius: 20, boxShadow: 'var(--card-shadow)', height: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
            <Statistic
                title={title}
                value={loading ? '--' : value}
                valueStyle={{ color: 'var(--text-primary)', fontWeight: 700 }}
            />
            <div
                style={{
                    width: 46,
                    height: 46,
                    borderRadius: 14,
                    background: color,
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 21,
                    flexShrink: 0,
                }}
            >
                {icon}
            </div>
        </div>
        <Text type="secondary" style={{ fontSize: 12 }}>{note}</Text>
    </Card>
);

const Dashboard = () => {
    const [stats, setStats] = useState(null);
    const [statsLoading, setStatsLoading] = useState(true);
    const [statsError, setStatsError] = useState(false);
    const [showTrendChart, setShowTrendChart] = useState(false);
    const [todos, setTodos] = useState([]);
    const [todoRevision, setTodoRevision] = useState(0);
    const [todoInput, setTodoInput] = useState('');
    const [todoLoading, setTodoLoading] = useState(true);
    const [todoSaving, setTodoSaving] = useState(false);
    const navigate = useNavigate();
    const { isMobile } = useResponsive();

    const fetchStats = useCallback(async () => {
        try {
            setStatsLoading(true);
            setStatsError(false);
            const response = await api.get('/stats/dashboard');
            if (response.data.success) setStats(response.data.data);
            else setStatsError(true);
        } catch (error) {
            console.error('获取首页数据失败:', error);
            setStatsError(true);
        } finally {
            setStatsLoading(false);
        }
    }, []);

    const loadTodos = useCallback(async () => {
        try {
            setTodoLoading(true);
            const response = await api.get('/todos');
            setTodos(response.data.data || []);
            setTodoRevision(response.data.revision || 0);
        } catch (error) {
            console.error('获取待办失败:', error);
            message.error('待办加载失败');
        } finally {
            setTodoLoading(false);
        }
    }, []);

    useEffect(() => {
        const timerId = window.setTimeout(() => {
            fetchStats();
            loadTodos();
        }, 0);
        return () => window.clearTimeout(timerId);
    }, [fetchStats, loadTodos]);

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

    const saveTodoOperations = async (operations) => {
        setTodoSaving(true);
        try {
            const response = await api.post('/todos/mutations', {
                revision: todoRevision,
                operations,
            });
            setTodos(response.data.data || []);
            setTodoRevision(response.data.revision || todoRevision + 1);
            return true;
        } catch (error) {
            if (error.response?.status === 409) {
                message.info('待办已在其他设备更新，已为你重新加载');
                await loadTodos();
            } else {
                message.error('待办保存失败');
            }
            return false;
        } finally {
            setTodoSaving(false);
        }
    };

    const addTodo = async () => {
        const title = todoInput.trim();
        if (!title || todoSaving) return;

        const now = getTimestamp();
        const id = globalThis.crypto?.randomUUID?.() || `todo-${now}-${Math.random().toString(16).slice(2)}`;
        const saved = await saveTodoOperations([{
            type: 'upsert',
            task: {
                id,
                title,
                completed: false,
                priority: 'normal',
                recurrence: 'none',
                createdAt: now,
                updatedAt: now,
            },
        }]);
        if (saved) setTodoInput('');
    };

    const toggleTodo = (todo, completed) => saveTodoOperations([{
        type: 'upsert',
        task: {
            ...todo,
            completed,
            reminderStatus: completed ? 'dismissed' : 'pending',
            updatedAt: getTimestamp(),
        },
    }]);

    const deleteTodo = (id) => saveTodoOperations([{ type: 'delete', id }]);

    const sortedTodos = useMemo(() => [...todos].sort((left, right) => {
        if (left.completed !== right.completed) return left.completed ? 1 : -1;
        return (right.updatedAt || 0) - (left.updatedAt || 0);
    }), [todos]);

    const quickActions = [
        { label: '订单', path: '/course-orders', icon: <ShoppingOutlined /> },
        { label: '查询', path: '/query', icon: <FileSearchOutlined /> },
        { label: '空气能', path: '/air-energy', icon: <FireOutlined /> },
        { label: '用户', path: '/users', icon: <UserOutlined /> },
        { label: '设置', path: '/settings', icon: <SettingOutlined /> },
    ];

    const today = new Intl.DateTimeFormat('zh-CN', {
        month: 'long',
        day: 'numeric',
        weekday: 'long',
    }).format(new Date());

    return (
        <div style={{ maxWidth: 1500, margin: '0 auto' }}>
            <Card
                bordered={false}
                style={{ borderRadius: 20, boxShadow: 'var(--card-shadow)', marginBottom: isMobile ? 12 : 20 }}
                bodyStyle={{ padding: isMobile ? 16 : 22 }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <div>
                        <Title level={3} style={{ margin: 0, color: 'var(--text-primary)' }}>我的管理台</Title>
                        <Text type="secondary">{today}，常用操作都在这里。</Text>
                    </div>
                    <Space wrap size={8}>
                        {quickActions.map((action) => (
                            <Button key={action.path} icon={action.icon} onClick={() => navigate(action.path)}>
                                {action.label}
                            </Button>
                        ))}
                    </Space>
                </div>
            </Card>

            <Row gutter={[isMobile ? 10 : 18, isMobile ? 10 : 18]}>
                <Col xs={12} lg={8}>
                    <StatCard
                        title="需要处理"
                        value={statsError ? '--' : (stats?.orders?.active ?? 0)}
                        note={statsError ? '暂时无法获取' : '待处理或进行中的订单'}
                        icon={<ShoppingOutlined />}
                        color="#F59E0B"
                        loading={statsLoading}
                    />
                </Col>
                <Col xs={12} lg={8}>
                    <StatCard
                        title="全部订单"
                        value={statsError ? '--' : (stats?.orders?.total ?? 0)}
                        note={statsError ? '暂时无法获取' : '当前保存的订单'}
                        icon={<AreaChartOutlined />}
                        color="#4A7CF7"
                        loading={statsLoading}
                    />
                </Col>
                <Col xs={24} lg={8}>
                    <StatCard
                        title="用户"
                        value={statsError ? '--' : (stats?.users?.total ?? 0)}
                        note={statsError ? '暂时无法获取' : `正常使用 ${stats?.users?.active ?? 0}`}
                        icon={<TeamOutlined />}
                        color="#5CC9A7"
                        loading={statsLoading}
                    />
                </Col>
            </Row>

            <Row gutter={[isMobile ? 10 : 18, isMobile ? 10 : 18]} style={{ marginTop: isMobile ? 12 : 18 }}>
                <Col xs={24} lg={14}>
                    <Card
                        title="最近 7 天"
                        extra={<Text type="secondary" style={{ fontSize: 12 }}>新用户和新订单</Text>}
                        bordered={false}
                        style={{ borderRadius: 20, boxShadow: 'var(--card-shadow)', height: '100%' }}
                        bodyStyle={{ height: 340, padding: isMobile ? '16px 8px' : 20 }}
                    >
                        {showTrendChart ? (
                            <Suspense fallback={<Spin style={{ width: '100%', paddingTop: 120 }} />}>
                                <DashboardTrendChart data={stats?.trend || []} />
                            </Suspense>
                        ) : (
                            <Spin style={{ width: '100%', paddingTop: 120 }} />
                        )}
                    </Card>
                </Col>
                <Col xs={24} lg={10}>
                    <Card
                        title="我的待办"
                        extra={<Text type="secondary" style={{ fontSize: 12 }}>{todos.filter((todo) => !todo.completed).length} 件未完成</Text>}
                        bordered={false}
                        style={{ borderRadius: 20, boxShadow: 'var(--card-shadow)', height: '100%' }}
                        bodyStyle={{ padding: isMobile ? 16 : 20 }}
                    >
                        <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
                            <Input
                                value={todoInput}
                                onChange={(event) => setTodoInput(event.target.value)}
                                onPressEnter={addTodo}
                                placeholder="写下要做的事"
                                maxLength={200}
                                disabled={todoSaving}
                            />
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                onClick={addTodo}
                                loading={todoSaving}
                                disabled={!todoInput.trim()}
                            >
                                添加
                            </Button>
                        </Space.Compact>

                        <Spin spinning={todoLoading}>
                            <div style={{ maxHeight: 260, overflowY: 'auto', paddingRight: 4 }}>
                                {!todoLoading && sortedTodos.length === 0 ? (
                                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有待办" />
                                ) : sortedTodos.map((todo) => (
                                    <div
                                        key={todo.id}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 10,
                                            minHeight: 42,
                                            padding: '8px 2px',
                                            borderBottom: '1px solid var(--border-color)',
                                        }}
                                    >
                                        <Checkbox
                                            checked={todo.completed}
                                            disabled={todoSaving}
                                            onChange={(event) => toggleTodo(todo, event.target.checked)}
                                        />
                                        <Text
                                            style={{
                                                flex: 1,
                                                color: todo.completed ? 'var(--text-tertiary)' : 'var(--text-primary)',
                                                textDecoration: todo.completed ? 'line-through' : 'none',
                                                wordBreak: 'break-word',
                                            }}
                                        >
                                            {todo.title}
                                        </Text>
                                        <Popconfirm
                                            title="删除这条待办？"
                                            okText="删除"
                                            cancelText="取消"
                                            onConfirm={() => deleteTodo(todo.id)}
                                        >
                                            <Button
                                                type="text"
                                                danger
                                                size="small"
                                                icon={<DeleteOutlined />}
                                                disabled={todoSaving}
                                                aria-label={`删除待办：${todo.title}`}
                                            />
                                        </Popconfirm>
                                    </div>
                                ))}
                            </div>
                        </Spin>
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default Dashboard;
