import { useState, useEffect } from 'react';

/**
 * 响应式断点 Hook
 * @returns {{ isMobile: boolean, isTablet: boolean, isDesktop: boolean, screenWidth: number }}
 * - isMobile: 宽度 <= 768px (手机端)
 * - isTablet: 宽度 > 768px && <= 1024px (平板端)
 * - isDesktop: 宽度 > 1024px (桌面端)
 * - screenWidth: 当前屏幕宽度
 */
const useResponsive = () => {
    const [state, setState] = useState(() => {
        const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
        return {
            isMobile: w <= 768,
            isTablet: w > 768 && w <= 1024,
            isDesktop: w > 1024,
            screenWidth: w,
        };
    });

    useEffect(() => {
        let frameId = null;
        const handleResize = () => {
            if (frameId) return;
            frameId = window.requestAnimationFrame(() => {
                const w = window.innerWidth;
                setState({
                    isMobile: w <= 768,
                    isTablet: w > 768 && w <= 1024,
                    isDesktop: w > 1024,
                    screenWidth: w,
                });
                frameId = null;
            });
        };

        window.addEventListener('resize', handleResize, { passive: true });
        return () => {
            window.removeEventListener('resize', handleResize);
            if (frameId) {
                window.cancelAnimationFrame(frameId);
            }
        };
    }, []);

    return state;
};

/**
 * useIsMobile:
 * 现在的策略是分离平板和手机，<=768px 才判定为手机端，
 * 以便平板享受到更宽广的桌面端 Table 布局。
 */
const useIsMobile = () => {
    const { isMobile } = useResponsive();
    return isMobile;
};

export default useIsMobile;
export { useResponsive };