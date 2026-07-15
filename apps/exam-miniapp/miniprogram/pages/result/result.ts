Page({
    data: {
        result: null as any,
        scoreLevel: 'score-good',
        scoreTitle: '表现不错',
        scoreBadgeText: '稳住节奏',
        scoreSummary: '继续复盘错题，把薄弱点一点点补齐。',
        accuracyPercent: 0,
        wrongCount: 0,
    },

    onLoad(options: any) {
        // Try to get data from options (URL params)
        if (options.result) {
            try {
                const result = JSON.parse(decodeURIComponent(options.result));
                this.initData(result);
            } catch (e) {
                console.error('Parse result failed', e);
            }
        }

        // Also try event channel
        const eventChannel = this.getOpenerEventChannel();
        if (eventChannel && typeof eventChannel.on === 'function') {
            eventChannel.on('acceptDataFromOpenerPage', (data) => {
                this.initData(data);
            });
        }

        // Fallback: Load from storage if categoryId is provided (for redirectTo from exam page)
        if (!options.result && options.categoryId) {
            try {
                const stored = wx.getStorageSync(`exam_result_${options.categoryId}`);
                if (stored) {
                    this.initData(stored);
                }
            } catch (e) {
                console.error('Load from storage failed', e);
            }
        }
    },

    initData(result: any) {
        const score = Number(result.score || 0);
        const totalCount = Number(result.totalCount || 0);
        const correctCount = Number(result.correctCount || 0);
        const wrongCount = Math.max(totalCount - correctCount, 0);
        const rawAccuracy = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
        const accuracyPercent = Math.max(0, Math.min(rawAccuracy, 100));

        let scoreLevel = 'score-good';
        let scoreTitle = '表现不错';
        let scoreBadgeText = '稳住节奏';
        let scoreSummary = '继续复盘错题，把薄弱点一点点补齐。';

        if (score >= 90) {
            scoreLevel = 'score-excellent';
            scoreTitle = '太棒了';
            scoreBadgeText = '高分通过';
            scoreSummary = '这次答题状态很在线，可以进入下一轮巩固。';
        } else if (score >= 60) {
            scoreLevel = 'score-good';
            scoreTitle = '顺利通过';
            scoreBadgeText = '继续加油';
            scoreSummary = '基础掌握不错，复盘错题后还能再提一截。';
        } else {
            scoreLevel = 'score-need-review';
            scoreTitle = '继续练习';
            scoreBadgeText = '重点复盘';
            scoreSummary = '先从错题和解析入手，下一次会更稳。';
        }

        this.setData({
            result,
            scoreLevel,
            scoreTitle,
            scoreBadgeText,
            scoreSummary,
            accuracyPercent,
            wrongCount,
        });
    },

    onBackHome() {
        wx.reLaunch({
            url: '/pages/index/index'
        });
    },

    onViewDetail() {
        const { result } = this.data;
        if (!result) return;

        wx.navigateTo({
            url: `/pages/exam-review/exam-review`,
            success: (res) => {
                res.eventChannel.emit('acceptDataFromOpenerPage', result);
            }
        });
    }
});
