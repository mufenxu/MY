Component({
    data: {
        selected: 0,
        color: "#94a3b8",
        selectedColor: "#3b82f6",
        list: [
            {
                pagePath: "/pages/index/index",
                text: "首页"
            },
            {
                pagePath: "/pages/profile/profile",
                text: "我的"
            }
        ]
    },
    methods: {
        switchTab(e: any) {
            const data = e.currentTarget.dataset;
            const url = data.path;

            // Haptic Feedback for premium feel
            wx.vibrateShort({ type: 'light' });

            wx.switchTab({ url });

            // Optimistic update (though target page onShow will override)
            this.setData({
                selected: data.index
            });
        }
    }
});
