export const getDiceBearAvatar = (seed) => {
    if (!seed) return 'https://api.dicebear.com/7.x/bottts/svg?seed=fallback&backgroundColor=f5f7fb';
    return `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(seed)}&backgroundColor=f5f7fb`;
};
