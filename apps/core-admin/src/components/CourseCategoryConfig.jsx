import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Space, Modal, Form, Input, Select, Switch, Typography, Popconfirm, Tag, InputNumber, Row, Col, Card, List } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, FileSyncOutlined, AppstoreOutlined } from '@ant-design/icons';
import api from '../utils/api';
import useIsMobile from '../hooks/useIsMobile';
import { message } from '../utils/feedback';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const CourseCategoryConfig = () => {
    const isMobile = useIsMobile();
    const isTablet = window.innerWidth <= 1024;
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
            width: 80,
            align: 'center'
        },
        {
            title: '平台名字',
            dataIndex: 'name',
            render: (text) => <Text strong style={{ color: '#4A7CF7' }}>{text}</Text>
        },
        {
            title: '查询接口 (代号)',
            dataIndex: 'getnoun',
            render: (text, record) => (
                <Space direction="vertical" size={0}>
                    <Text type="secondary" style={{fontSize: 12}}>通道: {record.queryplat || '自营'}</Text>
                    <Tag color="cyan">查: {text}</Tag>
                </Space>
            )
        },
        {
            title: '交单接口 (代号)',
            dataIndex: 'noun',
            render: (text, record) => (
                <Space direction="vertical" size={0}>
                    <Text type="secondary" style={{fontSize: 12}}>通道: {record.docking || '自营'}</Text>
                    <Tag color="blue">交: {text}</Tag>
                </Space>
            )
        },
        {
            title: '免查课',
            dataIndex: 'nock',
            render: (val) => val === 1 ? <Tag color="orange">是的</Tag> : '-'
        },
        {
            title: '状态',
            dataIndex: 'status',
            render: (val) => val === 1 ? <Tag color="success">上架中</Tag> : <Tag color="default">已下架</Tag>
        },
        {
            title: '创建时间',
            dataIndex: 'createdAt',
            render: (val) => new Date(val).toLocaleDateString()
        },
        {
            title: '操作',
            key: 'action',
            render: (_, record) => (
                <Space size="middle">
                    <Button type="primary" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
                    <Popconfirm title="确定要删除此分类吗？" onConfirm={() => handleDelete(record._id)}>
                        <Button type="primary" danger size="small" icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                </Space>
            ),
            align: 'right'
        },
    ];

    return (
        <Card 
            title={
                <Space>
                    <AppstoreOutlined style={{ color: '#4A7CF7' }}/>
                    <span style={{ fontWeight: 'bold', fontSize: isMobile ? 15 : 16 }}>网课分类配置</span>
                    {!isMobile && <span style={{ fontSize: 13, color: 'var(--text-tertiary)', fontWeight: 'normal' }}>(小程序前端可用列表)</span>}
                </Space>
            } 
            extra={!isMobile && (
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                    添加平台
                </Button>
            )}
            bordered={false} 
            style={{ borderRadius: 12, boxShadow: 'var(--card-shadow)', margin: 0 }}
            headStyle={{ paddingBottom: isMobile ? 8 : 16 }}
        >
            <div style={{ marginBottom: 16 }}>
                <Text type="secondary" style={{ fontSize: 13 }}>用于配置在小程序中给用户展现的网课列表分类及其对应的后端通道查课下单标识参数等。</Text>
            </div>

            {isMobile || isTablet ? (
                <div style={{ paddingBottom: 16 }}>
                    {isMobile && (
                        <Button type="primary" block icon={<PlusOutlined />} onClick={handleAdd} style={{ marginBottom: 16, borderRadius: 8 }}>
                            添加网课分类
                        </Button>
                    )}
                    <List
                        dataSource={categories}
                        loading={loading}
                        renderItem={item => (
                            <Card size="small" style={{ marginBottom: 12, borderRadius: 12, border: '1px solid var(--border-color)' }} bodyStyle={{ padding: 12 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                                    <div style={{ fontWeight: 'bold', color: '#4A7CF7', fontSize: 14 }}>{item.name}</div>
                                    <Tag color={item.status === 1 ? 'success' : 'default'} style={{ margin: 0 }}>
                                        {item.status === 1 ? '上架中' : '已下架'}
                                    </Tag>
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                                        <Tag color="cyan" style={{ margin: 0 }}>查: {item.getnoun} ({item.queryplat || '自营'})</Tag>
                                        <Tag color="blue" style={{ margin: 0 }}>交: {item.noun} ({item.docking || '自营'})</Tag>
                                    </div>
                                    <div style={{ marginTop: 4 }}>
                                        排序: {item.sort} | 定价: ¥{item.price || 0} {item.nock === 1 && <Tag color="orange" style={{ marginLeft: 6 }}>免查课</Tag>}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                    <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => handleEdit(item)}>编辑</Button>
                                    <Popconfirm title="确定要删除此分类吗？" onConfirm={() => handleDelete(item._id)}>
                                        <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                                    </Popconfirm>
                                </div>
                            </Card>
                        )}
                        pagination={{
                            current: query.page,
                            pageSize: query.limit,
                            total: total,
                            simple: true,
                            onChange: (page, pageSize) => handleTableChange({ current: page, pageSize })
                        }}
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
                        showSizeChanger: true
                    }}
                    onChange={handleTableChange}
                    style={{ borderRadius: 12, overflow: 'hidden' }}
                />
            )}

            <Modal
                title={editingId ? '编辑平台网课' : '添加平台网课'}
                open={isModalVisible}
                onOk={handleModalOk}
                onCancel={() => setIsModalVisible(false)}
                width={700}
                style={{ top: 20 }}
                destroyOnClose
            >
                <Form
                    form={form}
                    layout="vertical"
                    style={{ marginTop: 8 }}
                >
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
                                <Input placeholder="0为不锁死" />
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
                            <Option value={1}>是 (直接下单无选课)</Option>
                            <Option value={0}>否 (需要先查询课程表)</Option>
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
        </Card>
    );
};

export default CourseCategoryConfig;
