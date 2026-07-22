const request = require('../../../../utils/request').default;
const logger = require('../../../../utils/logger');

Page({
    data: {
        deviceId: '',
        smartSchedule: {
            enabled: false,
            valleyTemp: 50,
            peakTemp: 45
        },
        // 制热时段配置
        heatSchedule: {
            enabled: false,
            defaultTemp: 35,
            periods: []
        },
        // 编辑弹窗状态
        showEditModal: false,
        editingPeriod: {
            id: '',
            startTime: '08:00',
            endTime: '22:00',
            targetTemp: 45
        },
        isNewPeriod: true,
        loading: true
    },

    onLoad(options) {
        this.fetchConfig();
    },

    async fetchConfig() {
        wx.showLoading({ title: '加载配置...' });
        try {
            const res = await request('/tuya/heat-pump/automation', 'GET');
            if (res && res.success) {
                const auto = res.automation || {};

                if (auto.smartSchedule) {
                    this.setData({
                        'smartSchedule.enabled': auto.smartSchedule.enabled,
                        'smartSchedule.valleyTemp': auto.smartSchedule.valleyTemp || 50,
                        'smartSchedule.peakTemp': auto.smartSchedule.peakTemp || 45
                    });
                }

                if (auto.heatSchedule) {
                    this.setData({
                        'heatSchedule.enabled': auto.heatSchedule.enabled || false,
                        'heatSchedule.defaultTemp': auto.heatSchedule.defaultTemp || 35,
                        'heatSchedule.periods': auto.heatSchedule.periods || []
                    });
                }
            }
        } catch (err) {
            logger.error(err);
            wx.showToast({ title: '加载失败', icon: 'none' });
        } finally {
            wx.hideLoading();
            this.setData({ loading: false });
        }
    },

    async saveConfig() {
        const temperatures = [
            this.data.smartSchedule.valleyTemp,
            this.data.smartSchedule.peakTemp,
            this.data.heatSchedule.defaultTemp,
            ...this.data.heatSchedule.periods.map(period => period.targetTemp)
        ];
        if (temperatures.some(temp => !Number.isInteger(temp) || temp < 15 || temp > 60)) {
            wx.showToast({ title: '温度范围: 15-60°C', icon: 'none' });
            return;
        }

        wx.showLoading({ title: '保存中...' });
        try {
            const data = {
                smartSchedule: this.data.smartSchedule,
                heatSchedule: this.data.heatSchedule
            };

            const res = await request('/tuya/heat-pump/automation', 'POST', data);
            if (res && res.success) {
                wx.showToast({ title: '保存成功', icon: 'success' });
            } else {
                wx.showToast({ title: '保存失败', icon: 'none' });
            }
        } catch (err) {
            logger.error(err);
            wx.showToast({ title: '保存出错', icon: 'none' });
        } finally {
            wx.hideLoading();
        }
    },

    // --- Smart Schedule Handlers ---
    onScheduleToggle(e) {
        this.setData({ 'smartSchedule.enabled': e.detail.value });
    },
    onValleyInput(e) {
        this.setData({ 'smartSchedule.valleyTemp': parseInt(e.detail.value) });
    },
    onPeakInput(e) {
        this.setData({ 'smartSchedule.peakTemp': parseInt(e.detail.value) });
    },

    // --- Heat Schedule Handlers ---
    onHeatScheduleToggle(e) {
        this.setData({ 'heatSchedule.enabled': e.detail.value });
    },
    onDefaultTempChange(e) {
        this.setData({ 'heatSchedule.defaultTemp': parseInt(e.detail.value) });
    },

    // 打开添加时段弹窗
    onAddPeriod() {
        this.setData({
            showEditModal: true,
            isNewPeriod: true,
            editingPeriod: {
                id: '',
                startTime: '08:00',
                endTime: '22:00',
                targetTemp: 45
            }
        });
    },

    // 打开编辑时段弹窗
    onEditPeriod(e) {
        const idx = e.currentTarget.dataset.idx;
        const period = this.data.heatSchedule.periods[idx];
        this.setData({
            showEditModal: true,
            isNewPeriod: false,
            editingPeriod: { ...period, _idx: idx }
        });
    },

    // 删除时段
    onDeletePeriod(e) {
        const idx = e.currentTarget.dataset.idx;
        const periods = [...this.data.heatSchedule.periods];
        periods.splice(idx, 1);
        this.setData({ 'heatSchedule.periods': periods });
    },

    // 时间选择器
    onStartTimeChange(e) {
        this.setData({ 'editingPeriod.startTime': e.detail.value });
    },
    onEndTimeChange(e) {
        this.setData({ 'editingPeriod.endTime': e.detail.value });
    },
    onTargetTempChange(e) {
        this.setData({ 'editingPeriod.targetTemp': parseInt(e.detail.value) });
    },

    // --- 自定义滑块逻辑 ---
    onSliderTouchStart(e) {
        this.handleSliderTouch(e, '#sliderContainer', 'editingPeriod.targetTemp');
    },
    onSliderTouchMove(e) {
        this.handleSliderTouch(e, '#sliderContainer', 'editingPeriod.targetTemp');
    },
    // 页面中的默认温度滑块
    onDefaultSliderTouch(e) {
        this.handleSliderTouch(e, '#defaultSliderContainer', 'heatSchedule.defaultTemp');
    },

    handleSliderTouch(e, selector, targetKey) {
        const query = wx.createSelectorQuery();
        query.select(selector).boundingClientRect(rect => {
            if (!rect) return;
            const touch = e.touches[0];
            const x = touch.clientX - rect.left;
            let percent = x / rect.width;
            percent = Math.max(0, Math.min(1, percent));

            const min = 15;
            const max = 60;
            const val = Math.round(min + (max - min) * percent);

            // 只有数值变化时才更新，防止频繁 setData
            const currentVal = selector.includes('default') ? this.data.heatSchedule.defaultTemp : this.data.editingPeriod.targetTemp;
            if (val !== currentVal) {
                this.setData({ [targetKey]: val });
            }
        }).exec();
    },

    // 关闭弹窗
    onCloseModal() {
        this.setData({ showEditModal: false });
    },

    // 确认保存时段
    onConfirmPeriod() {
        const { editingPeriod, isNewPeriod, heatSchedule } = this.data;
        const periods = [...heatSchedule.periods];

        // 验证
        if (!editingPeriod.startTime || !editingPeriod.endTime) {
            wx.showToast({ title: '请选择时间', icon: 'none' });
            return;
        }
        if (editingPeriod.targetTemp < 15 || editingPeriod.targetTemp > 60) {
            wx.showToast({ title: '温度范围: 15-60°C', icon: 'none' });
            return;
        }

        if (isNewPeriod) {
            // 新增
            periods.push({
                id: Date.now().toString(),
                startTime: editingPeriod.startTime,
                endTime: editingPeriod.endTime,
                targetTemp: editingPeriod.targetTemp
            });
        } else {
            // 编辑
            const idx = editingPeriod._idx;
            periods[idx] = {
                id: editingPeriod.id,
                startTime: editingPeriod.startTime,
                endTime: editingPeriod.endTime,
                targetTemp: editingPeriod.targetTemp
            };
        }

        this.setData({
            'heatSchedule.periods': periods,
            showEditModal: false
        });
    }
});
