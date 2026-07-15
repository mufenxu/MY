import request from '../../utils/request'

Page({
    data: {
        isLoading: true,
        newsList: [] as string[],
        tip: '',
        date: '',
        error: '',
        isMaintenance: false,
    },

    onLoad() {
        this.fetchNews()
    },

    onPullDownRefresh() {
        this.fetchNews().then(() => {
            wx.stopPullDownRefresh()
        })
    },

    async fetchNews() {
        this.setData({ isLoading: true, error: '' })

        try {
            const res = await request<any>('/news/daily', 'GET')

            if (res && res.code === 200 && res.data) {
                const { news, tip, date, isMaintenance } = res.data

                // Format date to include day of week
                let formattedDate = date || '';
                if (date) {
                    const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
                    const dateObj = new Date(date);
                    if (!isNaN(dateObj.getTime())) {
                        const dayOfWeek = days[dateObj.getDay()];
                        formattedDate = `${date} ${dayOfWeek}`;
                    }
                }

                this.setData({
                    newsList: news || [],
                    tip: tip || '',
                    date: formattedDate,
                    isLoading: false,
                    isMaintenance: !!isMaintenance
                })
            } else {
                this.setData({
                    isLoading: false,
                    error: '数据整理中，请稍后再试'
                })
            }
        } catch (err) {
            this.setData({
                isLoading: false,
                error: '网络请求失败，请检查网络设置'
            })
            console.error('Fetch news failed', err)
        }
    },



    onShareAppMessage() {
        return {
            title: '每日60秒读懂世界',
            path: '/pages/daily-news/index'
        }
    }
})
