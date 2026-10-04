package cn.pxyb.mycontrol.ui.legal

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.components.button.AppDialogPrimaryButton
import cn.pxyb.mycontrol.ui.components.dialog.AppDialog

@Composable
fun PrivacyPolicyDialog(onDismiss: () -> Unit) {
    AppDialog(
        onDismissRequest = onDismiss,
        title = "隐私政策",
        subtitle = "更新日期：2026年10月4日",
        modifier = Modifier.heightIn(max = 680.dp),
        footer = {
            AppDialogPrimaryButton("已知晓", onDismiss, Modifier.fillMaxWidth())
        },
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState()),
        ) {
            PrivacySection(
                "1. 适用范围",
                "本政策说明 MY Android 客户端在账号登录、校园服务、个人待办、设备管理、通知及 AI 助手等功能中的信息处理方式。" +
                    "具体可用功能取决于你连接的平台、账号权限与服务配置。你主动访问的第三方网站和服务，还适用其自身的隐私政策。",
            )
            PrivacySection(
                "2. 收集的信息与用途",
                "· 账号与认证：登录、二次验证和账号安全操作会向 MY 平台发送你输入的用户名、密码、动态验证码或恢复凭据；" +
                    "Passkey 登录会提交凭据标识和签名验证结果。会话 Cookie 保存在本机，并随需要认证的请求发送给对应服务。" +
                    "\n· 设备与安全：设备名称、制造商及型号、应用版本、安装标识用于设备登记、会话管理和通知投递；" +
                    "设备认证还会提交公钥、请求签名，以及在启用设备证明时提交证明证书链。服务端在处理请求时可以获取来源 IP 等连接信息。" +
                    "\n· 业务内容：你填写或同步的待办、课程、成绩、预约、校园账号凭据、设备操作及通知偏好等，" +
                    "会按所用功能发送到 MY 平台及对应业务服务，用于查询、同步或执行你设置的任务。",
            )
            PrivacySection(
                "3. 本机存储与服务端存储",
                "· 登录凭据、接口快照、个人工作区、Google 邮箱台账、验证器密钥及保存的截图来源等敏感本地记录，" +
                    "由对应存储模块使用 Android Keystore 配合加密保护。界面偏好等普通设置保存在应用私有目录，不能将所有本地数据都视为加密数据。" +
                    "\n· 截图识别在设备上完成；保存的原图与识别来源保留在本机，由你确认生成的待办内容会参与平台同步。" +
                    "Google 邮箱台账和独立验证器记录保存在本机；主动导出或分享后的副本由你选择的保存位置或接收应用管理。" +
                    "\n· 本地接口快照的有效期为 7 天，过期后不再作为有效缓存使用。待办、预约、通知等服务端记录不会因清理客户端缓存而删除；" +
                    "其保留期限和删除处理请向你所使用的平台管理者确认。",
            )
            PrivacySection(
                "4. AI 助手与关联服务",
                "· 使用 AI 对话时，输入内容、近期对话以及当前可用的工作台上下文会发送到 MY 平台，" +
                    "再交由平台配置的模型服务处理。上下文可能包括待办标题、课程名称与地点、通知和事件摘要、资源到期与备份状态，" +
                    "用于生成与你当前工作台相关的回答。请勿在对话中输入密码、验证码或无关敏感信息。" +
                    "\n· 校园查询、预约和学习通签到等功能，需要将账号凭据、查询条件、任务参数或位置提交给对应服务。" +
                    "启用自动任务后，服务端可按你保存的配置继续执行；关闭手机权限或退出 App 不等于取消已保存的服务端任务。" +
                    "\n· 打开已登录的关联网页时，客户端可能向对应站点传递登录票据或设置会话 Cookie，帮助完成身份衔接。" +
                    "外部网页、文件下载、媒体资源及你主动分享的内容，由相应提供方或接收方按其规则处理。",
            )
            PrivacySection(
                "5. 权限与设备能力",
                "· 相机：用于你主动发起的二维码、条码扫描，如扫码登录和验证器导入。" +
                    "\n· 位置：学习通定位及签到功能在授权后获取经纬度、精度、地址和模拟位置标记；" +
                    "提交签到或保存自动签到位置时发送给对应服务。保存的位置可被后续自动任务使用，直至你修改或关闭任务。" +
                    "\n· 通知：用于预约、待办、告警等提醒；登录状态下可能通过后台定期同步获取通知。" +
                    "\n· 日历：在你开启同步后，读取日历信息并创建、更新或删除本应用管理的课程、待办等日历条目。" +
                    "\n· 生物识别与设备凭据：用于应用解锁、验证器及其他需要身份确认的安全操作；指纹、人脸模板由系统处理，应用不获取原始模板。" +
                    "\n· NFC：在你主动写入场景时与标签通信，将包含场景标识的应用链接写入标签；持有标签的人可能读到该链接。" +
                    "\n· 图片与文件：读取你通过系统选择器选中或主动分享的内容，用于识别、导入或上传；下载、导出文件会写入你选择的目录。" +
                    "Android 9 及以下向公共下载目录写文件时可能需要存储权限。" +
                    "\n· 安装应用：用于你确认后的 APK 更新安装，仍需经过系统安装流程。" +
                    "\n需要授权的权限会按功能请求。你可在系统设置中撤回；相关功能可能无法继续使用，已提交的数据和服务端任务需另行管理。",
            )
            PrivacySection(
                "6. 第三方组件与服务",
                "· Google ML Kit：用于设备上的扫码和中文文字识别；Android Credential Manager 及凭据提供方用于 Passkey 等身份验证。" +
                    "系统定位及地址解析服务用于获取位置与地址，其提供方取决于设备环境。相关组件与服务的信息处理还应参阅提供方说明。" +
                    "\n· 更新清单、安装包或项目资源可能来自 MY 平台、GitHub Releases 及相应下载服务，访问时会向资源提供方发起网络请求。" +
                    "\n· AI 模型服务、学校系统、学习通及其他外部网站会处理完成相应功能所需的数据；具体服务提供方取决于平台配置和你打开的目标站点。",
            )
            PrivacySection(
                "7. 安全保护与传输边界",
                "· MY 平台连接使用 HTTPS，部分指定域名配置了证书固定校验。为兼容现有外部页面，" +
                    "mxwk.shop 与 qlogo.cn 及其子域名允许 HTTP，不能将这些连接视为加密传输；使用外部页面前请留意地址与传输方式。" +
                    "\n· 应用配置禁止系统云备份及设备迁移复制应用私有数据。网页 Cookie 由 WebView 管理，" +
                    "下载文件、日历条目、导出副本和第三方凭据不等同于应用私有加密存储。" +
                    "\n· 请妥善保管设备、账号与导出文件。系统权限、加密和锁屏保护可降低风险，但无法保证任何环境下的绝对安全。",
            )
            PrivacySection(
                "8. 管理信息与撤回授权",
                "· 你可通过对应功能查看、修改或删除记录，在系统设置中关闭通知、定位、相机及日历等权限，并在任务管理中关闭自动任务。" +
                    "\n·「清理本地缓存」清除接口快照和应用缓存，不会删除账号、个人台账、验证器记录或服务端业务数据。" +
                    "退出登录会清理登录会话与网页 Cookie，也不等于注销账号。" +
                    "\n· 清除应用数据或卸载会移除应用私有数据，未导出的本地台账和验证器记录可能无法恢复；" +
                    "已导出文件、下载内容、系统日历条目及服务端记录需分别处理。" +
                    "\n· 如需获取、更正、删除服务端个人信息或注销账号，请使用对应服务提供的入口；没有入口时，可联系平台管理者核实身份后处理。",
            )
            PrivacySection(
                "9. 政策更新与联系",
                "本政策会随功能及信息处理方式变化而更新，你可在登录页面或个人页面查看更新日期与内容。" +
                    "如有隐私疑问或权利请求，请联系你使用的平台管理者；也可通过 MY 项目仓库的 Issue 向维护者反馈一般问题。" +
                    "请勿在公开 Issue 中提交密码、Cookie、验证码、密钥或其他个人敏感资料。",
            )
        }
    }
}

@Composable
private fun PrivacySection(title: String, content: String) {
    Column(modifier = Modifier.padding(bottom = 14.dp)) {
        Text(
            title,
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
        )
        Spacer(Modifier.height(4.dp))
        Text(
            content,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
