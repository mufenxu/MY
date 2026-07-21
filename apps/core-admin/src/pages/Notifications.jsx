import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, Switch, message, Tag, Space, Card, Tooltip, Typography, Badge } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, BellOutlined } from '@ant-design/icons';
import api from '../utils/api';
import useIsMobile from '../hooks/useIsMobile';

const { Option } = Select;
const { Title, Text } = Typography;

const Notifications = () => {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form] = Form.useForm();
    const isMobile = useIsMobile();
    const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });

    const fetchNotifications = async (page = 1, pageSize = 10) => {
        setLoading(true);
        try {
            const res = await api.get('/notifications', {
                params: { page, pageSize }
            });
            if (res.data.success) {
                setNotifications(res.data.items || []);
                setPagination({
                    current: page,
                    pageSize: pageSize,
                    total: res.data.total || (res.data.items || []).length
                });
            }
        } catch (err) {
            message.error('获取通知列表失败');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timerId = window.setTimeout(() => fetchNotifications(1, 10), 0);
        return () => window.clearTimeout(timerId);
    }, []);

    const handleAdd = () => {
        setEditingId(null);
        form.resetFields();
        form.setFieldsValue({
            level: 'info',
            audience: 'all',
            is_published: true
        });
        setModalVisible(true);
    };

    const handleEdit = (record) => {
        setEditingId(record._id);
        form.setFieldsValue({
            title: record.title,
            content: record.content,
            level: record.level,
            audience: record.audience,
            is_published: record.is_published
        });
        setModalVisible(true);
    };

    const handleDelete = (id) => {
        Modal.confirm({
            title: '确认删除',
            content: '确定要删除这条通知吗？',
            okType: 'danger',
            onOk: async () => {
                try {
                    await api.delete(`/notifications/${id}`);
                    message.success('删除成功');
                    fetchNotifications(pagination.current, pagination.pageSize);
                } catch {
                    message.error('删除失败');
                }
            }
        });
    };

    const handleModalOk = async () => {
        try {
            const values = await form.validateFields();
            if (editingId) {
                await api.put(`/notifications/${editingId}`, values);
                message.success('更新成功');
            } else {
                await api.post('/notifications', values);
                message.success('创建成功');
            }
            setModalVisible(false);
            fetchNotifications(pagination.current, pagination.pageSize);
        } catch (err) {
            console.error(err);
            message.error('操作失败');
        }
    };

    const columns = [
        {
            title: '标题',
            dataIndex: 'title',
            key: 'title',
            width: 200,
            fixed: 'left',
            render: (text, record) => (
                <Space>
                    <BellOutlined style={{ color: record.level === 'error' ? '#ff4d4f' : '#1677ff' }} />
                    <Text strong>{text}</Text>
                </Space>
            )
        },
        {
            title: '内容',
            dataIndex: 'content',
            key: 'content',
            ellipsis: {
                showTitle: false,
            },
            render: (content) => (
                <Tooltip placement="topLeft" title={content}>
                    <span style={{ color: '#666' }}>{content}</span>
                </Tooltip>
            ),
            responsive: ['md']
        },
        {
            title: '级别',
            dataIndex: 'level',
            key: 'level',
            width: 100,
            render: (level) => {
                const colors = { info: 'blue', warn: 'orange', error: 'red' };
                const labels = { info: '信息', warn: '警告', error: '错误' };
                return <Tag color={colors[level]}>{labels[level]}</Tag>;
            }
        },
        {
            title: '受众',
            dataIndex: 'audience',
            key: 'audience',
            width: 120,
            responsive: ['md'],
            render: (audience) => {
                const labels = { all: '全部用户', admin: '管理员', super_admin: '超级管理员' };
                return <Tag bordered={false}>{labels[audience] || audience}</Tag>;
            }
        },
        {
            title: '状态',
            dataIndex: 'is_published',
            key: 'is_published',
            width: 100,
            render: (published) => (
                <Badge status={published ? 'success' : 'default'} text={published ? '已发布' : '草稿'} />
            )
        },
        {
            title: '时间',
            dataIndex: 'updatedAt',
            key: 'updatedAt',
            width: 180,
            responsive: ['lg'],
            render: (ts) => <Text type="secondary">{new Date(ts).toLocaleString()}</Text>
        },
        {
            title: '操作',
            key: 'action',
            width: 120,
            fixed: 'right',
            render: (_, record) => (
                <Space size="small">
                    <Tooltip title="编辑">
                        <Button type="text" icon={<EditOutlined style={{ color: '#4A7CF7' }} />} onClick={() => handleEdit(record)} style={{ background: 'var(--bg-color)', borderRadius: 12, width: 36, height: 36 }} />
                    </Tooltip>
                    <Tooltip title="删除">
                        <Button type="text" icon={<DeleteOutlined style={{ color: '#E31A1A' }} />} onClick={() => handleDelete(record._id)} style={{ background: '#FFF5F5', borderRadius: 12, width: 36, height: 36 }} />
                    </Tooltip>
                </Space>
            ),
        },
    ];

    const pageHeader = (
        <div style={{
            marginBottom: 24,
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16
        }}>
            <Space>
                <Button icon={<ReloadOutlined />} onClick={() => fetchNotifications(pagination.current, pagination.pageSize)}>刷新</Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新建通知</Button>
            </Space>
        </div>
    );

    // 移动端卡片视图
    const mobileView = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {notifications.map((notification) => {
                const colors = { info: 'blue', warn: 'orange', error: 'red' };
                const labels = { info: '信息', warn: '警告', error: '错误' };
                const audienceLabels = { all: '全部用户', admin: '管理员', super_admin: '超级管理员' };

                return (
                    <Card
                        key={notification._id}
                        bordered={false}
                        style={{ borderRadius: 20, boxShadow: 'var(--card-shadow)' }}
                        bodyStyle={{ padding: 16 }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <BellOutlined style={{ color: notification.level === 'error' ? '#ff4d4f' : '#1677ff' }} />
                                    {notification.title}
                                </div>
                                <div style={{
                                    fontSize: '14px',
                                    color: '#666',
                                    marginBottom: 12,
                                    background: 'var(--bg-color)',
                                    padding: '8px 12px',
                                    borderRadius: 8
                                }}>
                                    {notification.content}
                                </div>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <Tag color={colors[notification.level]}>
                                        {labels[notification.level]}
                                    </Tag>
                                    <Tag>{audienceLabels[notification.audience] || notification.audience}</Tag>
                                    <Tag color={notification.is_published ? 'green' : 'default'}>
                                        {notification.is_published ? '已发布' : '草稿'}
                                    </Tag>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-color)' }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                {notification.updatedAt ? new Date(notification.updatedAt).toLocaleString() : '-'}
                            </Text>
                            <Space size="small">
                                <Button type="text" icon={<EditOutlined />} onClick={() => handleEdit(notification)} style={{ color: '#1677ff' }}>编辑</Button>
                                <Button type="text" danger icon={<DeleteOutlined />} onClick={() => handleDelete(notification._id)}>删除</Button>
                            </Space>
                        </div>
                    </Card>
                );
            })}

            {notifications.length === 0 && !loading && (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-tertiary)' }}>暂无通知</div>
            )}

            <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <Space>
                    <Button
                        disabled={pagination.current === 1}
                        onClick={() => fetchNotifications(pagination.current - 1, pagination.pageSize)}
                    >
                        上一页
                    </Button>
                    <span>{pagination.current} / {Math.ceil(pagination.total / pagination.pageSize) || 1}</span>
                    <Button
                        disabled={pagination.current >= Math.ceil(pagination.total / pagination.pageSize)}
                        onClick={() => fetchNotifications(pagination.current + 1, pagination.pageSize)}
                    >
                        下一页
                    </Button>
                </Space>
            </div>
        </div>
    );

    return (
        <div>
            {pageHeader}

            {isMobile ? (
                mobileView
            ) : (
                <Card bordered={false} style={{ borderRadius: 20, border: 'none', boxShadow: 'var(--card-shadow)' }}>
                    <Table
                        columns={columns}
                        dataSource={notifications}
                        rowKey="_id"
                        loading={loading}
                        scroll={{ x: 1000 }}
                        pagination={{
                            ...pagination,
                            showSizeChanger: true,
                            showTotal: (total) => `共 ${total} 条`,
                            onChange: (page, pageSize) => fetchNotifications(page, pageSize),
                        }}
                    />
                </Card>
            )}

            <Modal
                title={editingId ? '编辑通知' : '新建通知'}
                open={modalVisible}
                onOk={handleModalOk}
                onCancel={() => setModalVisible(false)}
                okText="确认"
                cancelText="取消"
                destroyOnClose
                width={500}
            >
                <Form form={form} layout="vertical">
                    <Form.Item name="title" label="标题" rules={[{ required: true }]}>
                        <Input placeholder="请输入通知标题" />
                    </Form.Item>
                    <Form.Item name="content" label="内容" rules={[{ required: true }]}>
                        <Input.TextArea rows={4} placeholder="请输入通知内容" />
                    </Form.Item>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="level" label="级别" rules={[{ required: true }]}>
                                <Select>
                                    <Option value="info">信息</Option>
                                    <Option value="warn">警告</Option>
                                    <Option value="error">错误</Option>
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="audience" label="受众" rules={[{ required: true }]}>
                                <Select>
                                    <Option value="all">全部用户</Option>
                                    <Option value="admin">管理员</Option>
                                    <Option value="super_admin">超级管理员</Option>
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item name="is_published" label="状态" valuePropName="checked">
                        <Switch checkedChildren="发布" unCheckedChildren="草稿" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

// Helper components for layout (with responsive fallback)
const Row = ({ children, gutter }) => <div style={{ display: 'flex', gap: gutter, flexWrap: 'wrap' }}>{children}</div>;
const Col = ({ children, span }) => <div style={{ flex: `1 1 ${span / 24 * 100}%`, minWidth: '45%', maxWidth: `${span / 24 * 100}%` }}>{children}</div>;

export default Notifications;
