import { api, Category, LibraryScope, MajorCategory } from '../../services/api';
import { buildPageUrl, isAuthRequiredError, promptLogin } from '../../utils/auth';
import { getNavBarInfo } from '../../utils/nav';
import { hasUsefulProgress } from '../../utils/progress';
import { ROUTES } from '../../utils/routes';

type LibraryTab = 'demo' | 'my';
type StudyMode = 'exam' | 'practice' | 'recite';
type ActionType = 'result' | StudyMode;
type ExpandedStateMap = Record<LibraryTab, Record<string, boolean>>;

type GroupedCategory = MajorCategory & {
  gradient: string;
  children: Category[];
  expanded: boolean;
  librarySource?: 'owned' | 'assigned' | string;
};

const GRADIENTS = [
  '#E0E7FF',
  '#DCFCE7',
  '#FEE2E2',
  '#FEF3C7',
  '#F3E8FF',
  '#E0F2FE'
];
const DEFAULT_GUEST_AVATAR = '/assets/guest-avatar.png';
const HOME_EXPANDED_STATE_STORAGE_KEY = 'home_library_expanded_state';
const STUDY_MODE_TITLES: Record<StudyMode, string> = {
  exam: '继续实战模拟',
  practice: '继续自由练习',
  recite: '继续背题模式',
};

function createEmptyExpandedState(): ExpandedStateMap {
  return {
    demo: {},
    my: {},
  };
}

Page({
  _expandedState: createEmptyExpandedState(),

  data: {
    activeLibraryTab: 'demo' as LibraryTab,
    demoGroupedCategories: [] as GroupedCategory[],
    myGroupedCategories: [] as GroupedCategory[],
    displayedGroups: [] as GroupedCategory[],
    loading: true,
    isLoggedIn: false,
    personalCategoryCount: 0,
    navBarHeight: 0,
    menuButtonTop: 0,
    menuButtonHeight: 0,
    showActionSheet: false,
    currentCategory: {} as any,
    hasExamResult: false,
    latestResult: null as any,
    progressEntries: [] as { mode: StudyMode; title: string; subtitle: string }[],
    progressModeMap: {
      exam: false,
      practice: false,
      recite: false,
    },
    nickname: '',
    avatarUrl: '',
    defaultGuestAvatar: DEFAULT_GUEST_AVATAR
  },

  onLoad() {
    this._expandedState = this.loadExpandedState();
    this.initNavBar();
    this.initData();
  },

  onShow() {
    this._expandedState = this.loadExpandedState();
    this.refreshUserProfile();
    api.flushPendingProgress().catch((error) => console.error('Flush progress failed', error));
    this.refreshLibraryState();
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 0
      });
    }
  },

  initNavBar() {
    const navInfo = getNavBarInfo();
    this.setData({
      navBarHeight: navInfo.navBarHeight,
      menuButtonTop: navInfo.menuButtonTop,
      menuButtonHeight: navInfo.menuButtonHeight,
    });
  },

  async initData() {
    const isLoggedIn = api.isLoggedIn();
    this.setData({
      loading: true,
      isLoggedIn,
      activeLibraryTab: isLoggedIn ? 'my' : 'demo',
    });
    try {
      if (isLoggedIn) {
        await this.loadMyLibraries();
        if (!api.isLoggedIn()) {
          await this.loadDemoLibraries();
          this.setData({
            isLoggedIn: false,
            activeLibraryTab: 'demo',
          });
        }
      } else {
        await this.loadDemoLibraries();
      }
      this.syncDisplayedGroups();
    } catch (error) {
      console.error('Load home libraries failed', error);
    } finally {
      this.setData({ loading: false });
    }
  },

  async refreshLibraryState() {
    if (!api.isLoggedIn()) {
      if (!this.data.demoGroupedCategories.length) {
        await this.loadDemoLibraries();
      }
      this.setData({
        isLoggedIn: false,
        activeLibraryTab: 'demo',
        myGroupedCategories: [],
        personalCategoryCount: 0,
        displayedGroups: this.data.demoGroupedCategories,
      });
      return;
    }

    await this.loadMyLibraries();
    if (!api.isLoggedIn()) {
      if (!this.data.demoGroupedCategories.length) {
        await this.loadDemoLibraries();
      }
      this.setData({
        isLoggedIn: false,
        activeLibraryTab: 'demo',
        displayedGroups: this.data.demoGroupedCategories
      });
      return;
    }

    this.setData({
      isLoggedIn: true,
      activeLibraryTab: 'my',
      displayedGroups: this.data.myGroupedCategories
    });
  },

  normalizeMajorId(majorCategoryId?: Category['majorCategoryId']) {
    if (!majorCategoryId) return '';
    if (typeof majorCategoryId === 'string') return majorCategoryId;
    return majorCategoryId._id || '';
  },

  buildGroupedCategories(majorCategories: MajorCategory[], categories: Category[], otherName: string): GroupedCategory[] {
    const grouped: GroupedCategory[] = majorCategories.map((mc, index) => {
      const children = categories.filter(c => this.normalizeMajorId(c.majorCategoryId) === mc._id);
      return {
        ...mc,
        gradient: GRADIENTS[index % GRADIENTS.length],
        children,
        expanded: false,
        librarySource: (children[0] && children[0].librarySource) || 'owned',
      } as GroupedCategory;
    });

    const otherCategories = categories.filter(c => !this.normalizeMajorId(c.majorCategoryId));
    if (otherCategories.length > 0) {
        grouped.push({
        _id: 'others',
        name: otherName,
        sortOrder: 999,
        gradient: '#F1F5F9',
        children: otherCategories,
        expanded: false,
        scopeType: categories.length > 0 ? (categories[0].scopeType || 'demo') : 'demo',
        librarySource: (otherCategories[0] && otherCategories[0].librarySource) || 'owned',
      } as GroupedCategory);
    }

    return grouped.filter(group => group.children.length > 0);
  },

  normalizeExpandedState(value: any) {
    if (!value || typeof value !== 'object') {
      return {};
    }

    return Object.keys(value).reduce((result, key) => {
      result[key] = !!value[key];
      return result;
    }, {} as Record<string, boolean>);
  },

  loadExpandedState(): ExpandedStateMap {
    try {
      const stored = wx.getStorageSync(HOME_EXPANDED_STATE_STORAGE_KEY);
      if (!stored || typeof stored !== 'object') {
        return createEmptyExpandedState();
      }

      return {
        demo: this.normalizeExpandedState(stored.demo),
        my: this.normalizeExpandedState(stored.my),
      };
    } catch (error) {
      console.error('Load home expanded state failed', error);
      return createEmptyExpandedState();
    }
  },

  persistExpandedState() {
    try {
      wx.setStorageSync(HOME_EXPANDED_STATE_STORAGE_KEY, this._expandedState);
    } catch (error) {
      console.error('Save home expanded state failed', error);
    }
  },

  applyExpandedState(tab: LibraryTab, groups: GroupedCategory[]) {
    const expandedState = this._expandedState[tab] || {};
    return groups.map((group) => ({
      ...group,
      expanded: typeof expandedState[group._id] === 'boolean'
        ? expandedState[group._id]
        : group.expanded,
    }));
  },

  updateExpandedState(tab: LibraryTab, groupId: string, expanded: boolean) {
    this._expandedState = {
      ...this._expandedState,
      [tab]: {
        ...this._expandedState[tab],
        [groupId]: expanded,
      },
    };
    this.persistExpandedState();
  },

  async loadDemoLibraries() {
    const [majorCategories, categories] = await Promise.all([
      api.getMajorCategories(),
      api.getCategories(),
    ]);

    const grouped = this.applyExpandedState(
      'demo',
      this.buildGroupedCategories(majorCategories, categories, '其他示例题库')
    );
    this.setData({
      demoGroupedCategories: grouped,
    });
  },

  async loadMyLibraries() {
    if (!api.isLoggedIn()) {
      this.setData({
        myGroupedCategories: [],
        personalCategoryCount: 0,
      });
      return;
    }

    try {
      const [majorCategories, categories] = await Promise.all([
        api.getMyMajorCategories(),
        api.getMyCategories(),
      ]);

      const grouped = this.applyExpandedState(
        'my',
        this.buildGroupedCategories(majorCategories, categories, '未分组题库')
      );
      const visibleCategoryCount = grouped.reduce((total, group) => total + group.children.length, 0);
      this.setData({
        myGroupedCategories: grouped,
        personalCategoryCount: visibleCategoryCount,
      });
    } catch (error) {
      if (!isAuthRequiredError(error)) {
        console.error('Load personal libraries failed', error);
      }
      this.setData({
        myGroupedCategories: [],
        personalCategoryCount: 0,
      });
    }
  },

  syncDisplayedGroups() {
    const displayedGroups = this.data.activeLibraryTab === 'my'
      ? this.data.myGroupedCategories
      : this.data.demoGroupedCategories;

    this.setData({ displayedGroups });
  },

  onToggleGroup(e: WechatMiniprogram.TouchEvent) {
    const { index } = e.currentTarget.dataset;
    const listKey = this.data.activeLibraryTab === 'my' ? 'myGroupedCategories' : 'demoGroupedCategories';
    const sourceList = this.data.activeLibraryTab === 'my'
      ? this.data.myGroupedCategories
      : this.data.demoGroupedCategories;

    if (!sourceList || !sourceList[index]) return;

    const key = `${listKey}[${index}].expanded`;
    const nextExpanded = !sourceList[index].expanded;
    this.updateExpandedState(this.data.activeLibraryTab, sourceList[index]._id, nextExpanded);
    this.setData({
      [key]: nextExpanded,
    }, () => this.syncDisplayedGroups());
  },

  rememberCategoryGroupExpanded(categoryId: string) {
    const tab = this.data.activeLibraryTab;
    const sourceList = tab === 'my'
      ? this.data.myGroupedCategories
      : this.data.demoGroupedCategories;
    const group = sourceList.find((item) => item.children.some((child) => child._id === categoryId));
    if (group) {
      this.updateExpandedState(tab, group._id, true);
    }
  },

  async onCategoryTap(e: WechatMiniprogram.TouchEvent) {
    const { id, name, duration, scopeType, librarySource } = e.currentTarget.dataset as {
      id: string;
      name: string;
      duration: number;
      scopeType?: string;
      librarySource?: 'owned' | 'assigned' | 'shared';
    };
    this.rememberCategoryGroupExpanded(id);

    const currentScope: LibraryScope = (scopeType === 'my' || scopeType === 'personal' || (!scopeType && this.data.activeLibraryTab === 'my'))
      ? 'personal'
      : 'demo';

    this.setData({
      currentCategory: { id, name, duration, scopeType: currentScope, librarySource: librarySource || 'owned' },
      hasExamResult: false,
      latestResult: null,
    });
    this.setProgressEntries([]);

    wx.showLoading({ title: '检查进度...' });
    try {
      const [latestResult, progressEntries] = await Promise.all([
        currentScope === 'personal' && api.isLoggedIn()
          ? api.getLatestExamResult(id).catch((error) => {
            if (!isAuthRequiredError(error)) {
              console.error('Error fetching personal exam result', error);
            }
            return null;
          })
          : Promise.resolve(null),
        this.loadProgressEntries(id, currentScope).catch((error) => {
          console.error('Load progress entries failed', error);
          return [];
        }),
      ]);

      if (latestResult) {
        this.setData({
          hasExamResult: true,
          latestResult: {
            ...latestResult,
            title: name,
            duration,
          }
        });
      }

      this.setProgressEntries(progressEntries);
    } finally {
      wx.hideLoading();
    }

    this.setData({ showActionSheet: true });
  },

  buildProgressSubtitle(progress: any) {
    const total = Number(progress.questionCount) || 0;
    const current = Math.min((Number(progress.currentIndex) || 0) + 1, total || 1);
    const timeText = progress.updateTime ? ` · ${String(progress.updateTime).slice(5, 16).replace('T', ' ')}` : '';
    return total > 0
      ? `上次做到第 ${current}/${total} 题${timeText}`
      : `上次进度可继续${timeText}`;
  },

  async loadProgressEntries(categoryId: string, scope: LibraryScope) {
    const modes: StudyMode[] = ['exam', 'practice', 'recite'];
    const progressList = await Promise.all(modes.map(async (mode) => {
      try {
        const progress = scope === 'personal'
          ? (api.isLoggedIn() ? await api.getProgress(categoryId, mode) : null)
          : api.getLocalProgress(categoryId, mode);
        if (!hasUsefulProgress(progress)) {
          return null;
        }
        return {
          mode,
          title: STUDY_MODE_TITLES[mode],
          subtitle: this.buildProgressSubtitle(progress),
        };
      } catch (error) {
        if (!isAuthRequiredError(error)) {
          console.error('Load progress failed', error);
        }
        return null;
      }
    }));

    return progressList.filter(Boolean) as { mode: StudyMode; title: string; subtitle: string }[];
  },

  setProgressEntries(progressEntries: { mode: StudyMode; title: string; subtitle: string }[]) {
    this.setData({
      progressEntries,
      progressModeMap: {
        exam: progressEntries.some((item) => item.mode === 'exam'),
        practice: progressEntries.some((item) => item.mode === 'practice'),
        recite: progressEntries.some((item) => item.mode === 'recite'),
      },
    });
  },

  onCloseActionSheet() {
    this.setData({ showActionSheet: false });
  },

  hasProgressForMode(mode: StudyMode) {
    return this.data.progressEntries.some((item) => item.mode === mode);
  },

  async openStudyMode(type: StudyMode, resume = false, restart = false) {
    const { currentCategory } = this.data as any;
    const nextUrl = buildPageUrl(ROUTES.EXAM, {
      categoryId: currentCategory.id,
      title: currentCategory.name,
      duration: currentCategory.duration || 0,
      mode: type,
      sourceType: currentCategory.scopeType === 'personal' ? 'my' : 'demo',
      resume: resume ? 1 : undefined,
      restart: restart ? 1 : undefined,
    });

    if (currentCategory.scopeType === 'personal' && !api.isLoggedIn()) {
      await promptLogin({
        message: '登录后才能练习你自己创建的题库，是否前往登录？',
        nextUrl,
      });
      return;
    }

    wx.navigateTo({ url: nextUrl });
  },

  async onResumeProgressTap(e: WechatMiniprogram.TouchEvent) {
    const { mode } = e.currentTarget.dataset as { mode: StudyMode };
    this.onCloseActionSheet();
    await this.openStudyMode(mode, true);
  },

  async clearProgressMode(mode: StudyMode, silent = false) {
    const { currentCategory } = this.data as any;
    if (!currentCategory || !currentCategory.id) {
      return;
    }

    if (!silent) {
      wx.showLoading({ title: '清除中...' });
    }

    try {
      if (currentCategory.scopeType === 'personal' && api.isLoggedIn()) {
        await api.clearProgress(currentCategory.id, mode);
      } else {
        api.clearLocalProgress(currentCategory.id, mode);
      }

      this.setProgressEntries(this.data.progressEntries.filter((item) => item.mode !== mode));
      if (!silent) {
        wx.showToast({ title: '已清除', icon: 'success' });
      }
    } catch (error) {
      console.error('Clear progress failed', error);
      if (!silent) {
        wx.showToast({ title: '清除失败', icon: 'none' });
      }
    } finally {
      if (!silent) {
        wx.hideLoading();
      }
    }
  },

  async onClearProgressTap(e: WechatMiniprogram.TouchEvent) {
    const { mode } = e.currentTarget.dataset as { mode: StudyMode };
    await this.clearProgressMode(mode);
  },

  async onClearAllProgressTap() {
    const res = await wx.showModal({
      title: '清除进度',
      content: '清除后不会再显示继续上次，之后可以重新开始练习。',
      confirmText: '清除',
      cancelText: '取消',
    });

    if (!res.confirm) {
      return;
    }

    wx.showLoading({ title: '清除中...' });
    try {
      const modes = this.data.progressEntries.map((item) => item.mode);
      for (const mode of modes) {
        await this.clearProgressMode(mode, true);
      }
      this.setProgressEntries([]);
      wx.showToast({ title: '已清除', icon: 'success' });
    } catch (error) {
      console.error('Clear all progress failed', error);
      wx.showToast({ title: '清除失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async onActionTap(e: WechatMiniprogram.TouchEvent) {
    const { type } = e.currentTarget.dataset as { type: ActionType };
    const { latestResult } = this.data as any;

    this.onCloseActionSheet();

    if (type === 'result') {
      wx.navigateTo({
        url: ROUTES.EXAM_REVIEW,
        success: (res) => {
          res.eventChannel.emit('acceptDataFromOpenerPage', latestResult);
        }
      });
      return;
    }

    await this.openStudyMode(type, false, this.hasProgressForMode(type));
  },

  refreshUserProfile() {
    const profile = wx.getStorageSync('user_profile') || {};
    const openid = api.getUserId();
    const localAvatar = api.getLocalAvatar(openid);
    this.setData({
      nickname: profile.nickname || '',
      avatarUrl: localAvatar || profile.avatarUrl || ''
    });
  },

  goToProfile() {
    wx.switchTab({
      url: ROUTES.PROFILE
    });
  },

  goToLogin() {
    wx.navigateTo({
      url: buildPageUrl(ROUTES.AUTH_LOGIN, {
        nextUrl: ROUTES.INDEX,
      }),
    });
  },

  async goToScanLogin() {
    if (!api.isLoggedIn()) {
      await promptLogin({
        message: '请先登录小程序，再继续扫码操作。',
        nextUrl: ROUTES.SCAN_LOGIN,
      });
      return;
    }
    wx.navigateTo({
      url: ROUTES.SCAN_LOGIN,
    });
  }
});
