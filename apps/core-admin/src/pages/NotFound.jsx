import { useEffect, useMemo, useState } from 'react';
import { HomeOutlined, ReloadOutlined, RocketOutlined, SmileOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router';
import './NotFound.css';

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

const AUTH_RANDOM_DEST = ['/dashboard', '/users', '/notifications', '/air-energy'];

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

    const hasSessionHint = useMemo(() => {
        try {
            return Boolean(localStorage.getItem('user'));
        } catch {
            return false;
        }
    }, []);

    const fallbackPath = hasSessionHint ? '/dashboard' : '/login';
    const bonkText = BONK_LINES[bonkCount % BONK_LINES.length];
    const currentPath = location.pathname || '/';

    const handleRandomJump = () => {
        if (!hasSessionHint) {
            navigate('/login');
            return;
        }
        const next = AUTH_RANDOM_DEST[Math.floor(Math.random() * AUTH_RANDOM_DEST.length)];
        navigate(next);
    };

    return (
        <div className="notfound-wrap">
            <div className="notfound-card">
                <span className="notfound-glow notfound-glow-a" aria-hidden="true" />
                <span className="notfound-glow notfound-glow-b" aria-hidden="true" />

                <span className="tag tone-info notfound-path">迷路坐标：{currentPath}</span>

                <div className="notfound-code" aria-label="404">
                    <span>4</span>
                    <span>0</span>
                    <span>4</span>
                </div>

                <p className="notfound-subtitle">管理后台里没有这条路，不过笑点已经送达。</p>
                <p className="notfound-quip">{QUIPS[quipIndex]}</p>
                <div className="notfound-radar" aria-hidden="true" />

                <div className="notfound-actions">
                    <button type="button" className="btn btn-primary" onClick={() => navigate(fallbackPath)}>
                        <HomeOutlined />
                        {hasSessionHint ? '带我回仪表盘' : '带我去登录'}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={handleRandomJump}>
                        <RocketOutlined />
                        随机传送
                    </button>
                    <button type="button" className="btn btn-text" onClick={() => setBonkCount(prev => prev + 1)}>
                        <ReloadOutlined spin={bonkCount % 2 === 1} />
                        再撞一次墙
                    </button>
                </div>

                <p className="notfound-bonk">
                    <SmileOutlined />
                    {bonkText}
                </p>
            </div>
        </div>
    );
};

export default NotFound;
