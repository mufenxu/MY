import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Input, Popconfirm, Spin } from 'antd';
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

const DashboardTrendChart = lazy(() => import('../components/DashboardTrendChart'));
const getTimestamp = () => Date.now();

const StatCard = ({ title, value, note, icon, tone, loading }) => (
    <article className="stat-card">
        <span className={`stat-icon ${tone ? `tone-${tone}` : ''}`} aria-hidden="true">{icon}</span>
        <div className="stat-copy">
            <span className="stat-label">{title}</span>
            <strong className="stat-figure tnum">{loading ? '—' : value}</strong>
            <span className="stat-foot">{note}</span>
        </div>
    </article>
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

    // 图表延后到空闲时再挂载，避免首页首屏被 recharts 拖慢
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

    const pendingTodos = todos.filter((todo) => !todo.completed).length;

    return (
        <div className="page-view">
            <section className="panel hero">
                <div className="hero-copy">
                    <h1>我的管理台</h1>
                    <p>{today}，常用操作都在这里。</p>
                </div>
                <div className="quick-actions">
                    {quickActions.map((action) => (
                        <button
                            key={action.path}
                            type="button"
                            className="quick-action"
                            onClick={() => navigate(action.path)}
                        >
                            {action.icon}
                            {action.label}
                        </button>
                    ))}
                </div>
            </section>

            <div className="stat-strip">
                <StatCard
                    title="需要处理"
                    value={statsError ? '—' : (stats?.orders?.active ?? 0)}
                    note={statsError ? '暂时无法获取' : '待处理或进行中的订单'}
                    icon={<ShoppingOutlined />}
                    tone="warn"
                    loading={statsLoading}
                />
                <StatCard
                    title="全部订单"
                    value={statsError ? '—' : (stats?.orders?.total ?? 0)}
                    note={statsError ? '暂时无法获取' : '当前保存的订单'}
                    icon={<AreaChartOutlined />}
                    loading={statsLoading}
                />
                <StatCard
                    title="用户"
                    value={statsError ? '—' : (stats?.users?.total ?? 0)}
                    note={statsError ? '暂时无法获取' : `正常使用 ${stats?.users?.active ?? 0}`}
                    icon={<TeamOutlined />}
                    tone="ok"
                    loading={statsLoading}
                />
            </div>

            <div className="split">
                <section className="panel" aria-label="最近 7 天趋势">
                    <header className="panel-head">
                        <span className="panel-title">最近 7 天</span>
                        <span className="panel-meta">新用户和新订单</span>
                    </header>
                    <div className="panel-body">
                        <div className="chart-box">
                            {showTrendChart ? (
                                <Suspense fallback={<Spin style={{ width: '100%', paddingTop: 120 }} />}>
                                    <DashboardTrendChart data={stats?.trend || []} />
                                </Suspense>
                            ) : (
                                <Spin style={{ width: '100%', paddingTop: 120 }} />
                            )}
                        </div>
                    </div>
                </section>

                <section className="panel" aria-label="我的待办">
                    <header className="panel-head">
                        <span className="panel-title">我的待办</span>
                        <span className="panel-meta">{pendingTodos} 件未完成</span>
                    </header>
                    <div className="panel-body">
                        <div className="todo-add">
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
                        </div>

                        <Spin spinning={todoLoading}>
                            <div className="todo-scroll">
                                {!todoLoading && sortedTodos.length === 0 ? (
                                    <div className="ops-empty todo-empty">还没有待办</div>
                                ) : sortedTodos.map((todo) => (
                                    <div key={todo.id} className={`todo-row ${todo.completed ? 'is-done' : ''}`}>
                                        <Checkbox
                                            checked={todo.completed}
                                            disabled={todoSaving}
                                            onChange={(event) => toggleTodo(todo, event.target.checked)}
                                        />
                                        <span className="todo-title">{todo.title}</span>
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
                    </div>
                </section>
            </div>
        </div>
    );
};

export default Dashboard;
