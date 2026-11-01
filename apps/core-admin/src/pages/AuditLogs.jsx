import { useState, useEffect, useCallback } from 'react';
import { Table, Pagination } from 'antd';
import { FileSearchOutlined } from '@ant-design/icons';
import api from '../utils/api';
import dayjs from 'dayjs';
import useIsMobile from '../hooks/useIsMobile';

const ACTION_META = {
    CREATE: { label: '创建', tone: 'ok' },
    UPDATE: { label: '更新', tone: 'warn' },
    DELETE: { label: '删除', tone: 'danger' },
    LOGIN: { label: '登录', tone: 'info' },
    LOGOUT: { label: '登出', tone: 'neutral' },
};

const resolveAction = (action = '') => {
    const matched = Object.keys(ACTION_META).find((name) => action.includes(name));
    return ACTION_META[matched] || { label: action || '未知', tone: 'neutral' };
};

const ActionTag = ({ action }) => {
    const meta = resolveAction(action);
    return <span className={`tag tone-${meta.tone}`}>{meta.label}</span>;
};

const AuditLogs = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const isMobile = useIsMobile();
    const [pagination, setPagination] = useState({
        current: 1,
        pageSize: 10,
        total: 0,
    });

    const fetchLogs = useCallback(async (page = 1, pageSize = 10) => {
        setLoading(true);
        try {
            const res = await api.get('/audit-logs', {
                params: { page, pageSize }
            });
            if (res.data.success) {
                setLogs(res.data.items);
                setPagination(prev => ({
                    ...prev,
                    current: page,
                    pageSize: pageSize,
                    total: res.data.total
                }));
            }
        } catch (error) {
            console.error('Failed to fetch audit logs:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const timerId = window.setTimeout(fetchLogs, 0);
        return () => window.clearTimeout(timerId);
    }, [fetchLogs]);

    const handleTableChange = (nextPagination) => {
        fetchLogs(nextPagination.current, nextPagination.pageSize);
    };

    const columns = [
        {
            title: '时间',
            dataIndex: 'ts',
            key: 'ts',
            width: 172,
            render: (ts) => <span className="cell-mono">{dayjs(ts).format('YYYY-MM-DD HH:mm:ss')}</span>,
        },
        {
            title: '操作人',
            dataIndex: 'actorOpenid',
            key: 'actorOpenid',
            width: 96,
            render: () => '我',
        },
        {
            title: '操作',
            dataIndex: 'action',
            key: 'action',
            width: 110,
            render: (action) => <ActionTag action={action} />,
        },
        {
            title: '对象',
            dataIndex: 'targetId',
            key: 'targetId',
            width: 150,
            render: (targetId) => <span className="cell-mono">{targetId || '—'}</span>,
        },
        {
            title: '内容',
            dataIndex: 'payload',
            key: 'payload',
            render: (payload) => {
                const text = JSON.stringify(payload);
                return (
                    <span className="cell-mono ellipsis" style={{ display: 'block' }} title={text}>
                        {text}
                    </span>
                );
            },
        },
    ];

    const mobileList = (
        <div className="panel-body">
            {loading ? (
                <div className="ops-loading">正在加载记录…</div>
            ) : logs.length === 0 ? (
                <div className="ops-empty">还没有修改记录</div>
            ) : (
                <div className="view-stack">
                    {logs.map((item) => (
                        <article key={item._id} className="list-card">
                            <div className="list-card-head">
                                <ActionTag action={item.action} />
                                <span className="cell-mono">{dayjs(item.ts).format('MM-DD HH:mm:ss')}</span>
                            </div>
                            <dl className="list-meta">
                                <div>
                                    <dt>对象</dt>
                                    <dd className="cell-mono">{item.targetId || '—'}</dd>
                                </div>
                            </dl>
                            <pre className="payload">{JSON.stringify(item.payload, null, 2)}</pre>
                        </article>
                    ))}
                </div>
            )}
            <Pagination
                style={{ marginTop: 12, textAlign: 'center' }}
                size="small"
                current={pagination.current}
                pageSize={pagination.pageSize}
                total={pagination.total}
                simple
                onChange={(page, pageSize) => fetchLogs(page, pageSize)}
            />
        </div>
    );

    return (
        <div className="page-view fade-in">
            <section className="panel">
                <div className="panel-head">
                    <h2 className="panel-title">
                        <FileSearchOutlined />
                        修改记录
                    </h2>
                    <p className="panel-meta">这里记录最近的修改，只有需要排查问题时再查看。</p>
                </div>

                {isMobile ? mobileList : (
                    <Table
                        columns={columns}
                        dataSource={logs}
                        rowKey="_id"
                        pagination={{
                            ...pagination,
                            showSizeChanger: true,
                            showTotal: (total) => `共 ${total} 条记录`,
                            style: { padding: '12px 16px' },
                        }}
                        loading={loading}
                        onChange={handleTableChange}
                        scroll={{ x: 900 }}
                    />
                )}
            </section>
        </div>
    );
};

export default AuditLogs;
