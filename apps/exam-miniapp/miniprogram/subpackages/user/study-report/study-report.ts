import { api, StudyReport } from '../../../services/api';
import { buildPageUrl, promptLogin } from '../../../utils/auth';
import { getNavBarInfo } from '../../../utils/nav';

type TrendItem = {
    date: string;
    dateText: string;
    count: number;
    averageScore: number;
    hasData: boolean;
    isToday: boolean;
};

type TrendMetric = {
    label: string;
    value: string;
};

Page({
    data: {
        report: null as StudyReport | null,
        trendItems: [] as TrendItem[],
        trendMetrics: [] as TrendMetric[],
        trendSummary: '最近 7 天',
        weakCategories: [] as any[],
        recentResults: [] as any[],
        loading: true,
        navBarHeight: 0,
        menuButtonTop: 0,
        menuButtonHeight: 0,
    },

    async onLoad() {
        const navInfo = getNavBarInfo();
        this.setData({
            navBarHeight: navInfo.navBarHeight,
            menuButtonTop: navInfo.menuButtonTop,
            menuButtonHeight: navInfo.menuButtonHeight,
        });

        if (!api.isLoggedIn()) {
            await promptLogin({
                message: '登录后才能查看学习报告，是否前往登录？',
                nextUrl: buildPageUrl('/subpackages/user/study-report/study-report'),
            });
            this.setData({ loading: false });
            return;
        }

        this.loadReport();
    },

    onReady() {
        if (this.data.trendItems.length > 0) {
            this.drawTrendChart();
        }
    },

    onResize() {
        if (this.data.trendItems.length > 0) {
            wx.nextTick(() => this.drawTrendChart());
        }
    },

    async loadReport() {
        this.setData({ loading: true });
        try {
            const report = await api.getStudyReport();
            const trendData = report.trendData || { dates: [], counts: [], averageScores: [] };
            const dates = (trendData.dates || []).slice(-7);
            const startIndex = Math.max((trendData.dates || []).length - dates.length, 0);
            const counts = trendData.counts || [];
            const averageScores = trendData.averageScores || [];
            const weekCounts = dates.map((_, index) => counts[startIndex + index] || 0);
            const weekScores = dates.map((_, index) => averageScores[startIndex + index] || 0);
            const weekTotal = weekCounts.reduce((sum, count) => sum + count, 0);
            const weekScoreTotal = weekScores.reduce((sum, score, index) => sum + (score * weekCounts[index]), 0);
            const weekAverage = weekTotal > 0 ? Math.round(weekScoreTotal / weekTotal) : 0;
            const activeDays = weekCounts.filter((count) => count > 0).length;
            const activeScores = weekScores.filter((_, index) => weekCounts[index] > 0);
            const bestDailyScore = activeScores.length > 0 ? Math.max(...activeScores) : 0;
            const todayLabel = this.getTodayLabel();
            const trendItems = dates.map((date, index) => ({
                date,
                dateText: this.formatTrendDate(date),
                count: weekCounts[index],
                averageScore: weekScores[index],
                hasData: weekCounts[index] > 0,
                isToday: date === todayLabel,
            }));

            this.setData({
                loading: false,
                report,
                trendItems,
                trendMetrics: [
                    { label: '7日加权均分', value: weekTotal > 0 ? `${weekAverage}分` : '-' },
                    { label: '有效练习', value: `${weekTotal} 次` },
                    { label: '活跃天数', value: `${activeDays}/7` },
                    { label: '最高日均', value: activeScores.length > 0 ? `${bestDailyScore}分` : '-' },
                ],
                trendSummary: weekTotal > 0 ? `有效样本 ${weekTotal} 次 · 加权均分 ${weekAverage}` : '最近 7 天暂无练习',
                weakCategories: report.weakCategories || [],
                recentResults: (report.recentResults || []).map((item) => ({
                    ...item,
                    dateText: this.formatDate(item.time),
                    accuracy: item.totalCount > 0 ? Math.round((item.correctCount / item.totalCount) * 100) : 0,
                    scoreClass: item.score >= 90 ? 'excellent' : (item.score >= 60 ? 'pass' : 'fail'),
                })),
            }, () => {
                wx.nextTick(() => this.drawTrendChart());
            });
        } catch (error) {
            console.error('Load study report failed', error);
            wx.showToast({ title: '学习报告加载失败', icon: 'none' });
            this.setData({ loading: false });
        }
    },

    drawTrendChart() {
        wx.createSelectorQuery()
            .select('#trendCanvasHost')
            .boundingClientRect((rect) => {
                if (!rect || rect.width <= 0 || rect.height <= 0) {
                    return;
                }

                this.renderTrendCanvas(rect.width, rect.height);
            })
            .exec();
    },

    renderTrendCanvas(width: number, height: number) {
        const items = this.data.trendItems || [];
        const hasData = items.some((item) => item.hasData);
        const ctx = wx.createCanvasContext('trendCanvas', this);
        const padding = {
            top: 24,
            right: 18,
            bottom: 48,
            left: 38,
        };
        const plotLeft = padding.left;
        const plotRight = width - padding.right;
        const plotTop = padding.top;
        const plotBottom = height - padding.bottom;
        const plotWidth = Math.max(plotRight - plotLeft, 1);
        const plotHeight = Math.max(plotBottom - plotTop, 1);
        const maxCount = Math.max(...items.map((item) => item.count), 1);
        const scoreToY = (score: number) => plotTop + ((100 - Math.max(0, Math.min(score, 100))) / 100) * plotHeight;
        const xAt = (index: number) => {
            const slotWidth = plotWidth / Math.max(items.length, 1);
            return plotLeft + slotWidth * (index + 0.5);
        };

        ctx.clearRect(0, 0, width, height);
        const frameInset = 1;
        const frameRadius = 12;
        this.fillRoundRect(
            ctx,
            frameInset,
            frameInset,
            width - (frameInset * 2),
            height - (frameInset * 2),
            frameRadius,
            '#ffffff',
        );

        [100, 80, 60, 40, 0].forEach((tick) => {
            const y = scoreToY(tick);
            ctx.beginPath();
            ctx.setLineWidth(tick === 60 ? 1.4 : 1);
            ctx.setStrokeStyle(tick === 60 ? 'rgba(234, 88, 12, 0.38)' : 'rgba(148, 163, 184, 0.22)');
            ctx.setLineDash(tick === 60 ? [5, 4] : [], 0);
            ctx.moveTo(plotLeft, y);
            ctx.lineTo(plotRight, y);
            ctx.stroke();

            ctx.setLineDash([], 0);
            ctx.setFillStyle(tick === 60 ? '#ea580c' : '#94a3b8');
            ctx.setFontSize(10);
            ctx.setTextAlign('right');
            ctx.setTextBaseline('middle');
            ctx.fillText(String(tick), plotLeft - 7, y);
        });

        if (hasData) {
            const weekTotal = items.reduce((sum, item) => sum + item.count, 0);
            const scoreTotal = items.reduce((sum, item) => sum + (item.averageScore * item.count), 0);
            const weekAverage = weekTotal > 0 ? Math.round(scoreTotal / weekTotal) : 0;
            const averageY = scoreToY(weekAverage);

            ctx.beginPath();
            ctx.setLineWidth(1.2);
            ctx.setStrokeStyle('rgba(15, 23, 42, 0.34)');
            ctx.setLineDash([3, 5], 0);
            ctx.moveTo(plotLeft, averageY);
            ctx.lineTo(plotRight, averageY);
            ctx.stroke();
            ctx.setLineDash([], 0);
        }

        items.forEach((item, index) => {
            const x = xAt(index);
            const slotWidth = plotWidth / Math.max(items.length, 1);
            const barWidth = Math.max(7, Math.min(16, slotWidth * 0.22));
            const barHeight = item.hasData
                ? Math.max(5, (item.count / maxCount) * plotHeight * 0.56)
                : 0;
            const barColor = item.isToday ? 'rgba(20, 184, 166, 0.56)' : 'rgba(37, 99, 235, 0.24)';

            if (item.hasData) {
                this.fillRoundRect(ctx, x - barWidth / 2, plotBottom - barHeight, barWidth, barHeight, 4, barColor);
            } else {
                this.fillRoundRect(ctx, x - 3, plotBottom - 6, 6, 6, 3, 'rgba(203, 213, 225, 0.7)');
            }

            ctx.setFillStyle(item.isToday ? '#2563eb' : '#94a3b8');
            ctx.setFontSize(10);
            ctx.setTextAlign('center');
            ctx.setTextBaseline('top');
            ctx.fillText(item.dateText, x, plotBottom + 12);
        });

        const scorePoints = items.map((item, index) => ({
            x: xAt(index),
            y: scoreToY(item.averageScore),
            item,
        }));

        ctx.setLineWidth(2.4);
        ctx.setStrokeStyle('#2563eb');
        ctx.setLineCap('round');
        ctx.setLineJoin('round');
        for (let index = 1; index < scorePoints.length; index += 1) {
            const previous = scorePoints[index - 1];
            const current = scorePoints[index];
            if (!previous.item.hasData || !current.item.hasData) {
                continue;
            }

            ctx.beginPath();
            ctx.moveTo(previous.x, previous.y);
            ctx.lineTo(current.x, current.y);
            ctx.stroke();
        }

        scorePoints.forEach((point) => {
            if (!point.item.hasData) {
                return;
            }

            ctx.beginPath();
            ctx.setFillStyle('#ffffff');
            ctx.setStrokeStyle(point.item.isToday ? '#0f766e' : '#2563eb');
            ctx.setLineWidth(2);
            ctx.arc(point.x, point.y, point.item.isToday ? 4.8 : 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        });

        ctx.beginPath();
        ctx.setLineWidth(1);
        ctx.setStrokeStyle('rgba(15, 23, 42, 0.16)');
        ctx.setLineDash([], 0);
        ctx.moveTo(plotLeft, plotBottom);
        ctx.lineTo(plotRight, plotBottom);
        ctx.stroke();

        if (!hasData) {
            ctx.setFillStyle('#64748b');
            ctx.setFontSize(13);
            ctx.setTextAlign('center');
            ctx.setTextBaseline('middle');
            ctx.fillText('最近 7 天暂无练习数据', width / 2, plotTop + plotHeight / 2);
        }

        this.strokeRoundRect(
            ctx,
            frameInset,
            frameInset,
            width - (frameInset * 2),
            height - (frameInset * 2),
            frameRadius,
            '#dbe4ef',
            1,
        );
        ctx.draw(false);
    },

    fillRoundRect(
        ctx: WechatMiniprogram.CanvasContext,
        x: number,
        y: number,
        width: number,
        height: number,
        radius: number,
        color: string,
    ) {
        const actualRadius = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
        ctx.beginPath();
        ctx.moveTo(x + actualRadius, y);
        ctx.lineTo(x + width - actualRadius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + actualRadius);
        ctx.lineTo(x + width, y + height - actualRadius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - actualRadius, y + height);
        ctx.lineTo(x + actualRadius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - actualRadius);
        ctx.lineTo(x, y + actualRadius);
        ctx.quadraticCurveTo(x, y, x + actualRadius, y);
        ctx.closePath();
        ctx.setFillStyle(color);
        ctx.fill();
    },

    strokeRoundRect(
        ctx: WechatMiniprogram.CanvasContext,
        x: number,
        y: number,
        width: number,
        height: number,
        radius: number,
        color: string,
        lineWidth: number,
    ) {
        const actualRadius = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
        ctx.beginPath();
        ctx.moveTo(x + actualRadius, y);
        ctx.lineTo(x + width - actualRadius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + actualRadius);
        ctx.lineTo(x + width, y + height - actualRadius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - actualRadius, y + height);
        ctx.lineTo(x + actualRadius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - actualRadius);
        ctx.lineTo(x, y + actualRadius);
        ctx.quadraticCurveTo(x, y, x + actualRadius, y);
        ctx.closePath();
        ctx.setStrokeStyle(color);
        ctx.setLineWidth(lineWidth);
        ctx.setLineDash([], 0);
        ctx.stroke();
    },

    formatDate(value: string) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
        const month = `${date.getMonth() + 1}`.padStart(2, '0');
        const day = `${date.getDate()}`.padStart(2, '0');
        const hour = `${date.getHours()}`.padStart(2, '0');
        const minute = `${date.getMinutes()}`.padStart(2, '0');
        return `${month}-${day} ${hour}:${minute}`;
    },

    formatTrendDate(value: string) {
        const parts = String(value || '').split('-');
        if (parts.length >= 2) {
            const month = parts.length >= 3 ? parts[1] : parts[0];
            const day = parts.length >= 3 ? parts[2] : parts[1];
            return `${Number(month) || month}/${Number(day) || day}`;
        }
        return String(value || '');
    },

    getTodayLabel() {
        const today = new Date();
        const month = `${today.getMonth() + 1}`.padStart(2, '0');
        const day = `${today.getDate()}`.padStart(2, '0');
        return `${month}-${day}`;
    },

    onBack() {
        wx.navigateBack();
    },

    onRetry() {
        this.loadReport();
    },
});
