import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Table, Tag, Space, Button, Input, Select, Modal, Tooltip, Typography, Form, Divider, Switch, List, Row, Col } from 'antd';
import { SyncOutlined, DeleteOutlined, FileTextOutlined, PlusOutlined, EditOutlined, EyeOutlined, EyeInvisibleOutlined, SearchOutlined, WarningOutlined, ExclamationCircleFilled } from '@ant-design/icons';
import api from '../utils/api';
import useIsMobile from '../hooks/useIsMobile';
import { message } from '../utils/feedback';

const { Option } = Select;
const ORDER_REFRESH_TIMEOUT_MS = 120000;

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
        const statusMap = {
            'Pending': { color: 'orange', label: '待处理' },
            'Submitting': { color: 'processing', label: '提交中' },
            'Processing': { color: 'processing', label: '进行中' },
            'Completed': { color: 'success', label: '已完成' },
            'Failed': { color: 'error', label: '失败' },
            'Cancelled': { color: 'default', label: '已取消' },
            'Refushing': { color: 'magenta', label: '重新处理' },
            'ReconcilePending': { color: 'warning', label: '待人工核对' },
            'Unknown': { color: 'default', label: '结果未知' }
        };
        const friendlyLabels = {
            ReconcilePending: '需要确认',
            Unknown: '状态未知',
        };
        const st = statusMap[status] || { color: 'default', label: '未知状态' };
        return <Tag color={st.color}>{friendlyLabels[status] || text || st.label}</Tag>;
    };

    const columns = [
        {
            title: '订单',
            dataIndex: 'tradeNo',
            width: 140,
            render: (text, record) => (
                <div style={{ lineHeight: 1.4 }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginBottom: 2 }}>下单时间：</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                        {new Date(record.createTime).toLocaleDateString()} {new Date(record.createTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <Text 
                        copyable={{ text: text, tooltips: ['点击复制单号', '复制成功'] }} 
                        style={{ fontSize: 11, color: '#BFBFBF', fontFamily: 'monospace' }}
                    >
                        {text.slice(0, 6)}...{text.slice(-4)}
                    </Text>
                </div>
            )
        },
        {
            title: '用户',
            dataIndex: ['userId', 'nickName'],
            width: 100,
            render: (text) => (
                <Text style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{text || '系统/游客'}</Text>
            )
        },
        {
            title: '账号',
            dataIndex: 'account',
            width: 160,
            render: (text, record) => (
                <div>
                    <div>{record.school && <Tag color="blue">{record.school}</Tag>}</div>
                    <div style={{ marginTop: 4 }}><b>{text}</b></div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>密码已保存</div>
                </div>
            )
        },
        {
            title: '课程',
            dataIndex: 'courseName',
            width: 260,
            render: (text, record) => (
                <div>
                    <div style={{ fontWeight: 'bold', color: '#4A7CF7', marginBottom: 4 }}>
                        {text || (record.isManual ? '待刷新同步...' : '未知课程')}
                    </div>
                    <Space size={4} wrap>
                        <Tag color="purple" style={{ margin: 0 }}>{record.platformName || record.platformCode}</Tag>
                        {record.isManual && <Tag color="cyan" style={{ margin: 0 }}>手动录入</Tag>}
                        {record.isHidden && <Tag color="red" style={{ margin: 0 }} icon={<EyeInvisibleOutlined />}>已隐藏</Tag>}
                    </Space>
                </div>
            )
        },
        {
            title: '进度',
            dataIndex: 'progress',
            width: 100,
            render: (text) => <b style={{ color: '#52c41a', fontSize: 14 }}>{text}</b>
        },
        {
            title: '状态',
            key: 'status',
            width: 160,
            render: (_, record) => (
                <Space direction="vertical" size={4}>
                    {getStatusTag(record.status, record.statusText)}
                    {record.remarks && <div style={{ fontSize: 12, color: 'gray', whiteSpace: 'normal', maxWidth: 140 }}>{record.remarks}</div>}
                </Space>
            )
        },
        // 移除原有的下单时间列，因为它已经合并到“订单参考”列中了
        {
            title: '操作',
            key: 'action',
            fixed: isMobile ? undefined : 'right',
            width: 120,
            render: (_, record) => (
                <Space size="small">
                    <Tooltip title={record.status === 'ReconcilePending' ? '仅查询上游状态，不会重新提交订单' : '从上游实时获取更新状态'}>
                        <Button 
                            type="dashed" 
                            size="small" 
                            icon={<SyncOutlined />} 
                            onClick={() => handleRefreshStatus([record.tradeNo])}
                            disabled={record.status === 'Submitting'}
                        >
                            刷新
                        </Button>
                    </Tooltip>
                    <Tooltip title={record.isHidden ? "显示在小程序订单列表" : "隐藏此订单"}>
                        <Button 
                            type="text" 
                            size="small" 
                            icon={record.isHidden ? <EyeOutlined /> : <EyeInvisibleOutlined />} 
                            onClick={() => handleToggleVisibility(record)}
                            aria-label={record.isHidden ? '在小程序显示订单' : '在小程序隐藏订单'}
                        />
                    </Tooltip>
                    <Tooltip title="编辑订单信息">
                        <Button 
                            type="text" 
                            size="small" 
                            icon={<EditOutlined />} 
                            onClick={() => openEditModal(record)}
                            aria-label="编辑订单"
                        />
                    </Tooltip>
                    <Button 
                        type="text" 
                        danger 
                        size="small" 
                        icon={<DeleteOutlined />} 
                        onClick={() => handleDelete(record.tradeNo)}
                    />
                </Space>
            ),
        },
    ];

    const { Text } = Typography;

    return (
        <Card 
            title={
                <Space>
                    <FileTextOutlined style={{ color: '#4A7CF7' }}/>
                        <span style={{ fontWeight: 'bold' }}>订单</span>
                </Space>
            } 
            bordered={false} 
            className="fade-in"
            style={{ borderRadius: 12, boxShadow: 'var(--card-shadow)', margin: isMobile ? '0 -10px' : '0' }}
        >
            <div style={{ marginBottom: 20, display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                <Input 
                    placeholder="搜索账号或学号"
                    prefix={<SearchOutlined style={{ color: '#A3AED0', marginRight: 8 }} />}
                    onChange={(e) => handleSearch(e.target.value, 'account')}
                    style={{ 
                        flex: '1 1 200px', 
                        maxWidth: isMobile ? '100%' : 260,
                        border: 'none',
                        boxShadow: 'var(--card-shadow)',
                        background: 'var(--component-bg)',
                        borderRadius: 30
                    }} 
                    allowClear
                />
                <Input 
                    placeholder="搜索订单号"
                    prefix={<SearchOutlined style={{ color: '#A3AED0', marginRight: 8 }} />}
                    onChange={(e) => handleSearch(e.target.value, 'tradeNo')}
                    style={{ 
                        flex: '1 1 200px', 
                        maxWidth: isMobile ? '100%' : 280,
                        border: 'none',
                        boxShadow: 'var(--card-shadow)',
                        background: 'var(--component-bg)',
                        borderRadius: 30
                    }} 
                    allowClear
                />
                <Select
                    placeholder="全部状态"
                    style={{ flex: '1 1 120px', maxWidth: isMobile ? 'calc(50% - 6px)' : 140 }}
                    allowClear
                    onChange={(val) => handleSearch(val || '', 'status')}
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
                
                <Button 
                    type="primary" 
                    icon={<SyncOutlined />} 
                    loading={refreshing}
                    onClick={() => handleRefreshStatus()}
                    disabled={selectedRowKeys.length === 0}
                    style={{ flex: isMobile ? '1 1 calc(50% - 6px)' : 'none' }}
                >
                    刷新进度 ({selectedRowKeys.length})
                </Button>

                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={openCreateModal}
                    block={isMobile}
                    style={{ background: '#722ED1', borderColor: '#722ED1', flex: isMobile ? '1 1 100%' : 'none' }}
                >
                    添加订单
                </Button>
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
                    }}
                    onChange={handleTableChange}
                />
            ) : (
                <div style={{ paddingBottom: 20 }}>
                    <List
                        loading={loading}
                        itemLayout="vertical"
                        dataSource={orders}
                        pagination={{
                            current: query.page,
                            pageSize: query.limit,
                            total: total,
                            simple: true,
                            onChange: (page, pageSize) => {
                                handleTableChange({ current: page, pageSize });
                            }
                        }}
                        renderItem={(record) => (
                            <Card 
                                size="small" 
                                style={{ marginBottom: 16, borderRadius: 12, border: '1px solid var(--border-color)' }}
                                bodyStyle={{ padding: 12 }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                                    <div style={{ flex: 1, marginRight: 8 }}>
                                        <div style={{ fontWeight: 'bold', color: 'var(--text-primary)', fontSize: 15, marginBottom: 4 }}>
                                            {record.courseName || (record.isManual ? '待刷新同步...' : '未知课程')}
                                        </div>
                                        <Space size={4} wrap>
                                            <Tag color="purple" style={{ fontSize: 10, margin: 0 }}>{record.platformName || record.platformCode}</Tag>
                                            {record.school && <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>{record.school}</Tag>}
                                            {record.isManual && <Tag color="cyan" style={{ fontSize: 10, margin: 0 }}>录入</Tag>}
                                        </Space>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        {getStatusTag(record.status, record.statusText)}
                                    </div>
                                </div>

                                <div style={{ background: 'var(--bg-color)', padding: '10px', borderRadius: 8, marginBottom: 12 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <Text type="secondary" style={{ fontSize: 12 }}>授权账号</Text>
                                        <Text strong style={{ fontSize: 13 }}>{record.account}</Text>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <Text type="secondary" style={{ fontSize: 12 }}>当前进度</Text>
                                        <Text style={{ color: '#52c41a', fontWeight: 'bold' }}>{record.progress}</Text>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Text type="secondary" style={{ fontSize: 12 }}>内部单号</Text>
                                        <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>{record.tradeNo.slice(-8)} (末8位)</Text>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                        {new Date(record.createTime).toLocaleDateString()} 下单
                                    </Text>
                                    <Space>
                                        <Button 
                                            size="small" 
                                            icon={<SyncOutlined />} 
                                            onClick={() => handleRefreshStatus([record.tradeNo])}
                                            disabled={record.status === 'Submitting'}
                                        >
                                            刷新
                                        </Button>
                                        <Button 
                                            size="small" 
                                            icon={<EditOutlined />} 
                                            onClick={() => openEditModal(record)}
                                            aria-label="编辑订单"
                                        />
                                        <Button 
                                            size="small" 
                                            danger 
                                            icon={<DeleteOutlined />} 
                                            onClick={() => handleDelete(record.tradeNo)}
                                            aria-label="删除订单"
                                        />
                                    </Space>
                                </div>
                            </Card>
                        )}
                    />
                </div>
            )}

            {/* ===== 新建/编辑订单弹窗 ===== */}
            <Modal
                title={
                    <Space style={{ fontSize: 16, fontWeight: 700 }}>
                        {editingOrder ? <EditOutlined style={{ color: '#4A7CF7' }} /> : <PlusOutlined style={{ color: '#722ED1' }} />}
                        <span>{editingOrder ? '修改订单' : '添加订单'}</span>
                    </Space>
                }
                open={createModalOpen}
                onCancel={() => { setCreateModalOpen(false); setEditingOrder(null); }}
                onOk={handleSubmitOrder}
                confirmLoading={createLoading}
                okText={editingOrder ? '保存' : '添加'}
                cancelText="取消"
                width={isMobile ? '94%' : 680}
                style={{ top: isMobile ? 12 : 50, borderRadius: 20 }}
                styles={{ body: { maxHeight: '70vh', overflowY: 'auto', padding: '16px 8px 8px 8px' } }}
                destroyOnClose
            >
                <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
                    {editingOrder 
                        ? `正在编辑订单：${editingOrder.tradeNo}。修改完成后点击保存立即生效。` 
                        : '把其他渠道的订单添加进来，方便统一查看和刷新进度。'
                    }
                    {!editingOrder && (
                        <div style={{
                            marginTop: 10,
                            padding: '12px 16px',
                            background: 'linear-gradient(135deg, rgba(254, 249, 195, 0.6) 0%, rgba(254, 243, 199, 0.6) 100%)',
                            borderLeft: '4px solid #f59e0b',
                            borderRadius: 12,
                            boxShadow: '0 4px 12px rgba(245, 158, 11, 0.05)',
                            color: '#b45309',
                            fontSize: 12,
                            lineHeight: 1.5
                        }}>
                            <span style={{ fontWeight: 700 }}>提示：</span>
                            填好登录账号和平台订单号后，保存并点击“刷新”，系统会自动更新课程和进度。
                        </div>
                    )}
                </div>
                <Form form={createForm} layout="vertical" requiredMark="optional">
                    <Divider orientation="left" plain style={{ fontSize: 12, color: '#722ED1', fontWeight: 600 }}>需要填写</Divider>
                    
                    <Row gutter={16}>
                        <Col xs={24} sm={12}>
                            <Form.Item 
                                name="account" 
                                label={<span style={{ fontWeight: 600, fontSize: 12 }}>登录账号（学号或手机号）</span>}
                                rules={[{ required: true, message: '请输入账号' }]}
                            >
                                <Input placeholder="请输入登录账号" style={{ borderRadius: 8 }} />
                            </Form.Item>
                        </Col>
                        
                        <Col xs={24} sm={12}>
                            <Form.Item 
                                name="password" 
                                label={<span style={{ fontWeight: 600, fontSize: 12 }}>登录密码</span>} 
                                rules={editingOrder ? [] : [{ required: true, message: '请输入密码' }]}
                            >
                                <Input.Password placeholder={editingOrder ? "留空则不修改密码" : "请输入登录密码"} visibilityToggle style={{ borderRadius: 8 }} />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col xs={24} sm={12}>
                            <Form.Item 
                                name="categoryId" 
                                label={<span style={{ fontWeight: 600, fontSize: 12 }}>平台</span>}
                                rules={[{ required: true, message: '请选择平台分类' }]}
                            >
                                <Select 
                                    placeholder="请选择平台"
                                    showSearch
                                    optionFilterProp="children"
                                    style={{ width: '100%' }}
                                    dropdownStyle={{ borderRadius: 12 }}
                                >
                                    {categories.map(cat => (
                                        <Option key={cat._id} value={cat._id}>
                                            {cat.name}
                                        </Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>

                        <Col xs={24} sm={12}>
                            <Form.Item 
                                name="remoteOid" 
                                label={<span style={{ fontWeight: 600, fontSize: 12 }}>平台订单号</span>}
                                tooltip="用于自动刷新进度的平台订单编号"
                            >
                                <Input placeholder="例如: 578050" style={{ borderRadius: 8 }} />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Divider orientation="left" plain style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>其他信息（一般不用填）</Divider>

                    <Row gutter={16}>
                        <Col xs={24} sm={12}>
                            <Form.Item 
                                name="remoteOrderId" 
                                label={<span style={{ fontWeight: 600, fontSize: 12 }}>平台流水号</span>}
                                tooltip="平台返回的另一种订单编号，可不填"
                            >
                                <Input placeholder="可不填" style={{ borderRadius: 8 }} />
                            </Form.Item>
                        </Col>

                        <Col xs={24} sm={12}>
                            <Form.Item 
                                name="courseId" 
                                label={<span style={{ fontWeight: 600, fontSize: 12 }}>课程编号</span>}
                            >
                                <Input placeholder="可不填" style={{ borderRadius: 8 }} />
                            </Form.Item>
                        </Col>
                    </Row>
                    
                    <Row gutter={16}>
                        <Col xs={24} sm={12}>
                            <Form.Item name="courseName" label={<span style={{ fontWeight: 600, fontSize: 12 }}>课程名称</span>}>
                                <Input placeholder="不填会自动获取" style={{ borderRadius: 8 }} />
                            </Form.Item>
                        </Col>

                        <Col xs={24} sm={12}>
                            <Form.Item name="school" label={<span style={{ fontWeight: 600, fontSize: 12 }}>学校</span>}>
                                <Input placeholder="不填会自动获取" style={{ borderRadius: 8 }} />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col xs={24} sm={12}>
                            <Form.Item name="userId" label={<span style={{ fontWeight: 600, fontSize: 12 }}>关联用户</span>}>
                                <Input placeholder="不填则归到当前账号" style={{ borderRadius: 8 }} />
                            </Form.Item>
                        </Col>

                        <Col xs={24} sm={12}>
                            <Form.Item name="status" label={<span style={{ fontWeight: 600, fontSize: 12 }}>订单状态</span>} initialValue="Processing">
                                <Select dropdownStyle={{ borderRadius: 12 }}>
                                    <Option value="Pending" disabled>待处理</Option>
                                    <Option value="Submitting" disabled>提交中</Option>
                                    <Option value="Processing">进行中 (Processing)</Option>
                                    <Option value="Completed">已完成 (Completed)</Option>
                                    <Option value="Failed">失败</Option>
                                    <Option value="ReconcilePending" disabled>需要确认</Option>
                                    <Option value="Unknown" disabled>状态未知</Option>
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item name="remarks" label={<span style={{ fontWeight: 600, fontSize: 12 }}>备注</span>}>
                        <Input.TextArea rows={2} placeholder="可不填" style={{ borderRadius: 8 }} />
                    </Form.Item>

                    <Form.Item name="isHidden" valuePropName="checked" style={{ marginBottom: 0 }}>
                        <Space style={{ display: 'flex', width: '100%', padding: '10px 12px', background: 'var(--bg-color)', borderRadius: 10 }}>
                            <Switch size="small" /> 
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>不在用户端显示这笔订单</span>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            {/* ===== 删除订单二次确认弹窗 (完全居中、高度对称美化版) ===== */}
            <Modal
                open={deleteModalOpen}
                onCancel={() => setDeleteModalOpen(false)}
                footer={null}
                width={isMobile ? '90%' : 400}
                centered
                destroyOnClose
                styles={{
                    content: {
                        borderRadius: 20,
                        padding: '32px 24px 24px 24px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                        background: 'var(--component-bg)'
                    }
                }}
            >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                    {/* 警示图标 */}
                    <div style={{
                        width: 56,
                        height: 56,
                        borderRadius: '50%',
                        backgroundColor: 'rgba(255, 77, 79, 0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 16
                    }}>
                        <WarningOutlined style={{ fontSize: 26, color: '#ff4d4f' }} />
                    </div>

                    {/* 居中标题 */}
                    <Typography.Title level={5} style={{ margin: '0 0 12px 0', fontWeight: 700, color: 'var(--text-primary)', fontSize: 16 }}>
                        确定要删除此订单吗？
                    </Typography.Title>

                    {/* 精致且高显眼的渐变色警告卡片 */}
                    <div style={{
                        width: '100%',
                        padding: '12px 14px',
                        background: 'linear-gradient(135deg, rgba(255, 77, 79, 0.03) 0%, rgba(255, 77, 79, 0.07) 100%)',
                        border: '1px solid rgba(255, 77, 79, 0.12)',
                        borderRadius: 12,
                        marginBottom: 16,
                        textAlign: 'left'
                    }}>
                        <div style={{ color: '#ff4d4f', fontWeight: 700, fontSize: 12, marginBottom: 4 }}>
                            ⚠️ 删除后不能恢复
                        </div>
                        <div style={{ color: '#ff4d4f', fontSize: 11, lineHeight: 1.5 }}>
                            这笔订单记录会被删除，用户端也无法再查询。
                        </div>
                    </div>

                    {/* 建议 */}
                    <Typography.Text type="secondary" style={{ fontSize: 11, lineHeight: 1.5, marginBottom: 24, display: 'block', padding: '0 4px' }}>
                        如果只是退单，建议把状态改为“已取消”，这样还能保留记录。
                    </Typography.Text>

                    {/* 完美对称的按钮 */}
                    <div style={{ display: 'flex', gap: 12, width: '100%' }}>
                        <Button 
                            onClick={() => setDeleteModalOpen(false)}
                            style={{ 
                                flex: 1, 
                                height: 38, 
                                borderRadius: 8,
                                fontWeight: 600,
                                border: '1px solid var(--border-color)',
                                color: 'var(--text-secondary)'
                            }}
                        >
                            取消
                        </Button>
                        <Button 
                            type="primary" 
                            danger 
                            loading={deleteLoading}
                            onClick={handleConfirmDelete}
                            style={{ 
                                flex: 1, 
                                height: 38, 
                                borderRadius: 8,
                                fontWeight: 600,
                                boxShadow: '0 4px 12px rgba(255, 77, 79, 0.15)'
                            }}
                        >
                            确认删除
                        </Button>
                    </div>
                </div>
            </Modal>
        </Card>
    );
};

export default CourseOrders;
