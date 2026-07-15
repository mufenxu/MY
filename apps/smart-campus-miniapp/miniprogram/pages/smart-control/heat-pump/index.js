const request = require('../../../utils/request').default;
const logger = require('../../../utils/logger');

Page({
    _isAlive: false,
    _isFetchingStatus: false,
    _isFetchingEnergy: false,
    _delayedRefreshTimer: null,
    data: {
        powerOn: false,
        online: false,
        currentTemp: '--',
        outdoorTemp: '--',
        targetTemp: '--',
        mode: '',
        modeLabel: '未知',
        // 诊断数据
        runCurrent: '--',
        runFreq: '--',
        acinVol: '--',
        waterOutTemp: '--',
        waterBackTemp: '--',
        ipmTemp: '--',
        realtimePower: '--',
        targetTankTemp: '--',
        targetCoolTemp: '--',
        isDefrosting: false,
        faultCode: 0,
        // 健康与能效
        healthList: [],
        copScore: '--',
        loadPercent: 0,
        targetFreq: '--',
        lastUpdate: '',
        loading: false,
        modes: [
            { label: '加热模式', value: 'heating', icon: 'icon-hot' },
            { label: '制冷模式', value: 'cold', icon: 'icon-cold' }
        ],
        // 涂鸦 DP ID 映射 (全量高级数据)
        DP_POWER: 'switch',
        DP_DCBUS: 'DCBUS_VOL',
        DP_EXHAUST: 'SYS_PQ_TEMP',
        DP_SUCTION: 'SYS_BACK_TEMP',
        DP_COIL: 'SYS_JIEL_TEMP',
        DP_TEMP_SET: 'temp_set',
        DP_TEMP_CURRENT: 'WATER_BACK_TEMP', // 修改为主显示回水温度
        DP_OUT_TEMP: 'OUT_TEMP',
        DP_WATER_OUT: 'WATER_OUT_TEMP',
        DP_WATER_BACK: 'WATER_BACK_TEMP',
        DP_CURRENT: 'RUN_CURRENT',
        DP_VOLTAGE: 'ACIN_VOL',
        DP_FREQ: 'RUN_FREQUENT',
        DP_IPM: 'IPM_TEMP',
        DP_FAULT: 'fault_num',
        DP_RUN_MODE: 'RUN_MODE',
        DP_SET_TANK: 'SET_TANK_TEMP',
        DP_SET_COOL: 'SET_COOL_TEMP',
        DP_TARGET_FREQ: 'TRAGE_FREQUENT',
        DP_PRO1: 'pro_flag1',
        DP_PRO2: 'pro_flag2',
        DP_PRO3: 'pro_flag3',
        DP_PRO4: 'pro_flag4',
        DP_MODE: 'mode'
    },

    onLoad() {
        this._isAlive = true;
        this.fetchStatus();
        this.fetchChartData(); // 加载图表数据
        this.fetchEnergyStats(); // 加载能耗数据
        this._startPollingTimers();
    },

    onShow() {
        this._isAlive = true;
        // 页面恢复时重启轮询，避免后台无效请求
        this._startPollingTimers();
        this.fetchStatus(true);
        this.fetchEnergyStats(true);
    },

    onHide() {
        this._isAlive = false;
        this._stopPollingTimers();
    },

    onUnload() {
        this._isAlive = false;
        this._stopPollingTimers();
    },

    _setDataIfChanged(patch) {
        if (!this._isAlive || !patch || typeof patch !== 'object') return;
        const changed = {};
        let hasChanged = false;
        Object.keys(patch).forEach((key) => {
            if (!Object.is(this.data[key], patch[key])) {
                changed[key] = patch[key];
                hasChanged = true;
            }
        });
        if (hasChanged) {
            this.setData(changed);
        }
    },

    _startPollingTimers() {
        // 每 3 秒自动刷新设备状态（轻量查询）
        if (!this.refreshTimer) {
            this.refreshTimer = setInterval(() => {
                this.fetchStatus(true);
            }, 3000);
        }

        // 能耗统计独立定时器，60 秒刷新一次（重量级查询，需要扫描大量日志）
        if (!this.energyTimer) {
            this.energyTimer = setInterval(() => {
                this.fetchEnergyStats(true);
            }, 60000);
        }
    },

    _stopPollingTimers() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
        if (this.energyTimer) {
            clearInterval(this.energyTimer);
            this.energyTimer = null;
        }
        if (this._delayedRefreshTimer) {
            clearTimeout(this._delayedRefreshTimer);
            this._delayedRefreshTimer = null;
        }
    },

    onPullDownRefresh() {
        this.fetchStatus().then(() => {
            wx.stopPullDownRefresh();
        });
    },

    /**
     * 获取设备最新状态
     */
    async fetchStatus(isSilent = false) {
        if (this._isFetchingStatus) {
            return;
        }
        // 防止控制后的数据回跳：如果距离上次下发指令不足 4 秒，暂不拉取云端数据
        // (等待云端数据一致性达成，在此期间 UI 保持乐观更新的状态)
        if (Date.now() - (this.lastCmdTime || 0) < 4000) {
            return;
        }

        this._isFetchingStatus = true;
        if (!isSilent) wx.showLoading({ title: '同步中...' });

        try {
            const res = await request('/tuya/heat-pump/status', 'GET');
            if (!this._isAlive) return;

            if (res && res.success && res.result) {
                this.parseStatus(res.result);
            } else {
                if (!isSilent) wx.showToast({ title: '获取状态失败', icon: 'none' });
            }
        } catch (err) {
            if (!this._isAlive) return;
            logger.error('Fetch HeatPump Status Failed', err);
            if (!isSilent) wx.showToast({ title: '网络请求失败', icon: 'none' });
        } finally {
            this._isFetchingStatus = false;
            if (!isSilent) wx.hideLoading();
        }
    },

    /**
     * 解析涂鸦设备状态
     */
    parseStatus(result) {
        const dataToSet = {};
        const now = new Date();
        dataToSet.lastUpdate = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

        // 处理在线状态
        const isOnline = result.online === true;
        dataToSet.online = isOnline;

        const statusList = result.status || [];
        statusList.forEach(item => {
            let val = item.value;
            // 自动处理缩放 (涂鸦标准协议通常温度为 10倍，电流也是 10倍)
            // 注意：IPM_TEMP (模块温度) 实际上报的是整数 (如 35 代表 35℃)，不应除以 10
            if (['WATER_OUT_TEMP', 'WATER_BACK_TEMP', 'OUT_TEMP', 'WATER_TANK_TEMP', 'SYS_JIEL_TEMP', 'SYS_PQ_TEMP', 'SYS_BACK_TEMP', 'RUN_CURRENT'].includes(item.code)) {
                val = val / 10;
            }

            switch (item.code) {
                case this.data.DP_POWER:
                    dataToSet.powerOn = val === true;
                    break;
                case this.data.DP_TEMP_SET:
                    dataToSet.targetTemp = val;
                    break;

                case this.data.DP_TEMP_CURRENT: // WATER_BACK_TEMP (映射匹配)
                    dataToSet.currentTemp = val;
                    dataToSet.waterBackTemp = val; // 同时更新回水温度小字
                    break;

                case this.data.DP_OUT_TEMP:
                    dataToSet.outdoorTemp = val;
                    break;
                case this.data.DP_WATER_OUT:
                    dataToSet.waterOutTemp = val; // 恢复出水温度的独立显示
                    break;

                // case this.data.DP_WATER_BACK: // 已被合并到 DP_TEMP_CURRENT 处理
                //     dataToSet.waterBackTemp = val;
                //     break;

                case this.data.DP_CURRENT:
                    dataToSet.runCurrent = val;
                    break;
                case this.data.DP_VOLTAGE:
                    dataToSet.acinVol = val;
                    break;
                case this.data.DP_FREQ:
                    dataToSet.runFreq = val;
                    break;
                case this.data.DP_IPM:
                    dataToSet.ipmTemp = val;
                    break;
                case this.data.DP_EXHAUST:
                    dataToSet.exhaustTemp = val;
                    break;
                case this.data.DP_DCBUS:
                    dataToSet.dcBusVol = val;
                    break;
                case this.data.DP_SUCTION:
                    dataToSet.suctionTemp = val;
                    break;
                case this.data.DP_COIL:
                    dataToSet.coilTemp = val;
                    break;
                case this.data.DP_FAULT:
                    const faultMap = {
                        1: '水箱温感故障', 2: '水温传感器故障', 3: '回水温感故障',
                        4: '室外冷凝器感温故障', 5: '室外环境温感故障', 6: '压缩机排气感温故障',
                        7: '压缩机回气感温故障', 8: '线控器与主板通信故障', 9: '线控器与室外机通信故障',
                        10: '泄压保护断开', 11: '电流过大停机', 12: '模块故障',
                        13: '相序模块异常', 14: '水流保护', 15: '系统压力高保护',
                        16: '过流保护', 17: 'U相过流保护', 18: 'V相过流保护', 19: 'W相过流保护',
                        20: '直流电压过压保护', 21: '直流电压欠压保护', 22: 'U相相位出错保护', 23: 'V相相位出错保护', 24: 'W相相位出错保护',
                        25: 'U相相位偏移故障', 26: 'V相相位偏移故障', 27: 'W相相位偏移故障',
                        28: '压缩机转速异常保护', 29: '压缩机转子卡死故障', 30: 'PFC过流保护', 31: 'PFC过压保护', 32: 'PFC欠压保护',
                        33: 'PFC故障', 34: '经济器进温感故障', 35: '经济器出温感故障',
                        36: 'PFC参数加载出错', 37: '驱动参数加载出错', 38: '直流电压反馈过压保护', 39: '驱动通讯断开故障', 40: '驱动执行超载',
                        41: '制冷节流后温度过低保护', 42: '2号直流风机故障', 43: '系统高压感温故障', 44: '系统低压感温故障',
                        45: '系统高压压力过高保护', 46: '系统低压压力过低保护', 50: '水箱温感故障(E50)',
                        61: '防冻保护', 62: '环境温度过低保护', 63: '压缩机启启动失败'
                    };
                    dataToSet.faultCode = val;
                    dataToSet.faultText = faultMap[val] || '';
                    break;
                case this.data.DP_RUN_MODE:
                    // 通常 4 或特定字符串表示除霜
                    dataToSet.isDefrosting = (val === 4 || val === 'defrost');
                    break;
                case this.data.DP_SET_TANK:
                    dataToSet.targetTankTemp = val;
                    // 解耦：不再强制覆盖制热设定温度，由用户独立调节
                    // if (this.data.mode === 'heating') dataToSet.targetTemp = val;
                    break;
                case this.data.DP_SET_COOL:
                    dataToSet.targetCoolTemp = val;
                    if (this.data.mode === 'cold') dataToSet.targetTemp = val;
                    break;
                case this.data.DP_TARGET_FREQ:
                    dataToSet.targetFreq = val;
                    break;
                case this.data.DP_PRO1:
                case this.data.DP_PRO2:
                case this.data.DP_PRO3:
                case this.data.DP_PRO4:
                    // 处理保护标志位更新逻辑在下方统一触发
                    break;
                case this.data.DP_MODE:
                    dataToSet.mode = val;
                    const m = this.data.modes.find(m => m.value === val);
                    if (m) dataToSet.modeLabel = m.label;
                    break;
            }
        });

        // 如果设备离线，UI上强制显示为“离线”并不处于“运行中”状态
        if (!isOnline) {
            dataToSet.powerOn = false;
        }

        // 计算实时功率 (P = U * I * cosφ)
        // 根据铭牌参数 (3kW / 220V / 13.8A ≈ 0.98)，功率因数调整为 0.96 以获得更准估算
        // 铭牌最大工作电流 13.8A，最大输入功率 3kW
        // P = U * I * 0.96 (保留原有保守估计)
        const vol = parseFloat(dataToSet.acinVol || this.data.acinVol);
        const cur = parseFloat(dataToSet.runCurrent || this.data.runCurrent);

        // 获取当前开关机状态 (优先取本次更新值)
        const isRunning = (dataToSet.powerOn !== undefined) ? dataToSet.powerOn : this.data.powerOn;

        let powerW = 0;
        if (!isNaN(vol) && !isNaN(cur)) {
            // 计算热泵主机功率 (W)
            let heatPumpPower = vol * cur * 0.985;

            // 加上外置水循环泵功率 370W (只要开机就工作)
            if (isRunning) {
                heatPumpPower += 370;
            }

            powerW = heatPumpPower;

            // 如果功率很大，转为 kW
            if (powerW > 1000) {
                dataToSet.realtimePower = (powerW / 1000).toFixed(2) + ' kW';
            } else {
                dataToSet.realtimePower = Math.round(powerW) + ' W';
            }
        } else {
            dataToSet.realtimePower = '--';
        }

        // --- 系统健康与能效深度计算 ---
        if (isOnline) {
            // 1. 保护状态解码 (参照说明书 Image 4 - d13 保护代码)
            const healthList = [];
            statusList.forEach(item => {
                if (item.code === 'pro_flag1' && item.value > 0) {
                    const val = parseInt(item.value);
                    if (val & 0x01) healthList.push('电流过大限频');
                    if (val & 0x02) healthList.push('排气过高限频');
                    if (val & 0x04) healthList.push('盘管制冷限频');
                    if (val & 0x08) healthList.push('IPM过热限频');
                    if (val & 0x10) healthList.push('系统高压限频');
                    if (val & 0x20) healthList.push('电压保护');
                    if (val & 0x40) healthList.push('节流后低温限频');
                }
            });
            dataToSet.healthList = healthList;

            // 2. 能效估算 (加热升温效率)
            // 公式：COP = (流量kg/s * 4186 * 温差) / 电功率W
            // 铭牌额定流量 1.2m³/h = 1200kg/3600s = 0.333 kg/s
            // 系数 = 0.333 * 4186 ≈ 1400
            const outT = parseFloat(dataToSet.waterOutTemp || this.data.waterOutTemp);
            const backT = parseFloat(dataToSet.waterBackTemp || this.data.waterBackTemp);

            // 只有当有温差且功率有效时才计算
            if (!isNaN(outT) && !isNaN(backT) && powerW > 100) {
                const deltaT = outT - backT;
                // 只有出水 > 回水 (制热) 或 回水 > 出水 (制冷?) 
                // 简单起见，取绝对值计算能量搬运量，或者只针对制热优化
                if (deltaT > 0) {
                    const efficiency = (deltaT * 1395 / powerW).toFixed(1);
                    dataToSet.copScore = efficiency;
                } else {
                    dataToSet.copScore = '0.0';
                }
            } else {
                dataToSet.copScore = '--';
            }

            // 3. 运行负荷
            const runF = parseFloat(dataToSet.runFreq || this.data.runFreq);
            const targetF = parseFloat(dataToSet.targetFreq || this.data.targetFreq);
            if (!isNaN(runF) && !isNaN(targetF) && targetF > 0) {
                dataToSet.loadPercent = Math.min(Math.round((runF / targetF) * 100), 100);
            }
        }

        this._setDataIfChanged(dataToSet);
    },

    /**
     * 校验设备在线状态
     */
    checkOnline() {
        if (!this.data.online) {
            wx.showToast({
                title: '设备离线，请检查电源或网络并联网',
                icon: 'none',
                duration: 2000
            });
            return false;
        }
        return true;
    },

    /**
     * 切换电源
     */
    async togglePower() {
        if (!this.checkOnline()) return;

        const oldState = this.data.powerOn;
        const nextState = !oldState;

        // 乐观更新: 立即更新 UI
        this.setData({ powerOn: nextState });

        const command = [{ code: this.data.DP_POWER, value: nextState }];

        // 静默发送指令
        this.sendCommands(command, null, () => {
            // 失败回滚
            this.setData({ powerOn: oldState });
        });
    },

    /**
     * 调节制热/制冷目标温度
     */
    async adjustTemp(e) {
        if (!this.checkOnline()) return;
        if (!this.data.powerOn) return;

        const delta = parseInt(e.currentTarget.dataset.delta);
        const oldTemp = this.data.targetTemp;
        const nextTemp = oldTemp + delta;

        // 温度范围限制
        if (nextTemp < 15 || nextTemp > 55) {
            wx.showToast({ title: '超出调节范围', icon: 'none' });
            return;
        }

        // 乐观更新
        this.setData({ targetTemp: nextTemp });

        const command = [{ code: this.data.DP_TEMP_SET, value: nextTemp }];

        this.sendCommands(command, null, () => {
            // 失败回滚
            this.setData({ targetTemp: oldTemp });
        });
    },

    /**
     * 调节设定水箱温度
     */
    async adjustTankTemp(e) {
        if (!this.checkOnline()) return;
        if (!this.data.powerOn) return;

        const delta = parseInt(e.currentTarget.dataset.delta);
        const oldTemp = this.data.targetTankTemp || 50;
        const nextTemp = oldTemp + delta;

        // 范围限制 (通常水箱温度范围 10~55)
        if (nextTemp < 10 || nextTemp > 55) {
            wx.showToast({ title: '超出调节范围', icon: 'none' });
            return;
        }

        // 乐观更新
        this.setData({ targetTankTemp: nextTemp });

        const command = [{ code: this.data.DP_SET_TANK, value: nextTemp }];

        this.sendCommands(command, null, () => {
            // 失败回滚
            this.setData({ targetTankTemp: oldTemp });
        });
    },

    /**
     * 设置模式
     */
    async setMode(e) {
        if (!this.checkOnline()) return;
        if (!this.data.powerOn) return;

        const newMode = e.currentTarget.dataset.mode;
        const oldMode = this.data.mode;
        const oldLabel = this.data.modeLabel;

        if (newMode === oldMode) return;

        // 乐观更新
        const m = this.data.modes.find(m => m.value === newMode);
        this.setData({
            mode: newMode,
            modeLabel: m ? m.label : '未知'
        });

        const command = [{ code: this.data.DP_MODE, value: newMode }];
        this.sendCommands(command, null, () => {
            // 失败回滚
            this.setData({
                mode: oldMode,
                modeLabel: oldLabel
            });
        });
    },

    /**
     * 统一下发指令 (支持乐观更新的回滚)
     * @param {Array} commands 指令集
     * @param {String|null} loadingText 如果为空则不显示 Loading
     * @param {Function} onError 失败回调
     */
    async sendCommands(commands, loadingText = null, onError) {
        // 记录最后一次控制时间，用于暂停自动轮询
        this.lastCmdTime = Date.now();

        if (loadingText) wx.showLoading({ title: loadingText });

        try {
            // 控制接口
            const res = await request('/tuya/heat-pump/control', 'POST', { commands });

            if (res && res.success) {
                if (loadingText) wx.showToast({ title: '操作成功', icon: 'success' });
                // 操作成功后延迟 2 秒默默刷新一次，确保云端状态最终一致
                if (this._delayedRefreshTimer) {
                    clearTimeout(this._delayedRefreshTimer);
                }
                this._delayedRefreshTimer = setTimeout(() => {
                    this._delayedRefreshTimer = null;
                    if (this._isAlive) {
                        this.fetchStatus(true);
                    }
                }, 2000);
            } else {
                throw new Error(res.msg || '操作失败');
            }
        } catch (err) {
            logger.error('Send Commands Failed', err);
            wx.showToast({ title: '操作失败，正在恢复状态...', icon: 'none' });
            if (onError) onError();
        } finally {
            if (loadingText) wx.hideLoading();
        }
    },

    /**
     * 获取图表数据
     */
    async fetchChartData() {
        try {
            const res = await request('/tuya/heat-pump/chart-data', 'GET');
            if (res && res.success && res.result) {
                this.drawChart(res.result);
            }
        } catch (err) {
            logger.error('Fetch Chart Data Failed', err);
        }
    },

    /**
     * 绘制 24H 趋势图 (Canvas 2D)
     */
    drawChart(data) {
        const query = wx.createSelectorQuery();
        query.select('#trendChart')
            .fields({ node: true, size: true })
            .exec((res) => {
                if (!res[0]) return;

                const canvas = res[0].node;
                const ctx = canvas.getContext('2d');
                const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
                const dpr = windowInfo.pixelRatio || 1;

                // 设置画布尺寸
                canvas.width = res[0].width * dpr;
                canvas.height = res[0].height * dpr;
                ctx.scale(dpr, dpr);

                const width = res[0].width;
                const height = res[0].height;
                const padding = { top: 20, right: 30, bottom: 30, left: 30 };
                const graphWidth = width - padding.left - padding.right;
                const graphHeight = height - padding.top - padding.bottom;

                // 清空画布
                ctx.clearRect(0, 0, width, height);

                if (!data || data.length === 0) {
                    ctx.fillStyle = '#94a3b8';
                    ctx.font = '12px sans-serif';
                    ctx.fillText('暂无历史数据', width / 2 - 30, height / 2);
                    return;
                }

                // 1. 计算极值
                const temps = data.map(d => d.temp).filter(v => v !== null);
                const powers = data.map(d => d.power).filter(v => v !== null);

                // 温度 Y轴 (左): 动态范围 + 留白
                const minTemp = Math.min(...temps, 0);
                const maxTemp = Math.max(...temps, 60);

                // 功率 Y轴 (右): 0 ~ 最大功率 * 1.2
                const maxPower = Math.max(...powers, 2000) * 1.1;

                // 2. 绘制坐标轴和网格
                ctx.lineWidth = 1;
                ctx.strokeStyle = '#f1f5f9';
                ctx.beginPath();

                // 横向网格线 (画 5 条)
                for (let i = 0; i <= 4; i++) {
                    const y = padding.top + (graphHeight / 4) * i;
                    ctx.moveTo(padding.left, y);
                    ctx.lineTo(width - padding.right, y);

                    // 左轴标签 (温度) - 红色
                    ctx.fillStyle = '#ef4444';
                    ctx.font = '10px sans-serif';
                    ctx.textAlign = 'right';
                    const tempVal = maxTemp - (maxTemp - minTemp) / 4 * i;
                    ctx.fillText(Math.round(tempVal) + '℃', padding.left - 5, y + 4);

                    // 右轴标签 (功率) - 蓝色
                    ctx.fillStyle = '#3b82f6';
                    ctx.textAlign = 'left';
                    const powerVal = maxPower - maxPower / 4 * i;

                    let powerText = Math.round(powerVal);
                    // 如果数值较大 (>1000)，转换为 kW 显示，带 'k' 单位更短
                    if (maxPower > 1000) {
                        powerText = (powerVal / 1000).toFixed(1) + 'k';
                    }

                    ctx.fillText(powerText, width - padding.right + 5, y + 4);
                }
                ctx.stroke();

                // 3. 绘制 X 轴时间标签 (动态自适应步长)
                ctx.fillStyle = '#94a3b8';
                ctx.textAlign = 'center';
                // 确保分母不为0，如果只有1个点，xStep无意义但不会显示线条
                const xStep = data.length > 1 ? graphWidth / (data.length - 1) : 0;

                // 目标显示约 6 个标签
                const labelCount = 6;
                let stride = Math.ceil(data.length / (labelCount - 1));
                if (stride < 1) stride = 1;

                for (let i = 0; i < data.length; i += stride) {
                    const item = data[i];
                    const x = padding.left + i * xStep;

                    // 避免最后一个标签画出界，如果靠太右可以靠左对齐，或者忽略
                    // 这里简单处理：直接画
                    ctx.fillText(item.time, x, height - 10);
                }

                // 4. 绘制功率曲线 (3D 渐变区域 + 平滑算法)
                const points = data.map((d, i) => ({
                    x: padding.left + i * xStep,
                    y: padding.top + graphHeight - (d.power / maxPower) * graphHeight
                }));

                ctx.beginPath();
                ctx.strokeStyle = '#3b82f6';
                ctx.lineWidth = 1.8;
                ctx.lineJoin = 'round';

                if (points.length > 2) {
                    ctx.moveTo(points[0].x, points[0].y);
                    for (let i = 1; i < points.length - 2; i++) {
                        const xc = (points[i].x + points[i + 1].x) / 2;
                        const yc = (points[i].y + points[i + 1].y) / 2;
                        ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
                    }
                    ctx.quadraticCurveTo(points[points.length - 2].x, points[points.length - 2].y, points[points.length - 1].x, points[points.length - 1].y);
                } else if (points.length === 2) {
                    ctx.moveTo(points[0].x, points[0].y);
                    ctx.lineTo(points[1].x, points[1].y);
                }
                ctx.stroke();

                // 绘制 3D 容积渐变
                const gradientP = ctx.createLinearGradient(0, padding.top, 0, padding.top + graphHeight);
                gradientP.addColorStop(0, 'rgba(59, 130, 246, 0.25)');
                gradientP.addColorStop(0.6, 'rgba(59, 130, 246, 0.08)');
                gradientP.addColorStop(1, 'rgba(59, 130, 246, 0.01)');

                if (points.length > 0) {
                    ctx.lineTo(points[points.length - 1].x, padding.top + graphHeight);
                    ctx.lineTo(points[0].x, padding.top + graphHeight);
                    ctx.closePath();
                    ctx.fillStyle = gradientP;
                    ctx.fill();
                }

                // 5. 绘制温度曲线 (3D 立体描边)
                ctx.beginPath();
                // 增加一层微弱的黑色投影，模拟 3D 悬浮
                ctx.shadowColor = 'rgba(239, 68, 68, 0.2)';
                ctx.shadowBlur = 8;
                ctx.shadowOffsetY = 4;

                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 3;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                let hasMove = false;
                data.forEach((d, i) => {
                    if (d.temp === null) return;
                    const x = padding.left + i * xStep;
                    const y = padding.top + graphHeight - ((d.temp - minTemp) / (maxTemp - minTemp)) * graphHeight;

                    if (!hasMove) {
                        ctx.moveTo(x, y);
                        hasMove = true;
                    } else {
                        ctx.lineTo(x, y);
                    }
                });
                ctx.stroke();

                // 重置阴影以免影响后续绘制
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetY = 0;

                // 6. 装饰性绘制: 末端呼吸点
                if (data.length > 0) {
                    const last = data[data.length - 1];
                    const x = padding.left + (data.length - 1) * xStep;
                    const yTemp = padding.top + graphHeight - ((last.temp - minTemp) / (maxTemp - minTemp)) * graphHeight;

                    ctx.beginPath();
                    ctx.fillStyle = '#ef4444';
                    ctx.arc(x, yTemp, 4, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                }
            });
    },

    /**
     * 获取今日能耗
     */
    async fetchEnergyStats(isSilent = false) {
        if (this._isFetchingEnergy) {
            return;
        }
        this._isFetchingEnergy = true;
        try {
            const res = await request('/tuya/heat-pump/energy-stats', 'GET');
            if (!this._isAlive) return;
            if (res && res.success && res.result) {
                this._setDataIfChanged({
                    dailyEnergy: res.result.dailyConsumption,
                    estimatedCost: res.result.estimatedCost || '0.00'
                });
            }
        } catch (err) {
            if (!isSilent && this._isAlive) logger.error('Fetch Energy Stats Failed', err);
        } finally {
            this._isFetchingEnergy = false;
        }
    },

    goToEnergyReport() {
        this.setData({ showEnergyPopup: true });
    },

    closeEnergyPopup() {
        this.setData({ showEnergyPopup: false });
    },

    goToSmartSettings() {
        wx.navigateTo({
            url: '/pages/smart-control/heat-pump/smart-settings/index'
        });
    }
});
