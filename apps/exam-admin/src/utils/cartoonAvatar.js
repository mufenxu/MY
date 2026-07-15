const avatarCache = new Map();

const palettes = [
    { bg: '#DDF4FF', shirt: '#2563EB', hair: '#2B2118', skin: '#FFD6B0', blush: '#FF9AA2' },
    { bg: '#E8F8EF', shirt: '#059669', hair: '#3A2A1B', skin: '#F7C59F', blush: '#F59E9E' },
    { bg: '#FFF1D7', shirt: '#EA580C', hair: '#1F2937', skin: '#EFC08D', blush: '#F9738E' },
    { bg: '#F1E8FF', shirt: '#7C3AED', hair: '#4B2E83', skin: '#F8C9B4', blush: '#FB7185' },
    { bg: '#E6FFFB', shirt: '#0F766E', hair: '#51362A', skin: '#F2B896', blush: '#FCA5A5' },
    { bg: '#FDEEEF', shirt: '#DB2777', hair: '#2F1B16', skin: '#FFD1A8', blush: '#FB7185' },
];

const hashString = (value) => {
    let hash = 2166136261;
    const text = String(value || 'anonymous-user');
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
};

const pick = (items, hash, shift = 0) => items[(hash >>> shift) % items.length];

const encodeSvg = (svg) => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

export function createCartoonAvatar(seed, options = {}) {
    const size = Number(options.size) || 96;
    const cacheKey = `${seed || 'anonymous-user'}:${size}`;
    if (avatarCache.has(cacheKey)) return avatarCache.get(cacheKey);

    const hash = hashString(seed);
    const palette = pick(palettes, hash);
    const hairStyles = [
        '<path d="M25 43c2-17 14-27 29-27 17 0 28 10 31 28-9-9-17-11-29-10-11 1-20 4-31 9Z"/>',
        '<path d="M23 47c1-20 14-31 32-31 15 0 27 9 30 26-7-5-14-8-22-8-14 0-25 4-40 13Z"/>',
        '<path d="M27 41c3-16 13-25 29-25 13 0 24 7 30 22-11-2-20-4-30-1-11 2-19 4-29 4Z"/>',
    ];
    const mouths = [
        '<path d="M42 63c5 5 14 5 20 0" fill="none" stroke="#8A3A32" stroke-width="3" stroke-linecap="round"/>',
        '<path d="M43 64c4 3 13 3 18 0" fill="none" stroke="#8A3A32" stroke-width="3" stroke-linecap="round"/>',
        '<path d="M44 62h17" fill="none" stroke="#8A3A32" stroke-width="3" stroke-linecap="round"/>',
    ];
    const eyeOffset = (hash % 3) - 1;
    const hasGlasses = (hash & 8) === 8;
    const hair = pick(hairStyles, hash, 6);
    const mouth = pick(mouths, hash, 12);

    const glasses = hasGlasses
        ? '<g fill="none" stroke="#172033" stroke-width="2.2" stroke-linecap="round"><circle cx="39" cy="52" r="7"/><circle cx="62" cy="52" r="7"/><path d="M46 52h9"/></g>'
        : '';

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 96 96" role="img" aria-label="用户卡通头像">
  <rect width="96" height="96" rx="24" fill="${palette.bg}"/>
  <circle cx="24" cy="22" r="8" fill="#FFFFFF" opacity=".65"/>
  <circle cx="76" cy="26" r="12" fill="#FFFFFF" opacity=".45"/>
  <path d="M25 86c5-15 17-23 31-23s26 8 32 23H25Z" fill="${palette.shirt}"/>
  <circle cx="30" cy="56" r="7" fill="${palette.skin}"/>
  <circle cx="72" cy="56" r="7" fill="${palette.skin}"/>
  <circle cx="50" cy="50" r="29" fill="${palette.skin}"/>
  <g fill="${palette.hair}">${hair}</g>
  <circle cx="${39 + eyeOffset}" cy="52" r="3.4" fill="#172033"/>
  <circle cx="${62 - eyeOffset}" cy="52" r="3.4" fill="#172033"/>
  ${glasses}
  <circle cx="35" cy="60" r="4" fill="${palette.blush}" opacity=".55"/>
  <circle cx="66" cy="60" r="4" fill="${palette.blush}" opacity=".55"/>
  ${mouth}
  <path d="M49 54c-1 3-2 6-4 8 3 1 6 1 9 0" fill="none" stroke="#B26B54" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>
</svg>`.trim();

    const dataUrl = encodeSvg(svg);
    avatarCache.set(cacheKey, dataUrl);
    return dataUrl;
}
