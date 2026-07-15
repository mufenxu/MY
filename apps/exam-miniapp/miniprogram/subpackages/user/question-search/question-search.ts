import {
    api,
    Category,
    MajorCategory,
    QuestionSearchItem,
    QuestionSearchResult,
} from '../../../services/api';
import { getNavBarInfo } from '../../../utils/nav';

type PickerOption = {
    label: string;
    value: string;
};
type SearchScope = 'all' | 'content' | 'option' | 'analysis';
type SearchScopeOption = {
    label: string;
    value: SearchScope;
};
type HighlightedQuestionSearchItem = QuestionSearchItem & {
    highlightedContent: string;
    highlightedAnalysis: string;
    highlightedOptions: Array<QuestionSearchItem['options'][number] & {
        highlightedValue: string;
    }>;
};
type HighlightRange = { start: number; end: number };

const DEFAULT_SUBJECT_OPTION: PickerOption = { label: '全部科目', value: '' };
const DEFAULT_PAPER_OPTION: PickerOption = { label: '全部试卷', value: '' };
const SEARCH_SCOPE_OPTIONS: SearchScopeOption[] = [
    { label: '全部', value: 'all' },
    { label: '题干', value: 'content' },
    { label: '选项', value: 'option' },
    { label: '解析', value: 'analysis' },
];

function normalizeMajorId(majorCategoryId?: Category['majorCategoryId']) {
    if (!majorCategoryId) return '';
    if (typeof majorCategoryId === 'string') return majorCategoryId;
    return majorCategoryId._id || '';
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/\n/g, '<br/>');
}

function shouldHighlightField(searchScope: SearchScope, field: 'content' | 'option' | 'analysis') {
    return searchScope === 'all' || searchScope === field;
}

function buildLiteralHighlightRanges(value: string, keyword: string, enabled: boolean): HighlightRange[] {
    const text = String(value || '');
    const trimmedKeyword = String(keyword || '').trim();
    if (!enabled || !trimmedKeyword) {
        return [];
    }

    const keywordRegex = new RegExp(escapeRegExp(trimmedKeyword), 'gi');
    const ranges: HighlightRange[] = [];
    let match: RegExpExecArray | null;

    while ((match = keywordRegex.exec(text)) !== null) {
        const start = match.index;
        const matchedText = match[0];
        ranges.push({ start, end: start + matchedText.length });

        if (keywordRegex.lastIndex === start) {
            keywordRegex.lastIndex += 1;
        }
    }

    return ranges;
}

function mergeHighlightRanges(ranges: HighlightRange[], maxLength: number) {
    const normalized = ranges
        .map((range) => ({
            start: Math.max(0, Math.min(Number(range.start) || 0, maxLength)),
            end: Math.max(0, Math.min(Number(range.end) || 0, maxLength)),
        }))
        .filter((range) => range.end > range.start)
        .sort((left, right) => left.start - right.start || left.end - right.end);

    return normalized.reduce((result, range) => {
        const previous = result[result.length - 1];
        if (previous && range.start <= previous.end) {
            previous.end = Math.max(previous.end, range.end);
            return result;
        }

        result.push({ ...range });
        return result;
    }, [] as HighlightRange[]);
}

function highlightKeyword(value: string, keyword: string, enabled: boolean, extraRanges: HighlightRange[] = []) {
    const text = String(value || '');
    const chars = Array.from(text);
    const literalRanges = buildLiteralHighlightRanges(text, keyword, enabled);
    const ranges = mergeHighlightRanges([...literalRanges, ...(enabled ? extraRanges : [])], chars.length);
    if (!ranges.length) {
        return escapeHtml(text);
    }

    let output = '';
    let lastIndex = 0;
    ranges.forEach((range) => {
        output += escapeHtml(chars.slice(lastIndex, range.start).join(''));
        output += `<span style="color:#1d4ed8;background:#dbeafe;border-radius:4px;padding:0 2px;font-weight:700;">${escapeHtml(chars.slice(range.start, range.end).join(''))}</span>`;
        lastIndex = range.end;
    });

    output += escapeHtml(chars.slice(lastIndex).join(''));
    return output;
}

Page({
    data: {
        navBarHeight: 0,
        menuButtonTop: 0,
        menuButtonHeight: 0,

        loadingOptions: true,
        searching: false,
        hasSearched: false,

        keyword: '',
        searchScope: 'all' as SearchScope,
        searchScopeOptions: SEARCH_SCOPE_OPTIONS,
        selectedMajorCategoryId: '',
        selectedCategoryId: '',

        majorCategories: [] as MajorCategory[],
        categories: [] as Category[],

        subjectOptions: [DEFAULT_SUBJECT_OPTION] as PickerOption[],
        paperOptions: [DEFAULT_PAPER_OPTION] as PickerOption[],
        selectedMajorIndex: 0,
        selectedCategoryIndex: 0,

        page: 1,
        limit: 20,
        total: 0,
        hasMore: false,
        list: [] as HighlightedQuestionSearchItem[],
    },

    onLoad() {
        this.initNavBar();
        this.loadFilterOptions();
    },

    initNavBar() {
        const navInfo = getNavBarInfo();
        this.setData({
            navBarHeight: navInfo.navBarHeight,
            menuButtonTop: navInfo.menuButtonTop,
            menuButtonHeight: navInfo.menuButtonHeight,
        });
    },

    async loadFilterOptions() {
        this.setData({ loadingOptions: true });
        try {
            const isLoggedIn = api.isLoggedIn();
            const [majorCategories, categories] = await Promise.all([
                isLoggedIn ? api.getMyMajorCategories() : api.getMajorCategories(),
                isLoggedIn ? api.getMyCategories() : api.getCategories(),
            ]);

            const visibleMajorIds = new Set(majorCategories.map((item) => item._id));
            const visibleCategories = categories.filter((item) => {
                const majorId = normalizeMajorId(item.majorCategoryId);
                return !majorId || visibleMajorIds.has(majorId);
            });

            this.setData({
                majorCategories,
                categories: visibleCategories,
            });

            this.refreshPickerOptions('', '');
        } catch (error) {
            console.error('loadFilterOptions error', error);
            wx.showToast({ title: '加载筛选项失败', icon: 'none' });
        } finally {
            this.setData({ loadingOptions: false });
        }
    },

    refreshPickerOptions(majorCategoryId: string, categoryId: string, callback?: () => void) {
        const subjectOptions: PickerOption[] = [
            DEFAULT_SUBJECT_OPTION,
            ...this.data.majorCategories.map((item) => ({
                label: item.name,
                value: item._id,
            })),
        ];

        const filteredCategories = this.data.categories.filter((item) => {
            if (!majorCategoryId) return true;
            return normalizeMajorId(item.majorCategoryId) === majorCategoryId;
        });

        const paperOptions: PickerOption[] = [
            DEFAULT_PAPER_OPTION,
            ...filteredCategories.map((item) => ({
                label: item.name,
                value: item._id,
            })),
        ];

        const safeCategoryId = paperOptions.some((item) => item.value === categoryId) ? categoryId : '';
        const selectedMajorIndex = Math.max(subjectOptions.findIndex((item) => item.value === majorCategoryId), 0);
        const selectedCategoryIndex = Math.max(paperOptions.findIndex((item) => item.value === safeCategoryId), 0);

        this.setData(
            {
                subjectOptions,
                paperOptions,
                selectedMajorCategoryId: majorCategoryId,
                selectedCategoryId: safeCategoryId,
                selectedMajorIndex,
                selectedCategoryIndex,
            },
            callback
        );
    },

    onBack() {
        wx.navigateBack();
    },

    _keywordTimer: 0 as any,

    onKeywordInput(e: any) {
        const value = e.detail.value;
        // 防抖 300ms，减少 setData 频率
        if (this._keywordTimer) {
            clearTimeout(this._keywordTimer);
        }
        this._keywordTimer = setTimeout(() => {
            this.setData({ keyword: value });
        }, 300);
    },

    onKeywordConfirm() {
        this.runSearch(true);
    },

    onTapSearch() {
        this.runSearch(true);
    },

    onScopeTap(e: WechatMiniprogram.TouchEvent) {
        const { value } = e.currentTarget.dataset as { value: SearchScope };
        if (!value || value === this.data.searchScope) {
            return;
        }

        this.setData({ searchScope: value }, () => {
            if (this.data.hasSearched) {
                this.runSearch(true);
            }
        });
    },

    onSubjectChange(e: any) {
        const index = Number(e.detail.value);
        const selected = this.data.subjectOptions[index] || DEFAULT_SUBJECT_OPTION;
        this.refreshPickerOptions(selected.value, this.data.selectedCategoryId, () => {
            if (this.data.hasSearched) {
                this.runSearch(true);
            }
        });
    },

    onPaperChange(e: any) {
        const index = Number(e.detail.value);
        const selected = this.data.paperOptions[index] || DEFAULT_PAPER_OPTION;
        this.setData(
            {
                selectedCategoryId: selected.value,
                selectedCategoryIndex: index,
            },
            () => {
                if (this.data.hasSearched) {
                    this.runSearch(true);
                }
            }
        );
    },

    async runSearch(reset: boolean) {
        if (this.data.searching) return;

        const keyword = this.data.keyword.trim();
        const hasFilter = !!this.data.selectedMajorCategoryId || !!this.data.selectedCategoryId;
        if (!keyword && !hasFilter) {
            wx.showToast({ title: '请输入关键词或选择筛选范围', icon: 'none' });
            return;
        }

        const nextPage = reset ? 1 : this.data.page + 1;
        this.setData({ searching: true });

        try {
            const searchParams = {
                keyword: keyword || undefined,
                majorCategoryId: this.data.selectedMajorCategoryId || undefined,
                categoryId: this.data.selectedCategoryId || undefined,
                searchScope: this.data.searchScope,
                page: nextPage,
                limit: this.data.limit,
            };
            const result = api.isLoggedIn()
                ? await api.searchMyQuestions(searchParams)
                : await api.searchQuestions(searchParams);

            this.applySearchResult(result, reset);
        } catch (error) {
            console.error('runSearch error', error);
            wx.showToast({ title: '搜索失败，请稍后重试', icon: 'none' });
        } finally {
            this.setData({ searching: false });
        }
    },

    applySearchResult(result: QuestionSearchResult, reset: boolean) {
        const keyword = this.data.keyword.trim();
        const searchScope = this.data.searchScope;
        const nextList = result.list.map((item) => this.buildHighlightedItem(item, keyword, searchScope));
        const mergedList = reset ? nextList : [...this.data.list, ...nextList];
        this.setData({
            list: mergedList,
            total: result.total,
            page: result.page,
            hasMore: result.hasMore,
            hasSearched: true,
        });
    },

    buildHighlightedItem(item: QuestionSearchItem, keyword: string, searchScope: SearchScope): HighlightedQuestionSearchItem {
        const pinyinHighlightRanges = item.pinyinHighlightRanges || {};
        const optionHighlightRanges = pinyinHighlightRanges.options || {};

        return {
            ...item,
            highlightedContent: highlightKeyword(
                item.content,
                keyword,
                shouldHighlightField(searchScope, 'content'),
                pinyinHighlightRanges.content || []
            ),
            highlightedAnalysis: highlightKeyword(
                item.analysis || '',
                keyword,
                shouldHighlightField(searchScope, 'analysis'),
                pinyinHighlightRanges.analysis || []
            ),
            highlightedOptions: (item.options || []).map((option) => ({
                ...option,
                highlightedValue: highlightKeyword(
                    option.value,
                    keyword,
                    shouldHighlightField(searchScope, 'option'),
                    optionHighlightRanges[option.label] || []
                ),
            })),
        };
    },

    onLoadMore() {
        if (this.data.searching || !this.data.hasMore) return;
        this.runSearch(false);
    },
});
