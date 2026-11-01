import React, { useState, useEffect, useCallback } from 'react';
import { Form, Input, Button, Switch, Row, Col, Select, Tabs, Modal, Upload } from 'antd';
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
    SyncOutlined,
    WarningOutlined
} from '@ant-design/icons';
import api from '../utils/api';
import SecretSettings from '../components/SecretSettings';
import CourseConfig from '../components/CourseConfig';
import CourseCategoryConfig from '../components/CourseCategoryConfig';
import TurnstileSettings from '../components/TurnstileSettings';

const { Option } = Select;

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
                const appChannel = result?.channels?.app;
                const wecomChannel = result?.channels?.wecom;
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
                } else if (appChannel?.inboxAccepted > 0 && !appChannel.systemDelivered) {
                    message.warning(wecomChannel?.reason === 'recipient_missing'
                        ? '提醒已写入 App 收件箱，但企业微信未配置接收成员。'
                        : '提醒已写入 App 收件箱，当前设备未配置系统推送，将在 App 打开或后台轮询时显示。');
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
        <section className="panel">
            <div className="panel-head">
                <h2 className="panel-title">
                    <ScheduleOutlined />
                    {title}
                </h2>
                {taskStatus && (
                    <span className={`tag tone-${taskStatus.enabled ? 'ok' : 'neutral'}`}>
                        {taskStatus.enabled ? '自动运行中' : '已暂停'}
                    </span>
                )}
            </div>
            <div className="panel-body">
                <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ enabled: true, schedule: DEFAULT_CRON_SCHEDULE }}>
                    <Form.Item name="enabled" label="自动运行" valuePropName="checked">
                        <Switch checkedChildren="已开启" unCheckedChildren="已暂停" />
                    </Form.Item>
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
                    <div className="form-actions">
                        <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading}>保存</Button>
                        <Button icon={<PlayCircleOutlined />} onClick={handleRunNow} loading={loading}>现在运行</Button>
                    </div>
                </Form>
            </div>
        </section>
    );
};

const ExpiryNotificationSettings = () => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);

    const loadConfig = useCallback(async () => {
        try {
            const response = await api.get('/settings/notify');
            if (response.data.success) {
                const config = response.data.result || {};
                form.setFieldsValue({
                    qywxEnabled: Boolean(config.qywxEnabled),
                    qywxToUser: config.qywxToUser || '',
                    qywxToParty: config.qywxToParty || '',
                    qywxToTag: config.qywxToTag || '',
                });
            }
        } catch (error) {
            message.error(error.response?.data?.error || '到期提醒配置加载失败');
        }
    }, [form]);

    useEffect(() => {
        loadConfig();
    }, [loadConfig]);

    const onFinish = async (values) => {
        const recipients = [values.qywxToUser, values.qywxToParty, values.qywxToTag]
            .map((value) => String(value || '').trim())
            .filter(Boolean);
        if (values.qywxEnabled && recipients.length === 0) {
            message.error('启用企业微信前请填写至少一个接收目标');
            return;
        }
        setLoading(true);
        try {
            const response = await api.post('/settings/notify', {
                qywxEnabled: values.qywxEnabled !== false,
                qywxToUser: values.qywxToUser || '',
                qywxToParty: values.qywxToParty || '',
                qywxToTag: values.qywxToTag || '',
            });
            if (!response.data.success) throw new Error(response.data.error || '保存失败');
            message.success('到期提醒接收目标已保存');
        } catch (error) {
            message.error(error.response?.data?.error || error.message || '保存失败');
        } finally {
            setLoading(false);
        }
    };

    return (
        <section className="panel">
            <div className="panel-head">
                <h2 className="panel-title">
                    <ApiOutlined />
                    到期提醒接收目标
                </h2>
            </div>
            <div className="panel-body">
                <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ qywxEnabled: false }}>
                    <Form.Item name="qywxEnabled" label="企业微信通知" valuePropName="checked">
                        <Switch checkedChildren="已开启" unCheckedChildren="已关闭" />
                    </Form.Item>
                    <Form.Item name="qywxToUser" label="成员 ID">
                        <Input placeholder="例如：zhangsan" />
                    </Form.Item>
                    <Form.Item name="qywxToParty" label="部门 ID">
                        <Input placeholder="例如：1" />
                    </Form.Item>
                    <Form.Item name="qywxToTag" label="标签 ID">
                        <Input placeholder="例如：ops" />
                    </Form.Item>
                    <div className="form-actions">
                        <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading}>保存</Button>
                    </div>
                </Form>
            </div>
        </section>
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
        <div className="view-stack">
            <div className="split even">
                <section className="panel">
                    <div className="panel-head">
                        <h2 className="panel-title">
                            <DatabaseOutlined />
                            数据备份
                        </h2>
                    </div>
                    <div className="panel-body">
                        <p className="settings-note">
                            下载一份当前数据副本。换电脑或误操作时，可以用它恢复。
                        </p>
                        <div className="backup-drop">
                            <DatabaseOutlined />
                            <span>不包含临时运行记录</span>
                        </div>
                        <div className="form-actions">
                            <Button
                                type="primary"
                                icon={<DownloadOutlined />}
                                loading={exportLoading}
                                onClick={handleExport}
                            >
                                下载备份
                            </Button>
                        </div>
                    </div>
                </section>

                <section className="panel">
                    <div className="panel-head">
                        <h2 className="panel-title">
                            <WarningOutlined />
                            数据恢复
                        </h2>
                    </div>
                    <div className="panel-body">
                        <p className="settings-note">
                            选择之前下载的备份文件，把数据恢复到备份时的状态。
                        </p>
                        <div className="hint is-danger" style={{ marginTop: 10 }}>
                            <strong>恢复后，备份之后新增的数据会丢失</strong>
                            <span>只能用备份文件覆盖，操作不可撤销。</span>
                        </div>
                        <div style={{ marginTop: 12 }}>
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
                        <div className="form-actions">
                            <Button
                                type="primary"
                                danger
                                disabled={fileList.length === 0}
                                onClick={() => setModalVisible(true)}
                            >
                                恢复数据
                            </Button>
                        </div>
                    </div>
                </section>
            </div>

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
                width={400}
            >
                <div className="hint is-danger" style={{ marginBottom: 14 }}>
                    <strong>当前数据会被备份文件覆盖</strong>
                    <span>请确认你选对了文件，恢复过程无法中止。</span>
                </div>
                <p className="settings-note" style={{ marginBottom: 8 }}>请输入当前登录密码：</p>
                <Input.Password
                    prefix={<LockOutlined style={{ color: 'var(--ink-faint)' }} />}
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
                    <span className="settings-tab-text">常用</span>
                </span>
            ),
            children: (
                <div className="view-stack">
                    <section className="panel">
                        <div className="panel-head">
                            <h2 className="panel-title">
                                <SettingOutlined />
                                常用操作
                            </h2>
                            <p className="panel-meta">这里放最常用的入口，其他设置需要时再打开。</p>
                        </div>
                        <div className="panel-body">
                            <div className="settings-inline">
                                <Button type="primary" icon={<FileTextOutlined />} onClick={() => { window.location.href = '/course-orders'; }}>
                                    查看订单
                                </Button>
                                <Button icon={<AppstoreOutlined />} onClick={() => { window.location.href = '/query'; }}>
                                    查询记录
                                </Button>
                                <Button icon={<ApiOutlined />} onClick={() => { window.location.href = '/console?view=notification'; }}>
                                    打开通知
                                </Button>
                            </div>
                        </div>
                    </section>
                </div>
            )
        },
        {
            key: '2',
            label: (
                <span className="settings-tab-label">
                    <ScheduleOutlined />
                    <span className="settings-tab-text">自动任务</span>
                </span>
            ),
            children: (
                <div className="view-stack">
                    <div className="split even">
                        <CronSettings title="CT8 自动签到" type="ct8_task" />
                        <CronSettings title="到期提醒" type="due_reminder" />
                    </div>
                    <div className="split even">
                        <CronSettings title="待办提醒" type="todo_reminder" />
                        <ExpiryNotificationSettings />
                    </div>
                </div>
            )
        },
        {
            key: '3',
            label: (
                <span className="settings-tab-label">
                    <SafetyCertificateOutlined />
                    <span className="settings-tab-text">登录安全</span>
                </span>
            ),
            children: (
                <div className="split even">
                    <section className="panel">
                        <div className="panel-head">
                            <h2 className="panel-title">
                                <UserOutlined />
                                登录账号
                            </h2>
                        </div>
                        <div className="panel-body">
                            <Form form={adminForm} layout="vertical" onFinish={onAdminFinish}>
                                <Form.Item name="username" label="用户名" rules={[{ required: true, min: 3 }]}>
                                    <Input prefix={<UserOutlined style={{ color: 'var(--ink-faint)' }} />} placeholder="请输入用户名" />
                                </Form.Item>

                                <p className="section-label" style={{ marginTop: 18 }}>修改密码（可选）</p>

                                <Form.Item name="currentPassword" label="验证当前密码">
                                    <Input.Password prefix={<LockOutlined style={{ color: 'var(--ink-faint)' }} />} placeholder="更改敏感信息需验证身份" />
                                </Form.Item>

                                <Row gutter={16}>
                                    <Col xs={24} lg={12}>
                                        <Form.Item name="newPassword" label="设置新密码">
                                            <Input.Password prefix={<LockOutlined style={{ color: 'var(--ink-faint)' }} />} placeholder="建议 8 位以上" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} lg={12}>
                                        <Form.Item name="confirmPassword" label="确认新密码" dependencies={['newPassword']} rules={[
                                            ({ getFieldValue }) => ({
                                                validator(_, value) {
                                                    if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                                                    return Promise.reject(new Error('两次输入的密码不一致'));
                                                },
                                            }),
                                        ]}>
                                            <Input.Password prefix={<LockOutlined style={{ color: 'var(--ink-faint)' }} />} placeholder="请再次输入新密码" />
                                        </Form.Item>
                                    </Col>
                                </Row>

                                <div className="form-actions">
                                    <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={adminLoading}>
                                        保存账号
                                    </Button>
                                </div>
                            </Form>
                        </div>
                    </section>

                    <TurnstileSettings />
                </div>
            )
        },
        {
            key: '4',
            label: (
                <span className="settings-tab-label">
                    <KeyOutlined />
                    <span className="settings-tab-text">连接信息</span>
                </span>
            ),
            children: <SecretSettings />
        },
        {
            key: '6',
            label: (
                <span className="settings-tab-label">
                    <ApiOutlined />
                    <span className="settings-tab-text">网课平台</span>
                </span>
            ),
            children: <CourseConfig />,
        },
        {
            key: '7',
            label: (
                <span className="settings-tab-label">
                    <AppstoreOutlined />
                    <span className="settings-tab-text">课程分类</span>
                </span>
            ),
            children: <CourseCategoryConfig />,
        }
    ].filter((item) => isSuperAdmin || !['1', '2', '3', '4'].includes(item.key));

    if (isSuperAdmin) {
        items.push({
            key: '8',
            label: (
                <span className="settings-tab-label">
                    <DatabaseOutlined />
                    <span className="settings-tab-text">备份与恢复</span>
                </span>
            ),
            children: <BackupRestoreSettings />
        });
    }

    const settingsOrder = ['1', '6', '7', '2', '3', '8', '4'];
    items.sort((left, right) => settingsOrder.indexOf(left.key) - settingsOrder.indexOf(right.key));

    return (
        <div className="page-view fade-in">
            <div className="page-head">
                <div>
                    <h1>系统设置</h1>
                    <p>常用设置排在前面，连接信息和数据恢复平时不用修改。</p>
                </div>
            </div>

            <Tabs className="settings-tabs" defaultActiveKey={isSuperAdmin ? '1' : '6'} items={items} />
        </div>
    );
};

export default Settings;
