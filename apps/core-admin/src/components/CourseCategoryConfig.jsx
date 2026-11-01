import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, Select, Popconfirm, InputNumber, Row, Col, Pagination, Tooltip } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, AppstoreOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../utils/api';
import { useResponsive } from '../hooks/useIsMobile';
import { message } from '../utils/feedback';

const { Option } = Select;
const { TextArea } = Input;

const CourseCategoryConfig = () => {
    const { isMobile } = useResponsive();
    const [categories, setCategories] = useState([]);
    const [platforms, setPlatforms] = useState([]);
    const [loading, setLoading] = useState(false);
    const [total, setTotal] = useState(0);
    const [query, setQuery] = useState({ page: 1, limit: 15 });

    const [isModalVisible, setIsModalVisible] = useState(false);
    const [form] = Form.useForm();
    const [editingId, setEditingId] = useState(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/course-category/admin/list', { params: query });
            if (res.data && res.data.code === 200) {
                setCategories(res.data.data.list || []);
                setTotal(res.data.data.total || 0);
                setPlatforms(res.data.data._platforms || []);
            } else {
                message.error('获取列表失败: ' + res.data?.message);
            }
        } catch {
            message.error('网络请求失败');
        } finally {
            setLoading(false);
        }
    }, [query]);

    useEffect(() => {
        const timerId = window.setTimeout(fetchData, 0);
        return () => window.clearTimeout(timerId);
    }, [fetchData]);

    const handleTableChange = (pagination) => {
        setQuery({ page: pagination.current, limit: pagination.pageSize });
    };

    const handleAdd = () => {
        setEditingId(null);
        form.resetFields();
        form.setFieldsValue({
            sort: 0,
            status: 1,
            nock: 0,
            price: 0,
            suo: '0',
            yunsuan: '*',
            queryplat: 'mx',
            docking: 'mx'
        });
        setIsModalVisible(true);
    };

    const handleEdit = (record) => {
        setEditingId(record._id);
        form.setFieldsValue({
            ...record,
        });
        setIsModalVisible(true);
    };

    const handleDelete = async (id) => {
        try {
            const res = await api.delete(`/course-category/admin/${id}`);
            if (res.data.code === 200) {
                message.success('删除成功');
                fetchData();
            } else {
                message.error(res.data.message);
            }
        } catch {
            message.error('删除异常');
        }
    };

    const handleModalOk = async () => {
        try {
            const values = await form.validateFields();
            if (editingId) {
                values._id = editingId;
            }
            const res = await api.post('/course-category/admin/save', values);
            if (res.data.code === 200) {
                message.success(res.data.message);
                setIsModalVisible(false);
                fetchData();
            } else {
                message.error(res.data.message);
            }
        } catch {
            message.error('请检查表单填写后重试');
        }
    };

    const columns = [
        {
            title: '排序',
            dataIndex: 'sort',
            width: 72,
            align: 'center'
        },
        {
            title: '平台名字',
            dataIndex: 'name',
            render: (text) => <strong className="cell-strong" style={{ color: 'var(--blue)' }}>{text}</strong>
        },
        {
            title: '查询接口',
            dataIndex: 'getnoun',
            render: (text, record) => (
                <div className="cell-stack">
                    <span className="cell-sub">通道 {record.queryplat || '自营'}</span>
                    <span className="tag tone-teal">查 {text}</span>
                </div>
            )
        },
        {
            title: '交单接口',
            dataIndex: 'noun',
            render: (text, record) => (
                <div className="cell-stack">
                    <span className="cell-sub">通道 {record.docking || '自营'}</span>
                    <span className="tag tone-info">交 {text}</span>
                </div>
            )
        },
        {
            title: '免查课',
            dataIndex: 'nock',
            width: 92,
            render: (val) => (val === 1 ? <span className="tag tone-warn">免查课</span> : <span className="faint">—</span>)
        },
        {
            title: '状态',
            dataIndex: 'status',
            width: 96,
            render: (val) => (
                <span className={`tag tone-${val === 1 ? 'ok' : 'neutral'}`}>{val === 1 ? '上架中' : '已下架'}</span>
            )
        },
        {
            title: '创建时间',
            dataIndex: 'createdAt',
            width: 110,
            render: (val) => <span className="cell-mono">{new Date(val).toLocaleDateString()}</span>
        },
        {
            title: '操作',
            key: 'action',
            width: 92,
            align: 'right',
            render: (_, record) => (
                <span className="row-actions">
                    <Tooltip title="编辑">
                        <button
                            type="button"
                            className="icon-action"
                            onClick={() => handleEdit(record)}
                            aria-label={`编辑平台：${record.name}`}
                        >
                            <EditOutlined />
                        </button>
                    </Tooltip>
                    <Popconfirm title="确定要删除此分类吗？" onConfirm={() => handleDelete(record._id)}>
                        <button
                            type="button"
                            className="icon-action danger"
                            aria-label={`删除平台：${record.name}`}
                        >
                            <DeleteOutlined />
                        </button>
                    </Popconfirm>
                </span>
            )
        },
    ];

    return (
        <section className="panel">
            <div className="toolbar-row">
                <h2 className="panel-title">
                    <AppstoreOutlined />
                    网课分类
                </h2>
                <span className="toolbar-spacer" />
                <span className="toolbar-count">共 {total} 个平台</span>
                <Tooltip title="刷新列表">
                    <button type="button" className="icon-action" onClick={fetchData} aria-label="刷新列表">
                        <ReloadOutlined spin={loading} />
                    </button>
                </Tooltip>
                <button type="button" className="btn btn-sm btn-primary" onClick={handleAdd}>
                    <PlusOutlined />
                    添加平台
                </button>
            </div>

            <p className="settings-note" style={{ margin: '0 16px 10px' }}>
                这里配置小程序里展示的网课分类，以及它们对应的后端查课、交单通道参数。
            </p>

            {isMobile ? (
                <div className="panel-body">
                    {loading ? (
                        <div className="ops-loading">正在加载平台…</div>
                    ) : categories.length === 0 ? (
                        <div className="ops-empty">还没有配置平台</div>
                    ) : (
                        <div className="view-stack">
                            {categories.map((item) => (
                                <article key={item._id} className="list-card">
                                    <div className="list-card-head">
                                        <span className="list-card-title" style={{ color: 'var(--blue)' }}>{item.name}</span>
                                        <span className={`tag tone-${item.status === 1 ? 'ok' : 'neutral'}`}>
                                            {item.status === 1 ? '上架中' : '已下架'}
                                        </span>
                                    </div>
                                    <div className="cell-tags">
                                        <span className="tag tone-teal">查 {item.getnoun}（{item.queryplat || '自营'}）</span>
                                        <span className="tag tone-info">交 {item.noun}（{item.docking || '自营'}）</span>
                                        {item.nock === 1 && <span className="tag tone-warn">免查课</span>}
                                    </div>
                                    <p className="cell-sub">
                                        排序 {item.sort} · 定价 ¥{item.price || 0}
                                    </p>
                                    <div className="list-card-foot">
                                        <span className="cell-sub">{new Date(item.createdAt).toLocaleDateString()}</span>
                                        <span className="row-actions">
                                            <button
                                                type="button"
                                                className="icon-action"
                                                onClick={() => handleEdit(item)}
                                                aria-label={`编辑平台：${item.name}`}
                                            >
                                                <EditOutlined />
                                            </button>
                                            <Popconfirm title="确定要删除此分类吗？" onConfirm={() => handleDelete(item._id)}>
                                                <button
                                                    type="button"
                                                    className="icon-action danger"
                                                    aria-label={`删除平台：${item.name}`}
                                                >
                                                    <DeleteOutlined />
                                                </button>
                                            </Popconfirm>
                                        </span>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                    <Pagination
                        style={{ marginTop: 12, textAlign: 'center' }}
                        size="small"
                        current={query.page}
                        pageSize={query.limit}
                        total={total}
                        simple
                        onChange={(page, pageSize) => handleTableChange({ current: page, pageSize })}
                    />
                </div>
            ) : (
                <Table
                    columns={columns}
                    dataSource={categories}
                    rowKey="_id"
                    loading={loading}
                    scroll={{ x: 'max-content' }}
                    pagination={{
                        current: query.page,
                        pageSize: query.limit,
                        total: total,
                        showSizeChanger: true,
                        showTotal: (count) => `共 ${count} 个平台`,
                        style: { padding: '12px 16px' },
                    }}
                    onChange={handleTableChange}
                />
            )}

            <Modal
                title={editingId ? '编辑平台网课' : '添加平台网课'}
                open={isModalVisible}
                onOk={handleModalOk}
                onCancel={() => setIsModalVisible(false)}
                width={isMobile ? '94%' : 700}
                style={{ top: isMobile ? 12 : 32 }}
                destroyOnClose
            >
                <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
                    <Form.Item label="排序" name="sort">
                        <InputNumber style={{ width: '100%' }} placeholder="商品排序从小到大" />
                    </Form.Item>
                    <Form.Item label="平台名字" name="name" rules={[{ required: true, message: '请输入平台名字' }]}>
                        <Input placeholder="例如：超星学习通全包" />
                    </Form.Item>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item label="定价" name="price">
                                <InputNumber style={{ width: '100%' }} min={0} step={0.1} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item label="首选价格" name="suo">
                                <Input placeholder="0 为不锁死" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item label="查询通道" name="queryplat">
                                <Select>
                                    <Option value="0">自营</Option>
                                    {platforms.map(p => <Option key={p.platformCode} value={p.platformCode}>{p.name} ({p.platformCode})</Option>)}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item label="查课参数" name="getnoun" rules={[{ required: true }]}>
                                <Input placeholder="例: 3" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item label="交单通道" name="docking">
                                <Select>
                                    <Option value="0">自营</Option>
                                    {platforms.map(p => <Option key={p.platformCode} value={p.platformCode}>{p.name} ({p.platformCode})</Option>)}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item label="交单参数" name="noun" rules={[{ required: true }]}>
                                <Input placeholder="例: 3" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item label="代理计算" name="yunsuan">
                        <Select>
                            <Option value="*">乘法 (*)</Option>
                            <Option value="+">加法 (+)</Option>
                        </Select>
                    </Form.Item>

                    <Form.Item label="免查课" name="nock">
                        <Select>
                            <Option value={1}>是（直接下单无选课）</Option>
                            <Option value={0}>否（需要先查询课程表）</Option>
                        </Select>
                    </Form.Item>

                    <Form.Item label="状态" name="status">
                        <Select>
                            <Option value={1}>上架</Option>
                            <Option value={0}>下架</Option>
                        </Select>
                    </Form.Item>

                    <Form.Item label="用户说明" name="content">
                        <TextArea rows={3} placeholder="下单界面的提示说明" />
                    </Form.Item>
                </Form>
            </Modal>
        </section>
    );
};

export default CourseCategoryConfig;
