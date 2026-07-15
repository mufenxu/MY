<template>
    <div
        ref="chartEl"
        class="mini-line-chart"
        :style="{ height: `${height}px` }"
        @mouseleave="activeIndex = -1">
        <svg
            :viewBox="viewBox"
            role="img"
            class="mini-line-chart__svg"
            @mousemove="handlePointerMove"
            @mouseleave="activeIndex = -1">
            <defs>
                <linearGradient :id="gradientId" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stop-color="#1b6ef3" stop-opacity="0.24" />
                    <stop offset="100%" stop-color="#1b6ef3" stop-opacity="0" />
                </linearGradient>
            </defs>

            <g class="mini-line-chart__grid">
                <line
                    v-for="tick in yTicks"
                    :key="tick.label"
                    :x1="padding.left"
                    :x2="chartWidth - padding.right"
                    :y1="tick.y"
                    :y2="tick.y"
                />
            </g>

            <g v-if="showYAxis" class="mini-line-chart__axis-labels">
                <text
                    v-for="tick in yTicks"
                    :key="`label-${tick.label}`"
                    :x="padding.left - 10"
                    :y="tick.y + 4"
                    text-anchor="end"
                >
                    {{ tick.label }}{{ unit }}
                </text>
            </g>

            <path v-if="linePath" class="mini-line-chart__area" :d="areaPath" :fill="`url(#${gradientId})`" />
            <path v-if="linePath" class="mini-line-chart__line" :d="linePath" vector-effect="non-scaling-stroke" />

            <g v-if="hasData">
                <g v-for="point in points" :key="point.label" class="mini-line-chart__point">
                    <circle :cx="point.x" :cy="point.y" r="3.5" />
                    <title>{{ point.label }}: {{ point.value }}{{ unit }}</title>
                </g>
            </g>

            <g v-if="activePoint" class="mini-line-chart__active">
                <line
                    :x1="activePoint.x"
                    :x2="activePoint.x"
                    :y1="padding.top"
                    :y2="height - padding.bottom"
                />
                <circle :cx="activePoint.x" :cy="activePoint.y" r="5" />
                <g :transform="tooltipTransform">
                    <rect width="108" height="42" rx="10" />
                    <text x="12" y="17">{{ activePoint.label }}</text>
                    <text x="12" y="32" class="mini-line-chart__tooltip-value">{{ activePoint.value }}{{ unit }}</text>
                </g>
            </g>

            <g class="mini-line-chart__labels">
                <text
                    v-for="point in visibleLabelPoints"
                    :key="point.label"
                    :x="point.x"
                    :y="height - 12"
                    text-anchor="middle"
                >
                    {{ point.label }}
                </text>
            </g>

            <text v-if="!hasData" class="mini-line-chart__empty" :x="chartWidth / 2" :y="height / 2" text-anchor="middle">
                {{ emptyText }}
            </text>
        </svg>
    </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps({
    labels: { type: Array, default: () => [] },
    values: { type: Array, default: () => [] },
    emptyText: { type: String, default: '暂无数据' },
    unit: { type: String, default: '' },
    height: { type: Number, default: 280 },
    showYAxis: { type: Boolean, default: true },
});

const chartEl = ref(null);
const measuredWidth = ref(640);
const activeIndex = ref(-1);
const padding = { top: 18, right: 28, bottom: 34, left: 46 };
const gradientId = `chart-fill-${Math.random().toString(36).slice(2)}`;
let resizeObserver = null;
let removeResizeFallback = null;

const chartWidth = computed(() => Math.max(320, measuredWidth.value));
const viewBox = computed(() => `0 0 ${chartWidth.value} ${props.height}`);
const plotWidth = computed(() => chartWidth.value - padding.left - padding.right);
const plotHeight = computed(() => props.height - padding.top - padding.bottom);
const normalizedValues = computed(() => props.labels.map((_, index) => Number(props.values[index]) || 0));
const maxValue = computed(() => Math.max(...normalizedValues.value, 1) * 1.12);
const hasData = computed(() => normalizedValues.value.some((value) => value > 0));
const activePoint = computed(() => points.value[activeIndex.value] || null);

function updateWidth() {
    measuredWidth.value = Math.round(chartEl.value?.clientWidth || 640);
}

onMounted(() => {
    updateWidth();
    if (typeof ResizeObserver !== 'undefined' && chartEl.value) {
        resizeObserver = new ResizeObserver(updateWidth);
        resizeObserver.observe(chartEl.value);
    } else if (typeof window !== 'undefined') {
        window.addEventListener('resize', updateWidth);
        removeResizeFallback = () => window.removeEventListener('resize', updateWidth);
    }
});

onBeforeUnmount(() => {
    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }
    if (removeResizeFallback) {
        removeResizeFallback();
        removeResizeFallback = null;
    }
});

const points = computed(() => {
    const count = Math.max(props.labels.length - 1, 1);
    return props.labels.map((label, index) => {
        const value = normalizedValues.value[index] || 0;
        return {
            label,
            value,
            x: padding.left + (plotWidth.value * index) / count,
            y: padding.top + plotHeight.value - (value / maxValue.value) * plotHeight.value,
        };
    });
});

function handlePointerMove(event) {
    if (!points.value.length || !chartEl.value) {
        activeIndex.value = -1;
        return;
    }

    const rect = chartEl.value.getBoundingClientRect();
    const ratio = chartWidth.value / Math.max(rect.width, 1);
    const x = (event.clientX - rect.left) * ratio;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    points.value.forEach((point, index) => {
        const distance = Math.abs(point.x - x);
        if (distance < nearestDistance) {
            nearestIndex = index;
            nearestDistance = distance;
        }
    });
    activeIndex.value = nearestIndex;
}

const linePath = computed(() => {
    if (!points.value.length) return '';
    return points.value
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
        .join(' ');
});

const areaPath = computed(() => {
    if (!points.value.length) return '';
    const bottom = props.height - padding.bottom;
    const first = points.value[0];
    const last = points.value[points.value.length - 1];
    return `${linePath.value} L ${last.x.toFixed(2)} ${bottom} L ${first.x.toFixed(2)} ${bottom} Z`;
});

const yTicks = computed(() => {
    const steps = 4;
    return Array.from({ length: steps }, (_, index) => {
        const value = Math.round((maxValue.value * (steps - 1 - index)) / (steps - 1));
        return {
            label: value,
            y: padding.top + (plotHeight.value * index) / (steps - 1),
        };
    });
});

const tooltipTransform = computed(() => {
    if (!activePoint.value) return '';
    const width = 108;
    const heightValue = 42;
    const x = Math.min(Math.max(activePoint.value.x + 10, padding.left), chartWidth.value - padding.right - width);
    const y = Math.max(padding.top, activePoint.value.y - heightValue - 12);
    return `translate(${x.toFixed(2)} ${y.toFixed(2)})`;
});

const visibleLabelPoints = computed(() => points.value.filter((point, index) => {
    if (points.value.length <= 5) return true;
    return index === 0 || index === points.value.length - 1 || index % 2 === 1;
}));
</script>

<style scoped>
.mini-line-chart {
    width: 100%;
    max-width: 100%;
    overflow: hidden;
}

.mini-line-chart__svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: hidden;
    cursor: crosshair;
}

.mini-line-chart__grid line {
    stroke: #e0e6ed;
    stroke-dasharray: 4 6;
}

.mini-line-chart__axis-labels text {
    fill: #8b98aa;
    font-size: 11px;
    font-weight: 650;
}

.mini-line-chart__line {
    fill: none;
    stroke: #1b6ef3;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.mini-line-chart__area {
    stroke: none;
}

.mini-line-chart__point circle {
    fill: #fff;
    stroke: #1b6ef3;
    stroke-width: 2;
}

.mini-line-chart__active {
    pointer-events: none;
}

.mini-line-chart__active line {
    stroke: rgba(27, 110, 243, 0.22);
    stroke-width: 1.5;
    stroke-dasharray: 5 5;
}

.mini-line-chart__active circle {
    fill: #1b6ef3;
    stroke: #fff;
    stroke-width: 3;
}

.mini-line-chart__active rect {
    fill: rgba(15, 23, 42, 0.9);
    filter: drop-shadow(0 8px 18px rgba(15, 23, 42, 0.18));
}

.mini-line-chart__active text {
    fill: #dbeafe;
    font-size: 11px;
    font-weight: 700;
}

.mini-line-chart__active .mini-line-chart__tooltip-value {
    fill: #fff;
    font-size: 14px;
    font-weight: 850;
}

.mini-line-chart__labels text {
    fill: #687281;
    font-size: 12px;
}

.mini-line-chart__empty {
    fill: #8a94a6;
    font-size: 14px;
    font-weight: 700;
}
</style>
