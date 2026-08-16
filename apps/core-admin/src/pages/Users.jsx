import React, { useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, Card, Tag, Typography, Tooltip, Tabs } from 'antd';
import { EditOutlined, DeleteOutlined, SearchOutlined, ReloadOutlined, TeamOutlined, AppstoreOutlined } from '@ant-design/icons';
import { useUsers } from '../hooks/useUsers';
import api from '../utils/api';
import useIsMobile from '../hooks/useIsMobile';
import FeatureVisibilityConfig from '../components/FeatureVisibilityConfig';
import UserAvatar from '../components/UserAvatar';
import { message } from '../utils/feedback';

const { Text } = Typography;
const { Option } = Select;

const Users = () => {
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [search, setSearch] = useState('');
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [form] = Form.useForm();
    const isMobile = useIsMobile();

    const { users, total, loading, isValidating, mutate } = useUsers(page, pageSize, { q: search });

    const handleEdit = (user) => {
        setEditingUser(user);
        form.setFieldsValue({
            nickName: user.nickName,
            role: user.role,
            status: user.status,
            permissions: user.permissions || [],
        });
        setIsModalVisible(true);
    };

    const handleDelete = (user) => {
        Modal.confirm({
            title: '删除用户',
            content: `确定要删除用户 ${user.nickName} 吗?`,
            okText: '删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                try {
                    await api.delete(`/users/${user._id}`);
                    message.success('用户删除成功');
                    mutate();
                } catch {
                    message.error('删除用户失败');
                }
            }
        });
    };

    const handleModalOk = async () => {
        try {
            const values = await form.validateFields();
            if (editingUser) {
                await api.put(`/users/${editingUser._id}`, values);
                message.success('用户更新成功');
            }
            setIsModalVisible(false);
            form.resetFields();
            setEditingUser(null);
            mutate();
        } catch {
            message.error('操作失败');
        }
    };

    const columns = [
        {
            title: '用户',
            dataIndex: 'nickName',
            key: 'nickName',
            render: (text, record) => (
                <Space>
                    <UserAvatar
                        seed={record.userId || record._id}
                        label={text || record.userId}
                        avatarUrl={record.avatarUrl}
                        style={{ verticalAlign: 'middle', border: '1px solid var(--border-color)' }}
                        size="large"
                    />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <Text strong style={{ fontSize: 16, color: 'var(--text-primary)' }}>{text}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>编号：{record.userId || record._id}</Text>
                    </div>
                </Space>
            ),
        },
        {
            title: '角色',
            dataIndex: 'role',
            key: 'role',
            render: (role) => {
                const roleLabels = {
                    super_admin: '超级管理员',
                    admin: '管理员',
                    user: '普通用户',
                };
                const roleColors = {
                    super_admin: '#4A7CF7',
                    admin: '#0B3D91',
                    user: '#5CC9A7',
                };
                return (
                    <Tag
                        color={roleColors[role] || '#A3AED0'}
                        style={{ borderRadius: 20, padding: '4px 12px', border: 'none', fontWeight: 600 }}
                    >
                        {roleLabels[role] || '普通用户'}
                    </Tag>
                );
            },
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            render: (status) => (
                <Space>
                    <div style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: status === 'active' ? '#5CC9A7' : '#E31A1A'
                    }} />
                    <Text style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                        {status === 'active' ? '可使用' : '已停用'}
                    </Text>
                </Space>
            ),
        },
        {
            title: '操作',
            key: 'actions',
            render: (_, record) => (
                <Space size="middle">
                    <Tooltip title="修改">
                        <Button
                            type="text"
                            icon={<EditOutlined style={{ color: '#4A7CF7' }} />}
                            onClick={() => handleEdit(record)}
                            style={{ background: 'var(--bg-color)', borderRadius: 12, width: 36, height: 36 }}
                        />
                    </Tooltip>
                    <Tooltip title="删除">
                        <Button
                            type="text"
                            icon={<DeleteOutlined style={{ color: '#E31A1A' }} />}
                            onClick={() => handleDelete(record)}
                            style={{ background: '#FFF5F5', borderRadius: 12, width: 36, height: 36 }}
                        />
                    </Tooltip>
                </Space>
            ),
        },
    ];

    // Mobile Card View
    const MobileCard = ({ user }) => (
        <Card
            style={{ marginBottom: 16, borderRadius: 20, border: 'none', boxShadow: 'var(--card-shadow)' }}
            bodyStyle={{ padding: 20 }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <Space>
                    <UserAvatar
                        seed={user.userId || user._id}
                        label={user.nickName || user.userId}
                        avatarUrl={user.avatarUrl}
                        size={48}
                        style={{ border: '1px solid var(--border-color)' }}
                    />
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{user.nickName}</div>
                        <div style={{ fontSize: 12, color: '#A3AED0' }}>编号：{user.userId || user._id}</div>
                    </div>
                </Space>
                <Tag
                    color={user.role === 'super_admin' ? '#4A7CF7' : (user.role === 'admin' ? '#0B3D91' : '#5CC9A7')}
                    style={{ borderRadius: 20, border: 'none', fontWeight: 600 }}
                >
                    {user.role === 'super_admin' ? '超级管理员' : (user.role === 'admin' ? '管理员' : '普通用户')}
                </Tag>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, borderTop: '1px solid #E0E5F2' }}>
                <Space>
                    <div style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: user.status === 'active' ? '#5CC9A7' : '#E31A1A'
                    }} />
                    <Text style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                        {user.status === 'active' ? '可使用' : '已停用'}
                    </Text>
                </Space>
                <Space>
                    <Button
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(user)}
                        style={{ color: '#4A7CF7', background: 'var(--bg-color)', borderRadius: 10 }}
                    />
                    <Button
                        type="text"
                        icon={<DeleteOutlined />}
                        onClick={() => handleDelete(user)}
                        style={{ color: '#E31A1A', background: '#FFF5F5', borderRadius: 10 }}
                    />
                </Space>
            </div>
        </Card>
    );

    const UserListTab = (
        <div style={{ paddingBottom: 20 }}>
            <div style={{
                display: 'flex',
                justifyContent: isMobile ? 'space-between' : 'flex-end',
                alignItems: 'center',
                marginBottom: 24,
                width: '100%',
                gap: 12
            }}>
                <div style={{ flex: isMobile ? 1 : '0 0 300px', minWidth: 0 }}>
                    <Input
                        prefix={<SearchOutlined style={{ color: '#A3AED0' }} />}
                        placeholder="搜索昵称或编号"
                        style={{
                            width: '100%',
                            height: 42,
                            borderRadius: 21,
                            background: '#F8FAFC',
                            border: 'none',
                            boxShadow: 'inset 3px 3px 6px rgba(112, 144, 176, 0.15), inset -3px -3px 6px rgba(255, 255, 255, 0.9)',
                            padding: '4px 16px',
                            fontSize: 14
                        }}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                
                <Tooltip title="刷新列表">
                    <Button
                        icon={<ReloadOutlined spin={isValidating} />}
                        onClick={() => mutate()}
                        style={{
                            borderRadius: 14,
                            width: 42,
                            height: 42,
                            flexShrink: 0,
                            border: 'none',
                            boxShadow: '4px 4px 10px rgba(112, 144, 176, 0.12), -4px -4px 10px rgba(255, 255, 255, 0.8), inset 1px 1px 2px rgba(255, 255, 255, 0.8), inset -1px -1px 2px rgba(112, 144, 176, 0.05)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#4A7CF7',
                            background: 'var(--component-bg)'
                        }}
                    />
                </Tooltip>
            </div>

            <div className="desktop-only" style={{ display: isMobile ? 'none' : 'block' }}>
                <Card bodyStyle={{ padding: 0 }} style={{ overflow: 'hidden', borderRadius: 20 }}>
                    <Table
                        columns={columns}
                        dataSource={users}
                        rowKey="_id"
                        loading={loading || isValidating}
                        scroll={{ x: 'max-content' }}
                        pagination={{
                            current: page,
                            pageSize: pageSize,
                            total: total,
                            onChange: (p, ps) => {
                                setPage(p);
                                setPageSize(ps);
                            },
                            showTotal: (total) => `共 ${total} 位用户`,
                            style: { padding: '20px' }
                        }}
                    />
                </Card>
            </div>

            <div className="mobile-only" style={{ display: isMobile ? 'block' : 'none' }}>
                {loading || isValidating ? (
                    <Card loading style={{ borderRadius: 20 }} />
                ) : (
                    users.map(user => <MobileCard key={user._id} user={user} />)
                )}
            </div>
        </div>
    );

    const tabItems = [
        {
            key: '1',
            label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px' }}>
                    <TeamOutlined />
                    <span>用户列表</span>
                </span>
            ),
            children: UserListTab,
        },
        {
            key: '2',
            label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px' }}>
                    <AppstoreOutlined />
                    <span>功能开关</span>
                </span>
            ),
            children: <FeatureVisibilityConfig />,
        },
    ];

    return (
        <div>
            <Tabs
                defaultActiveKey="1"
                items={tabItems}
                type="card"
                style={{ marginBottom: 20 }}
            />

            <Modal
                title={editingUser ? '修改用户' : '添加用户'}
                open={isModalVisible}
                onOk={handleModalOk}
                onCancel={() => {
                    setIsModalVisible(false);
                    setEditingUser(null);
                    form.resetFields();
                }}
                okButtonProps={{ style: { borderRadius: 12, height: 44 } }}
                cancelButtonProps={{ style: { borderRadius: 12, height: 44 } }}
                centered
            >
                <Form form={form} layout="vertical">
                    <Form.Item name="nickName" label="昵称" rules={[{ required: true }]}>
                        <Input style={{ borderRadius: 10 }} />
                    </Form.Item>
                    <Form.Item name="role" label="角色" rules={[{ required: true }]}>
                        <Select style={{ borderRadius: 10 }}>
                            <Option value="user">普通用户</Option>
                            <Option value="admin">管理员</Option>
                            <Option value="super_admin">超级管理员</Option>
                        </Select>
                    </Form.Item>
                    <Form.Item
                        name="permissions"
                        label="单独开放的功能"
                        extra="一般按角色使用；只有需要给某个用户额外能力时才修改。"
                    >
                        <Select mode="multiple" style={{ borderRadius: 10 }} placeholder="选择额外开放的功能">
                            <Option value="resources">资源管理</Option>
                            <Option value="bmi">BMI 计算</Option>
                            <Option value="todo">待办清单</Option>
                            <Option value="ct8">自动化查看</Option>
                            <Option value="view_ct8">自动化查看（只读）</Option>
                            <Option value="manage_ct8">自动化操作</Option>
                            <Option value="smart_control">智能控制</Option>
                            <Option value="view_smart_control">智能控制（只读）</Option>
                            <Option value="manage_smart_control">智能控制操作</Option>
                            <Option value="heat_pump">空气能</Option>
                            <Option value="view_heat_pump">空气能（只读）</Option>
                            <Option value="manage_heat_pump">空气能操作</Option>
                            <Option value="daily_news">每日资讯</Option>
                            <Option value="course_order">订单处理</Option>
                        </Select>
                    </Form.Item>
                    <Form.Item name="status" label="状态" rules={[{ required: true }]}>
                        <Select style={{ borderRadius: 10 }}>
                            <Option value="active">可使用</Option>
                            <Option value="banned">停用</Option>
                        </Select>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default Users;
