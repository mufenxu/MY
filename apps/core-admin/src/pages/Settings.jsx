import React, { useState, useEffect, useCallback } from 'react';
import { Form, Input, Button, Switch, Card, message, Divider, Space, Row, Col, Select, Typography, Tabs, Modal, Tag, Upload } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
    MailOutlined,
    SaveOutlined,
    SendOutlined,
    WechatOutlined,
    UserOutlined,
    LockOutlined,
    ClockCircleOutlined,
    PlayCircleOutlined,
    SettingOutlined,
    SafetyCertificateOutlined,
    ScheduleOutlined,
    KeyOutlined,
    ApiOutlined,
    AppstoreOutlined,
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
const NOTIFICATION_TEST_TIMEOUT_MS = 30000;
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
            message.error(`加载${title}配置失败`);
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
                    message.error('请输入自定义 Cron 表达式');
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
                message.success(`${title}配置已保存`);
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
                    message.info('无需要提醒的资源或配置未完成');
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
                <Form.Item name="enabled" label="启用任务" valuePropName="checked">
                    <Switch checkedChildren="已启用" unCheckedChildren="未开启" />
                </Form.Item>
                {taskStatus && (
                    <Space size={8} style={{ marginBottom: 16 }} wrap>
                        <Tag color={taskStatus.enabled ? 'success' : 'default'}>
                            {taskStatus.enabled ? '已启用' : '未开启'}
                        </Tag>
                        {typeof taskStatus.running === 'boolean' && (
                            <Tag color={taskStatus.running ? 'processing' : 'default'}>
                                {taskStatus.running ? '调度器已注册' : '调度器未运行'}
                            </Tag>
                        )}
                    </Space>
                )}
                {isTaskEnabled && (
                    <>
                        <Form.Item label="执行时间" required>
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
                            <Form.Item label="自定义 Cron 表达式" required>
                                <Input
                                    value={customSchedule}
                                    placeholder={`例如: ${DEFAULT_CRON_SCHEDULE}`}
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
                    <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading}>保存配置</Button>
                    <Button icon={<PlayCircleOutlined />} onClick={handleRunNow} loading={loading}>立即执行</Button>
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
                                将当前数据库中所有的关键业务数据（包括网课通道、待办事项、系统配置和用户基本资料等）打包并以 <strong>gzip</strong> 压缩的 JSON 格式下载到本地。
                            </Typography.Text>
                        </div>
                        <div style={{ padding: '12px 0', border: '1px dashed #e2e8f0', borderRadius: 12, textAlign: 'center', background: '#f7fafc', marginBottom: 24 }}>
                            <DatabaseOutlined style={{ fontSize: 32, color: '#a0aec0', marginBottom: 8 }} />
                            <div><Typography.Text type="secondary" style={{ fontSize: 13 }}>备份文件不包含无业务价值的运行日志与审计日志</Typography.Text></div>
                        </div>
                        <Button 
                            type="primary" 
                            icon={<DownloadOutlined />} 
                            loading={exportLoading} 
                            onClick={handleExport}
                            size="large"
                        >
                            生成备份并下载
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
                                从本地选择之前下载的备份文件（<code>.json.gz</code> 格式），将其上传并完全覆写当前数据库中的所有内容。
                            </Typography.Text>
                            <div style={{ color: '#ff4d4f', fontWeight: 600, marginTop: 8 }}>
                                ⚠️ 警告：恢复操作将清空现有数据库的全部内容，操作不可逆，请务必谨慎操作！
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
                                    选择备份文件 (.json.gz)
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
                            执行数据恢复
                        </Button>
                    </Card>
                </Col>
            </Row>

            <Modal
                title="数据恢复二次验证"
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
                        警告：数据恢复会清空当前数据库所有的表并覆盖为备份中的数据，这可能导致近期新增数据永久丢失！
                    </Typography.Text>
                </div>
                <div style={{ marginBottom: 8 }}>
                    <Typography.Text>请输入您当前登录账户的管理员密码以验证身份：</Typography.Text>
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
    const [form] = Form.useForm();
    const [adminForm] = Form.useForm();
    const [loading, setLoading] = useState(false);
    
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
    const [testingEmail, setTestingEmail] = useState(false);
    const [testingWecom, setTestingWecom] = useState(false);

    const loadConfig = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/settings/notify');
            if (res.data.success) {
                const config = res.data.result || {};
                config.emailEnabled = !!config.emailEnabled;
                config.qywxEnabled = !!config.qywxEnabled;
                form.setFieldsValue(config);
            }
        } catch {
            message.error('加载配置失败');
        } finally {
            setLoading(false);
        }
    }, [form]);

    const onFinish = async (values) => {
        setLoading(true);
        try {
            const res = await api.post('/settings/notify', values);
            if (res.data.success) {
                message.success('配置已保存');
            } else {
                message.error(res.data.error || '保存失败');
            }
        } catch {
            message.error('保存失败');
        } finally {
            setLoading(false);
        }
    };

    const handleTestEmail = async () => {
        try {
            const values = await form.validateFields();
            if (!values.emailEnabled) {
                message.warning('请先开启邮件通知');
                return;
            }
            setTestingEmail(true);
            const res = await api.post('/settings/test-notify', { config: values, testChannel: 'email' }, {
                timeout: NOTIFICATION_TEST_TIMEOUT_MS,
            });
            if (res.data.success) {
                message.success('测试邮件已发送');
            } else {
                message.error(res.data.error || '发送失败');
            }
        } catch {
            message.error('发送失败，请检查配置');
        } finally {
            setTestingEmail(false);
        }
    };

    const handleTestWecom = async () => {
        try {
            const values = await form.validateFields();
            if (!values.qywxEnabled) {
                message.warning('请先开启企业微信通知');
                return;
            }
            if (!values.qywxApiKey) {
                message.warning('请填写 API Key');
                return;
            }
            setTestingWecom(true);
            const res = await api.post('/settings/test-notify', { config: values, testChannel: 'wecom' }, {
                timeout: NOTIFICATION_TEST_TIMEOUT_MS,
            });
            if (res.data.success) {
                message.success('测试消息已发送');
            } else {
                message.error(res.data.error || '发送失败');
            }
        } catch {
            message.error('发送失败，请检查配置');
        } finally {
            setTestingWecom(false);
        }
    };

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
            loadConfig();
            loadAdminInfo();
        }, 0);
        return () => window.clearTimeout(timerId);
    }, [isSuperAdmin, loadConfig, loadAdminInfo]);

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
                    通知设置
                </span>
            ),
            children: (
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={onFinish}
                    initialValues={{
                        emailEnabled: false,
                        smtpHost: 'smtp.qq.com',
                        smtpPort: '465',
                        qywxEnabled: false
                    }}
                >
                    <Row gutter={[24, 24]}>
                        <Col xs={24} xl={12}>
                            <Card 
                                title={<span style={{ fontWeight: 700 }}><MailOutlined style={{ marginRight: 8, color: '#4A7CF7' }} /> 邮件通知</span>} 
                                bordered={false} 
                                style={{ borderRadius: 20, boxShadow: 'var(--card-shadow)', height: '100%' }}
                            >
                                <Form.Item name="emailEnabled" label={<Text strong>开启邮件通知</Text>} valuePropName="checked">
                                    <Switch />
                                </Form.Item>
                                <Form.Item noStyle shouldUpdate={(prev, curr) => prev.emailEnabled !== curr.emailEnabled}>
                                    {({ getFieldValue }) => getFieldValue('emailEnabled') && (
                                        <>
                                            <Row gutter={16}>
                                                <Col xs={24} sm={12}>
                                                    <Form.Item name="smtpHost" label="SMTP服务器" rules={[{ required: true }]}>
                                                        <Input placeholder="如: smtp.qq.com" />
                                                    </Form.Item>
                                                </Col>
                                                <Col xs={24} sm={12}>
                                                    <Form.Item name="smtpPort" label="端口" rules={[{ required: true }]}>
                                                        <Input placeholder="如: 465" />
                                                    </Form.Item>
                                                </Col>
                                            </Row>
                                            <Row gutter={16}>
                                                <Col xs={24} sm={12}>
                                                    <Form.Item name="smtpUser" label="发件邮箱" rules={[{ required: true, type: 'email' }]}>
                                                        <Input prefix={<MailOutlined style={{ color: '#A3AED0' }} />} placeholder="123456@qq.com" />
                                                    </Form.Item>
                                                </Col>
                                                <Col xs={24} sm={12}>
                                                    <Form.Item name="smtpPass" label="授权码/密码" rules={[{ required: true }]}>
                                                        <Input.Password placeholder="请输入授权码" />
                                                    </Form.Item>
                                                </Col>
                                            </Row>
                                            <Form.Item name="toList" label="收件人列表 (逗号分隔)" rules={[{ required: true }]}>
                                                <Input.TextArea rows={2} placeholder="a@ex.com, b@ex.com" />
                                            </Form.Item>
                                            <Form.Item style={{ marginBottom: 0 }}>
                                                <Button 
                                                    icon={<SendOutlined />} 
                                                    onClick={handleTestEmail} 
                                                    loading={testingEmail} 
                                                    type="primary"
                                                    style={{ 
                                                        background: 'rgba(67, 24, 255, 0.08)', 
                                                        color: '#4A7CF7', 
                                                        border: '1px solid rgba(67, 24, 255, 0.2)',
                                                        boxShadow: 'none'
                                                    }}
                                                >
                                                    发送测试邮件
                                                </Button>
                                            </Form.Item>
                                        </>
                                    )}
                                </Form.Item>
                            </Card>
                        </Col>

                        <Col xs={24} xl={12}>
                            <Card 
                                title={<span style={{ fontWeight: 700 }}><WechatOutlined style={{ marginRight: 8, color: '#5CC9A7' }} /> 企业微信通知</span>} 
                                bordered={false} 
                                style={{ borderRadius: 20, boxShadow: 'var(--card-shadow)', height: '100%' }}
                            >
                                <Form.Item name="qywxEnabled" label={<Text strong>开启企业微信通知</Text>} valuePropName="checked">
                                    <Switch />
                                </Form.Item>
                                <Form.Item noStyle shouldUpdate={(prev, curr) => prev.qywxEnabled !== curr.qywxEnabled}>
                                    {({ getFieldValue }) => getFieldValue('qywxEnabled') && (
                                        <>
                                            <Form.Item name="qywxApiKey" label="API Key (AgentSecret)" rules={[{ required: true }]}>
                                                <Input.Password placeholder="请输入企业微信 API Key" />
                                            </Form.Item>
                                            <Row gutter={16}>
                                                <Col xs={24} sm={12}>
                                                    <Form.Item name="qywxToUser" label="接收成员ID">
                                                        <Input placeholder="如: zhangsan|lisi" />
                                                    </Form.Item>
                                                </Col>
                                                <Col xs={24} sm={12}>
                                                    <Form.Item name="qywxToParty" label="接收部门ID">
                                                        <Input placeholder="如: 1|2" />
                                                    </Form.Item>
                                                </Col>
                                            </Row>
                                            <Form.Item style={{ marginBottom: 0 }}>
                                                <Button 
                                                    icon={<WechatOutlined />} 
                                                    onClick={handleTestWecom} 
                                                    loading={testingWecom} 
                                                    type="primary" 
                                                    style={{ 
                                                        background: 'rgba(1, 181, 116, 0.08)', 
                                                        color: '#5CC9A7', 
                                                        border: '1px solid rgba(1, 181, 116, 0.2)',
                                                        boxShadow: 'none'
                                                    }}
                                                >
                                                    发送测试消息
                                                </Button>
                                            </Form.Item>
                                        </>
                                    )}
                                </Form.Item>
                            </Card>
                        </Col>
                    </Row>

                    <div style={{ marginTop: 40, display: 'flex', justifyContent: 'center' }}>
                        <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading} size="large" style={{ minWidth: 240, height: 50, borderRadius: 15, boxShadow: '0 10px 20px rgba(67, 24, 255, 0.2)' }}>
                            保存通知配置
                        </Button>
                    </div>
                </Form>
            )
        },
        {
            key: '2',
            label: (
                <span className="settings-tab-label">
                    <ScheduleOutlined />
                    定时任务
                </span>
            ),
            children: (
                <Row gutter={[24, 24]}>
                    <Col xs={24} sm={24} md={12} lg={8} xl={8}>
                        <CronSettings title="CT8节点签到" type="ct8_task" />
                    </Col>
                    <Col xs={24} sm={24} md={12} lg={8} xl={8}>
                        <CronSettings title="资源到期提醒" type="due_reminder" />
                    </Col>
                    <Col xs={24} sm={24} md={12} lg={8} xl={8}>
                        <CronSettings title="待办事项提醒" type="todo_reminder" />
                    </Col>
                </Row>
            )
        },
        {
            key: '3',
            label: (
                <span className="settings-tab-label">
                    <SafetyCertificateOutlined />
                    安全设置
                </span>
            ),
            children: (
                <div style={{ padding: '0 4px' }}>
                    <Row gutter={[24, 24]}>
                        <Col xs={24} xl={12}>
                            <Card 
                                title={<span style={{ fontWeight: 700 }}><UserOutlined style={{ marginRight: 8, color: '#4A7CF7' }} /> 管理员账户安全</span>}
                                bordered={false} 
                                style={{ borderRadius: 20, boxShadow: 'var(--card-shadow)', height: '100%' }}
                            >
                                <Form form={adminForm} layout="vertical" onFinish={onAdminFinish}>
                                    <Form.Item name="username" label={<Text strong>管理员用户名</Text>} rules={[{ required: true, min: 3 }]}>
                                        <Input prefix={<UserOutlined style={{ color: '#A3AED0' }} />} placeholder="请输入管理员用户名" />
                                    </Form.Item>

                                    <Divider plain style={{ margin: '32px 0 24px' }}>
                                        <Space><LockOutlined style={{ color: '#707EAE' }} /><Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>修改登录密码 (可选)</Text></Space>
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
                                            更新管理员资料
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
                    系统密钥与配置
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
                    网课通道配置
                </span>
            ),
            children: <CourseConfig />,
        },
        {
            key: '7',
            label: (
                <span className="settings-tab-label settings-tab-label-compact">
                    <AppstoreOutlined />
                    网课分类配置
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
                    数据管理
                </span>
            ),
            children: <BackupRestoreSettings />
        });
    }

    return (
        <div>
            <Tabs className="settings-tabs" defaultActiveKey={isSuperAdmin ? '1' : '6'} items={items} type="card" />
        </div>
    );
};

export default Settings;
