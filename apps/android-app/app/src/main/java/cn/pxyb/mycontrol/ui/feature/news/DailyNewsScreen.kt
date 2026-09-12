package cn.pxyb.mycontrol.ui.feature.news

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Newspaper
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.DailyNews
import cn.pxyb.mycontrol.ui.components.feedback.AppEmptyState
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.feedback.AppSkeletonList
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.components.layout.AppSubPage
import java.time.LocalDate
import java.time.format.DateTimeParseException
import java.time.format.TextStyle
import java.util.Locale

@Composable
fun DailyNewsScreen(
    state: DailyNewsUiState,
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    onRefresh: (Boolean) -> Unit,
) {
    val news = state.news
    LaunchedEffect(Unit) {
        onRefresh(false)
    }
    AppSubPage(
        title = "每日新闻",
        subtitle = "每日 60 秒读懂世界",
        onBack = onBack,
        contentPadding = contentPadding,
        pinHeader = true,
        refreshing = state.refreshing,
        onRefresh = { onRefresh(true) },
    ) {
        if (state.refreshing && news == null) {
            item(key = "daily-news-loading") {
                AppSkeletonList(rowCount = 5, leadingSize = 30.dp, lineWidths = listOf(0.42f, 0.86f))
            }
        }
        state.error?.let { message ->
            item(key = "daily-news-error") {
                AppFeedbackBanner(message = message, error = true)
            }
        }
        if (news != null) {
            item(key = "daily-news-header") {
                DailyNewsHeader(news)
            }
            items(news.news, key = { it }, contentType = { "daily-news-item" }) { item ->
                DailyNewsItem(item)
            }
            if (news.tip.isNotBlank()) {
                item(key = "daily-news-tip") {
                    AppPanel {
                        Text(
                            news.tip,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(14.dp),
                        )
                    }
                }
            }
        } else if (!state.refreshing && state.error == null) {
            item(key = "daily-news-empty") {
                AppPanel {
                    AppEmptyState(
                        title = "暂无新闻",
                        detail = "下拉或稍后再试",
                        icon = Icons.Outlined.Newspaper,
                    )
                }
            }
        }
    }
}

@Composable
private fun DailyNewsHeader(news: DailyNews) {
    AppPanel {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Surface(
                shape = MaterialTheme.shapes.small,
                color = MaterialTheme.colorScheme.primaryContainer,
            ) {
                Icon(
                    Icons.Outlined.Newspaper,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier
                        .padding(8.dp)
                        .size(22.dp),
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    "每日 60 秒读懂世界",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    listOf(dailyNewsDateText(news.date), "${news.news.size} 条")
                        .filter(String::isNotBlank)
                        .joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (news.isMaintenance) {
                Surface(
                    shape = MaterialTheme.shapes.small,
                    color = MaterialTheme.colorScheme.tertiaryContainer,
                ) {
                    Text(
                        "维护模式",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onTertiaryContainer,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun DailyNewsItem(content: String) {
    AppPanel {
        Text(
            content,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(14.dp),
        )
    }
}

private fun dailyNewsDateText(date: String): String {
    if (date.isBlank()) return ""
    return try {
        val parsed = LocalDate.parse(date)
        "${parsed.year}年${parsed.monthValue}月${parsed.dayOfMonth}日 ${
            parsed.dayOfWeek.getDisplayName(TextStyle.FULL, Locale.CHINESE)
        }"
    } catch (_: DateTimeParseException) {
        date
    }
}
