import { useState, useEffect, useRef, useCallback } from 'react';
import { Table, Input, Select, Modal, Tooltip, Typography, Form, Switch, Row, Col, Pagination } from 'antd';
import { SyncOutlined, RedoOutlined, DeleteOutlined, FileTextOutlined, PlusOutlined, EditOutlined, EyeOutlined, EyeInvisibleOutlined, SearchOutlined, WarningOutlined } from '@ant-design/icons';
import api from '../utils/api';
import useIsMobile from '../hooks/useIsMobile';
import { message } from '../utils/feedback';

const { Option } = Select;
const ORDER_REFRESH_TIMEOUT_MS = 120000;

/** 订单状态：文案与色调取自统一映射，避免各处自行拼颜色 */
const ORDER_STATUS = {
    Pending: { label: '待处理', tone: 'warn' },
    Submitting: { label: '提交中', tone: 'info' },
    Processing: { label: '进行中', tone: 'info' },
    Completed: { label: '已完成', tone: 'ok' },
    Failed: { label: '失败', tone: 'danger' },
    Cancelled: { label: '已取消', tone: 'neutral' },
    Refushing: { label: '重新处理', tone: 'violet' },
    ReconcilePending: { label: '需要确认', tone: 'warn' },
    Unknown: { label: '状态未知', tone: 'neutral' },
};

/**
 * 只有没拿到上游订单号的「需要确认 / 失败」订单才允许重新提交；
 * 条件与后端 /course-order/admin/resubmit 的原子过滤保持一致。
 */
const canResubmit = (record) => ['ReconcilePending', 'Failed'].includes(record.status)
    && !record.remoteOrderId
    && !record.remoteOid
    && !record.isManual
    && typeof record.submissionKey === 'string'
    && typeof record.batchId === 'string'
    && record.batchId !== '';

const CourseOrders = () => {
    const isMobile = useIsMobile();
    const searchDebounceRef = useRef(null);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [total, setTotal] = useState(0);
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);
    const [refreshing, setRefreshing] = useState(false);
    
    // 新建/编辑弹窗
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [createLoading, setCreateLoading] = useState(false);
    const [categories, setCategories] = useState([]);
    const [createForm] = Form.useForm();
    const [editingOrder, setEditingOrder] = useState(null); // null=新建, 有值=编辑

    // 删除二次确认弹窗
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deletingTradeNo, setDeletingTradeNo] = useState('');
    const [deleteLoading, setDeleteLoading] = useState(false);

    // 重新提交二次确认弹窗
    const [resubmitTarget, setResubmitTarget] = useState(null);
    const [resubmitLoading, setResubmitLoading] = useState(false);

    // 搜索与分页条件
    const [query, setQuery] = useState({
        page: 1,
        limit: 15,
        tradeNo: '',
        account: '',
        status: ''
    });

    useEffect(() => {
        return () => {
            if (searchDebounceRef.current) {
                clearTimeout(searchDebounceRef.current);
            }
        };
    }, []);

    const fetchOrders = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/course-order/admin/list', { params: query });
            if (res.data.code === 200) {
                setOrders(res.data.data.list);
                setTotal(res.data.data.total);
            }
        } catch {
            message.error('订单加载失败');
        } finally {
            setLoading(false);
        }
    }, [query]);

    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);

    // 获取网课分类列表（用于录入时选择平台）
    const fetchCategories = async () => {
        try {
            const res = await api.get('/course-category/admin/list', { params: { limit: 100 } });
            if (res.data.code === 200) {
                setCategories(res.data.data?.list || []);
            }
        } catch (error) {
            console.error('获取分类失败', error);
        }
    };

    const handleSearch = (value, field) => {
        if (searchDebounceRef.current) {
            clearTimeout(searchDebounceRef.current);
        }
        searchDebounceRef.current = setTimeout(() => {
            setQuery(prev => ({ ...prev, [field]: value, page: 1 }));
        }, 250);
    };

    const handleTableChange = (pagination) => {
        setQuery(prev => ({
            ...prev,
            page: pagination.current,
            limit: pagination.pageSize
        }));
    };

    const handleRefreshStatus = async (keys = selectedRowKeys) => {
        const refreshableKeys = keys.filter((key) => orders.find((order) => order.tradeNo === key)?.status !== 'Submitting');
        if (!refreshableKeys.length) {
            message.warning('请先选择要刷新的订单');
            return;
        }
        setRefreshing(true);
        try {
            const res = await api.post('/course-order/admin/refresh', {
                orderIds: refreshableKeys
            }, {
                timeout: ORDER_REFRESH_TIMEOUT_MS,
            });
            if (res.data.code === 200) {
                message.success(res.data.message);
                fetchOrders();
                setSelectedRowKeys([]); // 清空选中
            } else {
                message.error(res.data.message || '刷新失败');
            }
        } catch {
            message.error('刷新失败');
        } finally {
            setRefreshing(false);
        }
    };

    const handleDelete = (tradeNo) => {
        setDeletingTradeNo(tradeNo);
        setDeleteModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        setDeleteLoading(true);
        try {
            const res = await api.delete(`/course-order/admin/${deletingTradeNo}`);
            if (res.data.code === 200) {
                message.success('订单已成功删除');
                setDeleteModalOpen(false);
                fetchOrders();
            } else {
                message.error(res.data.message || '删除失败');
            }
        } catch {
            message.error('删除异常');
        } finally {
            setDeleteLoading(false);
        }
    };

    const handleConfirmResubmit = async () => {
        if (!resubmitTarget) return;
        setResubmitLoading(true);
        try {
            const res = await api.post('/course-order/admin/resubmit', {
                tradeNo: resubmitTarget.tradeNo
            });
            if (res.data.code === 200) {
                message.success(res.data.message || '订单已重新入队');
                setResubmitTarget(null);
                fetchOrders();
            } else {
                message.error(res.data.message || '重新提交失败');
            }
        } catch (error) {
            message.error(error?.response?.data?.message || '重新提交失败');
        } finally {
            setResubmitLoading(false);
        }
    };

    // 打开新建弹窗
    const openCreateModal = () => {
        fetchCategories();
        setEditingOrder(null);
        createForm.resetFields();
        setCreateModalOpen(true);
    };

    // 打开编辑弹窗
    const openEditModal = (record) => {
        fetchCategories();
        setEditingOrder(record);
        createForm.setFieldsValue({
            account: record.account,
            remoteOid: record.remoteOid,
            remoteOrderId: record.remoteOrderId,
            courseName: record.courseName,
            courseId: record.courseId,
            school: record.school,
            userId: typeof record.userId === 'object' ? record.userId?._id : record.userId,
            status: record.status,
            remarks: record.remarks,
            isHidden: record.isHidden || false,
        });
        setCreateModalOpen(true);
    };

    // 提交新建或编辑
    const handleSubmitOrder = async () => {
        try {
            const values = await createForm.validateFields();
            setCreateLoading(true);

            let res;
            if (editingOrder) {
                // 编辑模式
                res = await api.put(`/course-order/admin/${editingOrder.tradeNo}`, values);
            } else {
                // 新建模式
                res = await api.post('/course-order/admin/create', values);
            }

            if (res.data.code === 200) {
                message.success(editingOrder ? '订单已更新！' : '订单录入成功！');
                setCreateModalOpen(false);
                setEditingOrder(null);
                createForm.resetFields();
                fetchOrders();
            } else {
                message.error(res.data.message || '操作失败');
            }
        } catch (error) {
            if (error.response) {
                message.error(error.response.data?.message || '操作失败');
            }
        } finally {
            setCreateLoading(false);
        }
    };

    const handleToggleVisibility = async (record) => {
        try {
            const newHiddenStatus = !record.isHidden;
            const res = await api.put(`/course-order/admin/${record.tradeNo}`, {
                isHidden: newHiddenStatus
            });
            if (res.data.code === 200) {
                message.success(newHiddenStatus ? '已在小程序端隐藏此订单' : '已取消隐藏此订单');
                fetchOrders();
            } else {
                message.error(res.data.message || '操作失败');
            }
        } catch {
            message.error('操作异常');
        }
    };

    const getStatusTag = (status, text) => {
        const meta = ORDER_STATUS[status] || { label: '未知状态', tone: 'neutral' };
        return <span className={`tag tone-${meta.tone}`}>{text || meta.label}</span>;
    };

    const columns = [
        {
            title: '订单',
            dataIndex: 'tradeNo',
            width: 150,
            render: (text, record) => (
                <div className="cell-stack">
                    <span className="cell-sub">
                        {new Date(record.createTime).toLocaleDateString()}{' '}
                        {new Date(record.createTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <Typography.Text
                        copyable={{ text, tooltips: ['点击复制单号', '复制成功'] }}
                        className="cell-mono"
                    >
                        {text.slice(0, 6)}…{text.slice(-4)}
                    </Typography.Text>
                </div>
            )
        },
        {
            title: '用户',
            dataIndex: ['userId', 'nickName'],
            width: 104,
            render: (text) => <span className="muted">{text || '系统/游客'}</span>
        },
        {
            title: '账号',
            dataIndex: 'account',
            width: 168,
            render: (text, record) => (
                <div className="cell-stack">
                    <strong className="cell-strong">{text}</strong>
                    <span className="cell-sub">
                        {record.school || '未标注学校'} · 密码已保存
                    </span>
                </div>
            )
        },
        {
            title: '课程',
            dataIndex: 'courseName',
            width: 260,
            render: (text, record) => (
                <div className="cell-stack">
                    <strong className="cell-strong">
                        {text || (record.isManual ? '待刷新同步…' : '未知课程')}
                    </strong>
                    <div className="cell-tags">
                        <span className="tag tone-violet">{record.platformName || record.platformCode}</span>
                        {record.isManual && <span className="tag tone-info">手动录入</span>}
                        {record.isHidden && <span className="tag tone-danger">已隐藏</span>}
                    </div>
                </div>
            )
        },
        {
            title: '进度',
            dataIndex: 'progress',
            width: 96,
            render: (text) => <strong className="cell-progress">{text}</strong>
        },
        {
            title: '状态',
            key: 'status',
            width: 156,
            render: (_, record) => (
                <div className="cell-stack">
                    {getStatusTag(record.status, record.statusText)}
                    {record.remarks && <span className="cell-sub cell-wrap">{record.remarks}</span>}
                </div>
            )
        },
        {
            title: '操作',
            key: 'action',
            fixed: isMobile ? undefined : 'right',
            width: 204,
            align: 'right',
            render: (_, record) => (
                <span className="row-actions">
                    <Tooltip title={record.status === 'ReconcilePending' ? '仅查询上游状态，不会重新提交订单' : '从上游实时获取更新状态'}>
                        <button
                            type="button"
                            className="icon-action"
                            onClick={() => handleRefreshStatus([record.tradeNo])}
                            disabled={record.status === 'Submitting'}
                            aria-label="刷新订单进度"
                        >
                            <SyncOutlined />
                        </button>
                    </Tooltip>
                    {canResubmit(record) && (
                        <Tooltip title="确认上游没有此单后，重新提交到上游">
                            <button
                                type="button"
                                className="icon-action"
                                onClick={() => setResubmitTarget(record)}
                                aria-label="重新提交订单"
                            >
                                <RedoOutlined />
                            </button>
                        </Tooltip>
                    )}
                    <Tooltip title={record.isHidden ? '显示在小程序订单列表' : '隐藏此订单'}>
                        <button
                            type="button"
                            className="icon-action"
                            onClick={() => handleToggleVisibility(record)}
                            aria-label={record.isHidden ? '在小程序显示订单' : '在小程序隐藏订单'}
                        >
                            {record.isHidden ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                        </button>
                    </Tooltip>
                    <Tooltip title="编辑订单信息">
                        <button
                            type="button"
                            className="icon-action"
                            onClick={() => openEditModal(record)}
                            aria-label="编辑订单"
                        >
                            <EditOutlined />
                        </button>
                    </Tooltip>
                    <button
                        type="button"
                        className="icon-action danger"
                        onClick={() => handleDelete(record.tradeNo)}
                        aria-label="删除订单"
                    >
                        <DeleteOutlined />
                    </button>
                </span>
            ),
        },
    ];

    return (
        <div className="page-view fade-in">
            <section className="panel">
                <div className="toolbar-row">
                    <Input
                        prefix={<SearchOutlined style={{ color: 'var(--ink-faint)' }} />}
                        placeholder="搜索账号或学号"
                        onChange={(event) => handleSearch(event.target.value, 'account')}
                        allowClear
                    />
                    <Input
                        prefix={<SearchOutlined style={{ color: 'var(--ink-faint)' }} />}
                        placeholder="搜索订单号"
                        onChange={(event) => handleSearch(event.target.value, 'tradeNo')}
                        allowClear
                    />
                    <Select
                        placeholder="全部状态"
                        style={{ minWidth: 132 }}
                        allowClear
                        onChange={(value) => handleSearch(value || '', 'status')}
                    >
                        <Option value="Pending">待处理</Option>
                        <Option value="Submitting">提交中</Option>
                        <Option value="Processing">进行中</Option>
                        <Option value="Completed">已完成</Option>
                        <Option value="Failed">失败</Option>
                        <Option value="Refushing">重新处理</Option>
                        <Option value="ReconcilePending">需要确认</Option>
                        <Option value="Unknown">状态未知</Option>
                    </Select>
                    <span className="toolbar-spacer" />
                    <span className="toolbar-count">共 {total} 笔订单</span>
                    <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => handleRefreshStatus()}
                        disabled={refreshing || selectedRowKeys.length === 0}
                    >
                        <SyncOutlined spin={refreshing} />
                        刷新进度（{selectedRowKeys.length}）
                    </button>
                    <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={openCreateModal}
                    >
                        <PlusOutlined />
                        添加订单
                    </button>
                </div>

                {!isMobile ? (
                    <Table
                        rowSelection={{
                            selectedRowKeys,
                            onChange: setSelectedRowKeys,
                            getCheckboxProps: (record) => ({
                                disabled: record.status === 'Submitting',
                                name: record.tradeNo,
                            }),
                        }}
                        columns={columns}
                        dataSource={orders}
                        rowKey="tradeNo"
                        loading={loading}
                        scroll={{ x: 'max-content' }}
                        pagination={{
                            current: query.page,
                            pageSize: query.limit,
                            total: total,
                            showSizeChanger: true,
                            showTotal: (count) => `共 ${count} 笔订单`,
                            style: { padding: '12px 16px' },
                        }}
                        onChange={handleTableChange}
                    />
                ) : (
                    <div className="panel-body">
                        {loading ? (
                            <div className="ops-loading">正在加载订单…</div>
                        ) : orders.length === 0 ? (
                            <div className="ops-empty">没有匹配的订单</div>
                        ) : (
                            <div className="view-stack">
                                {orders.map((record) => (
                                    <article key={record.tradeNo} className="list-card">
                                        <div className="list-card-head">
                                            <span className="list-card-title">
                                                {record.courseName || (record.isManual ? '待刷新同步…' : '未知课程')}
                                            </span>
                                            {getStatusTag(record.status, record.statusText)}
                                        </div>
                                        <div className="cell-tags">
                                            <span className="tag tone-violet">
                                                {record.platformName || record.platformCode}
                                            </span>
                                            {record.school && <span className="tag tone-info">{record.school}</span>}
                                            {record.isManual && <span className="tag tone-neutral">手动录入</span>}
                                            {record.isHidden && <span className="tag tone-danger">已隐藏</span>}
                                        </div>
                                        <dl className="list-meta">
                                            <div>
                                                <dt>授权账号</dt>
                                                <dd>{record.account}</dd>
                                            </div>
                                            <div>
                                                <dt>当前进度</dt>
                                                <dd className="cell-progress">{record.progress}</dd>
                                            </div>
                                            <div>
                                                <dt>内部单号</dt>
                                                <dd className="cell-mono">{record.tradeNo.slice(-8)}（末 8 位）</dd>
                                            </div>
                                        </dl>
                                        <div className="list-card-foot">
                                            <span className="cell-sub">
                                                {new Date(record.createTime).toLocaleDateString()} 下单
                                            </span>
                                            <span className="row-actions">
                                                <button
                                                    type="button"
                                                    className="btn btn-sm"
                                                    onClick={() => handleRefreshStatus([record.tradeNo])}
                                                    disabled={record.status === 'Submitting'}
                                                >
                                                    <SyncOutlined />
                                                    刷新
                                                </button>
                                                {canResubmit(record) && (
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm"
                                                        onClick={() => setResubmitTarget(record)}
                                                    >
                                                        <RedoOutlined />
                                                        重提
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    className="icon-action"
                                                    onClick={() => openEditModal(record)}
                                                    aria-label="编辑订单"
                                                >
                                                    <EditOutlined />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="icon-action danger"
                                                    onClick={() => handleDelete(record.tradeNo)}
                                                    aria-label="删除订单"
                                                >
                                                    <DeleteOutlined />
                                                </button>
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
                )}
            </section>

            {/* ===== 新建 / 编辑订单 ===== */}
            <Modal
                title={
                    <span className="panel-title">
                        {editingOrder ? <EditOutlined /> : <PlusOutlined />}
                        <span>{editingOrder ? '修改订单' : '添加订单'}</span>
                    </span>
                }
                open={createModalOpen}
                onCancel={() => {
                    setCreateModalOpen(false);
                    setEditingOrder(null);
                }}
                onOk={handleSubmitOrder}
                confirmLoading={createLoading}
                okText={editingOrder ? '保存' : '添加'}
                cancelText="取消"
                width={isMobile ? '94%' : 680}
                style={{ top: isMobile ? 12 : 48 }}
                styles={{ body: { maxHeight: '70vh', overflowY: 'auto', paddingTop: 4 } }}
                destroyOnClose
            >
                <p className="settings-note" style={{ marginBottom: 14 }}>
                    {editingOrder
                        ? `正在编辑订单：${editingOrder.tradeNo}。修改完成后点击保存立即生效。`
                        : '把其他渠道的订单添加进来，方便统一查看和刷新进度。'}
                </p>

                {!editingOrder && (
                    <div className="hint is-warn" style={{ marginBottom: 16 }}>
                        <strong>提示</strong>
                        <span>填好登录账号和平台订单号后保存，再点「刷新」，系统会自动更新课程和进度。</span>
                    </div>
                )}

                <Form form={createForm} layout="vertical" requiredMark="optional">
                    <p className="section-label">需要填写</p>

                    <Row gutter={16}>
                        <Col xs={24} sm={12}>
                            <Form.Item
                                name="account"
                                label="登录账号（学号或手机号）"
                                rules={[{ required: true, message: '请输入账号' }]}
                            >
                                <Input placeholder="请输入登录账号" />
                            </Form.Item>
                        </Col>

                        <Col xs={24} sm={12}>
                            <Form.Item
                                name="password"
                                label="登录密码"
                                rules={editingOrder ? [] : [{ required: true, message: '请输入密码' }]}
                            >
                                <Input.Password
                                    placeholder={editingOrder ? '留空则不修改密码' : '请输入登录密码'}
                                    visibilityToggle
                                />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col xs={24} sm={12}>
                            <Form.Item
                                name="categoryId"
                                label="平台"
                                rules={[{ required: true, message: '请选择平台分类' }]}
                            >
                                <Select placeholder="请选择平台" showSearch optionFilterProp="children" style={{ width: '100%' }}>
                                    {categories.map((cat) => (
                                        <Option key={cat._id} value={cat._id}>
                                            {cat.name}
                                        </Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>

                        <Col xs={24} sm={12}>
                            <Form.Item name="remoteOid" label="平台订单号" tooltip="用于自动刷新进度的平台订单编号">
                                <Input placeholder="例如：578050" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <p className="section-label">其他信息（一般不用填）</p>

                    <Row gutter={16}>
                        <Col xs={24} sm={12}>
                            <Form.Item name="remoteOrderId" label="平台流水号" tooltip="平台返回的另一种订单编号，可不填">
                                <Input placeholder="可不填" />
                            </Form.Item>
                        </Col>

                        <Col xs={24} sm={12}>
                            <Form.Item name="courseId" label="课程编号">
                                <Input placeholder="可不填" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col xs={24} sm={12}>
                            <Form.Item name="courseName" label="课程名称">
                                <Input placeholder="不填会自动获取" />
                            </Form.Item>
                        </Col>

                        <Col xs={24} sm={12}>
                            <Form.Item name="school" label="学校">
                                <Input placeholder="不填会自动获取" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col xs={24} sm={12}>
                            <Form.Item name="userId" label="关联用户">
                                <Input placeholder="不填则归到当前账号" />
                            </Form.Item>
                        </Col>

                        <Col xs={24} sm={12}>
                            <Form.Item name="status" label="订单状态" initialValue="Processing">
                                <Select>
                                    <Option value="Pending" disabled>待处理</Option>
                                    <Option value="Submitting" disabled>提交中</Option>
                                    <Option value="Processing">进行中（Processing）</Option>
                                    <Option value="Completed">已完成（Completed）</Option>
                                    <Option value="Failed">失败</Option>
                                    <Option value="ReconcilePending" disabled>需要确认</Option>
                                    <Option value="Unknown" disabled>状态未知</Option>
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item name="remarks" label="备注">
                        <Input.TextArea rows={2} placeholder="可不填" />
                    </Form.Item>

                    <div className="settings-inline" style={{ marginBottom: 4 }}>
                        <Form.Item name="isHidden" valuePropName="checked" noStyle>
                            <Switch size="small" />
                        </Form.Item>
                        <span className="settings-note">不在用户端显示这笔订单</span>
                    </div>
                </Form>
            </Modal>

            {/* ===== 删除订单二次确认 ===== */}
            <Modal
                open={deleteModalOpen}
                onCancel={() => setDeleteModalOpen(false)}
                footer={null}
                width={isMobile ? '90%' : 400}
                centered
                destroyOnClose
            >
                <div style={{ textAlign: 'center' }}>
                    <span className="danger-glyph">
                        <WarningOutlined />
                    </span>
                    <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 680 }}>确定要删除此订单吗？</h3>
                    <div className="hint is-danger" style={{ marginBottom: 12, textAlign: 'left' }}>
                        <strong>删除后不能恢复</strong>
                        <span>这笔订单记录会被删除，用户端也无法再查询。</span>
                    </div>
                    <p className="settings-note" style={{ marginBottom: 20 }}>
                        如果只是退单，建议把状态改为「已取消」，这样还能保留记录。
                    </p>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ flex: 1 }}
                            onClick={() => setDeleteModalOpen(false)}
                        >
                            取消
                        </button>
                        <button
                            type="button"
                            className="btn btn-danger"
                            style={{ flex: 1 }}
                            disabled={deleteLoading}
                            onClick={handleConfirmDelete}
                        >
                            {deleteLoading ? '删除中…' : '确认删除'}
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal
                title={null}
                open={Boolean(resubmitTarget)}
                onCancel={() => setResubmitTarget(null)}
                footer={null}
                width={isMobile ? '90%' : 420}
                centered
                destroyOnClose
            >
                <div style={{ textAlign: 'center' }}>
                    <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 680 }}>重新提交这笔订单？</h3>
                    <div className="hint is-warn" style={{ marginBottom: 12, textAlign: 'left' }}>
                        <strong>请先到上游确认没有这笔订单</strong>
                        <span>如果上游其实已经受理，重新提交会产生重复订单并重复扣费。</span>
                    </div>
                    {resubmitTarget && (
                        <p className="settings-note" style={{ marginBottom: 20, textAlign: 'left' }}>
                            {resubmitTarget.account} · {resubmitTarget.courseName || '未知课程'}
                            {resubmitTarget.remarks ? `（${resubmitTarget.remarks}）` : ''}
                        </p>
                    )}
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ flex: 1 }}
                            onClick={() => setResubmitTarget(null)}
                        >
                            取消
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            style={{ flex: 1 }}
                            disabled={resubmitLoading}
                            onClick={handleConfirmResubmit}
                        >
                            {resubmitLoading ? '提交中…' : '确认重新提交'}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default CourseOrders;
