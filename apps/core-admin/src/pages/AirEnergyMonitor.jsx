import React, { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Switch, Typography, Spin, Tag, Space, Button, Statistic, Slider, Radio, Divider, Tooltip } from 'antd';
import {
    ThunderboltOutlined,
    ReloadOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    ExclamationCircleOutlined,
    FireOutlined,
    DotChartOutlined,
    HistoryOutlined,
    AreaChartOutlined,
    DashboardOutlined,
    GlobalOutlined,
    ToolOutlined,
    DashboardFilled
} from '@ant-design/icons';
import { message } from '../utils/feedback';
import api from '../utils/api';

const { Title, Text } = Typography;

// 涂鸦 DP ID 映射
const DP_MAP = {
    POWER: 'switch',
    TEMP_SET: 'temp_set',
    TEMP_CURRENT: 'WATER_BACK_TEMP',
    OUT_TEMP: 'OUT_TEMP',
    WATER_OUT: 'WATER_OUT_TEMP',
    WATER_BACK: 'WATER_BACK_TEMP',
    CURRENT: 'RUN_CURRENT',
    VOLTAGE: 'ACIN_VOL',
    FREQ: 'RUN_FREQUENT',
    IPM: 'IPM_TEMP',
    FAULT: 'fault_num',
    RUN_MODE: 'RUN_MODE',
    SET_TANK: 'SET_TANK_TEMP',
    SET_COOL: 'SET_COOL_TEMP',
    TARGET_FREQ: 'TRAGE_FREQUENT',
    MODE: 'mode'
};

const DataCard = ({ title, value, unit, icon, color, loading, subText }) => (
    <Card
        style={{
            borderRadius: 20,
            background: `linear-gradient(135deg, ${color}05 0%, ${color}15 100%)`,
            border: `1px solid ${color}20`,
            height: '100%',
            transition: 'all 0.3s'
        }}
        bodyStyle={{ padding: '24px' }}
        hoverable
    >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
                <Text style={{ color: '#8C98A9', fontSize: 14, fontWeight: 500 }}>{title}</Text>
                <div style={{ marginTop: 8 }}>
                    {loading ? (
                        <Spin size="small" />
                    ) : (
                        <span style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-primary)' }}>
                            {value}
                            <span style={{ fontSize: 16, color: '#8C98A9', marginLeft: 4 }}>{unit}</span>
                        </span>
                    )}
                </div>
                {subText && <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>{subText}</Text>}
            </div>
            <div style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: `${color}20`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                {React.cloneElement(icon, { style: { fontSize: 24, color } })}
            </div>
        </div>
    </Card>
);

const TrendChart = ({ data, loading }) => {
    if (loading) return <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin tip="加载趋势数据..." /></div>;
    if (!data || data.length === 0) return <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Text type="secondary">暂无趋势数据</Text></div>;

    const padding = { top: 20, right: 40, bottom: 30, left: 40 };
    const width = 1000;
    const height = 200;
    const graphWidth = width - padding.left - padding.right;
    const graphHeight = height - padding.top - padding.bottom;

    const temps = data.map(d => d.temp).filter(v => v !== null);
    const powers = data.map(d => d.power).filter(v => v !== null);

    const minTemp = Math.min(...temps, 15);
    const maxTemp = Math.max(...temps, 55);
    const maxPower = Math.max(...powers, 1000) * 1.1;

    const getX = (index) => padding.left + (index / (data.length - 1)) * graphWidth;
    const getYTemp = (val) => padding.top + graphHeight - ((val - minTemp) / (maxTemp - minTemp)) * graphHeight;
    const getYPower = (val) => padding.top + graphHeight - (val / maxPower) * graphHeight;

    const tempPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getYTemp(d.temp)}`).join(' ');
    const powerPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getYPower(d.power)}`).join(' ');
    const areaPath = powerPath + ` L ${getX(data.length - 1)} ${padding.top + graphHeight} L ${getX(0)} ${padding.top + graphHeight} Z`;

    return (
        <div style={{ width: '100%', overflowX: 'auto' }}>
            <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ minWidth: 600 }}>
                {/* 网格线 */}
                {[0, 1, 2, 3, 4].map(i => (
                    <line
                        key={i}
                        x1={padding.left}
                        y1={padding.top + (graphHeight / 4) * i}
                        x2={width - padding.right}
                        y2={padding.top + (graphHeight / 4) * i}
                        stroke="#f0f0f0"
                    />
                ))}

                {/* 功率填充 */}
                <path d={areaPath} fill="rgba(67, 24, 255, 0.1)" />
                {/* 功率曲线 */}
                <path d={powerPath} fill="none" stroke="#4A7CF7" strokeWidth="2" strokeOpacity="0.5" />
                {/* 温度曲线 */}
                <path d={tempPath} fill="none" stroke="#FF5252" strokeWidth="3" strokeLinecap="round" />

                {/* 轴标签 */}
                <text x={padding.left - 10} y={padding.top} fill="#FF5252" fontSize="10" textAnchor="end">℃</text>
                <text x={width - padding.right + 10} y={padding.top} fill="#4A7CF7" fontSize="10">W</text>

                {/* 时间点 */}
                {data.map((d, i) => (i % 8 === 0) && (
                    <text key={i} x={getX(i)} y={height - 5} fill="#8C98A9" fontSize="10" textAnchor="middle">{d.time}</text>
                ))}
            </svg>
        </div>
    );
};

const AirEnergyMonitor = () => {
    const [data, setData] = useState({
        online: false,
        powerOn: false,
        currentTemp: '--',
        targetTemp: '--',
        outdoorTemp: '--',
        waterOutTemp: '--',
        waterBackTemp: '--',
        runFreq: '--',
        acinVol: '--',
        runCurrent: '--',
        ipmTemp: '--',
        mode: '',
        modeLabel: '未知',
        realtimePower: '--',
        copScore: '--',
        loadPercent: 0,
        healthList: [],
        lastUpdated: null
    });
    const [chartData, setChartData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [chartLoading, setChartLoading] = useState(true);
    const [switching, setSwitching] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);

    const parseStatus = useCallback((result) => {
        setData(prevData => {
            const d = { ...prevData };
            d.lastUpdated = Date.now();
            d.online = result.online === true;

            const statusList = result.status || [];
            statusList.forEach(item => {
                let val = item.value;
                // 自动处理缩放 (涂鸦标准协议通常温度为 10倍，电流也是 10倍)
                if (['WATER_OUT_TEMP', 'WATER_BACK_TEMP', 'OUT_TEMP', 'IPM_TEMP', 'WATER_TANK_TEMP', 'RUN_CURRENT'].includes(item.code)) {
                    val = val / 10;
                }

                switch (item.code) {
                    case DP_MAP.POWER: d.powerOn = val === true; break;
                    case DP_MAP.TEMP_SET: d.targetTemp = val; break;
                    case DP_MAP.TEMP_CURRENT: d.currentTemp = val; break;
                    case DP_MAP.OUT_TEMP: d.outdoorTemp = val; break;
                    case DP_MAP.WATER_OUT: d.waterOutTemp = val; break;
                    case DP_MAP.WATER_BACK: d.waterBackTemp = val; break;
                    case DP_MAP.CURRENT: d.runCurrent = val; break;
                    case DP_MAP.VOLTAGE: d.acinVol = val; break;
                    case DP_MAP.FREQ: d.runFreq = val; break;
                    case DP_MAP.IPM: d.ipmTemp = val; break;
                    case DP_MAP.MODE:
                        d.mode = val;
                        d.modeLabel = val === 'heating' ? '加热模式' : (val === 'cold' ? '制冷模式' : '自动');
                        break;
                }
            });

            if (!d.online) d.powerOn = false;

            // 功率计算
            const vol = parseFloat(d.acinVol);
            const cur = parseFloat(d.runCurrent);
            if (!isNaN(vol) && !isNaN(cur)) {
                // 系数调整为 0.96 (与小程序一致)
                const p = vol * cur * 0.96;
                d.realtimePower = p > 1000 ? (p / 1000).toFixed(2) + ' kW' : Math.round(p) + ' W';
                d.powerVal = p;
            }

            // COP 估算
            const outT = parseFloat(d.waterOutTemp);
            const backT = parseFloat(d.waterBackTemp);
            if (!isNaN(outT) && !isNaN(backT) && d.powerVal > 100) {
                const deltaT = outT - backT;
                d.copScore = deltaT > 0 ? (deltaT * 2000 / d.powerVal).toFixed(1) : '0.0';
            }

            return d;
        });
    }, []);

    const fetchData = useCallback(async (signal) => {
        try {
            const res = await api.get('/tuya/heat-pump/status', { signal });
            if (res.data.success && res.data.result) {
                parseStatus(res.data.result);
            }
        } catch (error) {
            if (error.code !== 'ERR_CANCELED') console.error('获取热泵数据失败:', error);
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, [parseStatus]);

    const fetchChartData = useCallback(async (signal) => {
        setChartLoading(true);
        try {
            const res = await api.get('/tuya/heat-pump/chart-data', { signal });
            if (res.data.success) {
                setChartData(res.data.result);
            }
        } catch (error) {
            if (error.code !== 'ERR_CANCELED') console.error('获取趋势数据失败:', error);
        } finally {
            if (!signal?.aborted) setChartLoading(false);
        }
    }, []);

    useEffect(() => {
        let stopped = false;
        let timer = 0;
        let controller = null;
        const poll = async () => {
            controller = new AbortController();
            if (timer === 0) {
                await Promise.all([
                    fetchData(controller.signal),
                    fetchChartData(controller.signal),
                ]);
            } else {
                await fetchData(controller.signal);
            }
            if (!stopped && autoRefresh) timer = window.setTimeout(poll, 5000);
        };
        void poll();

        return () => {
            stopped = true;
            window.clearTimeout(timer);
            controller?.abort();
        };
    }, [fetchData, fetchChartData, autoRefresh]);

    const handlePowerChange = async (checked) => {
        if (!data.online) return message.warning('设备离线');
        setSwitching(true);
        const prevState = data.powerOn;
        setData(prev => ({ ...prev, powerOn: checked }));

        try {
            const res = await api.post('/tuya/heat-pump/control', {
                commands: [{ code: DP_MAP.POWER, value: checked }]
            });
            if (res.data.success) {
                message.success(checked ? '设备已开启' : '设备已关闭');
                setTimeout(fetchData, 2000);
            } else {
                throw new Error(res.data.msg);
            }
        } catch (error) {
            message.error('控制失败: ' + error.message);
            setData(prev => ({ ...prev, powerOn: prevState }));
        } finally {
            setSwitching(false);
        }
    };

    const handleTempChange = async (val) => {
        if (!data.online || !data.powerOn) return;
        const prevState = data.targetTemp;
        setData(prev => ({ ...prev, targetTemp: val }));

        try {
            let dpCode = DP_MAP.TEMP_SET;
            if (data.mode === 'heating') dpCode = DP_MAP.SET_TANK;
            if (data.mode === 'cold') dpCode = DP_MAP.SET_COOL;

            const res = await api.post('/tuya/heat-pump/control', {
                commands: [{ code: dpCode, value: val }]
            });
            if (res.data.success) {
                message.success(`目标温度已设为 ${val}℃`);
            } else {
                throw new Error(res.data.msg);
            }
        } catch {
            message.error('调节温失败');
            setData(prev => ({ ...prev, targetTemp: prevState }));
        }
    };

    const formatTime = (ts) => ts ? new Date(ts).toLocaleTimeString() : '--:--:--';

    return (
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 0 40px' }}>
            {/* Header Status */}
            <Card
                className="glass-card"
                style={{
                    borderRadius: 20,
                    marginBottom: 24,
                    boxShadow: '0 20px 40px rgba(0,0,0,0.05)',
                    border: 'none',
                    background: 'var(--component-bg)'
                }}
            >
                <Row justify="space-between" align="middle" gutter={[16, 16]}>
                    <Col>
                        <Space size="large">
                            <Tag color={data.online ? 'green' : 'red'} style={{ padding: '4px 12px', borderRadius: 8 }}>
                                {data.online ? <CheckCircleOutlined /> : <CloseCircleOutlined />} {data.online ? '在线' : '离线'}
                            </Tag>
                            <Tag color={data.powerOn ? 'blue' : 'default'} style={{ padding: '4px 12px', borderRadius: 8 }}>
                                {data.powerOn ? '正在运行' : '待机中'}
                            </Tag>
                            <Text type="secondary">上次更新: {formatTime(data.lastUpdated)}</Text>
                        </Space>
                    </Col>
                    <Col>
                        <Space>
                            <Button icon={<ReloadOutlined spin={loading} />} onClick={() => { setLoading(true); fetchData(); fetchChartData(); }}>刷新</Button>
                            <Switch checked={autoRefresh} onChange={setAutoRefresh} checkedChildren="自动刷新" unCheckedChildren="手动" />
                        </Space>
                    </Col>
                </Row>
            </Card>

            {/* Main Stats */}
            <Row gutter={[24, 24]}>
                <Col xs={24} sm={12} lg={6}>
                    <DataCard title="当前水温" value={data.currentTemp} unit="℃" icon={<FireOutlined />} color="#FF5252" loading={loading} />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <DataCard title="目标温度" value={data.targetTemp} unit="℃" icon={<DashboardFilled />} color="#4A7CF7" loading={loading} />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <DataCard title="室外温度" value={data.outdoorTemp} unit="℃" icon={<GlobalOutlined />} color="#5CC9A7" loading={loading} />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <DataCard title="实时功率" value={data.realtimePower} unit="" icon={<ThunderboltOutlined />} color="#FFB547" loading={loading} subText={`COP 估算: ${data.copScore}`} />
                </Col>
            </Row>

            {/* Controls & Diagnostics */}
            <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
                {/* Control Panel */}
                <Col xs={24} lg={10}>
                    <Card title={<Space><ToolOutlined /> 设备控制</Space>} style={{ borderRadius: 20, height: '100%' }}>
                        <div style={{ padding: '10px 0' }}>
                            <Row align="middle" justify="space-between">
                                <Col><Text strong>主电源</Text></Col>
                                <Col><Switch checked={data.powerOn} onChange={handlePowerChange} loading={switching} disabled={!data.online} /></Col>
                            </Row>
                            <Divider />
                            <div style={{ marginBottom: 16 }}>
                                <Text strong>工作模式</Text>
                                <div style={{ marginTop: 12 }}>
                                    <Radio.Group value={data.mode} disabled={!data.powerOn} buttonStyle="solid">
                                        <Radio.Button value="heating">加热</Radio.Button>
                                        <Radio.Button value="cold">制冷</Radio.Button>
                                        <Radio.Button value="auto">自动</Radio.Button>
                                    </Radio.Group>
                                </div>
                            </div>
                            <Divider />
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Text strong>温度设定</Text>
                                    <Text type="primary" strong>{data.targetTemp}℃</Text>
                                </div>
                                <Slider
                                    min={15} max={60}
                                    value={typeof data.targetTemp === 'number' ? data.targetTemp : 45}
                                    onChange={handleTempChange}
                                    disabled={!data.powerOn}
                                />
                            </div>
                        </div>
                    </Card>
                </Col>

                {/* Diagnostics Panel */}
                <Col xs={24} lg={14}>
                    <Card title={<Space><DashboardOutlined /> 运行诊断</Space>} style={{ borderRadius: 20, height: '100%' }}>
                        <Row gutter={[16, 16]}>
                            <Col xs={12} sm={8}>
                                <Statistic title="运行频率" value={data.runFreq} suffix="Hz" />
                            </Col>
                            <Col xs={12} sm={8}>
                                <Statistic title="出水温度" value={data.waterOutTemp} suffix="℃" />
                            </Col>
                            <Col xs={12} sm={8}>
                                <Statistic title="回水温度" value={data.waterBackTemp} suffix="℃" />
                            </Col>
                            <Col xs={12} sm={8}>
                                <Statistic title="供电电压" value={data.acinVol} suffix="V" />
                            </Col>
                            <Col xs={12} sm={8}>
                                <Statistic title="运行电流" value={data.runCurrent} suffix="A" />
                            </Col>
                            <Col xs={12} sm={8}>
                                <Statistic title="模块温度" value={data.ipmTemp} suffix="℃" />
                            </Col>
                        </Row>
                        <Divider />
                        <div>
                            <Text type="secondary" style={{ fontSize: 12 }}>系统保护与警报</Text>
                            <div style={{ marginTop: 10 }}>
                                {data.online ? (
                                    <Tag color="success">系统健康</Tag>
                                ) : (
                                    <Tag color="error">设备通信异常</Tag>
                                )}
                                {parseFloat(data.currentTemp) > 55 && <Tag color="warning">水温过高</Tag>}
                            </div>
                        </div>
                    </Card>
                </Col>
            </Row>

            {/* History Trends */}
            <Card
                title={<Space><HistoryOutlined /> 24小时运行趋势</Space>}
                style={{ borderRadius: 20, marginTop: 24 }}
                extra={<Text type="secondary" style={{ fontSize: 12 }}><span style={{ color: '#FF5252', marginRight: 10 }}>● 温度</span> <span style={{ color: '#4A7CF7' }}>● 功率</span></Text>}
            >
                <TrendChart data={chartData} loading={chartLoading} />
            </Card>
        </div>
    );
};

export default AirEnergyMonitor;
