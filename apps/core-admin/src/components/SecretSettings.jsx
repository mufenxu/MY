import { useState, useEffect } from 'react';
import { Table, Modal, Form, Input, Tooltip } from 'antd';
import { EditOutlined, DeleteOutlined, KeyOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../utils/api';
import useIsMobile from '../hooks/useIsMobile';
import ReauthenticationModal from './ReauthenticationModal';
import { establishSensitiveSession } from '../utils/reauth';
import { message } from '../utils/feedback';

const SecretSettings = () => {
    const [secrets, setSecrets] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [currentSecret, setCurrentSecret] = useState(null);

    const [reauthVisible, setReauthVisible] = useState(false);
    const [reauthLoading, setReauthLoading] = useState(false);
    const [pendingAction, setPendingAction] = useState(null);

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
        const timerId = window.setTimeout(fetchSecrets, 0);
        return () => window.clearTimeout(timerId);
    }, []);

    const openEdit = (record) => {
        setCurrentSecret(record);
        form.setFieldsValue({ key: record.key, value: '' });
        setIsModalVisible(true);
    };

    const handleDeleteClick = (key) => {
        Modal.confirm({
            title: '确定要清空数据库中的配置吗？',
            content: '清空后将默认使用本地 .env 文件中的值。继续操作需要二次验证。',
            okText: '确认并验证',
            cancelText: '取消',
            onOk: () => {
                setPendingAction({ type: 'delete', key });
                setReauthVisible(true);
            }
        });
    };

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            setPendingAction({ type: 'update', values });
            setIsModalVisible(false);
            form.resetFields();
            setReauthVisible(true);
        } catch (error) {
            if (!error?.errorFields) message.error('请检查密钥内容');
        }
    };

    const handleReauthentication = async (credentials) => {
        if (!pendingAction) return;
        setReauthLoading(true);
        try {
            const proof = await establishSensitiveSession(credentials);
            const res = pendingAction.type === 'delete'
                ? await api.delete(`/secrets/${pendingAction.key}`, { data: proof })
                : await api.post('/secrets/update', { ...pendingAction.values, ...proof });
            if (!res.data.success) throw new Error(res.data.error || '操作失败');
            message.success(pendingAction.type === 'delete'
                ? '已清空数据库配置，系统将默认使用 .env 中的配置'
                : '密钥更新成功，已即刻生效');
            setReauthVisible(false);
            setPendingAction(null);
            setCurrentSecret(null);
            await fetchSecrets();
        } catch (error) {
            message.error(error.response?.data?.message || error.response?.data?.error || error.message || '二次验证失败');
        } finally {
            setReauthLoading(false);
        }
    };

    const cancelReauthentication = () => {
        setReauthVisible(false);
        setPendingAction(null);
        setCurrentSecret(null);
    };

    const columns = [
        {
            title: '密钥名称',
            dataIndex: 'key',
            key: 'key',
            width: 190,
            render: (text) => <span className="cell-mono" style={{ color: 'var(--ink)', fontWeight: 620 }}>{text}</span>
        },
        {
            title: '用途说明',
            dataIndex: 'desc',
            key: 'desc',
            render: (text) => <span className="muted">{text}</span>
        },
        {
            title: '当前值',
            dataIndex: 'displayValue',
            key: 'displayValue',
            width: 190,
            render: (val) => (
                <span className="cell-mono ellipsis" style={{ display: 'block' }} title={val || ''}>
                    {val || '未配置'}
                </span>
            )
        },
        {
            title: '生效来源',
            key: 'source',
            width: 150,
            render: (_, record) => (
                record.isUsingDb ? (
                    <span className="tag tone-ok">数据库 · 热更新</span>
                ) : (
                    <span className="tag tone-neutral">本地 .env · 需重启</span>
                )
            )
        },
        {
            title: '最近修改',
            dataIndex: 'updated_at',
            key: 'updated_at',
            width: 160,
            render: (val) => <span className="cell-sub">{val ? new Date(val).toLocaleString() : '—'}</span>
        },
        {
            title: '操作',
            key: 'action',
            width: 92,
            align: 'right',
            render: (_, record) => (
                <span className="row-actions">
                    <Tooltip title="覆盖配置">
                        <button
                            type="button"
                            className="icon-action"
                            onClick={() => openEdit(record)}
                            aria-label={`覆盖配置：${record.key}`}
                        >
                            <EditOutlined />
                        </button>
                    </Tooltip>
                    {record.isUsingDb && (
                        <Tooltip title="恢复默认">
                            <button
                                type="button"
                                className="icon-action danger"
                                onClick={() => handleDeleteClick(record.key)}
                                aria-label={`恢复默认：${record.key}`}
                            >
                                <DeleteOutlined />
                            </button>
                        </Tooltip>
                    )}
                </span>
            )
        }
    ];

    return (
        <section className="panel">
            <div className="toolbar-row">
                <h2 className="panel-title">
                    <KeyOutlined />
                    连接信息
                </h2>
                <span className="toolbar-spacer" />
                <span className="toolbar-count">共 {secrets.length} 项</span>
                <button type="button" className="btn btn-sm" onClick={fetchSecrets} disabled={loading}>
                    <ReloadOutlined spin={loading} />
                    刷新状态
                </button>
            </div>

            <p className="settings-note" style={{ margin: '0 16px 10px' }}>
                在此处修改的密钥配置会加密存进数据库，并要求管理员二次验证。
            </p>

            {isMobile ? (
                <div className="panel-body">
                    {loading ? (
                        <div className="ops-loading">正在加载密钥…</div>
                    ) : secrets.length === 0 ? (
                        <div className="ops-empty">还没有可配置的密钥</div>
                    ) : (
                        <div className="view-stack">
                            {secrets.map((record) => (
                                <article key={record.key} className="list-card">
                                    <div className="list-card-head">
                                        <span className="list-card-title cell-mono">{record.key}</span>
                                        <span className={`tag tone-${record.isUsingDb ? 'ok' : 'neutral'}`}>
                                            {record.isUsingDb ? '数据库' : '本地 .env'}
                                        </span>
                                    </div>
                                    <p className="cell-sub">{record.desc}</p>
                                    <p className="payload" style={{ maxHeight: 'none' }}>{record.displayValue || '未配置'}</p>
                                    <div className="list-card-foot">
                                        <span className="cell-sub">
                                            {record.updated_at ? new Date(record.updated_at).toLocaleString() : '—'}
                                        </span>
                                        <span className="row-actions">
                                            <button
                                                type="button"
                                                className="icon-action"
                                                onClick={() => openEdit(record)}
                                                aria-label={`覆盖配置：${record.key}`}
                                            >
                                                <EditOutlined />
                                            </button>
                                            {record.isUsingDb && (
                                                <button
                                                    type="button"
                                                    className="icon-action danger"
                                                    onClick={() => handleDeleteClick(record.key)}
                                                    aria-label={`恢复默认：${record.key}`}
                                                >
                                                    <DeleteOutlined />
                                                </button>
                                            )}
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
                    dataSource={secrets}
                    rowKey="key"
                    loading={loading}
                    pagination={false}
                />
            )}

            <ReauthenticationModal
                open={reauthVisible}
                title={pendingAction?.type === 'delete' ? '恢复默认配置二次验证' : '更新密钥二次验证'}
                danger={pendingAction?.type === 'delete'}
                confirmLoading={reauthLoading}
                onCancel={cancelReauthentication}
                onConfirm={handleReauthentication}
            />

            <Modal
                title={`修改配置：${currentSecret?.desc || ''}`}
                open={isModalVisible}
                onOk={handleOk}
                onCancel={() => {
                    setIsModalVisible(false);
                    setCurrentSecret(null);
                    form.resetFields();
                }}
                width={isMobile ? '94%' : 520}
                destroyOnHidden
            >
                <Form layout="vertical" form={form}>
                    <Form.Item name="key" hidden>
                        <Input />
                    </Form.Item>
                    <Form.Item
                        name="value"
                        label={<><KeyOutlined style={{ marginRight: 8 }} />新的密钥内容</>}
                        rules={[{ required: true, message: '请输入新的密钥内容' }]}
                    >
                        <Input.TextArea rows={4} placeholder="在此粘贴新的密钥内容…" />
                    </Form.Item>
                </Form>
            </Modal>
        </section>
    );
};

export default SecretSettings;
