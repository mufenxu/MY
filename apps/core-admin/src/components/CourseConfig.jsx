import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Switch, Tooltip } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ApiOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../utils/api';
import { useResponsive } from '../hooks/useIsMobile';
import { message } from '../utils/feedback';

const CourseConfig = () => {
    const { isMobile } = useResponsive();
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
            width: 120,
            render: (text) => <span className="tag tone-info">{text}</span>
        },
        {
            title: '通道名称',
            dataIndex: 'name',
            key: 'name',
            render: (text) => <strong className="cell-strong">{text}</strong>
        },
        {
            title: '接口 URL',
            dataIndex: 'url',
            key: 'url',
            render: (text) => <span className="cell-mono ellipsis" style={{ display: 'block' }} title={text}>{text}</span>
        },
        {
            title: '商户 UID',
            dataIndex: 'uid',
            key: 'uid',
            width: 130,
            render: (text) => <span className="cell-mono">{text || '—'}</span>
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 92,
            render: (status) => (
                <span className={`tag tone-${status ? 'ok' : 'neutral'}`}>{status ? '启用中' : '已停用'}</span>
            )
        },
        {
            title: '备注',
            dataIndex: 'remark',
            key: 'remark',
            width: 150,
            render: (text) => <span className="muted">{text || '—'}</span>
        },
        {
            title: '操作',
            key: 'action',
            width: 92,
            align: 'right',
            render: (_, record) => (
                <span className="row-actions">
                    <Tooltip title="配置通道">
                        <button
                            type="button"
                            className="icon-action"
                            onClick={() => handleOpenModal(record)}
                            aria-label={`配置通道：${record.name}`}
                        >
                            <EditOutlined />
                        </button>
                    </Tooltip>
                    <Tooltip title="删除通道">
                        <button
                            type="button"
                            className="icon-action danger"
                            onClick={() => handleDelete(record.platformCode)}
                            aria-label={`删除通道：${record.name}`}
                        >
                            <DeleteOutlined />
                        </button>
                    </Tooltip>
                </span>
            ),
        },
    ];

    return (
        <section className="panel">
            <div className="toolbar-row">
                <h2 className="panel-title">
                    <ApiOutlined />
                    网课通道平台
                </h2>
                <span className="toolbar-spacer" />
                <span className="toolbar-count">共 {configs.length} 个通道</span>
                <Tooltip title="刷新列表">
                    <button type="button" className="icon-action" onClick={fetchConfigs} aria-label="刷新列表">
                        <ReloadOutlined spin={loading} />
                    </button>
                </Tooltip>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => handleOpenModal()}>
                    <PlusOutlined />
                    新增通道
                </button>
            </div>

            <p className="settings-note" style={{ margin: '0 16px 10px' }}>
                第三方代刷平台的接口信息，密钥只在保存时提交，不会回显。
            </p>

            {isMobile ? (
                <div className="panel-body">
                    {loading ? (
                        <div className="ops-loading">正在加载通道…</div>
                    ) : configs.length === 0 ? (
                        <div className="ops-empty">还没有配置通道</div>
                    ) : (
                        <div className="view-stack">
                            {configs.map((item) => (
                                <article key={item.platformCode} className="list-card">
                                    <div className="list-card-head">
                                        <span className="list-card-title">{item.name}</span>
                                        <span className={`tag tone-${item.status ? 'ok' : 'neutral'}`}>
                                            {item.status ? '启用中' : '已停用'}
                                        </span>
                                    </div>
                                    <div className="cell-tags">
                                        <span className="tag tone-info">{item.platformCode}</span>
                                        {item.uid && <span className="tag tone-neutral">UID {item.uid}</span>}
                                    </div>
                                    <dl className="list-meta">
                                        <div>
                                            <dt>接口 URL</dt>
                                            <dd className="cell-mono">{item.url}</dd>
                                        </div>
                                        {item.remark && (
                                            <div>
                                                <dt>备注</dt>
                                                <dd>{item.remark}</dd>
                                            </div>
                                        )}
                                    </dl>
                                    <div className="list-card-foot">
                                        <span className="cell-sub">通道配置</span>
                                        <span className="row-actions">
                                            <button
                                                type="button"
                                                className="icon-action"
                                                onClick={() => handleOpenModal(item)}
                                                aria-label={`配置通道：${item.name}`}
                                            >
                                                <EditOutlined />
                                            </button>
                                            <button
                                                type="button"
                                                className="icon-action danger"
                                                onClick={() => handleDelete(item.platformCode)}
                                                aria-label={`删除通道：${item.name}`}
                                            >
                                                <DeleteOutlined />
                                            </button>
                                        </span>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
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
                title={editingCode ? '编辑网课通道' : '新增网课通道'}
                open={modalVisible}
                onOk={handleSave}
                onCancel={() => setModalVisible(false)}
                okText="保存配置"
                cancelText="取消"
                width={isMobile ? '94%' : 600}
                maskClosable={false}
            >
                <Form form={form} layout="vertical" initialValues={{ status: true }}>
                    <Form.Item
                        name="platformCode"
                        label="平台标识码（Code）"
                        tooltip="系统底层调用的唯一标识，例如 mx、joker"
                        rules={[{ required: true, message: '请输入平台标识码' }]}
                    >
                        <Input placeholder="例如：mx" disabled={!!editingCode} />
                    </Form.Item>

                    <Form.Item
                        name="name"
                        label="平台名称"
                        rules={[{ required: true, message: '请输入平台名称' }]}
                    >
                        <Input placeholder="例如：蜜雪代刷对接平台" />
                    </Form.Item>

                    <Form.Item
                        name="url"
                        label="接口 URL"
                        tooltip="第三方代刷平台的 API 入口请求地址，勿带 act 参数"
                        rules={[{ required: true, message: '请输入接口 URL' }]}
                    >
                        <Input placeholder="例如：http://api.example.com" />
                    </Form.Item>

                    <Form.Item name="uid" label="商户 UID（如有）">
                        <Input placeholder="对接所需的商户 ID 或用户账号" />
                    </Form.Item>

                    <Form.Item name="secretKey" label="通信秘钥（Key / Token）">
                        <Input.Password placeholder="对接所需的通信加密秘钥或 Token" />
                    </Form.Item>

                    <Form.Item name="status" label="启用状态" valuePropName="checked">
                        <Switch checkedChildren="开启" unCheckedChildren="停用" />
                    </Form.Item>

                    <Form.Item name="remark" label="内部备注">
                        <Input.TextArea placeholder="记录一些账号信息或其他备注说明" rows={2} />
                    </Form.Item>
                </Form>
            </Modal>
        </section>
    );
};

export default CourseConfig;
