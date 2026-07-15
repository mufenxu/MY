const request = require('../../utils/request').default;
const logger = require('../../utils/logger');

Component({
    properties: {
        show: {
            type: Boolean,
            value: false,
            observer(newVal) {
                if (newVal) {
                    this.fetchWeeklyData();
                }
            }
        }
    },

    data: {
        weeklyData: [],
        totalCost: '0.00',
        avgCost: '0.00'
    },

    methods: {
        close() {
            this.triggerEvent('close');
        },

        preventTouchMove() {
            // 阻止触摸事件冒泡，防止页面滚动穿透
            return;
        },

        async fetchWeeklyData() {
            wx.showLoading({ title: '加载中...' });
            try {
                const res = await request('/tuya/heat-pump/energy-weekly', 'GET');
                if (res && res.success && res.result) {
                    const data = res.result.reverse(); // [Day-6, ..., Today]

                    this.setData({
                        weeklyData: data
                    });

                    // 计算汇总
                    let total = 0;
                    data.forEach(item => {
                        total += parseFloat(item.cost);
                    });
                    this.setData({
                        totalCost: total.toFixed(2),
                        avgCost: (total / data.length).toFixed(2)
                    });

                    // 绘制图表 (延迟确保 canvas 节点就绪)
                    setTimeout(() => {
                        this.drawChart(data);
                    }, 100);
                }
            } catch (err) {
                console.error(err);
                wx.showToast({ title: '加载失败', icon: 'none' });
            } finally {
                wx.hideLoading();
            }
        },

        drawChart(data) {
            const query = this.createSelectorQuery();
            query.select('#barChart')
                .fields({ node: true, size: true })
                .exec((res) => {
                    if (!res[0]) return;
                    const canvas = res[0].node;
                    const ctx = canvas.getContext('2d');
                    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
                    const dpr = windowInfo.pixelRatio || 1;

                    canvas.width = res[0].width * dpr;
                    canvas.height = res[0].height * dpr;
                    ctx.scale(dpr, dpr);

                    const width = res[0].width;
                    const height = res[0].height;

                    // 绘图配置
                    const padding = { top: 30, right: 10, bottom: 20, left: 30 };
                    const graphW = width - padding.left - padding.right;
                    const graphH = height - padding.top - padding.bottom;

                    ctx.clearRect(0, 0, width, height);

                    // 找最大值
                    const maxCost = Math.max(...data.map(d => parseFloat(d.cost)), 5); // 至少 5元
                    const yMax = Math.ceil(maxCost * 1.1); // 留点余地

                    // 1. 绘制网格线 (3条)
                    ctx.strokeStyle = '#f0f0f0';
                    ctx.lineWidth = 1;
                    ctx.fillStyle = '#999';
                    ctx.font = '10px sans-serif';
                    ctx.textAlign = 'right';
                    ctx.textBaseline = 'middle';

                    for (let i = 0; i <= 3; i++) {
                        const yVal = yMax / 3 * i;
                        const yPos = padding.top + graphH - (yVal / yMax * graphH);

                        // 线
                        ctx.beginPath();
                        ctx.moveTo(padding.left, yPos);
                        ctx.lineTo(width - padding.right, yPos);
                        ctx.stroke();

                        // 文字
                        ctx.fillText(Math.round(yVal), padding.left - 5, yPos);
                    }

                    // 2. 绘制柱状图
                    const barWidth = (graphW / data.length) * 0.45;
                    const step = graphW / data.length;

                    ctx.textAlign = 'center';

                    data.forEach((item, index) => {
                        const val = parseFloat(item.cost);
                        const barH = (val / yMax) * graphH;

                        const x = padding.left + index * step + step / 2;
                        const y = padding.top + graphH - barH;

                        // 绘制 3D 效果柱体 (顶部带圆角)
                        const bx = x - barWidth / 2;
                        const by = y;
                        const bw = barWidth;
                        const bh = barH;
                        const r = 6; // 圆角半径

                        if (bh > 5) {
                            ctx.beginPath();
                            ctx.moveTo(bx + r, by);
                            ctx.lineTo(bx + bw - r, by);
                            ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
                            ctx.lineTo(bx + bw, by + bh);
                            ctx.lineTo(bx, by + bh);
                            ctx.lineTo(bx, by + r);
                            ctx.quadraticCurveTo(bx, by, bx + r, by);
                            ctx.closePath();

                            // 渐变色: 增强 3D 纵深感
                            const gradient = ctx.createLinearGradient(bx, by, bx + bw, by);
                            if (item.isToday) {
                                gradient.addColorStop(0, '#f59e0b');
                                gradient.addColorStop(0.5, '#fbbf24'); // 高光中线
                                gradient.addColorStop(1, '#f59e0b');
                            } else {
                                gradient.addColorStop(0, '#2563eb');
                                gradient.addColorStop(0.5, '#60a5fa'); // 高光中线
                                gradient.addColorStop(1, '#2563eb');
                            }
                            ctx.fillStyle = gradient;
                            ctx.fill();

                            // 数值标签: 增强直观性
                            ctx.fillStyle = '#475569';
                            ctx.font = 'bold 11px DIN';
                            ctx.fillText(val.toFixed(2), x, y - 8);
                        }

                        // 日期标签 (简化日期，如 14)
                        const dayLabel = item.date.split('-')[1]; // 01-14 -> 14
                        ctx.fillStyle = '#94a3b8';
                        ctx.font = '10px sans-serif';
                        ctx.fillText(dayLabel, x, height - 5);
                    });
                });
        }
    }
});
