import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Modal, Form, Input, message, Tag, Typography, List, Card } from 'antd';
import { EditOutlined, DeleteOutlined, KeyOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../utils/api';
import useIsMobile from '../hooks/useIsMobile';
import ScanAuthModal from './ScanAuthModal';

const { Text } = Typography;

const SecretSettings = () => {
    const [secrets, setSecrets] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [currentSecret, setCurrentSecret] = useState(null);

    // ScanAuth Modal State
    const [scanAuthVisible, setScanAuthVisible] = useState(false);
    const [pendingAction, setPendingAction] = useState(null); // { type: 'edit' | 'delete', record: object, key: string }

    const [form] = Form.useForm();
    const isMobile = useIsMobile();

    const fetchSecrets = async () => {
        setLoading(true);
        try {
            const res = await api.get('/secrets');
            if (res.data.success) {
                setSecrets(res.data.result);
            } else {
                message.error('获取密钥列表失败');
            }
        } catch {
            message.error('获取密钥列表失败');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSecrets();
    }, []);

    const triggerAuth = (action) => {
        setPendingAction(action);
        setScanAuthVisible(true);
    };

    const handleAuthSuccess = () => {
        setScanAuthVisible(false);
        if (pendingAction) {
            if (pendingAction.type === 'edit') {
                const { record } = pendingAction;
                setCurrentSecret(record);
                form.setFieldsValue({
                    key: record.key,
                    value: '' // 不要把打了🐎的值放进去，让用户输新的
                });
                setIsModalVisible(true);
            } else if (pendingAction.type === 'delete') {
                executeDelete(pendingAction.key);
            }
        }
    };

    const executeDelete = async (key) => {
        try {
            const res = await api.delete(`/secrets/${key}`);
            if (res.data.success) {
                message.success('已清空数据库配置，系统将默认使用 .env 中的配置');
                fetchSecrets();
            } else {
                message.error(res.data.error || '删除失败');
            }
        } catch (err) {
            message.error(err.response?.data?.error || '删除出错');
        }
    };

    const handleDeleteClick = (key) => {
        Modal.confirm({
            title: '确定要清空数据库中的配置吗？',
            content: '清空后将默认使用本地 .env 文件中的值。继续操作将需要扫码授权。',
            okText: '确认并授权',
            cancelText: '取消',
            onOk: () => {
                triggerAuth({ type: 'delete', key });
            }
        });
    };

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            const res = await api.post('/secrets/update', values);
            if (res.data.success) {
                message.success('密钥更新成功，已即刻生效');
                setIsModalVisible(false);
                fetchSecrets();
            } else {
                message.error(res.data.error || '更新失败');
            }
        } catch (error) {
            console.error(error);
        }
    };

    const columns = [
        {
            title: '密钥名称',
            dataIndex: 'key',
            key: 'key',
            render: (text) => <Text strong>{text}</Text>
        },
        {
            title: '用途说明',
            dataIndex: 'desc',
            key: 'desc'
        },
        {
            title: '当前值',
            dataIndex: 'displayValue',
            key: 'displayValue',
            render: (val) => (
                <Text type="secondary" style={{ fontFamily: 'monospace' }}>
                    {val || '未配置'}
                </Text>
            )
        },
        {
            title: '生效来源',
            key: 'source',
            render: (_, record) => (
                record.isUsingDb ? (
                    <Tag color="green">数据库 (热更新)</Tag>
                ) : (
                    <Tag color="default">本地 .env (需重启)</Tag>
                )
            )
        },
        {
            title: '最近修改',
            dataIndex: 'updated_at',
            key: 'updated_at',
            render: (val) => val ? new Date(val).toLocaleString() : '-'
        },
        {
            title: '操作',
            key: 'action',
            render: (_, record) => (
                <Space size="middle">
                    <Button type="link" icon={<EditOutlined />} onClick={() => triggerAuth({ type: 'edit', record })}>
                        覆盖配置
                    </Button>
                    {record.isUsingDb && (
                        <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleDeleteClick(record.key)}>
                            恢复默认
                        </Button>
                    )}
                </Space>
            )
        }
    ];

    return (
        <div style={{ padding: '0 0' }}>
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: 12 }}>
                <Text type="secondary" style={{ flex: 1 }}>在此处修改的密钥配置将存储至数据库中。修改前需进行管理员扫码安全验证，以确保系统稳定与安全。</Text>
                <Button icon={<ReloadOutlined />} onClick={fetchSecrets} loading={loading} style={{ alignSelf: isMobile ? 'flex-end' : 'auto' }}>
                    刷新状态
                </Button>
            </div>

            {isMobile ? (
                <List
                    dataSource={secrets}
                    loading={loading}
                    rowKey="key"
                    renderItem={(record) => (
                        <Card style={{ marginBottom: 16, borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }} bodyStyle={{ padding: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <Text strong style={{ fontSize: 16 }}>{record.key}</Text>
                                {record.isUsingDb ? (
                                    <Tag color="green">数据库</Tag>
                                ) : (
                                    <Tag color="default">本地 .env</Tag>
                                )}
                            </div>
                            <div style={{ marginBottom: 8 }}>
                                <Text type="secondary">{record.desc}</Text>
                            </div>
                            <div style={{ marginBottom: 12, background: 'var(--bg-color)', padding: '8px 12px', borderRadius: 6, wordBreak: 'break-all' }}>
                                <Text type="secondary" style={{ fontFamily: 'monospace' }}>
                                    {record.displayValue || '未配置'}
                                </Text>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: 12, marginTop: 12 }}>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    {record.updated_at ? new Date(record.updated_at).toLocaleString() : '-'}
                                </Text>
                                <Space>
                                    <Button type="primary" size="small" ghost icon={<EditOutlined />} onClick={() => triggerAuth({ type: 'edit', record })}>
                                        修改
                                    </Button>
                                    {record.isUsingDb && (
                                        <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => handleDeleteClick(record.key)}>
                                            重置
                                        </Button>
                                    )}
                                </Space>
                            </div>
                        </Card>
                    )}
                />
            ) : (
                <Table
                    columns={columns}
                    dataSource={secrets}
                    rowKey="key"
                    loading={loading}
                    pagination={false}
                    bordered={false}
                    style={{ borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
                />
            )}

            <ScanAuthModal
                open={scanAuthVisible}
                onCancel={() => setScanAuthVisible(false)}
                onSuccess={handleAuthSuccess}
                title={pendingAction?.type === 'edit' ? '安全操作授权 - 修改配置' : '安全操作授权 - 恢复默认'}
            />

            <Modal
                title={`修改配置: ${currentSecret?.desc}`}
                open={isModalVisible}
                onOk={handleOk}
                onCancel={() => setIsModalVisible(false)}
                destroyOnClose
            >
                <Form layout="vertical" form={form}>
                    <Form.Item name="key" hidden>
                        <Input />
                    </Form.Item>
                    <Form.Item
                        name="value"
                        label={<><KeyOutlined style={{ marginRight: 8 }} /> 新的密钥内容</>}
                        rules={[{ required: true, message: '请输入新的密钥内容' }]}
                    >
                        <Input.TextArea rows={4} placeholder="在此粘贴新的密钥内容..." />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default SecretSettings;
