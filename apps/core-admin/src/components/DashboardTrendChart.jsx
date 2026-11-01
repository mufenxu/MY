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

const TrendTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;

    return (
        <div className="chart-tip">
            <strong>{label}</strong>
            {payload.map((item) => (
                <span key={item.dataKey} style={{ color: item.color }}>
                    {item.name}：{item.value}
                </span>
            ))}
        </div>
    );
};

const DashboardTrendChart = ({ data }) => (
    <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 8 }}>
            <defs>
                <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--blue)" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="var(--blue)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--leaf-text)" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="var(--leaf-text)" stopOpacity={0} />
                </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
            <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--ink-faint)', fontSize: 11 }}
                dy={8}
            />
            <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--ink-faint)', fontSize: 11 }}
                width={44}
            />
            <Tooltip content={<TrendTooltip />} cursor={{ stroke: 'var(--blue)', strokeWidth: 1 }} />
            <Legend
                verticalAlign="top"
                align="right"
                iconType="circle"
                iconSize={7}
                wrapperStyle={{ paddingBottom: 14, fontSize: 11 }}
            />
            <Area
                name="新用户"
                type="monotone"
                dataKey="users"
                stroke="var(--blue)"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorUsers)"
                animationDuration={900}
            />
            <Area
                name="新订单"
                type="monotone"
                dataKey="orders"
                stroke="var(--leaf-text)"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorOrders)"
                animationDuration={900}
            />
        </AreaChart>
    </ResponsiveContainer>
);

export default DashboardTrendChart;
