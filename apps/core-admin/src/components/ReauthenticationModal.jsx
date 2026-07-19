import React, { useEffect } from 'react';
import { Form, Input, Modal } from 'antd';
import { IS_PLATFORM_SSO } from '../utils/runtime';

const ReauthenticationModal = ({
    open,
    title = '敏感操作二次验证',
    confirmLoading = false,
    danger = false,
    onCancel,
    onConfirm,
}) => {
    const [form] = Form.useForm();

    useEffect(() => {
        if (!open) form.resetFields();
    }, [form, open]);

    const handleConfirm = async () => {
        const values = await form.validateFields();
        await onConfirm(values);
    };

    return (
        <Modal
            title={title}
            open={open}
            onOk={handleConfirm}
            onCancel={onCancel}
            confirmLoading={confirmLoading}
            okText="验证并继续"
            okButtonProps={{ danger }}
            destroyOnHidden
        >
            <Form form={form} layout="vertical" preserve={false}>
                <Form.Item
                    name="password"
                    label={IS_PLATFORM_SSO ? '统一管理账号密码' : '当前 Core 管理员密码'}
                    rules={[{ required: true, message: '请输入当前密码' }]}
                >
                    <Input.Password autoComplete="current-password" />
                </Form.Item>
                {IS_PLATFORM_SSO && (
                    <Form.Item name="totp" label="动态验证码（已启用时必填）">
                        <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
                    </Form.Item>
                )}
            </Form>
        </Modal>
    );
};

export default ReauthenticationModal;
