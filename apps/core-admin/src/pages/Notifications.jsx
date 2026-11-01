import { BellOutlined, ExportOutlined } from '@ant-design/icons';

const Notifications = () => (
    <div className="page-view fade-in">
        <section className="panel">
            <div className="panel-head">
                <h2 className="panel-title">
                    <BellOutlined />
                    通知
                </h2>
            </div>
            <div className="panel-body">
                <p className="settings-note">
                    查看发送记录、发送测试通知或修改接收方式，请打开通知中心。
                </p>
                <button
                    type="button"
                    className="btn btn-primary"
                    style={{ marginTop: 14 }}
                    onClick={() => { window.location.href = '/console?view=notification'; }}
                >
                    <BellOutlined />
                    打开通知中心
                    <ExportOutlined style={{ opacity: 0.7 }} />
                </button>
            </div>
        </section>
    </div>
);

export default Notifications;
