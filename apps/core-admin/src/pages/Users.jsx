import { useState } from 'react';
import { Table, Modal, Form, Input, Select, Tooltip, Tabs } from 'antd';
import { EditOutlined, DeleteOutlined, SearchOutlined, ReloadOutlined, TeamOutlined, AppstoreOutlined } from '@ant-design/icons';
import { useUsers } from '../hooks/useUsers';
import api from '../utils/api';
import useIsMobile from '../hooks/useIsMobile';
import FeatureVisibilityConfig from '../components/FeatureVisibilityConfig';
import UserAvatar from '../components/UserAvatar';
import { message } from '../utils/feedback';

const { Option } = Select;

const ROLE_LABEL = {
    super_admin: '超级管理员',
    admin: '管理员',
    user: '普通用户',
};

const ROLE_TONE = {
    super_admin: 'info',
    admin: 'violet',
    user: 'neutral',
};

const STATUS_META = {
    active: { label: '可使用', tone: 'ok' },
    banned: { label: '已停用', tone: 'danger' },
};

const RoleTag = ({ role }) => (
    <span className={`tag tone-${ROLE_TONE[role] || 'neutral'}`}>
        <span className="tag-dot" aria-hidden="true" />
        {ROLE_LABEL[role] || '普通用户'}
    </span>
);

const StatusTag = ({ status }) => {
    const meta = STATUS_META[status] || STATUS_META.banned;
    return <span className={`tag tone-${meta.tone}`}>{meta.label}</span>;
};

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
            },
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
                <div className="cell-user">
                    <UserAvatar
                        seed={record.userId || record._id}
                        label={text || record.userId}
                        avatarUrl={record.avatarUrl}
                        size={30}
                    />
                    <span className="cell-user-copy">
                        <strong>{text}</strong>
                        <small>{record.userId || record._id}</small>
                    </span>
                </div>
            ),
        },
        {
            title: '角色',
            dataIndex: 'role',
            key: 'role',
            width: 132,
            render: (role) => <RoleTag role={role} />,
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 104,
            render: (status) => <StatusTag status={status} />,
        },
        {
            title: '操作',
            key: 'actions',
            width: 92,
            align: 'right',
            render: (_, record) => (
                <span className="row-actions">
                    <Tooltip title="修改">
                        <button
                            type="button"
                            className="icon-action"
                            onClick={() => handleEdit(record)}
                            aria-label={`修改用户：${record.nickName}`}
                        >
                            <EditOutlined />
                        </button>
                    </Tooltip>
                    <Tooltip title="删除">
                        <button
                            type="button"
                            className="icon-action danger"
                            onClick={() => handleDelete(record)}
                            aria-label={`删除用户：${record.nickName}`}
                        >
                            <DeleteOutlined />
                        </button>
                    </Tooltip>
                </span>
            ),
        },
    ];

    const userList = (
        <div className="view-stack">
            <section className="panel">
                <div className="toolbar-row">
                    <Input
                        prefix={<SearchOutlined style={{ color: 'var(--ink-faint)' }} />}
                        placeholder="搜索昵称或编号"
                        allowClear
                        value={search}
                        onChange={(event) => {
                            setSearch(event.target.value);
                            setPage(1);
                        }}
                    />
                    <span className="toolbar-spacer" />
                    <span className="toolbar-count">共 {total} 位用户</span>
                    <Tooltip title="刷新列表">
                        <button
                            type="button"
                            className="icon-action"
                            onClick={() => mutate()}
                            aria-label="刷新列表"
                        >
                            <ReloadOutlined spin={isValidating} />
                        </button>
                    </Tooltip>
                </div>

                {isMobile ? (
                    <div className="panel-body">
                        {loading || isValidating ? (
                            <div className="ops-loading">正在加载用户…</div>
                        ) : users.length === 0 ? (
                            <div className="ops-empty">没有匹配的用户</div>
                        ) : (
                            <div className="view-stack">
                                {users.map((user) => (
                                    <div key={user._id} className="list-card">
                                        <div className="list-card-head">
                                            <span className="cell-user">
                                                <UserAvatar
                                                    seed={user.userId || user._id}
                                                    label={user.nickName || user.userId}
                                                    avatarUrl={user.avatarUrl}
                                                    size={34}
                                                />
                                                <span className="cell-user-copy">
                                                    <strong>{user.nickName}</strong>
                                                    <small>{user.userId || user._id}</small>
                                                </span>
                                            </span>
                                            <RoleTag role={user.role} />
                                        </div>
                                        <div className="list-card-foot">
                                            <StatusTag status={user.status} />
                                            <span className="toolbar-spacer" />
                                            <button
                                                type="button"
                                                className="icon-action"
                                                onClick={() => handleEdit(user)}
                                                aria-label={`修改用户：${user.nickName}`}
                                            >
                                                <EditOutlined />
                                            </button>
                                            <button
                                                type="button"
                                                className="icon-action danger"
                                                onClick={() => handleDelete(user)}
                                                aria-label={`删除用户：${user.nickName}`}
                                            >
                                                <DeleteOutlined />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <Table
                        columns={columns}
                        dataSource={users}
                        rowKey="_id"
                        loading={loading || isValidating}
                        scroll={{ x: 'max-content' }}
                        pagination={{
                            current: page,
                            pageSize,
                            total,
                            onChange: (nextPage, nextSize) => {
                                setPage(nextPage);
                                setPageSize(nextSize);
                            },
                            showTotal: (count) => `共 ${count} 位用户`,
                            style: { padding: '12px 16px' },
                        }}
                    />
                )}
            </section>
        </div>
    );

    const tabItems = [
        {
            key: '1',
            label: (
                <span className="settings-tab-label">
                    <TeamOutlined />
                    <span className="settings-tab-text">用户列表</span>
                </span>
            ),
            children: userList,
        },
        {
            key: '2',
            label: (
                <span className="settings-tab-label">
                    <AppstoreOutlined />
                    <span className="settings-tab-text">功能开关</span>
                </span>
            ),
            children: <FeatureVisibilityConfig />,
        },
    ];

    return (
        <div className="page-view">
            <div className="page-head">
                <div>
                    <h1>用户</h1>
                    <p>管理平台账号、角色和可用状态。</p>
                </div>
            </div>

            <Tabs defaultActiveKey="1" items={tabItems} className="settings-tabs" />

            <Modal
                title={editingUser ? '修改用户' : '添加用户'}
                open={isModalVisible}
                onOk={handleModalOk}
                onCancel={() => {
                    setIsModalVisible(false);
                    setEditingUser(null);
                    form.resetFields();
                }}
                centered
                width={isMobile ? '92%' : 480}
            >
                <Form form={form} layout="vertical">
                    <Form.Item name="nickName" label="昵称" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="role" label="角色" rules={[{ required: true }]}>
                        <Select>
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
                        <Select mode="multiple" placeholder="选择额外开放的功能">
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
                        <Select>
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
