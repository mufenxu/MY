import React, { useState, useEffect, useCallback } from 'react';
import { Form, Input, Button, Switch, Card, Divider, Space, Row, Col, Select, Typography, Tabs, Modal, Tag, Upload } from 'antd';
import { useNavigate } from 'react-router';
import { message } from '../utils/feedback';
import {
    SaveOutlined,
    UserOutlined,
    LockOutlined,
    PlayCircleOutlined,
    SettingOutlined,
    SafetyCertificateOutlined,
    ScheduleOutlined,
    KeyOutlined,
    ApiOutlined,
    AppstoreOutlined,
    FileTextOutlined,
    DatabaseOutlined,
    DownloadOutlined,
    UploadOutlined,
    WarningOutlined
} from '@ant-design/icons';
import api from '../utils/api';
import SecretSettings from '../components/SecretSettings';
import CourseConfig from '../components/CourseConfig';
import CourseCategoryConfig from '../components/CourseCategoryConfig';
import TurnstileSettings from '../components/TurnstileSettings';

const { Option } = Select;
const { Title, Text } = Typography;

const BACKUP_REQUEST_TIMEOUT_MS = 120000;
const RESTORE_REQUEST_TIMEOUT_MS = 300000;
const MANUAL_TASK_TIMEOUT_MS = 120000;
const DEFAULT_CRON_SCHEDULE = '0 9 * * *';

const CRON_PRESETS = [
    { label: '每天上午 9:00', value: '0 9 * * *' },
    { label: '每天上午 9:00 和下午 6:00', value: '0 9,18 * * *' },
    { label: '每天中午 12:00', value: '0 12 * * *' },
    { label: '每天午夜 0:00', value: '0 0 * * *' },
    { label: '每 6 小时执行一次', value: '0 */6 * * *' },
    { label: '每 12 小时执行一次', value: '0 */12 * * *' },
    { label: '每周一上午 9:00', value: '0 9 * * 1' },
    { label: '自定义', value: 'custom' }
];

const CronSettings = ({ title, type }) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [taskStatus, setTaskStatus] = useState(null);
    const [selectedSchedule, setSelectedSchedule] = useState(DEFAULT_CRON_SCHEDULE);
    const [customSchedule, setCustomSchedule] = useState('');
    const latestRequestRef = React.useRef(0);
    const selectedScheduleRef = React.useRef(DEFAULT_CRON_SCHEDULE);
    const customScheduleRef = React.useRef('');
    const enabledValue = Form.useWatch('enabled', form);
    const isTaskEnabled = enabledValue !== false;

    const applyConfig = useCallback((config = {}) => {
        const schedule = config.schedule || DEFAULT_CRON_SCHEDULE;
        const isPreset = CRON_PRESETS.some(p => p.value === schedule && p.value !== 'custom');
        const formSchedule = isPreset ? schedule : 'custom';
        const enabled = config.enabled !== false;

        selectedScheduleRef.current = formSchedule;
        customScheduleRef.current = isPreset ? '' : schedule;
        setSelectedSchedule(formSchedule);
        setCustomSchedule(isPreset ? '' : schedule);
        form.setFieldsValue({
            schedule: formSchedule,
            customSchedule: isPreset ? undefined : schedule,
            enabled
        });
        setTaskStatus({
            enabled,
            running: config.running,
            currentSchedule: config.currentSchedule,
            schedule
        });
    }, [form]);

    const loadConfig = useCallback(async () => {
        const requestId = latestRequestRef.current + 1;
        latestRequestRef.current = requestId;

        try {
            const res = await api.get('/settings/cron', {
                params: { type, _t: requestId },
                headers: {
                    'Cache-Control': 'no-cache',
                    Pragma: 'no-cache',
                },
            });

            if (latestRequestRef.current !== requestId) return;

            if (res.data.success) {
                applyConfig(res.data.result || {});
            }
        } catch {
            message.error(`${title}加载失败`);
        }
    }, [applyConfig, title, type]);

    useEffect(() => {
        loadConfig();
    }, [loadConfig]);

    const onFinish = async (values) => {
        latestRequestRef.current += 1;
        setLoading(true);
        try {
            let schedule = selectedSchedule || selectedScheduleRef.current || form.getFieldValue('schedule') || values.schedule || DEFAULT_CRON_SCHEDULE;
            if (schedule === 'custom') {
                const customValue = customSchedule || customScheduleRef.current || form.getFieldValue('customSchedule') || values.customSchedule;
                if (!customValue) {
                    message.error('请输入自定义时间规则');
                    setLoading(false);
                    return;
                }
                schedule = customValue;
            }
            const enabled = values.enabled !== false;

            const res = await api.post('/settings/cron', { type, schedule, enabled });
            if (res.data.success) {
                const result = res.data.result || { schedule, enabled };
                applyConfig(result);
                message.success(`${title}已保存`);
            } else {
                message.error(res.data.error || '保存失败');
            }
        } catch (err) {
            message.error(err.response?.data?.error || '保存失败');
        } finally {
            setLoading(false);
        }
    };

    const handleRunNow = async () => {
        try {
            setLoading(true);
            const res = await api.post('/settings/run-task', { type }, {
                timeout: MANUAL_TASK_TIMEOUT_MS,
            });
            if (res.data.success) {
                const result = res.data.result;
                if (type === 'ct8_task') {
                    message.success(result?.ok ? 'CT8签到任务已提交' : 'CT8签到任务已执行');
                } else if (result && result.skipped) {
                    const reasonText = {
                        no_config: '旧通知配置不存在',
                        owner_not_configured: '通知配置未绑定资源所有者',
                        no_channel: 'App、邮件和企业微信通知渠道均未配置',
                    }[result.reason] || result.reason || '配置未完成';
                    message.warning(`提醒任务已跳过：${reasonText}`);
                } else if (result?.error) {
                    message.error('提醒任务执行失败，请查看服务日志');
                } else if (result?.channels && Object.values(result.channels).some(channel => channel?.success === false)) {
                    if (result.sent) {
                        message.warning('提醒已发送，但部分通知渠道失败，请查看服务日志');
                    } else {
                        message.error('已命中到期资源，但通知渠道发送失败，请查看服务日志');
                    }
                } else if (result && result.sent) {
                    message.success('检查完成并已发送提醒');
                } else {
                    message.info('检查完成，暂无需要提醒的内容');
                }
            } else {
                message.error(res.data.error || '执行失败');
            }
        } catch (err) {
            message.error(err.response?.data?.error || '执行失败');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card title={title} bordered={false} style={{ borderRadius: 20, boxShadow: 'var(--card-shadow)', marginBottom: 24 }}>
            <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ enabled: true, schedule: DEFAULT_CRON_SCHEDULE }}>
                <Form.Item name="enabled" label="自动运行" valuePropName="checked">
                    <Switch checkedChildren="已开启" unCheckedChildren="已暂停" />
                </Form.Item>
                {taskStatus && (
                    <Tag color={taskStatus.enabled ? 'success' : 'default'} style={{ marginBottom: 16 }}>
                        {taskStatus.enabled ? '自动运行中' : '已暂停'}
                    </Tag>
                )}
                {isTaskEnabled && (
                    <>
                        <Form.Item label="运行时间" required>
                            <Select
                                value={selectedSchedule}
                                onChange={(value) => {
                                    setSelectedSchedule(value);
                                    selectedScheduleRef.current = value;
                                    if (value !== 'custom') {
                                        setCustomSchedule('');
                                        customScheduleRef.current = '';
                                        form.setFieldValue('customSchedule', undefined);
                                    }
                                }}
                            >
                                {CRON_PRESETS.map(preset => (
                                    <Option key={preset.value} value={preset.value}>{preset.label}</Option>
                                ))}
                            </Select>
                        </Form.Item>
                        {selectedSchedule === 'custom' && (
                            <Form.Item label="自定义时间规则" required>
                                <Input
                                    value={customSchedule}
                                    placeholder={`高级用法，例如：${DEFAULT_CRON_SCHEDULE}`}
                                    onChange={(event) => {
                                        setCustomSchedule(event.target.value);
                                        customScheduleRef.current = event.target.value;
                                    }}
                                />
                            </Form.Item>
                        )}
                    </>
                    )}
                <Space style={{ marginTop: 24 }}>
                    <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading}>保存</Button>
                    <Button icon={<PlayCircleOutlined />} onClick={handleRunNow} loading={loading}>现在运行</Button>
                </Space>
            </Form>
        </Card>
    );
};

const BackupRestoreSettings = () => {
    const [exportLoading, setExportLoading] = useState(false);
    const [restoreLoading, setRestoreLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [password, setPassword] = useState('');
    const [fileList, setFileList] = useState([]);

    const handleExport = async () => {
        setExportLoading(true);
        try {
            const res = await api.post('/settings/backup', {}, {
                responseType: 'blob',
                timeout: BACKUP_REQUEST_TIMEOUT_MS,
            });
            const blob = new Blob([res.data], { type: 'application/octet-stream' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const now = new Date();
            const dateStr = now.toISOString().slice(0, 10);
            const timestamp = now.getTime();
            link.setAttribute('download', `backup_${dateStr}_${timestamp}.json.gz`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            message.success('备份导出成功！已开始下载备份包。');
        } catch (err) {
            console.error(err);
            message.error('备份导出失败，请检查网络或权限');
        } finally {
            setExportLoading(false);
        }
    };

    const handleRestoreSubmit = async () => {
        if (!password) {
            message.error('请输入管理员密码');
            return;
        }
        if (fileList.length === 0) {
            message.error('请先选择备份文件');
            return;
        }

        setRestoreLoading(true);
        const formData = new FormData();
        formData.append('file', fileList[0]);
        formData.append('password', password);

        try {
            const res = await api.post('/settings/restore', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: RESTORE_REQUEST_TIMEOUT_MS,
            });

            if (res.data.success) {
                message.success('数据恢复成功！系统即将刷新。');
                setModalVisible(false);
                setPassword('');
                setFileList([]);
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
            } else {
                message.error(res.data.error || '恢复失败');
            }
        } catch (err) {
            message.error(err.response?.data?.error || '恢复失败，密码验证可能不正确');
        } finally {
            setRestoreLoading(false);
        }
    };

    return (
        <div style={{ padding: '0 4px' }}>
            <Row gutter={[24, 24]}>
                <Col xs={24} xl={12}>
                    <Card 
                        title={<span style={{ fontWeight: 700 }}><DatabaseOutlined style={{ marginRight: 8, color: '#4A7CF7' }} /> 数据备份</span>}
                        bordered={false} 
                        style={{ borderRadius: 20, boxShadow: 'var(--card-shadow)', height: '100%' }}
                    >
                        <div style={{ marginBottom: 20 }}>
                            <Typography.Text type="secondary">
                                下载一份当前数据副本。换电脑或误操作时，可以用它恢复。
                            </Typography.Text>
                        </div>
                        <div style={{ padding: '12px 0', border: '1px dashed #e2e8f0', borderRadius: 12, textAlign: 'center', background: '#f7fafc', marginBottom: 24 }}>
                            <DatabaseOutlined style={{ fontSize: 32, color: '#a0aec0', marginBottom: 8 }} />
                            <div><Typography.Text type="secondary" style={{ fontSize: 13 }}>不包含临时运行记录</Typography.Text></div>
                        </div>
                        <Button 
                            type="primary" 
                            icon={<DownloadOutlined />} 
                            loading={exportLoading} 
                            onClick={handleExport}
                            size="large"
                        >
                            下载备份
                        </Button>
                    </Card>
                </Col>

                <Col xs={24} xl={12}>
                    <Card 
                        title={<span style={{ fontWeight: 700 }}><WarningOutlined style={{ marginRight: 8, color: '#ff4d4f' }} /> 数据恢复</span>}
                        bordered={false} 
                        style={{ borderRadius: 20, boxShadow: 'var(--card-shadow)', height: '100%' }}
                    >
                        <div style={{ marginBottom: 20 }}>
                            <Typography.Text type="secondary">
                                选择之前下载的备份文件，把数据恢复到备份时的状态。
                            </Typography.Text>
                            <div style={{ color: '#ff4d4f', fontWeight: 600, marginTop: 8 }}>
                                恢复后，备份之后新增的数据会丢失。
                            </div>
                        </div>

                        <div style={{ marginBottom: 24 }}>
                            <Upload
                                accept=".gz"
                                fileList={fileList}
                                beforeUpload={(file) => {
                                    setFileList([file]);
                                    return false; // 阻止自动上传
                                }}
                                onRemove={() => setFileList([])}
                            >
                                <Button icon={<UploadOutlined />} disabled={fileList.length > 0}>
                                    选择备份文件
                                </Button>
                            </Upload>
                        </div>

                        <Button 
                            type="primary" 
                            danger 
                            disabled={fileList.length === 0}
                            onClick={() => setModalVisible(true)}
                            size="large"
                        >
                            恢复数据
                        </Button>
                    </Card>
                </Col>
            </Row>

            <Modal
                title="确认恢复数据"
                open={modalVisible}
                onOk={handleRestoreSubmit}
                confirmLoading={restoreLoading}
                onCancel={() => {
                    setModalVisible(false);
                    setPassword('');
                }}
                okText="确认恢复"
                cancelText="取消"
                okButtonProps={{ danger: true }}
            >
                <div style={{ marginBottom: 16 }}>
                    <Typography.Text type="danger" strong>
                        当前数据会被备份文件覆盖，请确认你选对了文件。
                    </Typography.Text>
                </div>
                <div style={{ marginBottom: 8 }}>
                    <Typography.Text>请输入当前登录密码：</Typography.Text>
                </div>
                <Input.Password
                    prefix={<LockOutlined style={{ color: '#A3AED0' }} />}
                    placeholder="请输入管理员密码"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />
            </Modal>
        </div>
    );
};

const Settings = () => {
    const navigate = useNavigate();
    const [adminForm] = Form.useForm();
    
    // 获取当前登录用户角色，用于决定是否展示数据管理
    const userStr = localStorage.getItem('user');
    let currentUser = null;
    try {
        currentUser = userStr ? JSON.parse(userStr) : null;
    } catch (e) {
        console.error('Parse user from localStorage failed:', e);
    }
    const isSuperAdmin = currentUser?.role === 'super_admin';
    const [adminLoading, setAdminLoading] = useState(false);

    const loadAdminInfo = useCallback(async () => {
        try {
            const res = await api.get('/settings/admin');
            if (res.data.success) {
                adminForm.setFieldsValue({
                    username: res.data.result.userId
                });
            }
        } catch {
            message.error('加载管理员信息失败');
        }
    }, [adminForm]);

    useEffect(() => {
        if (!isSuperAdmin) return;
        const timerId = window.setTimeout(() => {
            loadAdminInfo();
        }, 0);
        return () => window.clearTimeout(timerId);
    }, [isSuperAdmin, loadAdminInfo]);

    const onAdminFinish = async (values) => {
        setAdminLoading(true);
        try {
            const payload = {};
            if (values.username) payload.newUsername = values.username;
            if (values.newPassword) {
                if (!values.currentPassword) {
                    message.error('修改密码需要输入当前密码');
                    setAdminLoading(false);
                    return;
                }
                payload.currentPassword = values.currentPassword;
                payload.newPassword = values.newPassword;
            }

            const res = await api.post('/settings/admin', payload);
            if (res.data.success) {
                const hasUsernameChange = values.username;
                const hasPasswordChange = values.newPassword;

                // 显示成功消息
                message.success('管理员信息已更新');

                // 如果修改了用户名或密码,需要重新登录
                if (hasUsernameChange || hasPasswordChange) {
                    Modal.info({
                        title: '需要重新登录',
                        content: hasPasswordChange
                            ? '密码已修改,系统将在 3 秒后自动退出,请使用新密码重新登录。'
                            : '用户名已修改,系统将在 3 秒后自动退出,请使用新用户名重新登录。',
                        okText: '确定',
                        onOk: () => {
                            localStorage.removeItem('token');
                            localStorage.removeItem('user');
                            navigate('/login');
                        }
                    });

                    // 3秒后自动退出
                    setTimeout(() => {
                        localStorage.removeItem('token');
                        localStorage.removeItem('user');
                        navigate('/login');
                    }, 3000);
                } else {
                    // 如果只是清空了密码字段,清空表单
                    adminForm.setFieldsValue({
                        currentPassword: '',
                        newPassword: '',
                        confirmPassword: ''
                    });
                }
            } else {
                message.error(res.data.error || '更新失败');
            }
        } catch (err) {
            message.error(err.response?.data?.error || '更新失败');
        } finally {
            setAdminLoading(false);
        }
    };

    const items = [
        {
            key: '1',
            label: (
                <span className="settings-tab-label">
                    <SettingOutlined />
                    常用
                </span>
            ),
            children: (
                <Card bordered={false} style={{ borderRadius: 20, boxShadow: 'var(--card-shadow)' }}>
                    <Space direction="vertical" size={18} style={{ width: '100%' }}>
                        <div>
                            <Title level={4} style={{ marginTop: 0 }}>常用操作</Title>
                            <Text type="secondary">
                                这里放最常用的入口，其他设置需要时再打开。
                            </Text>
                        </div>
                        <Space wrap>
                            <Button type="primary" icon={<FileTextOutlined />} onClick={() => { window.location.href = '/course-orders'; }}>
                                查看订单
                            </Button>
                            <Button icon={<AppstoreOutlined />} onClick={() => { window.location.href = '/query'; }}>
                                查询记录
                            </Button>
                            <Button icon={<ApiOutlined />} onClick={() => { window.location.href = '/console?view=notification'; }}>
                                打开通知
                            </Button>
                        </Space>
                    </Space>
                </Card>
            )
        },
        {
            key: '2',
            label: (
                <span className="settings-tab-label">
                    <ScheduleOutlined />
                    自动任务
                </span>
            ),
            children: (
                <Row gutter={[24, 24]}>
                    <Col xs={24} sm={24} md={12} lg={8} xl={8}>
                        <CronSettings title="CT8 自动签到" type="ct8_task" />
                    </Col>
                    <Col xs={24} sm={24} md={12} lg={8} xl={8}>
                        <CronSettings title="到期提醒" type="due_reminder" />
                    </Col>
                    <Col xs={24} sm={24} md={12} lg={8} xl={8}>
                        <CronSettings title="待办提醒" type="todo_reminder" />
                    </Col>
                </Row>
            )
        },
        {
            key: '3',
            label: (
                <span className="settings-tab-label">
                    <SafetyCertificateOutlined />
                    登录安全
                </span>
            ),
            children: (
                <div style={{ padding: '0 4px' }}>
                    <Row gutter={[24, 24]}>
                        <Col xs={24} xl={12}>
                            <Card 
                                title={<span style={{ fontWeight: 700 }}><UserOutlined style={{ marginRight: 8, color: '#4A7CF7' }} /> 登录账号</span>}
                                bordered={false} 
                                style={{ borderRadius: 20, boxShadow: 'var(--card-shadow)', height: '100%' }}
                            >
                                <Form form={adminForm} layout="vertical" onFinish={onAdminFinish}>
                                    <Form.Item name="username" label={<Text strong>用户名</Text>} rules={[{ required: true, min: 3 }]}>
                                        <Input prefix={<UserOutlined style={{ color: '#A3AED0' }} />} placeholder="请输入用户名" />
                                    </Form.Item>

                                    <Divider plain style={{ margin: '32px 0 24px' }}>
                                        <Space><LockOutlined style={{ color: '#707EAE' }} /><Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>修改密码（可选）</Text></Space>
                                    </Divider>
                                    
                                    <Form.Item name="currentPassword" label={<Text strong>验证当前密码</Text>}>
                                        <Input.Password prefix={<LockOutlined style={{ color: '#A3AED0' }} />} placeholder="更改敏感信息需验证身份" />
                                    </Form.Item>

                                    <Row gutter={16}>
                                        <Col xs={24} lg={12}>
                                            <Form.Item name="newPassword" label={<Text strong>设置新密码</Text>}>
                                                <Input.Password prefix={<LockOutlined style={{ color: '#A3AED0' }} />} placeholder="建议 8 位以上" />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} lg={12}>
                                            <Form.Item name="confirmPassword" label={<Text strong>确认新密码</Text>} dependencies={['newPassword']} rules={[
                                                ({ getFieldValue }) => ({
                                                    validator(_, value) {
                                                        if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                                                        return Promise.reject(new Error('两次输入的密码不一致'));
                                                    },
                                                }),
                                            ]}>
                                                <Input.Password prefix={<LockOutlined style={{ color: '#A3AED0' }} />} placeholder="请再次输入新密码" />
                                            </Form.Item>
                                        </Col>
                                    </Row>

                                    <div style={{ marginTop: 12 }}>
                                        <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={adminLoading} size="large">
                                            保存账号
                                        </Button>
                                    </div>
                                </Form>
                            </Card>
                        </Col>

                        <Col xs={24} xl={12}>
                            <TurnstileSettings />
                        </Col>
                    </Row>
                </div>
            )
        },
        {
            key: '4',
            label: (
                <span className="settings-tab-label">
                    <KeyOutlined />
                    连接信息
                </span>
            ),
            children: (
                <Card bordered={false} style={{ borderRadius: 20, boxShadow: 'var(--card-shadow)' }}>
                    <SecretSettings />
                </Card>
            )
        },
        {
            key: '6',
            label: (
                <span className="settings-tab-label settings-tab-label-compact">
                    <ApiOutlined />
                    网课平台
                </span>
            ),
            children: <CourseConfig />,
        },
        {
            key: '7',
            label: (
                <span className="settings-tab-label settings-tab-label-compact">
                    <AppstoreOutlined />
                    课程分类
                </span>
            ),
            children: <CourseCategoryConfig />,
        }
    ].filter((item) => isSuperAdmin || !['1', '2', '3', '4'].includes(item.key));

    if (isSuperAdmin) {
        items.push({
            key: '8',
            label: (
                <span className="settings-tab-label settings-tab-label-compact">
                    <DatabaseOutlined />
                    备份与恢复
                </span>
            ),
            children: <BackupRestoreSettings />
        });
    }

    const settingsOrder = ['1', '6', '7', '2', '3', '8', '4'];
    items.sort((left, right) => settingsOrder.indexOf(left.key) - settingsOrder.indexOf(right.key));

    return (
        <div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 14 }}>
                常用设置排在前面，连接信息和数据恢复平时不用修改。
            </Text>
            <Tabs className="settings-tabs" defaultActiveKey={isSuperAdmin ? '1' : '6'} items={items} type="card" />
        </div>
    );
};

export default Settings;
