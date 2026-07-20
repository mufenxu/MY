import React, { useState, useEffect } from 'react';
import { Table, Card, Button, message, Modal, Form, Input, Switch, Tag, Space, Popconfirm, List, Drawer } from 'antd';
import UserAvatar from '../components/UserAvatar';
import { PlusOutlined, DeleteOutlined, EditOutlined, GlobalOutlined, KeyOutlined, CodeOutlined, CopyOutlined, ReloadOutlined, HistoryOutlined } from '@ant-design/icons';
import api from '../utils/api';
import { IS_PLATFORM_SSO } from '../utils/runtime';
import dayjs from 'dayjs';
import useIsMobile from '../hooks/useIsMobile';

const ScanManagement = () => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSecretModalOpen, setIsSecretModalOpen] = useState(false);
    const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
    const [currentApp, setCurrentApp] = useState(null);
    const [currentSecret, setCurrentSecret] = useState('');
    const [secretConfigured, setSecretConfigured] = useState(false);
    const [secretLoading, setSecretLoading] = useState(false);
    const [reauthModalOpen, setReauthModalOpen] = useState(false);
    const [reauthAction, setReauthAction] = useState('reveal');
    const [reauthLoading, setReauthLoading] = useState(false);

    const [isLogDrawerOpen, setIsLogDrawerOpen] = useState(false);
    const [logsData, setLogsData] = useState([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [logsTotal, setLogsTotal] = useState(0);
    const [logsCurrentPage, setLogsCurrentPage] = useState(1);

    const [form] = Form.useForm();
    const [reauthForm] = Form.useForm();
    const [editingId, setEditingId] = useState(null);
    const [currentUser] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('user')) || {};
        } catch {
            return {};
        }
    });
    const canManageSecrets = currentUser.role === 'super_admin';
    const isMobile = useIsMobile();
    const integrationApiBase = `${window.location.origin}${IS_PLATFORM_SSO ? '/api/core/api' : '/api'}`;
    const qrCreateUrl = `${integrationApiBase}/auth/qrcode/create`;
    const tokenExchangeUrl = `${integrationApiBase}/auth/token/exchange`;

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await api.get('/apps');
            if (res.data.success) {
                setData(res.data.list);
            }
        } catch {
            message.error('获取应用列表失败');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleAdd = () => {
        setEditingId(null);
        form.resetFields();
        setIsModalOpen(true);
    };

    const handleEdit = (record) => {
        setEditingId(record._id);
        form.setFieldsValue(record);
        setIsModalOpen(true);
    };

    const handleDelete = async (id) => {
        try {
            await api.delete(`/apps/${id}`);
            message.success('删除成功');
            fetchData();
        } catch {
            message.error('删除失败');
        }
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            if (editingId) {
                await api.put(`/apps/${editingId}`, values);
                message.success('更新成功');
            } else {
                await api.post('/apps', values);
                message.success('创建成功');
            }
            setIsModalOpen(false);
            fetchData();
        } catch {
            // Validate failed or api error
        }
    };

    const handleViewSecret = async (record) => {
        setCurrentApp(record);
        setSecretLoading(true);
        setIsSecretModalOpen(true);
        setCurrentSecret('');
        setSecretConfigured(false);
        try {
            const res = await api.get(`/apps/${record._id}/secret`);
            if (res.data.success) {
                setSecretConfigured(Boolean(res.data.configured));
            }
        } catch {
            message.error('获取密钥失败');
        } finally {
            setSecretLoading(false);
        }
    };

    const openSensitiveAction = (action) => {
        setReauthAction(action);
        reauthForm.resetFields();
        setReauthModalOpen(true);
    };

    const handleSensitiveAction = async () => {
        try {
            const values = await reauthForm.validateFields();
            setReauthLoading(true);
            setSecretLoading(true);
            if (IS_PLATFORM_SSO) {
                const reauthResponse = await fetch('/api/auth/reauth', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Platform-Request': 'console',
                    },
                    body: JSON.stringify({ password: values.password, totp: values.totp || '' }),
                });
                if (!reauthResponse.ok) {
                    const payload = await reauthResponse.json().catch(() => ({}));
                    throw new Error(payload.error || '统一管理账号二次验证失败');
                }
            }

            const endpoint = reauthAction === 'reset'
                ? `/apps/${currentApp._id}/reset-secret`
                : `/apps/${currentApp._id}/secret/reveal`;
            const res = await api.post(endpoint, IS_PLATFORM_SSO ? {} : { currentPassword: values.password });
            if (res.data.success) {
                setCurrentSecret(res.data.secret);
                setSecretConfigured(Boolean(res.data.secret));
                setReauthModalOpen(false);
                reauthForm.resetFields();
                message.success(reauthAction === 'reset' ? '密钥重置成功' : '密钥已安全显示');
            }
        } catch (error) {
            if (error?.errorFields) return;
            message.error(error.response?.data?.message || error.message || '二次验证失败');
        } finally {
            setReauthLoading(false);
            setSecretLoading(false);
        }
    };

    const handleViewGuide = (record) => {
        setCurrentApp(record);
        setIsGuideModalOpen(true);
    };

    const fetchLogs = async (appId, page = 1) => {
        setLogsLoading(true);
        try {
            const res = await api.get('/auth/logs', { params: { appId, page, limit: 10 } });
            if (res.data.success) {
                setLogsData(res.data.data);
                setLogsTotal(res.data.total);
                setLogsCurrentPage(page);
            }
        } catch {
            message.error('获取日志失败');
        } finally {
            setLogsLoading(false);
        }
    };

    const handleViewLogs = (record) => {
        setCurrentApp(record);
        setIsLogDrawerOpen(true);
        fetchLogs(record.appId, 1);
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            message.success('复制成功');
        });
    };

    const columns = [
        {
            title: '应用名称',
            dataIndex: 'appName',
            key: 'appName',
            render: (text) => <b>{text}</b>
        },
        {
            title: 'App ID',
            dataIndex: 'appId',
            key: 'appId',
            render: (text) => <Tag color="blue">{text}</Tag>
        },
        {
            title: '接入域名',
            dataIndex: 'domain',
            key: 'domain',
            render: (text) => text || <span style={{ color: '#ccc' }}>不限制</span>
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            render: (status) => (
                <Tag color={status === 'active' ? 'success' : 'error'}>
                    {status === 'active' ? '启用' : '禁用'}
                </Tag>
            )
        },
        {
            title: '创建时间',
            dataIndex: 'createdTime',
            key: 'createdTime',
            render: (ts) => dayjs(ts).format('YYYY-MM-DD HH:mm')
        },
        {
            title: '操作',
            key: 'action',
            width: 200,
            render: (_, record) => (
                <Space>
                    <Button type="text" icon={<HistoryOutlined />} onClick={() => handleViewLogs(record)} title="授权日志" />
                    <Button type="text" icon={<CodeOutlined />} onClick={() => handleViewGuide(record)} title="接入向导" />
                    <Button type="text" icon={<KeyOutlined />} onClick={() => handleViewSecret(record)} title="密钥管理" />
                    <Button type="text" icon={<EditOutlined />} onClick={() => handleEdit(record)} title="编辑" />
                    <Popconfirm title="确定删除吗？" onConfirm={() => handleDelete(record._id)}>
                        <Button type="text" danger icon={<DeleteOutlined />} title="删除" />
                    </Popconfirm>
                </Space>
            )
        }
    ];

    return (
        <Card
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <GlobalOutlined /> 接入应用管理
                </div>
            }
            extra={
                <Space wrap style={{ justifyContent: 'flex-end', display: 'flex' }}>
                    <Button size={isMobile ? "small" : "middle"} icon={<HistoryOutlined />} onClick={() => {
                        setCurrentApp(null);
                        setIsLogDrawerOpen(true);
                        fetchLogs(null, 1);
                    }}>
                        {isMobile ? '全局日志' : '全部授权日志'}
                    </Button>
                    <Button size={isMobile ? "small" : "middle"} type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                        {isMobile ? '新增' : '接入新网站'}
                    </Button>
                </Space>
            }
            style={{ borderRadius: 20, border: 'none', boxShadow: 'var(--card-shadow)' }}
            bodyStyle={isMobile ? { padding: '0 12px' } : {}}
        >
            {isMobile ? (
                <List
                    dataSource={data}
                    loading={loading}
                    rowKey="_id"
                    renderItem={(item) => (
                        <List.Item
                            actions={[
                                <Button type="text" icon={<HistoryOutlined />} onClick={() => handleViewLogs(item)} />,
                                <Button type="text" icon={<EditOutlined />} onClick={() => handleEdit(item)} />,
                                <Popconfirm title="确定删除吗？" onConfirm={() => handleDelete(item._id)}>
                                    <Button type="text" danger icon={<DeleteOutlined />} />
                                </Popconfirm>
                            ]}
                        >
                            <List.Item.Meta
                                title={
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <b>{item.appName}</b>
                                        <Tag color={item.status === 'active' ? 'success' : 'error'}>
                                            {item.status === 'active' ? '启用' : '禁用'}
                                        </Tag>
                                    </div>
                                }
                                description={
                                    <div style={{ marginTop: 8 }}>
                                        <div style={{ marginBottom: 4 }}>
                                            <span style={{ color: 'var(--text-tertiary)' }}>App ID: </span>
                                            <Tag color="blue" style={{ margin: 0 }}>{item.appId}</Tag>
                                        </div>
                                        <div style={{ marginBottom: 4 }}>
                                            <span style={{ color: 'var(--text-tertiary)' }}>域名: </span>
                                            {item.domain || <span style={{ color: '#ccc' }}>不限制</span>}
                                        </div>
                                        <div style={{ color: '#bfbfbf', fontSize: '12px' }}>
                                            {dayjs(item.createdTime).format('YYYY-MM-DD HH:mm')}
                                        </div>
                                    </div>
                                }
                            />
                        </List.Item>
                    )}
                />
            ) : (
                <Table
                    dataSource={data}
                    columns={columns}
                    rowKey="_id"
                    loading={loading}
                    scroll={{ x: 'max-content' }}
                    pagination={{ pageSize: 10 }}
                />
            )}

            <Modal
                title={editingId ? "编辑应用" : "接入新应用"}
                open={isModalOpen}
                onOk={handleSubmit}
                onCancel={() => setIsModalOpen(false)}
                width={isMobile ? '90%' : 520}
                centered={isMobile}
            >
                <Form form={form} layout="vertical">
                    <Form.Item name="appName" label="应用名称" rules={[{ required: true }]}>
                        <Input placeholder="例如：公司CMS后台" />
                    </Form.Item>
                    <Form.Item name="domain" label="网站域名">
                        <Input placeholder="https://cms.example.com" />
                    </Form.Item>
                    <Form.Item name="description" label="描述备注">
                        <Input.TextArea />
                    </Form.Item>
                    {editingId && (
                        <Form.Item
                            name="status"
                            label="状态"
                            initialValue="active"
                            getValueProps={(value) => ({ checked: value === 'active' })}
                            normalize={(value) => (value ? 'active' : 'disabled')}
                        >
                            <Switch
                                checkedChildren="启用"
                                unCheckedChildren="禁用"
                            />
                        </Form.Item>
                    )}
                </Form>
            </Modal>

            {/* Secret Management Modal */}
            <Modal
                title="应用密钥管理 (App Secret)"
                open={isSecretModalOpen}
                footer={null}
                onCancel={() => {
                    setIsSecretModalOpen(false);
                    setCurrentSecret('');
                    setCurrentApp(null);
                    setSecretConfigured(false);
                }}
                centered
                destroyOnHidden
            >
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <p style={{ color: '#666', marginBottom: 10 }}>App Secret 是应用进行后端接口调用的凭证，请妥善保管。</p>
                    <div style={{ background: '#F4F7FE', padding: '15px', borderRadius: '16px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '16px', fontFamily: 'monospace', marginRight: '10px', color: 'var(--text-primary)' }}>
                            {secretLoading
                                ? '加载中...'
                                : currentSecret || (secretConfigured ? '已配置（需二次验证后显示）' : '尚未配置')}
                        </span>
                        <Button type="text" icon={<CopyOutlined />} onClick={() => copyToClipboard(currentSecret)} disabled={!currentSecret} />
                    </div>

                    {canManageSecrets ? (
                        <Space wrap style={{ justifyContent: 'center' }}>
                            <Button icon={<KeyOutlined />} loading={secretLoading} disabled={!secretConfigured} onClick={() => openSensitiveAction('reveal')}>
                                显示密钥
                            </Button>
                            <Button type="primary" danger icon={<ReloadOutlined />} loading={secretLoading} onClick={() => openSensitiveAction('reset')}>
                                重置密钥
                            </Button>
                        </Space>
                    ) : (
                        <Tag>只读权限</Tag>
                    )}
                </div>
            </Modal>

            <Modal
                title={reauthAction === 'reset' ? '重置密钥二次验证' : '显示密钥二次验证'}
                open={reauthModalOpen}
                onOk={handleSensitiveAction}
                onCancel={() => {
                    setReauthModalOpen(false);
                    reauthForm.resetFields();
                }}
                confirmLoading={reauthLoading}
                okText={reauthAction === 'reset' ? '验证并重置' : '验证并显示'}
                okButtonProps={{ danger: reauthAction === 'reset' }}
                destroyOnHidden
            >
                <Form form={reauthForm} layout="vertical" preserve={false}>
                    <Form.Item
                        name="password"
                        label={IS_PLATFORM_SSO ? '统一管理账号密码' : '当前 Core 管理员密码'}
                        rules={[{ required: true, message: '请输入当前密码' }]}
                    >
                        <Input.Password autoComplete="current-password" />
                    </Form.Item>
                    {IS_PLATFORM_SSO && (
                        <Form.Item name="totp" label="动态验证码（已启用时必填）">
                            <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
                        </Form.Item>
                    )}
                </Form>
            </Modal>

            {/* Integration Guide Modal */}
            <Modal
                title="接入向导"
                open={isGuideModalOpen}
                footer={null}
                onCancel={() => setIsGuideModalOpen(false)}
                width={700}
                centered
            >
                <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                    <h3>1. 前端接入 (HTML)</h3>
                    <p>请将以下代码复制到您网站的登录页面（如 login.html）中：</p>

                    <div style={{ background: 'var(--bg-color)', color: '#d4d4d4', padding: '15px', borderRadius: '16px', overflowX: 'auto', fontFamily: 'monospace', fontSize: '13px', position: 'relative', marginBottom: '20px' }}>
                        <pre>{`<!-- 1. 在页面放置容器 -->
<div id="qrcode-container"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>

<!-- 2. 接入核心逻辑 -->
<script>
  async function refreshQR() {
    const api = "${qrCreateUrl}";
    const appId = "${currentApp?.appId || 'YOUR_APP_ID'}";
    
    // 获取旧 Token 用于废弃旧码，防止刷新页面产生多余有效码
    const oldToken = sessionStorage.getItem('wx_qr_token');

    const res = await fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId, oldToken })
    });
    const data = await res.json();
    
    if (data.qrToken) {
      sessionStorage.setItem('wx_qr_token', data.qrToken);
      // 使用 qrcode.js 渲染 (容器内容需先清空)
      document.getElementById("qrcode-container").innerHTML = "";
      new QRCode(document.getElementById("qrcode-container"), data.qrCodeUrl);
    }
  }

  refreshQR(); // 初始加载
</script>`}</pre>
                        <Button
                            style={{ position: 'absolute', top: 10, right: 10 }}
                            size="small"
                            icon={<CopyOutlined />}
                            onClick={() => copyToClipboard(`<!-- 1. 在页面放置容器 -->
<div id="qrcode-container"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>

<!-- 2. 接入核心逻辑 -->
<script>
  async function refreshQR() {
    const api = "${qrCreateUrl}";
    const appId = "${currentApp?.appId || 'YOUR_APP_ID'}";
    
    // 获取旧 Token 用于废弃旧码
    const oldToken = sessionStorage.getItem('wx_qr_token');

    const res = await fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId, oldToken })
    });
    const data = await res.json();
    
    if (data.qrToken) {
      sessionStorage.setItem('wx_qr_token', data.qrToken);
      document.getElementById("qrcode-container").innerHTML = "";
      new QRCode(document.getElementById("qrcode-container"), data.qrCodeUrl);
    }
  }

  refreshQR(); 
</script>`)}
                        >复制</Button>
                    </div>

                    <h3>2. 后端兑换 Token (Node.js 示例)</h3>
                    <p>前端扫码成功后会获得 <code>code</code>，请在您的服务端使用 <code>AppSecret</code> 换取用户信息：</p>
                    <div style={{ background: 'var(--bg-color)', color: '#d4d4d4', padding: '15px', borderRadius: '16px', overflowX: 'auto', fontFamily: 'monospace', fontSize: '14px', position: 'relative' }}>
                        <pre>{`// POST ${tokenExchangeUrl}
const response = await axios.post('${tokenExchangeUrl}', {
    appId: "${currentApp?.appId || 'YOUR_APP_ID'}",
    secret: "${currentSecret || 'YOUR_APP_SECRET'}",
    tempAuthCode: "前端传来的code"
});

console.log(response.data);
// { accessToken: "...", user: { ... } }`}</pre>
                        <Button
                            style={{ position: 'absolute', top: 10, right: 10 }}
                            size="small"
                            icon={<CopyOutlined />}
                            onClick={() => copyToClipboard(`// POST ${tokenExchangeUrl}
const response = await axios.post('${tokenExchangeUrl}', {
    appId: "${currentApp?.appId || 'YOUR_APP_ID'}",
    secret: "${currentSecret || 'YOUR_APP_SECRET'}",
    tempAuthCode: "前端传来的code"
});`)}
                        >复制</Button>
                    </div>

                    <p style={{ marginTop: 20, color: '#ff4d4f', fontSize: '12px' }}>
                        ⚠️ 安全提示：请勿将 AppSecret 暴露在前端代码中，否则会导致密钥泄露。
                    </p>
                </div>
            </Modal>

            {/* Audit Logs Drawer */}
            <Drawer
                title={`${currentApp?.appName || '所有应用'} - 授权日志`}
                placement={isMobile ? "bottom" : "right"}
                height={isMobile ? '90vh' : undefined}
                width={isMobile ? '100%' : 800}
                onClose={() => setIsLogDrawerOpen(false)}
                open={isLogDrawerOpen}
                bodyStyle={{ padding: isMobile ? '16px 12px' : '24px' }}
            >
                {isMobile ? (
                    <List
                        dataSource={logsData}
                        loading={logsLoading}
                        rowKey="_id"
                        pagination={{
                            current: logsCurrentPage,
                            total: logsTotal,
                            pageSize: 10,
                            onChange: (page) => fetchLogs(currentApp?.appId, page),
                            size: "small",
                            align: "center"
                        }}
                        renderItem={(item) => (
                            <List.Item style={{ flexDirection: 'column', alignItems: 'flex-start', background: 'var(--bg-color)', marginBottom: 16, borderRadius: 8, padding: 12 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: 12 }}>
                                    <Space>
                                        <b style={{ color: 'var(--text-primary)' }}>{item.appName}</b>
                                    </Space>
                                    <Tag color={
                                        item.actionStatus === 'CONFIRMED' ? 'green' :
                                            item.actionStatus === 'REJECTED' ? 'red' :
                                                item.actionStatus === 'SCANNED' ? 'orange' : 'default'
                                    } style={{ margin: 0 }}>
                                        {item.actionStatus === 'CONFIRMED' ? '已授权' :
                                            item.actionStatus === 'REJECTED' ? '已拒绝' :
                                                item.actionStatus === 'SCANNED' ? '待确认' : '已过期'}
                                    </Tag>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, fontSize: 13, color: 'var(--text-primary)' }}>
                                    <UserAvatar
                                        seed={item.userId?._id || item.userId?.userId}
                                        label={item.userId?.nickName || item.userId?.username}
                                        style={{ marginRight: 8, border: '1px solid var(--border-color)' }}
                                        size="small"
                                    />
                                    {item.userId?.nickname || item.userId?.username || '未知用户'}
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                                    <span>时间: {dayjs(item.updateTime).format('MM-DD HH:mm:ss')}</span>
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                                    <div>IP: {item.ip}</div>
                                    <div style={{ marginTop: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>设备: {item.device}</div>
                                </div>
                            </List.Item>
                        )}
                    />
                ) : (
                    <Table
                        dataSource={logsData}
                        rowKey="_id"
                        loading={logsLoading}
                        pagination={{
                            current: logsCurrentPage,
                            total: logsTotal,
                            pageSize: 10,
                            onChange: (page) => fetchLogs(currentApp?.appId, page),
                            showSizeChanger: false
                        }}
                        size="small"
                        scroll={{ x: 600 }}
                        columns={[
                            {
                                title: '目标应用',
                                dataIndex: 'appName',
                                key: 'appName',
                                width: 140,
                                render: (text) => <b style={{ color: 'var(--text-primary)' }}>{text}</b>
                            },
                            {
                                title: '操作用户',
                                dataIndex: 'userId',
                                key: 'userId',
                                width: 120,
                                render: (user) => (
                                    <Space>
                                        <UserAvatar
                                            seed={user?._id || user?.userId}
                                            label={user?.nickName || user?.username}
                                            style={{ border: '1px solid var(--border-color)' }}
                                            size="small"
                                        />
                                        <span style={{ maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {user?.nickname || user?.username || '未知'}
                                        </span>
                                    </Space>
                                )
                            },
                            {
                                title: '状态',
                                dataIndex: 'actionStatus',
                                key: 'actionStatus',
                                width: 90,
                                render: (status) => {
                                    const colors = {
                                        'SCANNED': 'orange',
                                        'CONFIRMED': 'green',
                                        'REJECTED': 'red',
                                        'EXPIRED': 'default'
                                    };
                                    const labels = {
                                        'SCANNED': '待确认',
                                        'CONFIRMED': '已授权',
                                        'REJECTED': '已拒绝',
                                        'EXPIRED': '已过期'
                                    };
                                    return <Tag color={colors[status] || 'default'}>{labels[status] || status}</Tag>;
                                }
                            },
                            {
                                title: '更新时间',
                                dataIndex: 'updateTime',
                                key: 'updateTime',
                                width: 140,
                                render: (ts) => dayjs(ts).format('MM-DD HH:mm:ss')
                            },
                            {
                                title: '网络环境与设备',
                                dataIndex: 'device',
                                key: 'device',
                                render: (text, record) => (
                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                        <div style={{ color: 'var(--text-primary)', marginBottom: 2 }}>IP: {record.ip}</div>
                                        <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={text}>
                                            {text}
                                        </div>
                                    </div>
                                )
                            }
                        ]}
                    />
                )}
            </Drawer>
        </Card>
    );
};

export default ScanManagement;
