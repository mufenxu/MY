import React from 'react';
import { Button, Card, Space, Typography } from 'antd';
import { BellOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const Notifications = () => (
    <Card bordered={false} style={{ borderRadius: 20, boxShadow: 'var(--card-shadow)' }}>
        <Space direction="vertical" size={18} style={{ width: '100%' }}>
            <div>
                <Title level={4} style={{ marginTop: 0 }}>
                    通知
                </Title>
                <Text type="secondary">
                    查看发送记录、发送测试通知或修改接收方式，请打开通知中心。
                </Text>
            </div>
            <Button
                type="primary"
                size="large"
                icon={<BellOutlined />}
                onClick={() => { window.location.href = '/console?view=notification'; }}
            >
                打开通知中心
            </Button>
        </Space>
    </Card>
);

export default Notifications;
