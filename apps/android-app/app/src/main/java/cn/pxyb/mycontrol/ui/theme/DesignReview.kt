package cn.pxyb.mycontrol.ui.theme

import androidx.compose.runtime.staticCompositionLocalOf

// 默认采用选定的 Material 分区方案；其他候选仅供 Debug 对比。
enum class DesignReview { Original, Telegram, Material, Quiet }

val LocalDesignReview = staticCompositionLocalOf { DesignReview.Material }
