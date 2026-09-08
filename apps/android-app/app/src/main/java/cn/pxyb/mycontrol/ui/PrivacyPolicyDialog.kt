package cn.pxyb.mycontrol.ui

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

@Composable
fun PrivacyPolicyDialog(onDismiss: () -> Unit) {
    AppDialog(
        onDismissRequest = onDismiss,
        title = "隐私政策",
        subtitle = "更新日期：2026年8月31日",
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
                        "1. 我们收集的信息",
                        "· 账号信息：你主动输入的用户名，用于登录本应用与 MY 平台。" +
                            "\n· 会话信息：登录后由服务端签发的会话 Cookie，仅保存在本机，用于保持登录状态。" +
                            "\n· 使用数据：离线快照、页面缓存、个人设置等仅存储在本机。",
                    )
                    PrivacySection(
                        "2. 信息的存储与保护",
                        "· 会话凭据与本地快照使用 Android Keystore 密钥（AES-GCM）加密后存储，密钥不会离开设备。" +
                            "\n· 网络传输全部使用 HTTPS，并对主要服务端证书进行固定校验，降低中间人攻击风险。",
                    )
                    PrivacySection(
                        "3. 权限使用说明",
                        "· 相机：仅在你主动发起扫码（如扫码登录、预约）时使用。" +
                            "\n· 通知：用于推送预约、告警等提醒，你可随时在系统设置中关闭。" +
                            "\n· 日历：仅在你主动开启日程同步时读写。" +
                            "\n· 生物识别：仅用于解锁已开启锁屏保护的应用。" +
                            "\n· 安装未知来源应用：仅在你主动确认安装应用更新时使用。",
                    )
                    PrivacySection(
                        "4. 第三方服务",
                        "· 本应用不含广告 SDK 与统计 SDK。" +
                            "\n· 应用更新清单可能托管于 GitHub Releases，访问时遵循对应服务商的隐私政策。" +
                            "\n· 应用内打开的其他平台网页（如教务、图书馆等）由对应平台提供，遵循其自身政策。",
                    )
                    PrivacySection(
                        "5. 数据共享",
                        "除登录所需的服务端认证外，本应用不会向任何第三方上传或出售你的个人信息。",
                    )
                    PrivacySection(
                        "6. 你的权利",
                        "你可以随时在「清理本地缓存」中清除缓存，或在退出登录后删除本地会话数据。",
                    )
                    PrivacySection(
                        "7. 联系我们",
                        "如对本隐私政策有任何疑问，可通过 MY 项目仓库提交 Issue 与我们联系。",
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
