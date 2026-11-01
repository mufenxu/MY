import React, { useState, useEffect, useCallback } from 'react';
import { Switch, Slider, Radio, Spin } from 'antd';
import {
    ThunderboltOutlined,
    ReloadOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    FireOutlined,
    HistoryOutlined,
    DashboardOutlined,
    GlobalOutlined,
    ToolOutlined,
    DashboardFilled
} from '@ant-design/icons';
import { message } from '../utils/feedback';
import api from '../utils/api';

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

const Readout = ({ icon, tone, label, value, unit, foot }) => (
    <div className="stat-card">
        <span className={`stat-icon${tone ? ` tone-${tone}` : ''}`}>{icon}</span>
        <span className="stat-copy">
            <span className="stat-label">{label}</span>
            <span className="stat-figure">
                {value}
                {unit ? <span className="stat-unit">{unit}</span> : null}
            </span>
            {foot ? <span className="stat-foot">{foot}</span> : null}
        </span>
    </div>
);

const TrendChart = ({ data, loading }) => {
    if (loading) {
        return (
            <div className="chart-placeholder">
                <Spin />
                <span>加载趋势数据…</span>
            </div>
        );
    }
    if (!data || data.length === 0) {
        return <div className="chart-placeholder"><span>暂无趋势数据</span></div>;
    }

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
        <div className="chart-scroll">
            <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ minWidth: 600 }}>
                {[0, 1, 2, 3, 4].map(i => (
                    <line
                        key={i}
                        x1={padding.left}
                        y1={padding.top + (graphHeight / 4) * i}
                        x2={width - padding.right}
                        y2={padding.top + (graphHeight / 4) * i}
                        stroke="var(--line)"
                    />
                ))}

                <path d={areaPath} fill="var(--blue-soft)" />
                <path d={powerPath} fill="none" stroke="var(--blue)" strokeWidth="2" strokeOpacity="0.55" />
                <path d={tempPath} fill="none" stroke="var(--red-text)" strokeWidth="3" strokeLinecap="round" />

                <text x={padding.left - 10} y={padding.top} fill="var(--red-text)" fontSize="10" textAnchor="end">℃</text>
                <text x={width - padding.right + 10} y={padding.top} fill="var(--blue)" fontSize="10">W</text>

                {data.map((d, i) => (i % 8 === 0) && (
                    <text key={i} x={getX(i)} y={height - 5} fill="var(--ink-muted)" fontSize="10" textAnchor="middle">{d.time}</text>
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
    const waterTooHot = parseFloat(data.currentTemp) > 55;

    return (
        <div className="page-view fade-in">
            <div className="toolbar-row" style={{ padding: 0 }}>
                <span className={`tag tone-${data.online ? 'ok' : 'danger'}`}>
                    {data.online ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                    {data.online ? '在线' : '离线'}
                </span>
                <span className={`tag tone-${data.powerOn ? 'info' : 'neutral'}`}>
                    {data.powerOn ? '正在运行' : '待机中'}
                </span>
                <span className={`tag tone-${data.mode === 'heating' ? 'warn' : data.mode === 'cold' ? 'teal' : 'neutral'}`}>
                    {data.modeLabel}
                </span>
                <span className="toolbar-spacer" />
                <span className="toolbar-count">更新于 {formatTime(data.lastUpdated)}</span>
                <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => { setLoading(true); fetchData(); fetchChartData(); }}
                >
                    <ReloadOutlined spin={loading} />
                    刷新
                </button>
                <span className="settings-inline">
                    <Switch size="small" checked={autoRefresh} onChange={setAutoRefresh} />
                    <span className="settings-note">自动刷新</span>
                </span>
            </div>

            <div className="stat-strip">
                <Readout
                    icon={<FireOutlined />}
                    tone="danger"
                    label="当前水温"
                    value={loading ? '—' : data.currentTemp}
                    unit="℃"
                    foot={waterTooHot ? '水温偏高' : undefined}
                />
                <Readout
                    icon={<DashboardFilled />}
                    label="目标温度"
                    value={loading ? '—' : data.targetTemp}
                    unit="℃"
                />
                <Readout
                    icon={<GlobalOutlined />}
                    tone="ok"
                    label="室外温度"
                    value={loading ? '—' : data.outdoorTemp}
                    unit="℃"
                />
                <Readout
                    icon={<ThunderboltOutlined />}
                    tone="warn"
                    label="当前功率"
                    value={loading ? '—' : data.realtimePower}
                    foot={`能效估算 ${data.copScore}`}
                />
            </div>

            <div className="split">
                <section className="panel">
                    <header className="panel-head">
                        <span className="panel-title">
                            <ToolOutlined />
                            控制
                        </span>
                        <span className="panel-meta">{data.powerOn ? '设备运行中' : '设备待机'}</span>
                    </header>
                    <div className="panel-body">
                        <div className="control-row">
                            <span className="control-label">主电源</span>
                            <Switch
                                checked={data.powerOn}
                                onChange={handlePowerChange}
                                loading={switching}
                                disabled={!data.online}
                            />
                        </div>

                        <div className="control-block">
                            <span className="control-label">运行方式</span>
                            <Radio.Group value={data.mode} disabled={!data.powerOn} buttonStyle="solid">
                                <Radio.Button value="heating">加热</Radio.Button>
                                <Radio.Button value="cold">制冷</Radio.Button>
                                <Radio.Button value="auto">自动</Radio.Button>
                            </Radio.Group>
                        </div>

                        <div className="control-block">
                            <div className="control-row">
                                <span className="control-label">目标温度</span>
                                <strong className="control-value">{data.targetTemp}℃</strong>
                            </div>
                            <Slider
                                min={15}
                                max={60}
                                value={typeof data.targetTemp === 'number' ? data.targetTemp : 45}
                                onChange={handleTempChange}
                                disabled={!data.powerOn}
                            />
                        </div>
                    </div>
                </section>

                <section className="panel">
                    <header className="panel-head">
                        <span className="panel-title">
                            <DashboardOutlined />
                            详细数据
                        </span>
                        <span className="panel-meta">实时读表</span>
                    </header>
                    <div className="panel-body">
                        <div className="metric-grid">
                            <div className="metric-tile"><span>运行频率</span><strong>{data.runFreq} Hz</strong></div>
                            <div className="metric-tile"><span>出水温度</span><strong>{data.waterOutTemp} ℃</strong></div>
                            <div className="metric-tile"><span>回水温度</span><strong>{data.waterBackTemp} ℃</strong></div>
                            <div className="metric-tile"><span>供电电压</span><strong>{data.acinVol} V</strong></div>
                            <div className="metric-tile"><span>运行电流</span><strong>{data.runCurrent} A</strong></div>
                            <div className="metric-tile"><span>模块温度</span><strong>{data.ipmTemp} ℃</strong></div>
                        </div>

                        <div className="cell-tags" style={{ marginTop: 14 }}>
                            {data.online ? (
                                <span className="tag tone-ok">系统健康</span>
                            ) : (
                                <span className="tag tone-danger">设备连接异常</span>
                            )}
                            {waterTooHot && <span className="tag tone-warn">水温过高</span>}
                        </div>
                    </div>
                </section>
            </div>

            <section className="panel">
                <header className="panel-head">
                    <span className="panel-title">
                        <HistoryOutlined />
                        今天的变化
                    </span>
                    <span className="chart-legend">
                        <span className="chart-legend-temp">温度</span>
                        <span className="chart-legend-power">功率</span>
                    </span>
                </header>
                <div className="panel-body">
                    <TrendChart data={chartData} loading={chartLoading} />
                </div>
            </section>
        </div>
    );
};

export default AirEnergyMonitor;
