import React from 'react';
import { Result, Button, Typography } from 'antd';
import { SyncOutlined, HomeOutlined } from '@ant-design/icons';

const { Paragraph, Text } = Typography;

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        // You can also log the error to an error reporting service like Sentry
        console.error('ErrorBoundary caught an error:', error, errorInfo);
        this.setState({ errorInfo });
    }

    handleReload = () => {
        window.location.reload();
    };

    handleHome = () => {
        window.location.href = this.props.homePath || '/';
    };

    render() {
        if (this.state.hasError) {
            // Render fallback UI
            return (
                <div style={{ padding: '50px', background: 'var(--bg-color)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Result
                        status="500"
                        title="页面遇到了一些问题"
                        subTitle="很抱歉，在渲染该页面时发生了意外错误。我们的开发人员已被通知。"
                        extra={[
                            <Button type="primary" key="reload" icon={<SyncOutlined />} onClick={this.handleReload}>
                                重新加载
                            </Button>,
                            <Button key="home" icon={<HomeOutlined />} onClick={this.handleHome}>
                                返回首页
                            </Button>,
                        ]}
                    >
                        {import.meta.env.DEV && (
                            <div className="desc">
                                <Paragraph>
                                    <Text strong style={{ fontSize: 16 }}>错误详情（仅供开发参考）:</Text>
                                </Paragraph>
                                <Paragraph>
                                    <Text type="danger">{this.state.error?.toString()}</Text>
                                </Paragraph>
                            </div>
                        )}
                    </Result>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
