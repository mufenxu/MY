import React from 'react';
import { Button, Card, Space, Tag, Typography } from 'antd';
import { ApiOutlined, BellOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const Notifications = () => (
    <Card bordered={false} style={{ borderRadius: 20, boxShadow: 'var(--card-shadow)' }}>
        <Space direction="vertical" size={18} style={{ width: '100%' }}>
            <Space size={10} wrap>
                <Tag color="processing">已迁移</Tag>
                <Tag>发送记录</Tag>
                <Tag>Android App</Tag>
                <Tag>企业微信</Tag>
                <Tag>API 接入</Tag>
            </Space>
            <div>
                <Title level={4} style={{ marginTop: 0 }}>
                    通知管理已迁移到统一控制台
                </Title>
                <Text type="secondary">
                    旧的通知发布和配置入口已停用。请在统一通知控制中心查看发送台账、发送企业微信或 Android App 测试通知、维护接收偏好、模板编排和 API 接入。
                </Text>
            </div>
            <Button
                type="primary"
                size="large"
                icon={<BellOutlined />}
                onClick={() => { window.location.href = '/console?view=notification'; }}
            >
                打开统一通知控制中心
            </Button>
            <Button
                type="link"
                icon={<ApiOutlined />}
                onClick={() => { window.location.href = '/console?view=notification'; }}
            >
                管理通知服务 API
            </Button>
        </Space>
    </Card>
);

export default Notifications;
