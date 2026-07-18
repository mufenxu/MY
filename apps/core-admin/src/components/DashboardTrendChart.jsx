import { Typography } from 'antd';
import {
    Area,
    AreaChart,
    CartesianGrid,
    Legend,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

const { Text } = Typography;

const TrendTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;

    return (
        <div
            style={{
                background: 'var(--component-bg)',
                padding: 12,
                border: '1px solid var(--border-color)',
                borderRadius: 12,
                boxShadow: 'var(--box-shadow)',
            }}
        >
            <Text strong style={{ display: 'block', marginBottom: 8 }}>{label}</Text>
            {payload.map((item) => (
                <div key={item.dataKey} style={{ color: item.color, fontSize: 12 }}>
                    {item.name}: {item.value}
                </div>
            ))}
        </div>
    );
};

const DashboardTrendChart = ({ data }) => (
    <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
            <defs>
                <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4A7CF7" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#4A7CF7" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#5CC9A7" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#5CC9A7" stopOpacity={0} />
                </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F5F7FB" />
            <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#A3AED0', fontSize: 12 }}
                dy={10}
            />
            <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#A3AED0', fontSize: 12 }}
            />
            <Tooltip content={<TrendTooltip />} cursor={{ stroke: '#4A7CF7', strokeWidth: 1 }} />
            <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: 20 }} />
            <Area
                name="新增用户"
                type="monotone"
                dataKey="users"
                stroke="#4A7CF7"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorUsers)"
                animationDuration={900}
            />
            <Area
                name="新增订单"
                type="monotone"
                dataKey="orders"
                stroke="#5CC9A7"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorOrders)"
                animationDuration={900}
            />
        </AreaChart>
    </ResponsiveContainer>
);

export default DashboardTrendChart;
