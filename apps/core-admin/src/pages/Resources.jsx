import React, { useState, useEffect } from 'react';
import { Card, Tabs, Table, Button, Space, Modal, Form, Input, Switch, message, Popconfirm, List, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import api from '../utils/api';
import useIsMobile from '../hooks/useIsMobile';

const Resources = () => {
    const isMobile = useIsMobile();
    const [loading, setLoading] = useState(false);
    const [_saving, setSaving] = useState(false);
    const [globalConfig, setGlobalConfig] = useState({
        apiServers: [],
        images: [],
        cdns: [],
        constants: []
    });

    // Modals state
    const [modalVisible, setModalVisible] = useState(false);
    const [currentTab, setCurrentTab] = useState('apiServers');
    const [editingRecord, setEditingRecord] = useState(null);
    const [form] = Form.useForm();

    useEffect(() => {
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        setLoading(true);
        try {
            const res = await api.get('/resources/global');
            if (res.data.success) {
                setGlobalConfig({
                    apiServers: res.data.result?.apiServers || [],
                    images: res.data.result?.images || [],
                    cdns: res.data.result?.cdns || [],
                    constants: res.data.result?.constants || []
                });
            } else {
                message.error('加载全局配置失败');
            }
        } catch {
            message.error('加载全局配置失败');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveAndSync = async (newConfig) => {
        setSaving(true);
        try {
            const res = await api.post('/resources/global', newConfig || globalConfig);
            if (res.data.success) {
                message.success('配置已更新下发');
                if (newConfig) {
                    setGlobalConfig(newConfig);
                }
            } else {
                message.error('保存失败: ' + (res.data.error || '未知错误'));
            }
        } catch {
            message.error('保存失败');
        } finally {
            setSaving(false);
        }
    };

    const handleAdd = () => {
        setEditingRecord(null);
        form.resetFields();
        setModalVisible(true);
    };

    const handleEdit = (record, index) => {
        setEditingRecord({ ...record, _index: index });
        form.setFieldsValue(record);
        setModalVisible(true);
    };

    const handleDelete = (index) => {
        const newList = [...globalConfig[currentTab]];
        newList.splice(index, 1);
        const newConfig = { ...globalConfig, [currentTab]: newList };
        handleSaveAndSync(newConfig);
    };

    const handleModalOk = async () => {
        try {
            const values = await form.validateFields();
            const newList = [...globalConfig[currentTab]];
            if (editingRecord) {
                newList[editingRecord._index] = values;
            } else {
                newList.push(values);
            }
            const newConfig = { ...globalConfig, [currentTab]: newList };
            setModalVisible(false);
            handleSaveAndSync(newConfig);
        } catch {
            // Validate failed
        }
    };

    const toggleSwitch = (index, field, checked) => {
        const newList = [...globalConfig[currentTab]];
        newList[index][field] = checked;
        const newConfig = { ...globalConfig, [currentTab]: newList };
        handleSaveAndSync(newConfig);
    };

    // Columns configurations
    const apiServersCols = [
        { title: '名称', dataIndex: 'name', key: 'name' },
        { title: 'URL/域名', dataIndex: 'url', key: 'url' },
        { 
            title: '状态', 
            dataIndex: 'isActive', 
            key: 'isActive', 
            render: (text, record, index) => (
                <Switch checked={text} onChange={(val) => toggleSwitch(index, 'isActive', val)} />
            ) 
        },
        {
            title: '操作',
            key: 'action',
            render: (_, record, index) => (
                <Space>
                    <Button type="link" onClick={() => handleEdit(record, index)}><EditOutlined /></Button>
                    <Popconfirm title="确定删除?" onConfirm={() => handleDelete(index)}>
                        <Button type="link" danger><DeleteOutlined /></Button>
                    </Popconfirm>
                </Space>
            )
        }
    ];

    const imagesCols = [
        { title: '键值 (Key)', dataIndex: 'key', key: 'key' },
        { title: '图片 URL', dataIndex: 'url', key: 'url', render: (text) => <a href={text} target="_blank" rel="noreferrer">预览</a> },
        { title: '说明', dataIndex: 'description', key: 'description' },
        {
            title: '操作',
            key: 'action',
            render: (_, record, index) => (
                <Space>
                    <Button type="link" onClick={() => handleEdit(record, index)}><EditOutlined /></Button>
                    <Popconfirm title="确定删除?" onConfirm={() => handleDelete(index)}>
                        <Button type="link" danger><DeleteOutlined /></Button>
                    </Popconfirm>
                </Space>
            )
        }
    ];

    const cdnCols = [
        { title: 'CDN 名称', dataIndex: 'name', key: 'name' },
        { title: '加速域名', dataIndex: 'url', key: 'url' },
        { 
            title: '启用', 
            dataIndex: 'isActive', 
            key: 'isActive', 
            render: (text, record, index) => (
                <Switch checked={text} onChange={(val) => toggleSwitch(index, 'isActive', val)} />
            ) 
        },
        {
            title: '操作',
            key: 'action',
            render: (_, record, index) => (
                <Space>
                    <Button type="link" onClick={() => handleEdit(record, index)}><EditOutlined /></Button>
                    <Popconfirm title="确定删除?" onConfirm={() => handleDelete(index)}>
                        <Button type="link" danger><DeleteOutlined /></Button>
                    </Popconfirm>
                </Space>
            )
        }
    ];

    const constantsCols = [
        { title: '常量键', dataIndex: 'key', key: 'key' },
        { title: '常量值', dataIndex: 'value', key: 'value' },
        { title: '描述', dataIndex: 'description', key: 'description' },
        {
            title: '操作',
            key: 'action',
            render: (_, record, index) => (
                <Space>
                    <Button type="link" onClick={() => handleEdit(record, index)}><EditOutlined /></Button>
                    <Popconfirm title="确定删除?" onConfirm={() => handleDelete(index)}>
                        <Button type="link" danger><DeleteOutlined /></Button>
                    </Popconfirm>
                </Space>
            )
        }
    ];

    const renderModalForm = () => {
        if (currentTab === 'apiServers') {
            return (
                <Form form={form} layout="vertical">
                    <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input placeholder="例如：主接口" /></Form.Item>
                    <Form.Item name="url" label="URL/域名" rules={[{ required: true }]}><Input placeholder="例如：https://api.example.com" /></Form.Item>
                    <Form.Item name="isActive" label="是否开启" valuePropName="checked" initialValue={true}><Switch /></Form.Item>
                </Form>
            );
        } else if (currentTab === 'images') {
            return (
                <Form form={form} layout="vertical">
                    <Form.Item name="key" label="键值" rules={[{ required: true }]}><Input placeholder="例如：home_banner" /></Form.Item>
                    <Form.Item name="url" label="图片 URL" rules={[{ required: true }]}><Input placeholder="图片外链" /></Form.Item>
                    <Form.Item name="description" label="说明"><Input.TextArea placeholder="用处说明" /></Form.Item>
                </Form>
            );
        } else if (currentTab === 'cdns') {
            return (
                <Form form={form} layout="vertical">
                    <Form.Item name="name" label="CDN 名称" rules={[{ required: true }]}><Input placeholder="例如：前端静态资源" /></Form.Item>
                    <Form.Item name="url" label="加速域名" rules={[{ required: true }]}><Input placeholder="例如：https://cdn.example.com" /></Form.Item>
                    <Form.Item name="isActive" label="是否启用" valuePropName="checked" initialValue={true}><Switch /></Form.Item>
                </Form>
            );
        } else if (currentTab === 'constants') {
            return (
                <Form form={form} layout="vertical">
                    <Form.Item name="key" label="常量键" rules={[{ required: true }]}><Input placeholder="例如：MAX_RETRY_COUNT" /></Form.Item>
                    <Form.Item name="value" label="常量值" rules={[{ required: true }]}><Input placeholder="例如：5 (支持字符串/JSON格式自行控制)" /></Form.Item>
                    <Form.Item name="description" label="描述"><Input.TextArea placeholder="变量用途" /></Form.Item>
                </Form>
            );
        }
    };

    const getTabName = () => {
        switch(currentTab) {
            case 'apiServers': return 'API 服务配置';
            case 'images': return '公共图片配置';
            case 'cdns': return 'CDN 配置';
            case 'constants': return '静态常量配置';
            default: return '配置';
        }
    };

    const renderMobileList = (data, type) => {
        return (
            <List
                dataSource={data}
                renderItem={(item, index) => (
                    <Card
                        size="small"
                        style={{ marginBottom: 12, borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                        bodyStyle={{ padding: '16px' }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <div style={{ fontWeight: 'bold', fontSize: 16 }}>{item.name || item.key}</div>
                            {type !== 'images' && type !== 'constants' && (
                                <Switch size="small" checked={item.isActive} onChange={(val) => toggleSwitch(index, 'isActive', val)} />
                            )}
                        </div>
                        <div style={{ fontSize: 14, color: '#666', marginBottom: 12, wordBreak: 'break-all', background: 'var(--bg-color)', padding: '8px 12px', borderRadius: 8 }}>
                            {item.url || item.value || <span style={{ color: '#ccc' }}>无内容</span>}
                        </div>
                        {item.description && (
                            <div style={{ fontSize: 12, color: '#999', marginBottom: 16 }}>
                                {item.description}
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f0f0f0', paddingTop: 12, marginTop: 4 }}>
                            {type === 'images' && item.url ? <a href={item.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, background: '#e6f4ff', padding: '4px 12px', borderRadius: 12 }}>预览图片</a> : <span />}
                            <Space>
                                <Button size="small" type="primary" ghost icon={<EditOutlined />} onClick={() => handleEdit(item, index)}>编辑</Button>
                                <Popconfirm title="确定删除?" onConfirm={() => handleDelete(index)}>
                                    <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                                </Popconfirm>
                            </Space>
                        </div>
                    </Card>
                )}
            />
        );
    };

    return (
        <Card 
            title="全局应用资源配置池" 
            extra={!isMobile && (
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增{getTabName().replace('配置','')}</Button>
            )} 
            bordered={false} 
            style={{ borderRadius: 20, border: 'none', boxShadow: 'var(--card-shadow)', minHeight: '80vh', margin: isMobile ? '0 -10px' : '0' }}
        >
            {isMobile && (
                <div style={{ marginBottom: 16 }}>
                    <Button type="primary" block icon={<PlusOutlined />} onClick={handleAdd}>新增{getTabName().replace('配置','')}</Button>
                </div>
            )}
            
            <Tabs defaultActiveKey="apiServers" type="card" onChange={key => setCurrentTab(key)}>
                <Tabs.TabPane tab="接口路由" key="apiServers">
                    {isMobile ? renderMobileList(globalConfig.apiServers, 'apiServers') : <Table dataSource={globalConfig.apiServers} columns={apiServersCols} rowKey="url" pagination={false} loading={loading} scroll={{ x: 600 }} />}
                </Tabs.TabPane>
                <Tabs.TabPane tab="公共图片" key="images">
                    {isMobile ? renderMobileList(globalConfig.images, 'images') : <Table dataSource={globalConfig.images} columns={imagesCols} rowKey="key" pagination={false} loading={loading} scroll={{ x: 600 }} />}
                </Tabs.TabPane>
                <Tabs.TabPane tab="CDN 节点" key="cdns">
                    {isMobile ? renderMobileList(globalConfig.cdns, 'cdns') : <Table dataSource={globalConfig.cdns} columns={cdnCols} rowKey="url" pagination={false} loading={loading} scroll={{ x: 600 }} />}
                </Tabs.TabPane>
                <Tabs.TabPane tab="静态常量" key="constants">
                    {isMobile ? renderMobileList(globalConfig.constants, 'constants') : <Table dataSource={globalConfig.constants} columns={constantsCols} rowKey="key" pagination={false} loading={loading} scroll={{ x: 600 }} />}
                </Tabs.TabPane>
            </Tabs>

            <Modal 
                title={editingRecord ? `编辑${getTabName().replace('配置','')}` : `新增${getTabName().replace('配置','')}`}
                open={modalVisible} 
                onOk={handleModalOk} 
                onCancel={() => setModalVisible(false)}
                okText="确认"
                cancelText="取消"
            >
                {renderModalForm()}
            </Modal>
        </Card>
    );
};

export default Resources;
