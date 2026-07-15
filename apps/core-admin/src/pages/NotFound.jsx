import React, { useEffect, useMemo, useState } from 'react';
import { Button, Space, Tag, Typography } from 'antd';
import { HomeOutlined, ReloadOutlined, RocketOutlined, SmileOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import './NotFound.css';

const { Paragraph, Text } = Typography;

const QUIPS = [
    '系统认真找了一圈，确认这里没有页面，只有空气和一点点尴尬。',
    '你打开的是隐藏关卡，可惜奖励只有一个 404。',
    '这条链接像周一早晨的灵魂：存在感很强，实体不存在。',
    '后台导航员表示：前方道路施工，请原路返回。'
];

const BONK_LINES = [
    '提示：多点几次也不会召唤出这个页面。',
    '页面还没写出来，但你的探索精神值得加鸡腿。',
    '工程师正在赶来，预计永远不会到这个地址。',
    '这不是 bug，这是你发现的幽默彩蛋。'
];

const AUTH_RANDOM_DEST = ['/dashboard', '/users', '/notifications', '/iot-monitor', '/air-energy'];

const NotFound = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [quipIndex, setQuipIndex] = useState(0);
    const [bonkCount, setBonkCount] = useState(0);

    useEffect(() => {
        const timer = window.setInterval(() => {
            setQuipIndex(prev => (prev + 1) % QUIPS.length);
        }, 2400);
        return () => window.clearInterval(timer);
    }, []);

    const hasToken = useMemo(() => {
        try {
            return Boolean(localStorage.getItem('token'));
        } catch {
            return false;
        }
    }, []);

    const fallbackPath = hasToken ? '/dashboard' : '/login';
    const bonkText = BONK_LINES[bonkCount % BONK_LINES.length];
    const currentPath = location.pathname || '/';

    const handleRandomJump = () => {
        if (!hasToken) {
            navigate('/login');
            return;
        }
        const next = AUTH_RANDOM_DEST[Math.floor(Math.random() * AUTH_RANDOM_DEST.length)];
        navigate(next);
    };

    return (
        <div className="notfound-wrap">
            <div className="notfound-card">
                <span className="notfound-orb notfound-orb-a" />
                <span className="notfound-orb notfound-orb-b" />
                <span className="notfound-orb notfound-orb-c" />

                <Tag className="notfound-path-tag" bordered={false}>
                    迷路坐标：{currentPath}
                </Tag>

                <div className="notfound-title" aria-label="404">
                    <span>4</span>
                    <span>0</span>
                    <span>4</span>
                </div>

                <Paragraph className="notfound-subtitle">
                    管理后台里没有这条路，不过笑点已经送达。
                </Paragraph>

                <Text className="notfound-quip">{QUIPS[quipIndex]}</Text>
                <div className="notfound-radar" />

                <Space wrap className="notfound-actions" size={[10, 10]}>
                    <Button type="primary" size="large" icon={<HomeOutlined />} onClick={() => navigate(fallbackPath)}>
                        {hasToken ? '带我回仪表盘' : '带我去登录'}
                    </Button>
                    <Button size="large" icon={<RocketOutlined />} onClick={handleRandomJump}>
                        随机传送
                    </Button>
                    <Button
                        size="large"
                        type="text"
                        icon={<ReloadOutlined spin={bonkCount % 2 === 1} />}
                        onClick={() => setBonkCount(prev => prev + 1)}
                    >
                        再撞一次墙
                    </Button>
                </Space>

                <Text className="notfound-bonk">
                    <SmileOutlined /> {bonkText}
                </Text>
            </div>
        </div>
    );
};

export default NotFound;
