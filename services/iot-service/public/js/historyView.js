(function (global) {
  'use strict';

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function noop() {}

  function isSensorDevice(device) {
    return device.temp !== undefined || device.hum !== undefined;
  }

  function formatTimestamp(timestamp) {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date(timestamp));
  }

  function formatShortTime(timestamp) {
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(timestamp));
  }

  function formatPointTime(timestamp) {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date(timestamp));
  }

  function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function createDomain(values, paddingRatio, fallbackMin, fallbackMax) {
    if (!values.length) {
      return { min: fallbackMin, max: fallbackMax };
    }

    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) {
      min -= 1;
      max += 1;
    }

    const padding = Math.max((max - min) * paddingRatio, paddingRatio > 0.14 ? 3 : 0.8);
    return {
      min: min - padding,
      max: max + padding
    };
  }

  function scaleY(value, domain, plot) {
    const ratio = (value - domain.min) / (domain.max - domain.min || 1);
    return plot.bottom - ratio * (plot.bottom - plot.top);
  }

  function createSmoothPath(points) {
    if (!points.length) return '';
    if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;

    const commands = [`M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`];
    for (let index = 0; index < points.length - 1; index += 1) {
      const current = points[index];
      const next = points[index + 1];
      const previous = points[index - 1] || current;
      const afterNext = points[index + 2] || next;
      const cp1x = current.x + (next.x - previous.x) / 6;
      const cp1y = current.y + (next.y - previous.y) / 6;
      const cp2x = next.x - (afterNext.x - current.x) / 6;
      const cp2y = next.y - (afterNext.y - current.y) / 6;
      commands.push(
        `C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${next.x.toFixed(1)} ${next.y.toFixed(1)}`
      );
    }

    return commands.join(' ');
  }

  function createAreaPath(points, baseline) {
    if (points.length < 2) return '';
    const first = points[0];
    const last = points[points.length - 1];
    return `${createSmoothPath(points)} L ${last.x.toFixed(1)} ${baseline.toFixed(1)} L ${first.x.toFixed(1)} ${baseline.toFixed(1)} Z`;
  }

  function formatAxisValue(value, suffix, decimals) {
    return `${value.toFixed(decimals)}${suffix}`;
  }

  function createHistoryView(options = {}) {
    const {
      modalChartBox,
      mainChartBox,
      tableBody,
      deviceSelector,
      rangeSelector,
      exportButton,
      requestJson,
      requestTimeoutMs = 30000,
      getTheme = () => 'dark',
      getLastHistoryData = () => null,
      setLastHistoryData = noop,
      setupCustomSelect = noop,
      showToast = noop
    } = options;

    function renderModalChart(data) {
      renderSvgToContainer(data, modalChartBox, getTheme());
    }

    function renderMainChart(data) {
      renderSvgToContainer(data, mainChartBox, getTheme());
    }

    function renderTable(data) {
      if (!tableBody) return;

      if (!data || data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="3" class="muted" style="text-align: center;">暂无足够的传感器采样记录</td></tr>';
        return;
      }

      const displayData = [...data].reverse().slice(0, 50);
      tableBody.innerHTML = displayData.map((item) => `
        <tr>
          <td data-label="采集时间" style="padding: 10px 14px;">${formatTimestamp(item.created_at)}</td>
          <td data-label="温度数值" style="padding: 10px 14px; font-weight:600; color:var(--text-main);">${item.temp != null ? `${Number(item.temp).toFixed(1)} °C` : '--'}</td>
          <td data-label="湿度数值" style="padding: 10px 14px; font-weight:600; color:var(--text-main);">${item.hum != null ? `${Number(item.hum).toFixed(1)} %` : '--'}</td>
        </tr>
      `).join('');
    }

    function updateDeviceSelector(devices) {
      if (!deviceSelector) return;

      const currentValue = deviceSelector.value;
      const deviceList = Object.values(devices || {}).filter(isSensorDevice);

      if (deviceList.length === 0) {
        deviceSelector.innerHTML = '<option value="">-- 当前无温湿度设备 --</option>';
        setupCustomSelect(deviceSelector);
        return;
      }

      deviceSelector.innerHTML = ['<option value="">-- 选择分析物理设备 --</option>']
        .concat(deviceList.map((device) =>
          `<option value="${escapeHtml(device.id)}">${escapeHtml(device.name)} (${escapeHtml(device.id)})</option>`
        ))
        .join('');

      if (currentValue && deviceList.some((device) => device.id === currentValue)) {
        deviceSelector.value = currentValue;
      }

      setupCustomSelect(deviceSelector);
    }

    async function loadMainChart() {
      if (!deviceSelector || !mainChartBox || !requestJson) return;

      const deviceId = deviceSelector.value;
      if (!deviceId) {
        mainChartBox.innerHTML = '<p class="muted" style="text-align:center; padding-top: 140px;">请先在右上角下拉框中选择要分析的物理设备。</p>';
        return;
      }

      const range = rangeSelector ? rangeSelector.value : '';
      mainChartBox.innerHTML = '<p class="muted" style="text-align:center; padding-top: 140px;">正在提取 MongoDB 历史传感器采样...</p>';

      try {
        const url = `/api/devices/${deviceId}/history${range ? `?range=${range}` : ''}`;
        const data = await requestJson(url, {
          timeoutMs: requestTimeoutMs
        });

        if (!data || data.length < 2) {
          mainChartBox.innerHTML = '<p class="muted" style="text-align:center; padding-top: 140px;">当前时间区间内在 MongoDB 中暂无充足的传感器采样记录。</p>';
          return;
        }

        setLastHistoryData(data);
        renderMainChart(data);
        renderTable(data);
      } catch (error) {
        mainChartBox.innerHTML = `<p class="muted" style="text-align:center; padding-top: 140px; color:var(--danger);">提取历史记录失败: ${escapeHtml(error.message)}</p>`;
      }
    }

    function exportCsv() {
      const data = getLastHistoryData();
      if (!data || data.length === 0) {
        showToast('导出失败', '当前无历史采样数据可供导出，请先选择设备和时间跨度。', 'error');
        return;
      }

      const deviceId = deviceSelector ? (deviceSelector.value || 'device') : 'device';
      const csvRows = ['时间戳,温度(°C),湿度(%)'];

      data.forEach((item) => {
        csvRows.push(`"${formatTimestamp(item.created_at)}",${item.temp ?? ''},${item.hum ?? ''}`);
      });

      const csvContent = '\uFEFF' + csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `mqtt_sensor_history_${deviceId}_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast('CSV 导出成功', '采样历史时序表已被浏览器下载保存。', 'success');
    }

    if (deviceSelector) {
      deviceSelector.addEventListener('change', loadMainChart);
    }

    if (rangeSelector) {
      rangeSelector.addEventListener('change', loadMainChart);
    }

    if (exportButton) {
      exportButton.addEventListener('click', exportCsv);
    }

    return {
      exportCsv,
      loadMainChart,
      renderMainChart,
      renderModalChart,
      renderTable,
      updateDeviceSelector
    };
  }

  function renderSvgToContainer(data, container, theme) {
    if (!data || data.length < 2 || !container) return;

    const rows = data
      .map((item) => ({
        created_at: item.created_at,
        temp: toNumber(item.temp),
        hum: toNumber(item.hum)
      }))
      .filter((item) => item.created_at && (item.temp !== null || item.hum !== null));

    if (rows.length < 2) {
      container.innerHTML = '<p class="muted" style="text-align:center; padding-top: 140px;">当前时间区间内暂无足够的有效采样点。</p>';
      return;
    }

    const containerWidth = Math.max(container.clientWidth || 0, 320);
    const isCompact = containerWidth < 560;
    const width = isCompact ? 680 : 920;
    const height = isCompact ? 310 : 360;
    const padding = isCompact
      ? { top: 58, right: 54, bottom: 58, left: 54 }
      : { top: 62, right: 78, bottom: 58, left: 72 };
    const plot = {
      left: padding.left,
      right: width - padding.right,
      top: padding.top,
      bottom: height - padding.bottom
    };
    const plotWidth = plot.right - plot.left;
    const plotHeight = plot.bottom - plot.top;
    const chartId = `history-chart-${Date.now()}-${Math.round(Math.random() * 100000)}`;

    const temps = rows.map((item) => item.temp).filter((value) => value !== null);
    const hums = rows.map((item) => item.hum).filter((value) => value !== null);
    const tempDomain = createDomain(temps, 0.12, 0, 40);
    const humDomain = createDomain(hums, 0.16, 0, 100);
    const xStep = plotWidth / (rows.length - 1 || 1);
    const axisTicks = [];
    const interactionPoints = [];
    const tempPoints = [];
    const humPoints = [];

    rows.forEach((item, index) => {
      const x = plot.left + index * xStep;
      const point = {
        x,
        time: formatPointTime(item.created_at),
        shortTime: formatShortTime(item.created_at),
        temp: item.temp,
        hum: item.hum,
        tempY: item.temp !== null ? scaleY(item.temp, tempDomain, plot) : null,
        humY: item.hum !== null ? scaleY(item.hum, humDomain, plot) : null
      };

      if (point.tempY !== null) {
        tempPoints.push({ x, y: point.tempY, val: item.temp, time: point.time });
      }

      if (point.humY !== null) {
        humPoints.push({ x, y: point.humY, val: item.hum, time: point.time });
      }

      interactionPoints.push(point);
    });

    const tickCount = isCompact ? 4 : 5;
    for (let index = 0; index < tickCount; index += 1) {
      const rawIndex = Math.round((index / (tickCount - 1)) * (rows.length - 1));
      const point = interactionPoints[rawIndex];
      if (point && !axisTicks.some((tick) => tick.index === rawIndex)) {
        axisTicks.push({
          index: rawIndex,
          x: point.x,
          text: point.shortTime
        });
      }
    }

    const isLight = theme === 'light';
    const tempLineColor = isLight ? '#dc2626' : '#fb7185';
    const tempLineEnd = isLight ? '#f97316' : '#f59e0b';
    const humLineColor = isLight ? '#2563eb' : '#60a5fa';
    const humLineEnd = isLight ? '#0891b2' : '#22d3ee';
    const gridColor = isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(226, 232, 240, 0.08)';
    const axisColor = isLight ? 'rgba(15, 23, 42, 0.34)' : 'rgba(226, 232, 240, 0.34)';
    const labelColor = isLight ? '#64748b' : '#94a3b8';
    const surfaceStart = isLight ? '#ffffff' : '#1e293b';
    const surfaceEnd = isLight ? '#f8fafc' : '#020617';
    const cardBg = isLight ? 'rgba(248, 250, 252, 0.72)' : 'rgba(15, 23, 42, 0.26)';

    let svg = `
      <svg class="sensor-history-chart" viewBox="0 0 ${width} ${height}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" data-width="${width}" data-height="${height}">
        <defs>
          <linearGradient id="${chartId}-surface" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${surfaceStart}" stop-opacity="${isLight ? '0.92' : '0.26'}" />
            <stop offset="100%" stop-color="${surfaceEnd}" stop-opacity="${isLight ? '0.38' : '0.10'}" />
          </linearGradient>
          <linearGradient id="${chartId}-temp-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="${tempLineColor}" />
            <stop offset="100%" stop-color="${tempLineEnd}" />
          </linearGradient>
          <linearGradient id="${chartId}-hum-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="${humLineColor}" />
            <stop offset="100%" stop-color="${humLineEnd}" />
          </linearGradient>
          <linearGradient id="${chartId}-temp-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${tempLineColor}" stop-opacity="${isLight ? '0.20' : '0.22'}" />
            <stop offset="100%" stop-color="${tempLineColor}" stop-opacity="0" />
          </linearGradient>
          <linearGradient id="${chartId}-hum-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${humLineColor}" stop-opacity="${isLight ? '0.18' : '0.20'}" />
            <stop offset="100%" stop-color="${humLineColor}" stop-opacity="0" />
          </linearGradient>
          <filter id="${chartId}-soft-glow" x="-16%" y="-28%" width="132%" height="156%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .22 0" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect x="0" y="0" width="${width}" height="${height}" rx="16" fill="url(#${chartId}-surface)" />
        <rect x="${plot.left}" y="${plot.top}" width="${plotWidth}" height="${plotHeight}" rx="10" fill="${cardBg}" />
    `;

    const gridLines = 4;
    for (let index = 0; index <= gridLines; index += 1) {
      const ratio = index / gridLines;
      const y = plot.top + ratio * plotHeight;
      const tempValue = tempDomain.max - ratio * (tempDomain.max - tempDomain.min);
      const humValue = humDomain.max - ratio * (humDomain.max - humDomain.min);

      svg += `
        <line x1="${plot.left}" y1="${y.toFixed(1)}" x2="${plot.right}" y2="${y.toFixed(1)}" stroke="${gridColor}" stroke-width="1" class="svg-fade-in" />
        <text x="${plot.left - 12}" y="${(y + 4).toFixed(1)}" fill="${labelColor}" font-size="${isCompact ? 9 : 10}" font-weight="600" text-anchor="end" class="svg-fade-in">${formatAxisValue(tempValue, '°', 0)}</text>
        <text x="${plot.right + 12}" y="${(y + 4).toFixed(1)}" fill="${labelColor}" font-size="${isCompact ? 9 : 10}" font-weight="600" text-anchor="start" class="svg-fade-in">${formatAxisValue(humValue, '%', 0)}</text>
      `;
    }

    axisTicks.forEach((tick) => {
      svg += `
        <line x1="${tick.x.toFixed(1)}" y1="${plot.top}" x2="${tick.x.toFixed(1)}" y2="${plot.bottom}" stroke="${gridColor}" stroke-width="1" opacity="0.55" class="svg-fade-in" />
        <text x="${tick.x.toFixed(1)}" y="${height - 21}" fill="${labelColor}" font-size="${isCompact ? 9 : 10}" font-weight="600" text-anchor="middle" class="svg-fade-in">${tick.text}</text>
      `;
    });

    svg += `
      <line x1="${plot.left}" y1="${plot.bottom}" x2="${plot.right}" y2="${plot.bottom}" stroke="${axisColor}" stroke-width="1" class="svg-fade-in" />
      <line x1="${plot.left}" y1="${plot.top}" x2="${plot.left}" y2="${plot.bottom}" stroke="${axisColor}" stroke-width="1" class="svg-fade-in" />
      <line x1="${plot.right}" y1="${plot.top}" x2="${plot.right}" y2="${plot.bottom}" stroke="${axisColor}" stroke-width="1" class="svg-fade-in" />
      <g transform="translate(${plot.left}, 27)" class="svg-fade-in chart-legend">
        <rect x="0" y="-13" width="${isCompact ? 172 : 200}" height="30" rx="15" fill="${isLight ? 'rgba(255,255,255,0.78)' : 'rgba(15,23,42,0.42)'}" stroke="${gridColor}" />
        <circle cx="18" cy="2" r="4.5" fill="${tempLineColor}" />
        <text x="30" y="6" fill="var(--text-main)" font-size="${isCompact ? 10 : 11}" font-weight="700">温度</text>
        <circle cx="${isCompact ? 90 : 104}" cy="2" r="4.5" fill="${humLineColor}" />
        <text x="${isCompact ? 102 : 116}" y="6" fill="var(--text-main)" font-size="${isCompact ? 10 : 11}" font-weight="700">湿度</text>
      </g>
    `;

    if (humPoints.length > 1) {
      svg += `<path d="${createAreaPath(humPoints, plot.bottom)}" fill="url(#${chartId}-hum-area)" class="svg-fade-in chart-area" />`;
      svg += `<path d="${createSmoothPath(humPoints)}" class="svg-chart-line svg-chart-hum" stroke="url(#${chartId}-hum-line)" filter="url(#${chartId}-soft-glow)" />`;
    }

    if (tempPoints.length > 1) {
      svg += `<path d="${createAreaPath(tempPoints, plot.bottom)}" fill="url(#${chartId}-temp-area)" class="svg-fade-in chart-area" />`;
      svg += `<path d="${createSmoothPath(tempPoints)}" class="svg-chart-line svg-chart-temp" stroke="url(#${chartId}-temp-line)" filter="url(#${chartId}-soft-glow)" />`;
    }

    svg += `
      <g class="chart-hover-layer" opacity="0">
        <line class="chart-cursor-line" x1="${plot.left}" y1="${plot.top}" x2="${plot.left}" y2="${plot.bottom}" />
        <circle class="chart-cursor-dot chart-cursor-temp" cx="${plot.left}" cy="${plot.top}" r="0" />
        <circle class="chart-cursor-dot chart-cursor-hum" cx="${plot.left}" cy="${plot.top}" r="0" />
      </g>
      <g class="chart-hit-zones">
    `;

    interactionPoints.forEach((point, index) => {
      const prevX = index === 0 ? plot.left : (interactionPoints[index - 1].x + point.x) / 2;
      const nextX = index === interactionPoints.length - 1 ? plot.right : (point.x + interactionPoints[index + 1].x) / 2;
      svg += `
        <rect class="chart-hover-zone" x="${prevX.toFixed(1)}" y="${plot.top}" width="${Math.max(nextX - prevX, 1).toFixed(1)}" height="${plotHeight}"
          data-x="${point.x.toFixed(1)}"
          data-temp-y="${point.tempY === null ? '' : point.tempY.toFixed(1)}"
          data-hum-y="${point.humY === null ? '' : point.humY.toFixed(1)}"
          data-temp="${point.temp === null ? '--' : `${point.temp.toFixed(1)} °C`}"
          data-hum="${point.hum === null ? '--' : `${point.hum.toFixed(1)} %RH`}"
          data-time="${escapeHtml(point.time)}" />
      `;
    });

    svg += `
      </g>
    </svg>`;

    container.innerHTML = svg;
    bindChartTooltip(container);
  }

  function bindChartTooltip(container) {
    container.style.position = 'relative';

    const svg = container.querySelector('.sensor-history-chart');
    const hoverLayer = container.querySelector('.chart-hover-layer');
    const cursorLine = container.querySelector('.chart-cursor-line');
    const tempCursor = container.querySelector('.chart-cursor-temp');
    const humCursor = container.querySelector('.chart-cursor-hum');
    const zones = container.querySelectorAll('.chart-hover-zone');
    const viewBoxWidth = Number(svg?.dataset.width || 1);
    const viewBoxHeight = Number(svg?.dataset.height || 1);

    let tooltip = container.querySelector('.chart-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.className = 'chart-tooltip';
      tooltip.style.opacity = '0';
      container.appendChild(tooltip);
    }

    function toPixelPosition(x, y) {
      const svgRect = svg.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      return {
        x: svgRect.left - containerRect.left + (x / viewBoxWidth) * svgRect.width,
        y: svgRect.top - containerRect.top + (y / viewBoxHeight) * svgRect.height
      };
    }

    function setCursorCircle(circle, x, y, radius) {
      if (!y) {
        circle.setAttribute('r', '0');
        return;
      }

      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', radius);
    }

    function showTooltip(zone) {
      const x = zone.getAttribute('data-x');
      const tempY = zone.getAttribute('data-temp-y');
      const humY = zone.getAttribute('data-hum-y');
      const temp = zone.getAttribute('data-temp');
      const hum = zone.getAttribute('data-hum');
      const time = zone.getAttribute('data-time');

      hoverLayer.setAttribute('opacity', '1');
      cursorLine.setAttribute('x1', x);
      cursorLine.setAttribute('x2', x);
      setCursorCircle(tempCursor, x, tempY, tempY ? '5.5' : '0');
      setCursorCircle(humCursor, x, humY, humY ? '5.5' : '0');

      tooltip.innerHTML = `
        <div class="chart-tooltip-time">${escapeHtml(time)}</div>
        <div class="chart-tooltip-row">
          <span class="chart-tooltip-label chart-tooltip-label-temp">温度</span>
          <span class="chart-tooltip-val chart-tooltip-val-temp">${escapeHtml(temp)}</span>
        </div>
        <div class="chart-tooltip-row">
          <span class="chart-tooltip-label chart-tooltip-label-hum">湿度</span>
          <span class="chart-tooltip-val chart-tooltip-val-hum">${escapeHtml(hum)}</span>
        </div>
      `;
      tooltip.style.opacity = '1';
      tooltip.style.transform = 'translateY(0)';

      requestAnimationFrame(() => {
        const anchorY = tempY || humY || '0';
        const position = toPixelPosition(Number(x), Number(anchorY));
        const maxLeft = container.clientWidth - tooltip.offsetWidth - 10;
        const left = Math.max(10, Math.min(position.x - tooltip.offsetWidth / 2, maxLeft));
        const top = Math.max(10, position.y - tooltip.offsetHeight - 16);
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
      });
    }

    function hideTooltip() {
      hoverLayer.setAttribute('opacity', '0');
      tooltip.style.opacity = '0';
      tooltip.style.transform = 'translateY(4px)';
    }

    zones.forEach((zone) => {
      zone.addEventListener('mouseenter', () => showTooltip(zone));
      zone.addEventListener('mousemove', () => showTooltip(zone));
      zone.addEventListener('click', (event) => {
        event.stopPropagation();
        showTooltip(zone);
      });
    });

    container.addEventListener('mouseleave', hideTooltip);
    container.onclick = (event) => {
      if (!event.target.classList.contains('chart-hover-zone')) {
        hideTooltip();
      }
    };
  }

  global.MqttApiHistoryView = {
    createHistoryView
  };
})(window);
