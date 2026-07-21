import React, { useState, useEffect, useCallback } from 'react';
import { Table, Card, Tag, Typography, Space, List } from 'antd';
import api from '../utils/api';
import dayjs from 'dayjs';
import useIsMobile from '../hooks/useIsMobile';

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

    const handleTableChange = (pagination) => {
        fetchLogs(pagination.current, pagination.pageSize);
    };

    const columns = [
        {
            title: '时间',
            dataIndex: 'ts',
            key: 'ts',
            width: 180,
            render: (ts) => dayjs(ts).format('YYYY-MM-DD HH:mm:ss'),
        },
        {
            title: '操作人 (OpenID)',
            dataIndex: 'actorOpenid',
            key: 'actorOpenid',
            width: 250,
            ellipsis: true,
        },
        {
            title: '动作',
            dataIndex: 'action',
            key: 'action',
            width: 150,
            render: (action) => {
                const actionMap = {
                    'CREATE': '创建',
                    'UPDATE': '更新',
                    'DELETE': '删除',
                    'LOGIN': '登录',
                    'LOGOUT': '登出'
                };
                let color = 'blue';
                if (action.includes('DELETE')) color = 'red';
                if (action.includes('UPDATE')) color = 'orange';
                if (action.includes('CREATE')) color = 'green';
                return <Tag color={color}>{actionMap[action] || action}</Tag>;
            },
        },
        {
            title: '目标对象 ID',
            dataIndex: 'targetId',
            key: 'targetId',
            width: 200,
            ellipsis: true,
        },
        {
            title: '详情',
            dataIndex: 'payload',
            key: 'payload',
            ellipsis: true,
            render: (payload) => (
                <Typography.Text code ellipsis={{ tooltip: JSON.stringify(payload, null, 2) }}>
                    {JSON.stringify(payload)}
                </Typography.Text>
            ),
        },
    ];

    const mobileView = (
        <List
            dataSource={logs}
            loading={loading}
            rowKey="_id"
            pagination={{
                ...pagination,
                size: "small",
                showTotal: (total) => `共 ${total} 条`,
                onChange: (page, pageSize) => fetchLogs(page, pageSize),
            }}
            renderItem={item => {
                const actionMap = {
                    'CREATE': '创建',
                    'UPDATE': '更新',
                    'DELETE': '删除',
                    'LOGIN': '登录',
                    'LOGOUT': '登出'
                };
                let color = 'blue';
                if (item.action.includes('DELETE')) color = 'red';
                if (item.action.includes('UPDATE')) color = 'orange';
                if (item.action.includes('CREATE')) color = 'green';
                
                return (
                    <List.Item style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', background: '#F4F7FE', marginBottom: 16, borderRadius: 16, padding: '16px 12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: 12 }}>
                            <Tag color={color} style={{ margin: 0 }}>{actionMap[item.action] || item.action}</Tag>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{dayjs(item.ts).format('MM-DD HH:mm:ss')}</Typography.Text>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 8, width: '100%' }}>
                            <div style={{ marginBottom: 4 }}>操作人: {item.actorOpenid}</div>
                            <div style={{ wordBreak: 'break-all' }}>目标ID: {item.targetId || '无'}</div>
                        </div>
                        <div style={{ width: '100%', background: 'var(--bg-color)', padding: 8, borderRadius: 6, overflowX: 'auto' }}>
                            <pre style={{ margin: 0, fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                {JSON.stringify(item.payload, null, 2)}
                            </pre>
                        </div>
                    </List.Item>
                );
            }}
        />
    );

    return (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Card bordered={false} style={{ borderRadius: 20, border: 'none', boxShadow: 'var(--card-shadow)' }} bodyStyle={isMobile ? { padding: '16px 12px' } : undefined}>
                {isMobile ? mobileView : (
                    <Table
                        columns={columns}
                        dataSource={logs}
                        rowKey="_id"
                        pagination={{
                            ...pagination,
                            showSizeChanger: true,
                            showTotal: (total) => `共 ${total} 条记录`,
                        }}
                        loading={loading}
                        onChange={handleTableChange}
                        scroll={{ x: 1000 }}
                    />
                )}
            </Card>
        </Space>
    );
};

export default AuditLogs;
