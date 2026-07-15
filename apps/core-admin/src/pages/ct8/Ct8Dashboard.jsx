import React, { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Typography, Table, Tag, Space, Button, Spin, Modal, List, Badge, Tabs, Input, message, Form, Popconfirm } from 'antd';
import { CloudServerOutlined, CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, ReloadOutlined, ProfileOutlined, SettingOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import api from '../../utils/api';
import useIsMobile from '../../hooks/useIsMobile';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;

const StatCard = ({ title, value, icon, color, subText, loading }) => (
    <Card
        style={{ borderRadius: 20, border: 'none', boxShadow: 'var(--card-shadow)' }}
        bodyStyle={{ padding: '24px' }}
    >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
                <Text style={{ color: '#A3AED0', fontSize: 14, fontWeight: 500 }}>{title}</Text>
                <div style={{ marginTop: 8 }}>
                    {loading ? <Spin size="small" /> : <span style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</span>}
                </div>
                {subText && <Text style={{ color: '#A3AED0', fontSize: 12, marginTop: 4, display: 'block' }}>{subText}</Text>}
            </div>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: `linear-gradient(135deg, ${color}20 0%, ${color}40 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {React.cloneElement(icon, { style: { fontSize: 24, color } })}
            </div>
        </div>
    </Card>
);

const Ct8Dashboard = () => {
    const isMobile = useIsMobile();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [runs, setRuns] = useState([]);
    const [chartData, setChartData] = useState([]);
    const [pagination, setPagination] = useState({ current: 1, pageSize: 15, total: 0 });

    const [detailsModalVisible, setDetailsModalVisible] = useState(false);
    const [currentRunDetails, setCurrentRunDetails] = useState(null);
    const [detailsLoading, setDetailsLoading] = useState(false);

    // 策略管理状态
    const [secretConfig, setSecretConfig] = useState('');
    const [secretItems, setSecretItems] = useState([]);
    const [secretLoading, setSecretLoading] = useState(false);
    const [newPolicy, setNewPolicy] = useState('');

    const fetchDashboard = useCallback(async () => {
        setLoading(true);
        try {
            const [statsRes, runsRes] = await Promise.all([
                api.get('/ct8/stats'),
                api.get(`/github/status?limit=${pagination.pageSize}`)
            ]);

            if (statsRes.data.success) {
                setStats(statsRes.data.stats);
            }
            if (runsRes.data.success) {
                const historyRuns = runsRes.data.data.runs;
                setRuns(historyRuns);
                setPagination(prev => ({ ...prev, total: runsRes.data.data.total }));

                // 组装折线图数据 - 反转顺序以展现时间轴顺序 (旧 -> 新)
                const cData = [...historyRuns].reverse().map(r => ({
                    time: dayjs(r.start_time).format('MM-DD HH:mm'),
                    success: r.stats?.success || 0,
                    failed: r.stats?.failed || 0,
                    total: r.stats?.total || 0,
                    duration: (new Date(r.end_time).getTime() - new Date(r.start_time).getTime()) / 1000 || 0
                }));
                setChartData(cData);
            }
        } catch (error) {
            console.error('获取 CT8 面板数据失败:', error);
        } finally {
            setLoading(false);
        }
    }, [pagination.pageSize]);

    const loadSecretConfig = useCallback(async () => {
        setSecretLoading(true);
        try {
            // 获取代理节点配置池 Secret (USERS_LIST)
            const res = await api.post('/github/secret/cache', { action: 'get', secret_name: 'USERS_LIST' });
            if (res.data.ok) {
                const val = res.data.data.value || '';
                setSecretConfig(val);
                parseSecretInput(val);
            }
        } catch (error) {
            // 如果 404 就当空
            if (error.response?.status !== 404) {
                console.error(error);
            }
        } finally {
            setSecretLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDashboard();
        loadSecretConfig();
    }, [fetchDashboard, loadSecretConfig]);

    const handleTrigger = async (inputs = null) => {
        Modal.confirm({
            title: inputs ? '确认发起特定重试执行？' : '确认触发全局执行？',
            content: inputs ? `正在申请对特定的失控节点发起重连调度。` : '这将会向 GitHub 发送 Dispatch 调度请求，对外部 CT8 集群节点进行状态重测并续期。执行可能需要一两分钟的时间。',
            okText: '确认触发',
            cancelText: '取消',
            onOk: async () => {
                setLoading(true);
                try {
                    const payload = inputs ? { inputs } : {};
                    const res = await api.post('/github/trigger', payload);
                    if (res.data.ok) {
                        message.success('已成功下发调度指令！正在队列中执行...');
                        if (detailsModalVisible) setDetailsModalVisible(false);
                        setTimeout(fetchDashboard, 4000); 
                    } else {
                        message.error('触发失败');
                        setLoading(false);
                    }
                } catch (error) {
                    message.error(error.response?.data?.message || '触发接口请求失败');
                    setLoading(false);
                }
            }
        });
    };

    const handleRunClick = async (runId) => {
        setDetailsModalVisible(true);
        setDetailsLoading(true);
        setCurrentRunDetails(null);
        try {
            const res = await api.get(`/github/status?run_id=${runId}`);
            if (res.data.success) {
                setCurrentRunDetails(res.data.data);
            }
        } catch (error) {
            console.error('获取执行细节失败:', error);
        } finally {
            setDetailsLoading(false);
        }
    };

    const parseSecretInput = (str) => {
        const items = str.split(',').map(s => s.trim()).filter(s => s.length > 0);
        setSecretItems(items);
    };

    const handleSaveSecrets = async (newVal) => {
        setSecretLoading(true);
        try {
            const res = await api.post('/github/secret/update', { action: 'update', secret_name: 'USERS_LIST', value: newVal });
            if (res.data.ok) {
                message.success('代理调度策略已更新！将即时同步至集群');
                setSecretConfig(newVal);
                parseSecretInput(newVal);
                
                // 再尝试更新本地 Cache
                await api.post('/github/secret/cache', { action: 'set', secret_name: 'USERS_LIST', secret_value: newVal, updated_by: 'admin' });
            } else {
                message.error('策略更新失败');
            }
        } catch (error) {
            message.error(error.response?.data?.message || '网络请求失败');
        } finally {
            setSecretLoading(false);
        }
    };

    const handleAppendPolicy = () => {
        if (!newPolicy.trim()) return message.warning('请输入新代理及签到配置');
        const nextVal = secretConfig ? `${secretConfig},${newPolicy.trim()}` : newPolicy.trim();
        handleSaveSecrets(nextVal);
        setNewPolicy('');
    };

    const handleRemovePolicy = (index) => {
        const arr = [...secretItems];
        arr.splice(index, 1);
        const nextVal = arr.join(',');
        handleSaveSecrets(nextVal);
    };

    const columns = [
        {
            title: '运行批次号',
            dataIndex: 'run_id',
            key: 'run_id',
            render: (text) => <Text style={{ fontFamily: 'monospace', color: '#4A7CF7' }}>{text.substring(0, 15)}...</Text>
        },
        {
            title: '开始时间',
            dataIndex: 'start_time',
            key: 'start_time',
            render: (val) => dayjs(val).format('MM-DD HH:mm:ss')
        },
        {
            title: '运行耗时',
            key: 'duration',
            render: (_, record) => {
                if (!record.end_time) return '-';
                const diff = dayjs(record.end_time).diff(dayjs(record.start_time), 'second');
                return diff + ' s';
            }
        },
        {
            title: '全局状态',
            dataIndex: 'status',
            key: 'status',
            render: (status) => {
                const colors = { success: 'green', failed: 'red', partial: 'orange', running: 'blue' };
                const labels = { success: '全活', failed: '崩坏', partial: '部分掉线', running: '调度中' };
                return <Tag color={colors[status] || 'default'}>{labels[status] || status}</Tag>;
            }
        },
        {
            title: '节点健康度',
            key: 'stats',
            render: (_, record) => (
                <Space size="middle">
                    <span style={{ color: '#05CD99' }}><CheckCircleOutlined /> {record.stats?.success || 0}</span>
                    <span style={{ color: '#E31A1A' }}><CloseCircleOutlined /> {record.stats?.failed || 0}</span>
                </Space>
            )
        },
        {
            title: '追溯详情',
            key: 'action',
            render: (_, record) => (
                <Button type="link" size="small" icon={<ProfileOutlined />} onClick={() => handleRunClick(record.run_id)}>
                    下钻追踪
                </Button>
            )
        }
    ];

    const RunDetailsList = () => {
        if (!currentRunDetails || !currentRunDetails.details) return null;
        return (
            <List
                dataSource={currentRunDetails.details}
                size="small"
                renderItem={(item) => (
                    <List.Item>
                        <Card style={{ width: '100%', borderRadius: 8, border: item.success ? '1px solid #e6f7ff' : '1px solid #ffebe6' }} bodyStyle={{ padding: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                                <Text strong style={{ fontSize: 15 }}>{item.user} @ {item.host}</Text>
                                <Space>
                                    {!item.success && (
                                        <Button
                                            type="primary"
                                            danger
                                            size="small"
                                            onClick={() => handleTrigger({ retry_host: item.host, retry_user: item.user })}
                                        >
                                            针对此项单独重连
                                        </Button>
                                    )}
                                    <Tag color={item.success ? 'green' : 'red'}>{item.success ? '已续命' : '执行失败 / 节点失联'}</Tag>
                                </Space>
                            </div>
                            <div style={{ fontSize: 13, color: '#666' }}>
                                <Row>
                                    <Col span={12}>目标端口: <Text code>{item.port}</Text></Col>
                                    <Col span={12}>登录探测IP: <Text code>{item.out_ip || '失败'}</Text></Col>
                                </Row>
                                <div style={{ marginTop: 8 }}>
                                    应用节点代理配置: <Text code>{item.proxy || '未配置外挂代理，直连'}</Text>
                                </div>
                                {item.expiry_text && (
                                    <div style={{ marginTop: 8, padding: 8, background: item.expiry_text.includes('Days') ? 'rgba(56, 158, 13, 0.1)' : 'rgba(207, 19, 34, 0.1)', borderRadius: 4, color: item.expiry_text.includes('Days') ? '#389e0d' : '#cf1322' }}>
                                        节点到期回执文本: <strong>{item.expiry_text}</strong>
                                    </div>
                                )}
                            </div>
                        </Card>
                    </List.Item>
                )}
            />
        );
    };

    const overviewTab = (
        <>
            <Row gutter={[20, 20]} style={{ marginBottom: 20 }}>
                <Col xs={24} sm={12} lg={6}>
                    <StatCard
                        title="集群受控节点总数"
                        value={stats?.totalHosts || 0}
                        icon={<CloudServerOutlined />}
                        color="#4A7CF7"
                        subText={`近期有效纳管节点`}
                        loading={loading}
                    />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <StatCard
                        title="今日跑批/心跳次数"
                        value={stats?.todayRuns || 0}
                        icon={<SyncOutlined />}
                        color="#5CC9A7"
                        subText={`自动 / 人工干预`}
                        loading={loading}
                    />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <StatCard
                        title="有效存活主机"
                        value={stats?.successHosts || 0}
                        icon={<CheckCircleOutlined />}
                        color="#05CD99"
                        subText={stats?.lastRunTime ? `最后检测于 ${dayjs(stats.lastRunTime).format('HH:mm')}` : ''}
                        loading={loading}
                    />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <StatCard
                        title="离线失控故障点"
                        value={stats?.failedHosts || 0}
                        icon={<CloseCircleOutlined />}
                        color="#E31A1A"
                        subText="可能已被平台暂停或封禁"
                        loading={loading}
                    />
                </Col>
            </Row>

            <Card
                title="CT8 集群稳定性执行耗时分析"
                style={{ borderRadius: 20, border: 'none', boxShadow: 'var(--card-shadow)', marginBottom: 20 }}
                bodyStyle={{ padding: '24px 16px 16px 0px' }}
            >
                {loading ? <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin /></div> :
                    chartData.length > 0 ? (
                        <div style={{ height: 300, width: '100%' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#A3AED0' }} dy={10} />
                                    <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#A3AED0' }} />
                                    <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#A3AED0' }} />
                                    <RechartsTooltip
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0px 8px 24px rgba(112, 144, 176, 0.2)' }}
                                    />
                                    <Legend wrapperStyle={{ paddingTop: 20 }} />
                                    <Line yAxisId="left" type="monotone" dataKey="success" name="存活成功数" stroke="#05CD99" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                    <Line yAxisId="left" type="monotone" dataKey="failed" name="失联报错数" stroke="#E31A1A" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                    <Line yAxisId="right" type="step" dataKey="duration" name="网络请求耗时(s)" stroke="#4A7CF7" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#A3AED0' }}>暂无图表数据</div>
                    )
                }
            </Card>

            <Card
                title="历史扫描记录溯源追踪"
                style={{ borderRadius: 20, border: 'none', boxShadow: 'var(--card-shadow)' }}
                bodyStyle={isMobile ? { padding: '16px 12px' } : undefined}
                extra={
                    <Button type="primary" onClick={() => handleTrigger(null)} loading={loading}>
                        人工批量下发重检
                    </Button>
                }
            >
                {isMobile ? (
                    <List
                        dataSource={runs}
                        loading={loading}
                        rowKey="run_id"
                        pagination={{ ...pagination, size: 'small', onChange: (p, s) => setPagination(prev => ({ ...prev, current: p, pageSize: s })) }}
                        renderItem={item => (
                            <List.Item style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', background: '#F4F7FE', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                                    <Text strong style={{ fontSize: 13, fontFamily: 'monospace' }}>{item.run_id.substring(0, 16)}...</Text>
                                    <Tag color={item.status === 'success' ? 'green' : item.status === 'failed' ? 'red' : item.status === 'partial' ? 'orange' : 'blue'}>{item.status}</Tag>
                                </div>
                                <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
                                    <div>时间: {dayjs(item.start_time).format('MM-DD HH:mm:ss')}</div>
                                    <div style={{ marginTop: 4 }}>
                                        有效节点数量: <Text type="success" strong>{item.stats?.success || 0}</Text> / <Text type="danger" strong>{item.stats?.failed || 0}</Text>
                                    </div>
                                </div>
                                <Button size="small" type="primary" ghost block onClick={() => handleRunClick(item.run_id)}>下钻追踪单台故障点</Button>
                            </List.Item>
                        )}
                    />
                ) : (
                    <Table
                        columns={columns}
                        dataSource={runs}
                        rowKey="run_id"
                        loading={loading}
                        scroll={{ x: 800 }}
                        pagination={{
                            ...pagination,
                            showSizeChanger: true,
                            showTotal: total => `共 ${total} 条记录`,
                            onChange: (p, s) => setPagination(prev => ({ ...prev, current: p, pageSize: s }))
                        }}
                    />
                )}
            </Card>
        </>
    );

    const secretTab = (
        <Card style={{ borderRadius: 20, border: 'none', boxShadow: 'var(--card-shadow)', minHeight: 600 }}>
            {secretLoading ? <Spin /> : (
                <Row gutter={40}>
                    <Col xs={24} md={12}>
                        <Title level={4} style={{ marginBottom: 24 }}><SettingOutlined /> 全局纳管配置池下发</Title>
                        <Paragraph type="secondary">
                            在此处配置用于被自动程序扫描的节点清单及代理连接规则。此清单将被自动分发推送至安全隐匿区域的执行链路上（Github Secrets）。
                        </Paragraph>

                        <div style={{ marginBottom: 24 }}>
                            <Title level={5}>批量覆盖主配置链</Title>
                            <Input.TextArea
                                rows={6}
                                value={secretConfig}
                                onChange={(e) => {
                                    setSecretConfig(e.target.value);
                                    parseSecretInput(e.target.value);
                                }}
                                style={{ fontFamily: 'monospace', borderRadius: 12 }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                                <Button type="primary" icon={<SaveOutlined />} onClick={() => handleSaveSecrets(secretConfig)}>
                                    覆盖保存长链至云端
                                </Button>
                            </div>
                        </div>

                        <div>
                            <Title level={5}>热追加新主机或代理</Title>
                            <Space.Compact style={{ width: '100%' }}>
                                <Input
                                    placeholder="格式: { host: '..', proxy: '..' }"
                                    value={newPolicy}
                                    onChange={(e) => setNewPolicy(e.target.value)}
                                />
                                <Button type="primary" onClick={handleAppendPolicy}>入池挂载</Button>
                            </Space.Compact>
                        </div>
                    </Col>
                    
                    <Col xs={24} md={12}>
                        <Title level={4} style={{ marginBottom: 24, marginTop: isMobile ? 32 : 0 }}>节点资产快照与黑名单摘除</Title>
                        <Paragraph type="secondary">
                            解析后的节点列表片段可视化。如果发现某台主机已因 TOS 黑榜封禁或者网络失联无法恢复，可以快速点按移除它，系统将不再对其进行重测。
                        </Paragraph>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {secretItems.map((item, index) => (
                                <div key={index} style={{ 
                                    background: 'var(--bg-color)', 
                                    borderRadius: 8, 
                                    padding: '6px 12px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    border: '1px solid var(--border-color)',
                                    minWidth: '130px',
                                    flex: isMobile ? '0 1 calc(50% - 4px)' : '0 1 calc(33.33% - 6px)'
                                }}>
                                    <Text style={{ fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-all', flex: 1, marginRight: 8 }}>
                                        {item}
                                    </Text>
                                    <Popconfirm title="确定摘除此节点？" onConfirm={() => handleRemovePolicy(index)}>
                                        <Button type="primary" danger ghost size="small" icon={<DeleteOutlined />} style={{ borderRadius: 6, height: 26, fontSize: 12, padding: '0 8px' }}>移除</Button>
                                    </Popconfirm>
                                </div>
                            ))}
                        </div>
                    </Col>
                </Row>
            )}
        </Card>
    );

    return (
        <div style={{ paddingBottom: 24 }}>
            <Tabs 
                defaultActiveKey="1" 
                type="card"
                tabBarExtraContent={
                    <Button icon={<ReloadOutlined />} onClick={fetchDashboard} loading={loading}>
                        强制获取最新快照
                    </Button>
                }
                items={[
                    { label: '集时数据总览监控', key: '1', children: overviewTab },
                    { label: '下发节点配置与封禁管理', key: '2', children: secretTab }
                ]}
            />

            <Modal
                title={`节点扫描详细猎报追踪 (${currentRunDetails?.run_id ? currentRunDetails.run_id.substring(0, 8) + '...' : ''})`}
                open={detailsModalVisible}
                onCancel={() => setDetailsModalVisible(false)}
                footer={[<Button key="close" type="primary" onClick={() => setDetailsModalVisible(false)}>完成追踪</Button>]}
                width={700}
                centered
                bodyStyle={{ maxHeight: '600px', overflowY: 'auto' }}
            >
                {detailsLoading ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div> : <RunDetailsList />}
            </Modal>
        </div>
    );
};

export default Ct8Dashboard;
