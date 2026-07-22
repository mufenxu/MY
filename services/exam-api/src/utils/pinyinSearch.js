const PINYIN_INITIALS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'w', 'x', 'y', 'z'];
const PINYIN_BOUNDARIES = ['阿', '芭', '擦', '搭', '蛾', '发', '噶', '哈', '机', '喀', '垃', '妈', '拿', '哦', '啪', '期', '然', '撒', '塌', '挖', '昔', '压', '匝'];

const CHINESE_RE = /[\u4e00-\u9fff]/;
const ALNUM_RE = /[a-z0-9]/i;
const LETTER_RE = /[a-z]/i;

let pinyinCollator = null;
try {
    pinyinCollator = new Intl.Collator('zh-CN-u-co-pinyin', { sensitivity: 'base' });
} catch (error) {
    pinyinCollator = null;
}

function normalizePinyinKeyword(keyword = '') {
    return String(keyword).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isPinyinInitialKeyword(keyword = '') {
    const normalized = normalizePinyinKeyword(keyword);
    return normalized.length > 0 && LETTER_RE.test(normalized);
}

function getCharInitial(char) {
    if (!char) return '';

    if (ALNUM_RE.test(char)) {
        return char.toLowerCase();
    }

    if (!CHINESE_RE.test(char) || !pinyinCollator) {
        return '';
    }

    let boundaryIndex = 0;
    for (let i = 0; i < PINYIN_BOUNDARIES.length; i++) {
        if (pinyinCollator.compare(char, PINYIN_BOUNDARIES[i]) >= 0) {
            boundaryIndex = i;
        } else {
            break;
        }
    }

    return PINYIN_INITIALS[boundaryIndex] || '';
}

function getTextInitials(text = '') {
    if (!text) return '';

    let initials = '';
    for (const char of String(text)) {
        initials += getCharInitial(char);
    }
    return initials;
}

function containsPinyinInitials(text, keyword, cache) {
    const normalizedKeyword = normalizePinyinKeyword(keyword);
    if (!normalizedKeyword) return false;

    const sourceText = String(text || '');
    if (!sourceText) return false;

    let initials = null;
    if (cache && cache.has(sourceText)) {
        initials = cache.get(sourceText);
    } else {
        initials = getTextInitials(sourceText);
        if (cache) {
            cache.set(sourceText, initials);
        }
    }

    return initials.includes(normalizedKeyword);
}

function getPinyinInitialMatchRanges(text, keyword, cache) {
    const normalizedKeyword = normalizePinyinKeyword(keyword);
    if (!normalizedKeyword) return [];

    const sourceText = String(text || '');
    if (!sourceText) return [];

    const chars = Array.from(sourceText);
    const cacheKey = `ranges:${sourceText}`;
    let indexedInitials = null;

    if (cache && cache.has(cacheKey)) {
        indexedInitials = cache.get(cacheKey);
    } else {
        let initials = '';
        const indexMap = [];

        chars.forEach((char, charIndex) => {
            const initial = getCharInitial(char);
            if (!initial) return;
            initials += initial;
            indexMap.push(charIndex);
        });

        indexedInitials = { initials, indexMap };
        if (cache) {
            cache.set(cacheKey, indexedInitials);
        }
    }

    const ranges = [];
    let fromIndex = 0;
    while (fromIndex < indexedInitials.initials.length) {
        const matchIndex = indexedInitials.initials.indexOf(normalizedKeyword, fromIndex);
        if (matchIndex < 0) {
            break;
        }

        const startCharIndex = indexedInitials.indexMap[matchIndex];
        const endInitialIndex = matchIndex + normalizedKeyword.length - 1;
        const endCharIndex = indexedInitials.indexMap[endInitialIndex];

        if (startCharIndex !== undefined && endCharIndex !== undefined) {
            ranges.push({
                start: startCharIndex,
                end: endCharIndex + 1,
            });
        }

        fromIndex = matchIndex + 1;
    }

    return ranges;
}

async function collectMatchingPage(items, { startIndex = 0, limit = 20, getMatch }) {
    const pageItems = [];
    let total = 0;

    for await (const item of items) {
        const match = await getMatch(item);
        if (!match || (Array.isArray(match) && match.length === 0)) {
            continue;
        }

        if (total >= startIndex && pageItems.length < limit) {
            pageItems.push({ item, match });
        }
        total += 1;
    }

    return { pageItems, total };
}

module.exports = {
    collectMatchingPage,
    normalizePinyinKeyword,
    isPinyinInitialKeyword,
    containsPinyinInitials,
    getPinyinInitialMatchRanges,
};
