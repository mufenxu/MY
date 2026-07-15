Component({
    properties: {
        show: {
            type: Boolean,
            value: false,
        },
        title: {
            type: String,
            value: '提示',
        },
        content: {
            type: String,
            value: '',
        },
        confirmText: {
            type: String,
            value: '确定',
        },
        cancelText: {
            type: String,
            value: '取消',
        },
    },

    methods: {
        onCancel() {
            this.triggerEvent('cancel');
        },
        onConfirm() {
            this.triggerEvent('confirm');
        },
    },
});
