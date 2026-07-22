import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, Switch, Space, Tag, List, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ApiOutlined } from '@ant-design/icons';
import api from '../utils/api';
import useIsMobile from '../hooks/useIsMobile';
import { message } from '../utils/feedback';

const { Text } = Typography;

const CourseConfig = () => {
    const isMobile = useIsMobile();
    const isTablet = window.innerWidth <= 1024;
    const [configs, setConfigs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [form] = Form.useForm();
    const [editingCode, setEditingCode] = useState(null);

    const fetchConfigs = async () => {
        setLoading(true);
        try {
            const res = await api.get('/platform-config/list');
            if (res.data.code === 200) {
                setConfigs(res.data.data || []);
            } else {
                message.error(res.data.message || '获取配置失败');
            }
        } catch (error) {
            message.error(error.response?.data?.message || '获取配置失败');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timerId = window.setTimeout(fetchConfigs, 0);
        return () => window.clearTimeout(timerId);
    }, []);

    const handleOpenModal = (record = null) => {
        if (record) {
            setEditingCode(record.platformCode);
            form.setFieldsValue({
                ...record,
                status: record.status !== false // 默认 true
            });
        } else {
            setEditingCode(null);
            form.resetFields();
            form.setFieldsValue({ status: true });
        }
        setModalVisible(true);
    };

    const handleSave = async () => {
        try {
            const values = await form.validateFields();
            // 编辑时不允许修改 code 除非是新增，但为了简便，统一把 editingCode 加入
            if (editingCode) {
                values.platformCode = editingCode;
            }
            const res = await api.post('/platform-config/save', values);
            if (res.data.code === 200) {
                message.success('保存成功');
                setModalVisible(false);
                fetchConfigs();
            } else {
                message.error(res.data.message || '保存失败');
            }
        } catch (error) {
            if (error.name !== 'ValidationError') {
                message.error(error.response?.data?.message || '保存失败');
            }
        }
    };

    const handleDelete = (platformCode) => {
        Modal.confirm({
            title: '确定要删除此通道吗？',
            content: '删除后可能导致小程序网课代刷无法正常工作。',
            okText: '确定删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                try {
                    const res = await api.delete(`/platform-config/${platformCode}`);
                    if (res.data.code === 200) {
                        message.success('删除成功');
                        fetchConfigs();
                    } else {
                        message.error(res.data.message || '删除失败');
                    }
                } catch {
                    message.error('删除失败');
                }
            }
        });
    };

    const columns = [
        {
            title: '通道标识',
            dataIndex: 'platformCode',
            key: 'platformCode',
            render: text => <Tag color="blue">{text}</Tag>
        },
        {
            title: '通道名称',
            dataIndex: 'name',
            key: 'name',
        },
        {
            title: '接口 URL',
            dataIndex: 'url',
            key: 'url',
            ellipsis: true
        },
        {
            title: '商户 UID',
            dataIndex: 'uid',
            key: 'uid',
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            render: status => (
                <Tag color={status ? 'success' : 'default'}>
                    {status ? '启用中' : '已停用'}
                </Tag>
            )
        },
        {
            title: '备注',
            dataIndex: 'remark',
            key: 'remark',
        },
        {
            title: '操作',
            key: 'action',
            render: (_, record) => (
                <Space size="middle">
                    <Button 
                        type="primary" 
                        size="small" 
                        icon={<EditOutlined />} 
                        onClick={() => handleOpenModal(record)}
                    >
                        配置
                    </Button>
                    <Button 
                        danger 
                        size="small" 
                        icon={<DeleteOutlined />} 
                        onClick={() => handleDelete(record.platformCode)}
                    >
                        删除
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <Card 
            title={
                <Space>
                    <ApiOutlined style={{ color: '#4A7CF7' }}/>
                    <span style={{ fontWeight: 'bold', fontSize: isMobile ? 15 : 16 }}>网课通道平台</span>
                </Space>
            } 
            extra={!isMobile && (
                <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
                    新增通道
                </Button>
            )}
            bordered={false} 
            style={{ borderRadius: 12, boxShadow: 'var(--card-shadow)', margin: 0 }}
            headStyle={{ paddingBottom: isMobile ? 8 : 16 }}
        >
            {isMobile || isTablet ? (
                <div style={{ paddingBottom: 16 }}>
                    {isMobile && (
                        <Button type="primary" block icon={<PlusOutlined />} onClick={() => handleOpenModal()} style={{ marginBottom: 16, borderRadius: 8 }}>
                            新增网课通道
                        </Button>
                    )}
                    <List
                        dataSource={configs}
                        loading={loading}
                        renderItem={item => (
                            <Card size="small" style={{ marginBottom: 12, borderRadius: 12, border: '1px solid var(--border-color)' }} bodyStyle={{ padding: 12 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                                    <div style={{ fontWeight: 'bold' }}>{item.name}</div>
                                    <Tag color={item.status ? 'success' : 'default'} style={{ margin: 0 }}>{item.status ? '启用中' : '已停用'}</Tag>
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                                    <div>标识码: <Tag color="blue">{item.platformCode}</Tag></div>
                                    <div style={{ marginTop: 4, wordBreak: 'break-all' }}>URL: <Text code>{item.url}</Text></div>
                                    {item.uid && <div style={{ marginTop: 4 }}>UID: {item.uid}</div>}
                                    {item.remark && <div style={{ marginTop: 4, color: '#999' }}>备注: {item.remark}</div>}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                    <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => handleOpenModal(item)}>配置</Button>
                                    <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(item.platformCode)}>删除</Button>
                                </div>
                            </Card>
                        )}
                    />
                </div>
            ) : (
                <Table 
                    columns={columns} 
                    dataSource={configs} 
                    rowKey="platformCode"
                    loading={loading}
                    scroll={{ x: 'max-content' }}
                    pagination={false}
                />
            )}

            <Modal
                title={editingCode ? "编辑网课通道" : "新增网课通道"}
                open={modalVisible}
                onOk={handleSave}
                onCancel={() => setModalVisible(false)}
                okText="保存配置"
                cancelText="取消"
                width={600}
                maskClosable={false}
            >
                <Form
                    form={form}
                    layout="vertical"
                    initialValues={{ status: true }}
                >
                    <Form.Item 
                        name="platformCode" 
                        label="平台标识码 (Code)" 
                        tooltip="系统底层调用的唯一标识，例如 mx、joker"
                        rules={[{ required: true, message: '请输入平台标识码' }]}
                    >
                        <Input placeholder="例如: mx" disabled={!!editingCode} />
                    </Form.Item>
                    
                    <Form.Item 
                        name="name" 
                        label="平台名称" 
                        rules={[{ required: true, message: '请输入平台名称' }]}
                    >
                        <Input placeholder="例如: 蜜雪代刷对接平台" />
                    </Form.Item>
                    
                    <Form.Item 
                        name="url" 
                        label="接口 URL" 
                        tooltip="第三方代刷平台的API入口请求地址，勿带 act 参数"
                        rules={[{ required: true, message: '请输入接口 URL' }]}
                    >
                        <Input placeholder="例如: http://api.example.com" />
                    </Form.Item>
                    
                    <Form.Item 
                        name="uid" 
                        label="商户 UID (如有)" 
                    >
                        <Input placeholder="对接所需的商户ID或用户账号" />
                    </Form.Item>
                    
                    <Form.Item 
                        name="secretKey" 
                        label="通信秘钥 (Key/Token)" 
                    >
                        <Input.Password placeholder="对接所需的通信加密秘钥或 Token" />
                    </Form.Item>
                    
                    <Form.Item 
                        name="status" 
                        label="启用状态" 
                        valuePropName="checked"
                    >
                        <Switch checkedChildren="开启" unCheckedChildren="停用" />
                    </Form.Item>

                    <Form.Item 
                        name="remark" 
                        label="内部备注" 
                    >
                        <Input.TextArea placeholder="记录一些账号信息或其他备注说明" rows={2}/>
                    </Form.Item>
                </Form>
            </Modal>
        </Card>
    );
};

export default CourseConfig;
