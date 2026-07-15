/**
 * 导航栏工具函数
 * 提供统一的导航栏高度计算逻辑
 */

export interface NavBarInfo {
    navBarHeight: number;
    menuButtonTop: number;
    menuButtonHeight: number;
    statusBarHeight: number;
}

/**
 * 获取导航栏尺寸信息
 * 包括导航栏高度、胶囊按钮位置等
 */
export function getNavBarInfo(): NavBarInfo {
    const menuButton = wx.getMenuButtonBoundingClientRect();
    const systemInfo = wx.getSystemInfoSync();
    const statusBarHeight = systemInfo.statusBarHeight || 0;

    // 导航栏高度 = (胶囊顶部 - 状态栏高度) * 2 + 胶囊高度 + 状态栏高度
    const navBarHeight = (menuButton.top - statusBarHeight) * 2 + menuButton.height + statusBarHeight;

    return {
        navBarHeight,
        menuButtonTop: menuButton.top,
        menuButtonHeight: menuButton.height,
        statusBarHeight
    };
}
