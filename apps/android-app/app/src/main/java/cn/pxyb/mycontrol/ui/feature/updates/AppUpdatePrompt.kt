package cn.pxyb.mycontrol.ui.feature.updates

import cn.pxyb.mycontrol.update.AppUpdatePhase

internal fun shouldShowStartupUpdatePrompt(
    phase: AppUpdatePhase,
    isAuthenticated: Boolean,
    hasPrompted: Boolean,
): Boolean = phase == AppUpdatePhase.Available && isAuthenticated && !hasPrompted
