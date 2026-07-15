import React, { useEffect, useState } from 'react';
import { Input, Button, Card, Progress, Empty, message, Tag, Typography, Spin } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleFilled,
  FieldTimeOutlined,
  FileSearchOutlined,
  IdcardOutlined,
  InfoCircleOutlined,
  MobileOutlined,
  NumberOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  SyncOutlined,
  UserOutlined,
} from '@ant-design/icons';
import api from '../utils/api';
import './PublicQuery.css';

const { Title, Text } = Typography;

const queryTypes = [
  { icon: <MobileOutlined />, label: '手机号' },
  { icon: <IdcardOutlined />, label: '学号' },
  { icon: <NumberOutlined />, label: '记录编号' },
];

const PublicQuery = () => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshingId, setRefreshingId] = useState(null);
  const [results, setResults] = useState(null);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = '星轨控制台';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  const handleSearch = async () => {
    const keyword = query.trim();
    if (keyword.length < 2) {
      message.warning('请输入有效的手机号、学号或记录编号');
      return;
    }

    setLoading(true);
    try {
      const res = await api.get(`/course-order/public-search?q=${encodeURIComponent(keyword)}`);
      if (res.data.code === 200) {
        setResults(Array.isArray(res.data.data) ? res.data.data : []);
      } else {
        message.error(res.data.message || '未查到相关信息');
        setResults([]);
      }
    } catch (err) {
      console.error(err);
      if (err.response && err.response.status === 429) {
        message.warning(err.response.data?.message || err.response.data || '访问过于频繁，请稍后再试');
      } else {
        message.error('系统繁忙，请稍后再试');
      }
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async (tradeNo) => {
    setRefreshingId(tradeNo);
    try {
      const res = await api.post('/course-order/public-refresh', { tradeNo });
      if (res.data.code === 200) {
        message.success(res.data.message || '记录已刷新');
        if (results) {
          const updated = results.map((item) => {
            if (item.tradeNo === tradeNo && res.data.data) {
              return { ...item, ...res.data.data };
            }
            return item;
          });
          setResults(updated);
        }
      } else {
        message.warning(res.data.message || '刷新请求失败');
      }
    } catch (err) {
      console.error(err);
      if (err.response && err.response.status === 429) {
        message.warning(err.response.data?.message || err.response.data || '刷新过于频繁，请稍后再试');
      } else {
        message.error('刷新失败，请检查网络或稍后重试');
      }
    } finally {
      setRefreshingId(null);
    }
  };

  const parseProgress = (prog) => {
    if (!prog) return 0;
    const normalized = String(prog).trim();
    const percentMatch = normalized.match(/^\s*(\d+(?:\.\d+)?)\s*%\s*$/);
    if (percentMatch) {
      return Math.min(Math.max(parseFloat(percentMatch[1]), 0), 100);
    }

    const numeric = parseFloat(normalized);
    if (!Number.isNaN(numeric)) {
      return Math.min(Math.max(numeric, 0), 100);
    }

    return 0;
  };

  const formatTime = (time) => {
    if (!time) return '未记录';
    const d = new Date(time);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <main className="record-query-page">
      <section className="record-hero" aria-labelledby="record-query-title">
        <div className="record-hero-copy">
          <div className="brand-mark">
            <span className="brand-mark-icon"><SafetyCertificateOutlined /></span>
            <span>星轨记录工具</span>
          </div>

          <Title id="record-query-title" level={1} className="record-title">
            学习记录自查
          </Title>

          <Text className="record-subtitle">
            通过手机号、学号或记录编号核验已记录的状态信息。
          </Text>

          <div className="record-support-list" aria-label="可查询类型">
            {queryTypes.map((item) => (
              <span className="support-pill" key={item.label}>
                {item.icon}
                {item.label}
              </span>
            ))}
          </div>

          <div className="notice-strip">
            <InfoCircleOutlined />
            <div className="notice-copy">
              <span>页面信息可能存在延迟，具体情况请以原平台页面展示为准。</span>
              <strong>如果此页面显示已完成，但实际页面仍未完成，请联系我协助核验记录。</strong>
            </div>
          </div>
        </div>

        <div className="record-query-panel" aria-label="记录查询">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">Record Lookup</span>
              <h2>记录查询</h2>
            </div>
            <FileSearchOutlined />
          </div>

          <div className="query-input-row">
            <Input
              size="large"
              placeholder="请输入手机号 / 学号 / 记录编号"
              value={query}
              allowClear
              onChange={(e) => setQuery(e.target.value)}
              onPressEnter={handleSearch}
              prefix={<SearchOutlined className="query-input-icon" />}
              className="record-search-input"
            />
            <Button
              type="primary"
              size="large"
              loading={loading}
              onClick={handleSearch}
              className="record-search-button"
              icon={<SearchOutlined />}
            >
              查询
            </Button>
          </div>

          <div className="query-helper-grid">
            <div>
              <span>支持</span>
              <strong>手机号 / 学号 / 编号</strong>
            </div>
            <div>
              <span>结果</span>
              <strong>仅供自查参考</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="record-results-section" aria-label="查询结果">
        {loading ? (
          <div className="record-loading">
            <Spin size="large" tip="正在获取记录信息..." />
          </div>
        ) : results === null ? (
          <div className="record-empty-intro">
            <CheckCircleOutlined />
            <span>输入信息后即可查看记录状态</span>
          </div>
        ) : results.length > 0 ? (
          <div className="record-list">
            {results.map((order, index) => {
              const isCompleted = order.statusText?.includes('完成');
              const isRefreshing = refreshingId === order.tradeNo;

              return (
                <Card
                  key={order.tradeNo || index}
                  className={`record-result-card${isCompleted ? ' is-complete' : ''}`}
                  hoverable
                >
                  <div className="result-card-top">
                    <div>
                      <Title level={4} ellipsis={{ tooltip: order.courseName }} className="result-title">
                        {order.courseName || '未知记录'}
                      </Title>
                      <Text className="result-time">最后更新 {formatTime(order.updateTime)}</Text>
                    </div>
                    <Tag color={isCompleted ? 'success' : 'processing'} className="result-status">
                      {order.statusText || '进行中'}
                    </Tag>
                  </div>

                  <div className="result-progress">
                    <div className="progress-copy">
                      <span>记录状态</span>
                      <strong>{order.progress || '0%'}</strong>
                    </div>
                    <Progress
                      percent={parseProgress(order.progress)}
                      strokeColor={{
                        '0%': '#2563eb',
                        '100%': '#0f766e',
                      }}
                      strokeWidth={12}
                      className="record-progress-bar"
                      status={isCompleted ? 'success' : 'active'}
                    />
                  </div>

                  {order.remarks && (
                    <div className="result-remarks">
                      <InfoCircleOutlined />
                      <Text>{order.remarks}</Text>
                    </div>
                  )}

                  <div className="result-meta">
                    <div className="meta-item">
                      <UserOutlined />
                      <span>关联账号</span>
                      <strong>{order.account || '未记录'}</strong>
                    </div>
                    <div className="meta-item">
                      <FieldTimeOutlined />
                      <span>记录编号</span>
                      <strong title={order.tradeNo}>{order.tradeNo || '未记录'}</strong>
                    </div>
                    <div className="meta-item">
                      <ClockCircleFilled />
                      <span>记录时间</span>
                      <strong>{formatTime(order.createTime || order.updateTime)}</strong>
                    </div>
                  </div>

                  <div className="result-actions">
                    <button
                      disabled={isRefreshing}
                      onClick={() => handleRefresh(order.tradeNo)}
                      className={`refresh-record-button${isRefreshing ? ' is-loading' : ''}`}
                    >
                      <SyncOutlined spin={isRefreshing} />
                      {isRefreshing ? '刷新中...' : '刷新记录'}
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="record-empty-state">
            <Empty description="未发现相关记录，请检查输入是否正确" />
          </div>
        )}
      </section>

      <footer className="record-footer">
        © 2024 星轨记录工具 · 个人学习记录自查页面
      </footer>
    </main>
  );
};

export default PublicQuery;
