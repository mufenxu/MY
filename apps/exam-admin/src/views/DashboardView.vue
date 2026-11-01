<template>
<div class="admin-shell">

        <!-- 手机抽屉 -->
        <button v-if="mobileMenuVisible" type="button" class="rail-drawer-veil" aria-label="关闭导航菜单"
            @click="mobileMenuVisible = false"></button>
        <aside class="rail-drawer" :class="{ 'is-open': mobileMenuVisible }" aria-label="导航菜单">
            <div class="rail-brand">
                <span class="rail-brand-mark"><img :src="faviconUrl" alt="好爱学习"></span>
                <span class="rail-brand-copy">
                    <strong>好爱学习</strong>
                    <small>考试业务管理后台</small>
                </span>
            </div>
            <DashboardNavMenu
                :active-menu="activeMenu"
                :console-mode="isConsoleMode"
                :manage-menu-label="manageMenuLabel"
                :feedback-menu-label="feedbackMenuLabel"
                :feedback-badge-count="feedbackBadgeCount"
                @select="handleMenuSelect"
            />
            <div class="rail-foot">
                <a v-if="IS_PLATFORM_SSO" class="rail-console-link" href="/console" aria-label="返回统一服务控制台">
                    <el-icon><Grid /></el-icon>
                    <span>统一控制台</span>
                </a>
                <button type="button" class="rail-user" @click="mobileMenuVisible = false; handleLogout()">
                    <img class="rail-user-avatar" :src="getUserCartoonAvatar(loggedInUser)" alt="">
                    <span class="rail-user-copy">
                        <strong>{{ displayName }}</strong>
                        <small>{{ roleText }}</small>
                    </span>
                    <el-icon class="rail-user-arrow"><SwitchButton /></el-icon>
                </button>
            </div>
        </aside>

        <!-- 桌面侧栏 -->
        <aside class="admin-rail is-desktop">
            <div class="rail-brand">
                <span class="rail-brand-mark"><img :src="faviconUrl" alt="好爱学习"></span>
                <span class="rail-brand-copy">
                    <strong>好爱学习</strong>
                    <small>考试业务管理后台</small>
                </span>
            </div>
            <DashboardNavMenu
                :active-menu="activeMenu"
                :console-mode="isConsoleMode"
                :manage-menu-label="manageMenuLabel"
                :feedback-menu-label="feedbackMenuLabel"
                :feedback-badge-count="feedbackBadgeCount"
                @select="handleMenuSelect"
            />

            <div class="rail-foot">
                <a v-if="IS_PLATFORM_SSO" class="rail-console-link" href="/console" aria-label="返回统一服务控制台">
                    <el-icon><Grid /></el-icon>
                    <span>统一控制台</span>
                </a>
                <el-popover
                    v-model:visible="userMenuVisible"
                    trigger="click"
                    placement="top-start"
                    :width="236"
                    popper-class="user-menu-popover"
                >
                    <div class="user-menu-panel">
                        <div class="user-menu-head">
                            <div class="user-menu-name">{{ displayName }}</div>
                            <div class="user-menu-role">{{ roleText }}</div>
                        </div>

                        <button
                            v-if="hasAdminSecurityActions && loggedInUser.isWechatBound"
                            type="button"
                            class="user-menu-item"
                            @click="userMenuVisible = false; unbindWechat()"
                        >
                            <el-icon><Link /></el-icon>
                            <span>解绑微信</span>
                        </button>
                        <button
                            v-else-if="hasAdminSecurityActions"
                            type="button"
                            class="user-menu-item"
                            @click="userMenuVisible = false; openBindDialog()"
                        >
                            <el-icon><Link /></el-icon>
                            <span>绑定微信</span>
                        </button>
                        <button
                            v-if="hasAdminSecurityActions"
                            type="button"
                            class="user-menu-item"
                            @click="userMenuVisible = false; openPasswordDialog()"
                        >
                            <el-icon><Key /></el-icon>
                            <span>修改密码</span>
                        </button>
                        <button
                            type="button"
                            class="user-menu-item is-danger"
                            @click="userMenuVisible = false; handleLogout()"
                        >
                            <el-icon><SwitchButton /></el-icon>
                            <span>退出登录</span>
                        </button>
                    </div>
                    <template #reference>
                        <button type="button" class="rail-user">
                            <img class="rail-user-avatar" :src="getUserCartoonAvatar(loggedInUser)" alt="">
                            <span class="rail-user-copy">
                                <strong>{{ displayName }}</strong>
                                <small>{{ roleText }}</small>
                            </span>
                            <el-icon class="rail-user-arrow"><ArrowDown /></el-icon>
                        </button>
                    </template>
                </el-popover>
            </div>
        </aside>

        <div class="admin-main">
            <header class="admin-topbar">
                <button type="button" class="topbar-btn rail-toggle" aria-label="打开导航菜单"
                    @click="mobileMenuVisible = true">
                    <el-icon><Menu /></el-icon>
                </button>
                <div class="topbar-heading">
                    <span class="topbar-title">{{ activePanelTitle }}</span>
                    <span v-if="isExamView" class="topbar-sub">{{ categoryLabel }}</span>
                    <span v-else-if="uiPreviewMode" class="topbar-sub">预览数据</span>
                </div>
                <div class="topbar-actions">
                    <button type="button" class="topbar-btn"
                        :aria-label="isDarkTheme ? '切换到浅色主题' : '切换到深色主题'"
                        :title="isDarkTheme ? '切换到浅色主题' : '切换到深色主题'"
                        @click="handleThemeToggle">
                        <el-icon><component :is="isDarkTheme ? 'Sunny' : 'Moon'" /></el-icon>
                    </button>
                </div>
            </header>
            <main class="admin-content">

                    <!-- Dashboard View (数据概览) -->
                    <div v-show="activeMenu === 'dashboard'" class="dashboard-container">
                        <!-- 统计卡片 -->
                        <div class="dashboard-stats-grid">
                            <div class="stat-card blue">
                                <div class="stat-icon"><el-icon>
                                        <Folder />
                                    </el-icon></div>
                                <div class="stat-info">
                                    <div class="stat-value">{{ dashboardStats.error ? '--' : (dashboardStats.counts.majorCategories || 0) }}</div>
                                    <div class="stat-label">{{ dashboardStatLabels.majorCategories }}</div>
                                    <div class="stat-hint">{{ dashboardStatHints.majorCategories }}</div>
                                </div>
                            </div>
                            <div class="stat-card green">
                                <div class="stat-icon"><el-icon>
                                        <Files />
                                    </el-icon></div>
                                <div class="stat-info">
                                    <div class="stat-value">{{ dashboardStats.error ? '--' : (dashboardStats.counts.categories || 0) }}</div>
                                    <div class="stat-label">{{ dashboardStatLabels.categories }}</div>
                                    <div class="stat-hint">{{ dashboardStatHints.categories }}</div>
                                </div>
                            </div>
                            <div class="stat-card orange">
                                <div class="stat-icon"><el-icon>
                                        <Edit />
                                    </el-icon></div>
                                <div class="stat-info">
                                    <div class="stat-value">{{ dashboardStats.error ? '--' : (dashboardStats.counts.questions || 0) }}</div>
                                    <div class="stat-label">{{ dashboardStatLabels.questions }}</div>
                                    <div class="stat-hint">{{ dashboardStatHints.questions }}</div>
                                </div>
                            </div>
                            <div class="stat-card purple">
                                <div class="stat-icon"><el-icon><DataAnalysis /></el-icon></div>
                                <div class="stat-info">
                                    <div class="stat-value">{{ fourthStatValue }}</div>
                                    <div class="stat-label">{{ dashboardStatLabels.examResults }}</div>
                                    <div class="stat-hint">{{ dashboardStatHints.examResults }}</div>
                                </div>
                            </div>
                        </div>

                        <div class="dashboard-action-strip">
                            <button
                                v-for="item in dashboardActionCards"
                                :key="item.id"
                                type="button"
                                class="dashboard-action-card"
                                :class="`is-${item.tone}`"
                                @click="handleDashboardAction(item)"
                            >
                                <span class="dashboard-action-icon">
                                    <el-icon v-if="item.kind === 'feedback'"><ChatDotRound /></el-icon>
                                    <el-icon v-else-if="item.kind === 'exam'"><DataAnalysis /></el-icon>
                                    <el-icon v-else-if="item.kind === 'user'"><User /></el-icon>
                                    <el-icon v-else-if="item.kind === 'category'"><Files /></el-icon>
                                    <el-icon v-else><TrendCharts /></el-icon>
                                </span>
                                <span class="dashboard-action-copy">
                                    <strong>{{ item.value }}</strong>
                                    <span>{{ item.label }}</span>
                                    <small>{{ item.detail }}</small>
                                </span>
                            </button>
                        </div>

                        <!-- 图表 -->
                        <div class="dashboard-insight-grid">
                            <div class="chart-section dashboard-chart-section">
                                <div class="chart-section-head">
                                    <div>
                                        <div class="section-title">近7天做题趋势</div>
                                        <div class="section-subtitle">{{ dashboardTrendSummary }}</div>
                                    </div>
                                    <div class="chart-kpis">
                                        <div>
                                            <span>今日</span>
                                            <strong>{{ activityTrendChart.today }}</strong>
                                        </div>
                                        <div>
                                            <span>峰值</span>
                                            <strong>{{ activityTrendChart.peakValue }}</strong>
                                        </div>
                                    </div>
                                </div>
                                <div class="chart-container">
                                    <MiniLineChart
                                        :labels="activityTrendChart.labels"
                                        :values="activityTrendChart.values"
                                        empty-text="近 7 天暂无做题记录"
                                        unit="次"
                                    />
                                </div>
                            </div>

                            <aside class="dashboard-side-panel">
                                <div class="dashboard-side-head">
                                    <div>
                                        <div class="section-title">最近动态</div>
                                        <div class="section-subtitle">考试、用户和反馈的最新变化</div>
                                    </div>
                                    <el-button size="small" text icon="Refresh" :loading="dashboardRecent.loading" @click="loadDashboardRecent">刷新</el-button>
                                </div>
                                <div v-if="dashboardRecentItems.length === 0" class="dashboard-recent-empty">
                                    暂无可展示动态
                                </div>
                                <button
                                    v-for="item in dashboardRecentItems"
                                    :key="item.id"
                                    type="button"
                                    class="dashboard-recent-item"
                                    @click="handleDashboardRecentItem(item)">
                                    <span class="dashboard-recent-icon" :class="`is-${item.kind}`">
                                        <el-icon v-if="item.kind === 'exam'"><DataAnalysis /></el-icon>
                                        <el-icon v-else-if="item.kind === 'user'"><User /></el-icon>
                                        <el-icon v-else><ChatDotRound /></el-icon>
                                    </span>
                                    <span class="dashboard-recent-main">
                                        <strong>{{ item.title }}</strong>
                                        <small>{{ item.meta }}</small>
                                    </span>
                                    <time>{{ item.timeText }}</time>
                                </button>
                            </aside>
                        </div>
                    </div>


                    <!-- Major Categories View (科目管理 - 卡片式) -->
                    <div v-if="activeMenu === 'major-categories' || activeMenu === 'demo-manage'">
                        <div class="content-toolbar category-toolbar-shell">
                            <div v-if="isExamView || uiPreviewMode" class="toolbar-context-strip">
                                <el-button v-if="isExamView" class="toolbar-back-button" text icon="ArrowLeft"
                                    @click.stop="backToSubjectList">返回{{ majorLabel }}列表</el-button>
                                <el-tag v-if="isExamView" effect="plain">{{ selectedMajorCategory?.name || '未选择科目' }}</el-tag>
                                <span v-if="uiPreviewMode" class="ui-preview-pill">预览数据</span>
                            </div>
                            <div class="page-header-actions">
                                <el-input
                                    class="category-card-search"
                                    v-model="categorySearchKeyword"
                                    :placeholder="isExamView ? `搜索${categoryLabel}` : `搜索${majorLabel}`"
                                    clearable>
                                    <template #prefix><el-icon><Search /></el-icon></template>
                                </el-input>
                                <el-button v-if="isConsoleMode" plain icon="Download"
                                    @click.stop="openAcceptShareDialog()">接受分享</el-button>
                                <el-button v-if="!isExamView" type="primary" icon="Plus"
                                    @click.stop="openMajorCategoryDialog()">添加{{ majorLabel }}</el-button>
                                <el-button v-else-if="!selectedMajorCategory?.readOnly" type="primary" icon="Plus"
                                    @click.stop="openCategoryDialog()">添加{{ categoryLabel }}</el-button>
                            </div>
                        </div>

                        <!-- 科目列表视图 -->
                        <div v-if="!isExamView" class="category-cards-grid" v-loading="viewLoading.majorCategories || viewLoading.categories">
                            <div class="category-card" v-for="cat in visibleMajorCategories" :key="cat._id"
                                :class="{ 'is-hidden': cat.showOnHome === false, 'is-assigned': cat.readOnly }"
                                @click="switchToExamView(cat)">
                                <div class="category-card-top">
                                    <div class="category-card-icon" aria-hidden="true">
                                        <el-icon>
                                            <Folder />
                                        </el-icon>
                                    </div>
                                    <span v-if="cat.readOnly" class="category-status-pill is-assigned">
                                        <span>管理员分配</span>
                                    </span>
                                    <span v-else class="category-status-pill"
                                        :class="cat.showOnHome !== false ? 'is-visible' : 'is-hidden'">
                                        <span>{{ cat.showOnHome !== false ? '显示中' : '已隐藏' }}</span>
                                    </span>
                                </div>

                                <div class="category-card-main">
                                    <div class="category-card-title">{{ cat.name }}</div>
                                    <div class="category-card-meta">
                                        <div class="category-meta-item">
                                            <span class="category-meta-label">试卷</span>
                                            <strong>{{ getMajorCategoryStats(cat).examCount }}</strong>
                                        </div>
                                        <div class="category-meta-item">
                                            <span class="category-meta-label">题量</span>
                                            <strong>{{ getMajorCategoryStats(cat).questionCount }}</strong>
                                        </div>
                                    </div>
                                    <div class="category-card-note">
                                        {{ getMajorCategoryStats(cat).publishedCount }} 份已发布 · 排序 {{ cat.sortOrder || 0 }} · {{ cat.readOnly ? '来自管理员分配' : '点击进入管理试卷' }}
                                    </div>
                                </div>

                                <div class="category-card-actions">
                                    <el-button class="category-card-primary-action" size="small" type="primary" plain
                                        @click.stop="switchToExamView(cat)">
                                        <el-icon>
                                            <Files />
                                        </el-icon>
                                        <span>{{ cat.readOnly ? '查看试卷' : '管理试卷' }}</span>
                                    </el-button>
                                    <el-tooltip v-if="canEditMajorCategory(cat)" :content="cat.readOnly ? '调整排序与显示' : '编辑科目'" placement="top">
                                        <el-button class="category-icon-action" size="small" icon="Edit" circle
                                            :aria-label="cat.readOnly ? '调整科目显示' : '编辑科目'"
                                            @click.stop="openMajorCategoryDialog(cat)"></el-button>
                                    </el-tooltip>
                                    <el-tooltip v-if="!cat.readOnly" content="删除科目" placement="top">
                                        <el-button class="category-icon-action danger" size="small" type="danger"
                                            icon="Delete" circle text
                                            aria-label="删除科目"
                                            @click.stop="deleteMajorCategory(cat)"></el-button>
                                    </el-tooltip>
                                </div>
                            </div>

                            <!-- 空状态 -->
                            <div v-if="visibleMajorCategories.length === 0" class="empty-state">
                                <div class="empty-icon"><el-icon><Folder /></el-icon></div>
                                <div class="empty-text">{{ categorySearchKeyword ? '没有匹配的结果' : `暂无${majorLabel}` }}</div>
                                <el-button type="primary" @click.stop="openMajorCategoryDialog()">创建第一个{{ majorLabel }}</el-button>
                            </div>
                        </div>

                        <!-- 试卷列表视图 (嵌套在科目管理面板中) -->
                        <div v-else class="exam-cards-grid" v-loading="viewLoading.categories">
                            <div class="exam-card" v-for="exam in visibleFilteredCategories" :key="exam._id">
                                <div class="exam-card-header">
                                    <el-tag size="small" type="info">{{ selectedMajorCategory?.name }}</el-tag>
                                    <el-tag v-if="exam.shareAccess" size="small" :type="exam.shareAccess.permission === 'edit' ? 'success' : 'warning'">
                                        {{ exam.shareAccess.permission === 'edit' ? '分享可编辑' : '分享只读' }}
                                    </el-tag>
                                    <el-tag v-else-if="exam.readOnly" size="small" type="warning">管理员分配</el-tag>
                                    <el-tag v-else size="small" :type="exam.isPublished !== false ? 'success' : 'warning'">
                                        {{ exam.isPublished !== false ? '已发布' : '已隐藏' }}
                                    </el-tag>
                                    <button type="button" class="exam-analysis-tag" @click.stop="openCategoryAnalysis(exam)">
                                        <el-icon><TrendCharts /></el-icon>
                                        <span>分析</span>
                                    </button>
                                </div>
                                <div class="exam-card-title">{{ exam.name }}</div>
                                <div class="exam-card-desc">{{ exam.description || '暂无试卷说明' }}</div>
                                <div class="exam-card-count">
                                    <span class="count-number">{{ exam.count || 0 }}</span>
                                    <span class="count-label">道题目</span>
                                </div>
                                <div class="exam-card-meta-grid">
                                    <div>
                                        <span>时长</span>
                                        <strong>{{ exam.duration || 0 }} 分钟</strong>
                                    </div>
                                    <div>
                                        <span>及格</span>
                                        <strong>{{ exam.passingScore || 60 }} 分</strong>
                                    </div>
                                    <div>
                                        <span>更新</span>
                                        <strong>{{ formatDateShort(exam.updateTime || exam.createTime) }}</strong>
                                    </div>
                                </div>
                                <div class="exam-card-actions" :class="{ 'has-four-actions': hasFourExamActions(exam) }">
                                    <el-button size="small" type="primary"
                                        @click.stop="goToExamDetail(exam._id)">{{ exam.readOnly ? '查看题目' : '管理题目' }}</el-button>
                                    <el-button v-if="!exam.readOnly || exam.canMove" size="small" @click.stop="openCategoryDialog(exam)">
                                        {{ exam.canMove ? '移动' : '编辑' }}
                                    </el-button>
                                    <el-button v-if="!isDemoManage && !exam.readOnly" size="small" icon="Share" text
                                        @click.stop="openShareDialog(exam)">分享</el-button>
                                    <el-button v-if="!exam.readOnly || exam.canDelete" size="small" type="danger" text
                                        @click.stop="deleteCategory(exam)">删除</el-button>
                                </div>
                            </div>

                            <!-- 空状态 -->
                            <div v-if="visibleFilteredCategories.length === 0" class="empty-state">
                                <div class="empty-icon"><el-icon><Files /></el-icon></div>
                                <div class="empty-text">{{ categorySearchKeyword ? '没有匹配的试卷' : `该${majorLabel}下暂无${categoryLabel}` }}</div>
                                <el-button v-if="!selectedMajorCategory?.readOnly" type="primary" @click.stop="openCategoryDialog()">创建第一份{{ categoryLabel }}</el-button>
                                <el-button class="empty-back-button" @click.stop="backToSubjectList">返回{{ majorLabel }}列表</el-button>
                            </div>
                        </div>
                    </div>
                    <!-- Exam Results View (考试记录) -->
                    <div v-if="!isConsoleMode && activeMenu === 'exam-results'" class="exam-results-view">
                        <div class="content-toolbar admin-list-toolbar-shell">
                            <div class="list-metric-strip toolbar-metric-strip">
                                <div>
                                    <span>当前页平均分</span>
                                    <strong>{{ examResultsListStats.averageScore }}</strong>
                                </div>
                                <div>
                                    <span>通过率</span>
                                    <strong>{{ examResultsListStats.passRate }}%</strong>
                                </div>
                                <div>
                                    <span>需关注</span>
                                    <strong>{{ examResultsListStats.lowScoreCount }}</strong>
                                </div>
                            </div>
                            <div class="exam-results-toolbar">
                                <div class="exam-results-total">共 {{ examResults.total || 0 }} 条</div>
                                <el-select class="exam-filter-select" v-model="examResultsFilter.categoryId"
                                    placeholder="筛选试卷" clearable @change="loadExamResults(1)">
                                    <el-option v-for="c in categories" :key="c._id" :label="c.name"
                                        :value="c._id"></el-option>
                                </el-select>
                                <el-tag v-if="examResultsFilter.userId" class="exam-filter-tag" type="warning" closable
                                    @close="() => { examResultsFilter.userId = ''; loadExamResults(1); }">
                                    考生筛选中
                                </el-tag>
                                <el-button class="batch-danger-button" type="danger" icon="Delete"
                                    @click="openDeleteDialog" :disabled="selectedExamResults.length === 0">
                                    删除<span v-if="selectedExamResults.length > 0">({{ selectedExamResults.length }})</span>
                                </el-button>
                            </div>
                        </div>

                        <div v-if="selectedExamResults.length > 0" class="selection-strip">
                            <div class="selection-strip-info">
                                <el-icon><Check /></el-icon>
                                已选择 {{ selectedExamResults.length }} 条考试记录
                            </div>
                            <div class="selection-strip-actions">
                                <el-button text @click="clearExamResultSelection">取消选择</el-button>
                                <el-button type="danger" plain icon="Delete" @click="openDeleteDialog">批量删除</el-button>
                            </div>
                        </div>

                        <el-card shadow="never" class="table-card data-table-card exam-results-card">
                            <el-table ref="examResultsTable" key="exam-results-table" class="exam-results-table full-width-table"
                                :data="examResults.list" v-loading="viewLoading.examResults" empty-text="暂无考试记录"
                                @selection-change="handleExamResultSelection">
                                <el-table-column type="selection" width="64"></el-table-column>
                                <el-table-column prop="createTime" label="提交时间" min-width="190">
                                    <template #default="scope">
                                        <div class="exam-time-cell">
                                            <span class="exam-date">{{ new Date(scope.row.createTime).toLocaleDateString() }}</span>
                                            <span class="exam-time">{{ new Date(scope.row.createTime).toLocaleTimeString() }}</span>
                                        </div>
                                    </template>
                                </el-table-column>
                                <el-table-column prop="nickname" label="考生" min-width="150">
                                    <template #default="scope">
                                        <div class="exam-user-cell">
                                            <img class="exam-user-avatar cartoon-user-avatar" :src="getUserCartoonAvatar(scope.row)" alt="">
                                            <span class="exam-user-name">{{ scope.row.nickname || '未命名考生' }}</span>
                                        </div>
                                    </template>
                                </el-table-column>
                                <el-table-column prop="categoryId" label="试卷名称" min-width="220">
                                    <template #default="scope">
                                        <div class="exam-paper-cell">
                                            <span class="exam-paper-icon">
                                                <el-icon><Document /></el-icon>
                                            </span>
                                            <span class="exam-paper-name">
                                                {{ scope.row.categoryName || (scope.row.categoryId ? scope.row.categoryId.name : '未知试卷') }}
                                            </span>
                                        </div>
                                    </template>
                                </el-table-column>
                                <el-table-column label="成绩" min-width="104" align="center">
                                    <template #default="scope">
                                        <div class="score-badge" :class="getScoreToneClass(scope.row.score)">
                                            <span class="score-value">{{ scope.row.score }}</span>
                                            <span class="score-unit">分</span>
                                        </div>
                                    </template>
                                </el-table-column>
                                <el-table-column label="答题详情" min-width="148" align="center">
                                    <template #default="scope">
                                        <div class="accuracy-indicator">
                                            <div class="accuracy-text">{{ scope.row.correctCount }}/{{
                                                scope.row.totalCount }}</div>
                                            <div class="accuracy-track">
                                                <progress class="accuracy-progress" :value="getAccuracyPercentage(scope.row)" max="100"></progress>
                                            </div>
                                            <div class="accuracy-pct">{{ getAccuracyPercentage(scope.row) }}%</div>
                                        </div>
                                    </template>
                                </el-table-column>
                            </el-table>

                            <div v-if="examResults.total > 20" class="pagination-container">
                                <el-pagination background layout="prev, pager, next" :total="examResults.total"
                                    :page-size="20" @current-change="loadExamResults">
                                </el-pagination>
                            </div>
                        </el-card>
                    </div>

                    <!-- Users View (考生管理) -->
                    <div v-if="!isConsoleMode && activeMenu === 'users'" class="users-view">
                        <div class="content-toolbar admin-list-toolbar-shell">
                            <div class="list-metric-strip toolbar-metric-strip">
                                <div>
                                    <span>近7天活跃</span>
                                    <strong>{{ usersListStats.recentActiveCount }}</strong>
                                </div>
                                <div>
                                    <span>已分配</span>
                                    <strong>{{ usersListStats.assignedCount }}</strong>
                                </div>
                                <div>
                                    <span>当前页考试</span>
                                    <strong>{{ usersListStats.examCount }}</strong>
                                </div>
                            </div>
                            <div class="admin-list-toolbar users-toolbar">
                                <el-input class="table-search-input" v-model="userSearchKeyword" placeholder="搜索"
                                    clearable size="default"
                                    @input="handleUserSearchInput" @keyup.enter="searchUsers" @clear="searchUsers">
                                    <template #prefix><el-icon>
                                            <Search />
                                        </el-icon></template>
                                </el-input>
                                <el-button type="danger" icon="Delete" @click="openUserDeleteDialog"
                                    :disabled="selectedUsers.length === 0">
                                    删除<span v-if="selectedUsers.length > 0">({{ selectedUsers.length }})</span>
                                </el-button>
                            </div>
                        </div>

                        <div v-if="selectedUsers.length > 0" class="selection-strip">
                            <div class="selection-strip-info">
                                <el-icon><Check /></el-icon>
                                已选择 {{ selectedUsers.length }} 位考生
                            </div>
                            <div class="selection-strip-actions">
                                <el-button text @click="clearUserSelection">取消选择</el-button>
                                <el-button type="danger" plain icon="Delete" @click="openUserDeleteDialog">批量删除</el-button>
                            </div>
                        </div>

                        <el-card shadow="never" class="table-card data-table-card">
                            <el-table ref="usersTable" key="users-table" class="users-table full-width-table" :data="users.list" v-loading="viewLoading.users" empty-text="暂无考生"
                                @selection-change="handleUserSelection">
                                <el-table-column type="selection" width="55"></el-table-column>
                                <el-table-column prop="nickname" label="考生" min-width="150">
                                    <template #default="scope">
                                        <div class="exam-user-cell">
                                            <img class="exam-user-avatar cartoon-user-avatar" :src="getUserCartoonAvatar(scope.row)" alt="">
                                            <span class="exam-user-name">{{ scope.row.nickname || '未命名考生' }}</span>
                                        </div>
                                    </template>
                                </el-table-column>
                                <el-table-column label="学习ID" width="120">
                                    <template #default="scope">
                                        <el-tag size="small" effect="plain">
                                            {{ scope.row.studyId || formatStudyId(scope.row.openid) || '--' }}
                                        </el-tag>
                                    </template>
                                </el-table-column>
                                <el-table-column prop="createTime" label="首次进入" width="180">
                                    <template #default="scope">
                                        {{ new Date(scope.row.createTime).toLocaleString() }}
                                    </template>
                                </el-table-column>
                                <el-table-column prop="lastActiveTime" label="最后活跃" width="180">
                                    <template #default="scope">
                                        {{ new Date(scope.row.lastActiveTime).toLocaleString() }}
                                    </template>
                                </el-table-column>
                                <el-table-column prop="examCount" label="累计考试" width="100">
                                    <template #default="scope">
                                        <el-tag size="small">{{ scope.row.examCount }}次</el-tag>
                                    </template>
                                </el-table-column>
                                <el-table-column label="已分配" width="150">
                                    <template #default="scope">
                                        <div class="assignment-tags">
                                            <el-tag size="small" type="success">科目 {{ scope.row.assignedMajorCategoryCount || 0 }}</el-tag>
                                            <el-tag size="small" type="primary">试卷 {{ scope.row.assignedCategoryCount || 0 }}</el-tag>
                                        </div>
                                    </template>
                                </el-table-column>
                                <el-table-column label="操作" width="260" fixed="right">
                                    <template #default="scope">
                                        <div class="row-actions">
                                            <el-button size="small" text type="success"
                                                @click="openUserAssignmentDialog(scope.row)">分配题库</el-button>
                                            <el-button size="small" text type="primary"
                                                @click="openUserDetail(scope.row)">详情</el-button>
                                            <el-button size="small" text type="primary"
                                                @click="viewUserHistory(scope.row)">记录</el-button>
                                            <el-button size="small" text type="danger"
                                                @click="clearUserRecords(scope.row)">清空</el-button>
                                        </div>
                                    </template>
                                </el-table-column>
                            </el-table>

                            <div v-if="users.total > 20" class="pagination-container">
                                <el-pagination background layout="prev, pager, next" :total="users.total"
                                    :page-size="20" @current-change="loadUsers">
                                </el-pagination>
                            </div>
                        </el-card>
                    </div>

                    <!-- Learning Operations View -->
                    <div v-if="!isConsoleMode && activeMenu === 'learning-plans'" class="learning-ops-view">
                        <div class="content-toolbar admin-list-toolbar-shell learning-ops-toolbar">
                            <div class="list-metric-strip toolbar-metric-strip">
                                <div>
                                    <span>进行中计划</span>
                                    <strong>{{ learningOpsStats.activePlans }}</strong>
                                </div>
                                <div>
                                    <span>覆盖考生</span>
                                    <strong>{{ learningOpsStats.assignedUsers }}</strong>
                                </div>
                                <div>
                                    <span>逾期未完成</span>
                                    <strong>{{ learningOpsStats.overdueUsers }}</strong>
                                </div>
                            </div>
                            <div class="admin-list-toolbar">
                                <el-button icon="Refresh" :loading="viewLoading.learningPlans" @click="loadLearningOperations">刷新</el-button>
                                <el-button icon="UserFilled" @click="openCohortDialog()">新建班组</el-button>
                                <el-button type="primary" icon="Plus" @click="openLearningPlanDialog()">新建计划</el-button>
                            </div>
                        </div>

                        <el-card shadow="never" class="table-card data-table-card learning-ops-card">
                            <el-tabs v-model="learningOpsTab" class="learning-ops-tabs">
                                <el-tab-pane label="学习计划" name="plans">
                                    <el-table :data="learningPlans" v-loading="viewLoading.learningPlans" empty-text="暂无学习计划">
                                        <el-table-column prop="title" label="计划" min-width="190">
                                            <template #default="{ row }">
                                                <div class="learning-primary-cell">
                                                    <strong>{{ row.title }}</strong>
                                                    <span>{{ row.categoryIds?.length || 0 }} 份试卷 · 目标 {{ row.targetScore }} 分</span>
                                                </div>
                                            </template>
                                        </el-table-column>
                                        <el-table-column label="分配范围" min-width="180">
                                            <template #default="{ row }">
                                                <div class="learning-tag-list">
                                                    <el-tag v-for="cohort in row.cohortIds || []" :key="cohort._id" size="small" effect="plain">{{ cohort.name }}</el-tag>
                                                    <span v-if="!(row.cohortIds || []).length">单独分配</span>
                                                </div>
                                            </template>
                                        </el-table-column>
                                        <el-table-column label="进度" min-width="190">
                                            <template #default="{ row }">
                                                <div class="learning-progress-cell">
                                                    <el-progress :percentage="row.progress?.averageProgress || 0" :stroke-width="8" />
                                                    <span>{{ row.progress?.completedCount || 0 }}/{{ row.progress?.assignedCount || 0 }} 人完成</span>
                                                </div>
                                            </template>
                                        </el-table-column>
                                        <el-table-column label="截止时间" width="170">
                                            <template #default="{ row }">{{ formatLearningDeadline(row.dueAt) }}</template>
                                        </el-table-column>
                                        <el-table-column label="状态" width="120">
                                            <template #default="{ row }">
                                                <el-tag :type="learningPlanStateType(row)" effect="plain">{{ learningPlanStateText(row) }}</el-tag>
                                            </template>
                                        </el-table-column>
                                        <el-table-column label="操作" width="150" fixed="right">
                                            <template #default="{ row }">
                                                <div class="row-actions">
                                                    <el-button text type="primary" @click="openLearningPlanDialog(row)">编辑</el-button>
                                                    <el-button v-if="row.status === 'active'" text type="danger" @click="archiveLearningPlan(row)">归档</el-button>
                                                </div>
                                            </template>
                                        </el-table-column>
                                    </el-table>
                                </el-tab-pane>
                                <el-tab-pane label="班组" name="cohorts">
                                    <el-table :data="cohorts" v-loading="viewLoading.learningPlans" empty-text="暂无班组">
                                        <el-table-column prop="name" label="班组" min-width="180">
                                            <template #default="{ row }">
                                                <div class="learning-primary-cell">
                                                    <strong>{{ row.name }}</strong>
                                                    <span>{{ row.description || '暂无备注' }}</span>
                                                </div>
                                            </template>
                                        </el-table-column>
                                        <el-table-column prop="memberCount" label="成员" width="100">
                                            <template #default="{ row }">{{ row.memberCount || 0 }} 人</template>
                                        </el-table-column>
                                        <el-table-column label="成员预览" min-width="260">
                                            <template #default="{ row }">
                                                <div class="learning-tag-list">
                                                    <el-tag v-for="member in (row.members || []).slice(0, 4)" :key="member.openid" size="small" effect="plain">
                                                        {{ member.nickname || member.studyId }}
                                                    </el-tag>
                                                    <span v-if="(row.members || []).length > 4">+{{ row.members.length - 4 }}</span>
                                                </div>
                                            </template>
                                        </el-table-column>
                                        <el-table-column label="状态" width="100">
                                            <template #default="{ row }">
                                                <el-tag :type="row.status === 'active' ? 'success' : 'info'" effect="plain">{{ row.status === 'active' ? '使用中' : '已归档' }}</el-tag>
                                            </template>
                                        </el-table-column>
                                        <el-table-column label="操作" width="150" fixed="right">
                                            <template #default="{ row }">
                                                <div class="row-actions">
                                                    <el-button text type="primary" @click="openCohortDialog(row)">编辑</el-button>
                                                    <el-button v-if="row.status === 'active'" text type="danger" @click="archiveCohort(row)">归档</el-button>
                                                </div>
                                            </template>
                                        </el-table-column>
                                    </el-table>
                                </el-tab-pane>
                            </el-tabs>
                        </el-card>
                    </div>

                    <!-- Personal Categories View -->
                    <div v-if="!isConsoleMode && activeMenu === 'personal-categories'" class="personal-categories-view">
                        <div class="content-toolbar admin-list-toolbar-shell">
                            <div class="list-metric-strip toolbar-metric-strip">
                                <div>
                                    <span>已发布</span>
                                    <strong>{{ personalCategoryListStats.publishedCount }}</strong>
                                </div>
                                <div>
                                    <span>来自分享</span>
                                    <strong>{{ personalCategoryListStats.sharedCount }}</strong>
                                </div>
                                <div>
                                    <span>当前页题量</span>
                                    <strong>{{ personalCategoryListStats.questionCount }}</strong>
                                </div>
                            </div>
                            <div class="personal-category-toolbar">
                                <el-input class="table-search-input" v-model="personalCategoryFilter.keyword"
                                    placeholder="搜索题库/用户/学习ID" clearable @keyup.enter="loadPersonalCategories(1)"
                                    @clear="loadPersonalCategories(1)">
                                    <template #prefix><el-icon><Search /></el-icon></template>
                                </el-input>
                                <el-input class="personal-study-id-input" v-model="personalCategoryFilter.ownerStudyId"
                                    placeholder="学习ID" clearable @keyup.enter="loadPersonalCategories(1)"
                                    @clear="loadPersonalCategories(1)"></el-input>
                                <el-select class="personal-filter-select" v-model="personalCategoryFilter.publishStatus"
                                    placeholder="发布状态" @change="loadPersonalCategories(1)">
                                    <el-option label="全部状态" value="all"></el-option>
                                    <el-option label="已发布" value="published"></el-option>
                                    <el-option label="已隐藏" value="hidden"></el-option>
                                </el-select>
                                <el-select class="personal-filter-select" v-model="personalCategoryFilter.source"
                                    placeholder="来源" @change="loadPersonalCategories(1)">
                                    <el-option label="全部来源" value="all"></el-option>
                                    <el-option label="用户创建" value="owned"></el-option>
                                    <el-option label="来自分享" value="shared"></el-option>
                                </el-select>
                                <el-button icon="Refresh" @click="loadPersonalCategories(1)">刷新</el-button>
                            </div>
                        </div>

                        <el-card shadow="never" class="table-card data-table-card personal-category-card">
                            <el-table key="personal-category-table" class="personal-category-table full-width-table" :data="personalCategories.list"
                                v-loading="viewLoading.personalCategories" empty-text="暂无个人题库">
                                <el-table-column prop="name" label="题库" min-width="220" show-overflow-tooltip>
                                    <template #default="{ row }">
                                        <div class="personal-category-name">
                                            <span>{{ row.name || '未命名题库' }}</span>
                                            <el-tag size="small" :type="row.sourceType === 'shared' ? 'warning' : 'success'">
                                                {{ row.sourceLabel }}
                                            </el-tag>
                                        </div>
                                    </template>
                                </el-table-column>
                                <el-table-column label="创建者" min-width="220">
                                    <template #default="{ row }">
                                        <div class="personal-owner-cell">
                                            <img class="exam-user-avatar cartoon-user-avatar" :src="getUserCartoonAvatar(row.owner)" alt="">
                                            <div>
                                                <div>{{ row.owner?.nickname || '未命名用户' }}</div>
                                            </div>
                                        </div>
                                    </template>
                                </el-table-column>
                                <el-table-column label="学习ID" width="120">
                                    <template #default="{ row }">
                                        <el-tag size="small" effect="plain">
                                            {{ row.owner?.studyId || '--' }}
                                        </el-tag>
                                    </template>
                                </el-table-column>
                                <el-table-column label="分组" min-width="140" show-overflow-tooltip>
                                    <template #default="{ row }">{{ row.majorCategory?.name || '未分组' }}</template>
                                </el-table-column>
                                <el-table-column label="状态" width="100">
                                    <template #default="{ row }">
                                        <el-tag size="small" :type="row.isPublished !== false ? 'success' : 'info'">
                                            {{ row.isPublished !== false ? '已发布' : '已隐藏' }}
                                        </el-tag>
                                    </template>
                                </el-table-column>
                                <el-table-column label="题量" width="90" align="center">
                                    <template #default="{ row }">{{ row.count || 0 }}</template>
                                </el-table-column>
                                <el-table-column prop="updateTime" label="更新时间" width="180">
                                    <template #default="{ row }">{{ formatDateTime(row.updateTime) }}</template>
                                </el-table-column>
                                <el-table-column label="操作" width="120" fixed="right">
                                    <template #default="{ row }">
                                        <el-button size="small" text type="primary"
                                            @click="openPersonalCategoryDetail(row)">只读查看</el-button>
                                    </template>
                                </el-table-column>
                            </el-table>

                            <div v-if="personalCategories.total > personalCategories.limit" class="pagination-container">
                                <el-pagination background layout="prev, pager, next" :total="personalCategories.total"
                                    :page-size="personalCategories.limit" @current-change="loadPersonalCategories">
                                </el-pagination>
                            </div>
                        </el-card>
                    </div>

                    <QuestionQualityView
                        v-if="activeMenu === 'question-quality'"
                        :api="adminApi"
                        :console-mode="isConsoleMode"
                        :initial-scope-type="qualityRouteState.scopeType"
                        :initial-issue="qualityRouteState.issue"
                        :initial-page="qualityRouteState.page"
                        :initial-limit="qualityRouteState.limit"
                        @open-question="openQuestionQualityTarget"
                    />

                    <!-- Feedback View -->
                    <div v-if="activeMenu === 'feedbacks'" class="feedback-view">
                        <div class="content-toolbar admin-list-toolbar-shell">
                            <div class="list-metric-strip toolbar-metric-strip">
                                <div>
                                    <span>待回复</span>
                                    <strong>{{ feedbackListStats.openCount }}</strong>
                                </div>
                                <div>
                                    <span>已回复</span>
                                    <strong>{{ feedbackListStats.repliedCount }}</strong>
                                </div>
                                <div>
                                    <span>未读回复</span>
                                    <strong>{{ feedbackListStats.unreadReplyCount }}</strong>
                                </div>
                            </div>
                            <div class="feedback-toolbar">
                                <el-select class="feedback-filter-select" v-model="feedbackFilter.status"
                                    placeholder="状态" clearable @change="loadFeedbacks(1)">
                                    <el-option label="待回复" value="open"></el-option>
                                    <el-option label="已回复" value="replied"></el-option>
                                    <el-option label="已关闭" value="closed"></el-option>
                                </el-select>
                                <el-input v-if="!isConsoleMode" class="table-search-input"
                                    v-model="feedbackFilter.keyword" placeholder="搜索反馈/用户/学习ID"
                                    clearable @keyup.enter="loadFeedbacks(1)" @clear="loadFeedbacks(1)">
                                    <template #prefix><el-icon><Search /></el-icon></template>
                                </el-input>
                                <el-button v-if="isConsoleMode" type="primary" icon="Plus"
                                    @click="openFeedbackCreateDialog">提交反馈</el-button>
                                <el-button icon="Refresh" @click="loadFeedbacks(1)">刷新</el-button>
                            </div>
                        </div>

                        <el-card shadow="never" class="table-card data-table-card feedback-card">
                            <el-table key="feedback-table" class="feedback-table full-width-table" :data="feedbacks.list" v-loading="viewLoading.feedbacks"
                                empty-text="暂无反馈" @row-click="openFeedbackDetail">
                                <el-table-column prop="title" label="反馈内容" min-width="280">
                                    <template #default="{ row }">
                                        <div class="feedback-title-cell">
                                            <div class="feedback-title-line">
                                                <el-tag size="small" :type="getFeedbackStatusType(row.status)">
                                                    {{ formatFeedbackStatus(row.status) }}
                                                </el-tag>
                                                <el-tag v-if="isFeedbackReplyUnread(row)" size="small" type="danger">
                                                    新回复
                                                </el-tag>
                                                <span>{{ row.title }}</span>
                                            </div>
                                            <div class="feedback-summary">{{ row.content }}</div>
                                        </div>
                                    </template>
                                </el-table-column>
                                <el-table-column label="类型" width="110">
                                    <template #default="{ row }">{{ formatFeedbackCategory(row.category) }}</template>
                                </el-table-column>
                                <el-table-column v-if="!isConsoleMode" label="用户" min-width="160">
                                    <template #default="{ row }">
                                        <div class="feedback-user-cell">
                                            <img class="exam-user-avatar cartoon-user-avatar" :src="getUserCartoonAvatar(row.user || { studyId: row.ownerStudyId })" alt="">
                                            <div>
                                                <div>{{ row.user?.nickname || '未命名用户' }}</div>
                                                <div class="feedback-user-meta">学习ID {{ row.user?.studyId || row.ownerStudyId || '--' }}</div>
                                            </div>
                                        </div>
                                    </template>
                                </el-table-column>
                                <el-table-column label="更新时间" width="180">
                                    <template #default="{ row }">{{ formatDateTime(row.updateTime) }}</template>
                                </el-table-column>
                                <el-table-column label="操作" width="170" fixed="right">
                                    <template #default="{ row }">
                                        <div class="row-actions">
                                            <el-button size="small" text type="primary"
                                                @click.stop="openFeedbackDetail(row)">
                                                {{ isConsoleMode ? '查看' : '处理' }}
                                            </el-button>
                                            <el-button v-if="!isConsoleMode && row.status !== 'closed'" size="small"
                                                text type="warning" @click.stop="closeFeedback(row)">关闭</el-button>
                                        </div>
                                    </template>
                                </el-table-column>
                            </el-table>

                            <div v-if="feedbacks.total > feedbacks.limit" class="pagination-container">
                                <el-pagination background layout="prev, pager, next" :total="feedbacks.total"
                                    :page-size="feedbacks.limit" @current-change="loadFeedbacks">
                                </el-pagination>
                            </div>
                        </el-card>
                    </div>
            </main>
        </div>


        <!-- Major Category Dialog -->
        <el-dialog v-model="majorCategoryDialog.visible" :title="majorCategoryDialog.isAssignedEdit ? '调整分配分组' : (majorCategoryDialog.isEdit ? `编辑${majorLabel}` : `添加${majorLabel}`)"
            width="460px" destroy-on-close :close-on-click-modal="false" append-to-body class="admin-form-dialog">
            <div class="operation-dialog-intro">
                <div>
                    <span>{{ majorLabel }}配置</span>
                    <strong>{{ majorCategoryDialog.isEdit ? `维护${majorLabel}基础信息` : `创建新的${majorLabel}` }}</strong>
                    <small>{{ majorCategoryDialog.isAssignedEdit ? '该分组来自分配，仅支持调整展示偏好。' : `用于组织${categoryLabel}，会影响小程序目录结构。` }}</small>
                </div>
                <el-tag :type="majorCategoryForm.showOnHome ? 'success' : 'info'">
                    {{ majorCategoryForm.showOnHome ? '首页展示' : '首页隐藏' }}
                </el-tag>
            </div>
            <el-form :model="majorCategoryForm" label-width="100px" class="admin-dialog-form">
                <el-form-item :label="`${majorLabel}名称`">
                    <el-input v-model="majorCategoryForm.name" :disabled="majorCategoryDialog.isAssignedEdit"
                        :placeholder="`请输入${majorLabel}名称`"></el-input>
                </el-form-item>
                <el-form-item label="排序">
                    <el-input-number v-model="majorCategoryForm.sortOrder" :min="0"></el-input-number>
                </el-form-item>
                <el-form-item label="显示在首页">
                    <div class="switch-field">
                        <el-switch v-model="majorCategoryForm.showOnHome"></el-switch>
                        <span>{{ majorCategoryForm.showOnHome ? '显示在小程序首页' : '不在小程序首页显示' }}</span>
                    </div>
                    <div class="form-helper-text">
                        关闭后，该科目不会显示在小程序首页
                    </div>
                </el-form-item>
            </el-form>
            <template #footer>
                <span class="dialog-footer operation-footer">
                    <el-button @click.stop="majorCategoryDialog.visible = false">取消</el-button>
                    <el-button type="primary" @click.stop="saveMajorCategory">保存</el-button>
                </span>
            </template>
        </el-dialog>

        <!-- Exam Paper Dialog -->
        <el-dialog v-model="categoryDialog.visible" :title="categoryDialog.moveOnly ? '调整试卷分类' : (categoryDialog.isEdit ? '编辑试卷' : '添加试卷')" width="540px"
            destroy-on-close :close-on-click-modal="false" append-to-body class="exam-form-dialog">
            <div class="operation-dialog-intro">
                <div>
                    <span>{{ categoryLabel }}配置</span>
                    <strong>{{ categoryDialogModeText }}</strong>
                    <small>{{ categoryDialog.moveOnly ? '只调整所属科目，不会修改试卷内容和发布状态。' : '配置试卷入口信息，题目内容请进入题目管理维护。' }}</small>
                </div>
                <el-tag :type="categoryForm.isPublished ? 'success' : 'info'">
                    {{ categoryForm.isPublished ? '已发布' : '已隐藏' }}
                </el-tag>
            </div>
            <el-form :model="categoryForm" label-width="104px" class="admin-dialog-form">
                <el-form-item label="所属科目">
                    <el-select v-model="categoryForm.majorCategoryId" placeholder="请选择科目" class="full-width-control">
                        <el-option v-for="mc in majorCategories" :key="mc._id" :label="mc.name"
                            :value="mc._id" :disabled="mc.readOnly"></el-option>
                    </el-select>
                </el-form-item>
                <el-form-item v-if="!categoryDialog.moveOnly" label="试卷名称">
                    <el-input v-model="categoryForm.name" placeholder="请输入试卷名称"></el-input>
                </el-form-item>
                <el-form-item v-if="!categoryDialog.moveOnly" label="试卷说明">
                    <el-input
                        v-model="categoryForm.description"
                        type="textarea"
                        :rows="3"
                        maxlength="300"
                        show-word-limit
                        placeholder="请输入试卷说明（选填）"
                    ></el-input>
                </el-form-item>
                <el-form-item v-if="!categoryDialog.moveOnly" label="考试时长(分)">
                    <el-input-number v-model="categoryForm.duration" :min="0" placeholder="0为不限制"></el-input-number>
                </el-form-item>
                <el-form-item v-if="!categoryDialog.moveOnly" label="及格分数">
                    <el-input-number v-model="categoryForm.passingScore" :min="0" :max="100"></el-input-number>
                </el-form-item>
                <el-form-item v-if="!categoryDialog.moveOnly" label="发布状态">
                    <div class="switch-field">
                        <el-switch v-model="categoryForm.isPublished"></el-switch>
                        <span>{{ categoryForm.isPublished ? '已发布到小程序目录' : '已隐藏，不在目录中展示' }}</span>
                    </div>
                    <div class="form-helper-text">
                        隐藏后，试卷仍保留在管理后台，但不会出现在小程序公开目录中。
                    </div>
                </el-form-item>
            </el-form>
            <template #footer>
                <span class="dialog-footer operation-footer">
                    <el-button @click.stop="categoryDialog.visible = false">取消</el-button>
                    <el-button type="primary" @click.stop="saveCategory">{{ categoryDialog.moveOnly ? '保存分类' : '保存' }}</el-button>
                </span>
            </template>
        </el-dialog>

        <!-- Paper Share Dialog -->
        <el-dialog v-model="shareDialog.visible" title="分享试卷" width="860px" destroy-on-close
            :close-on-click-modal="false" append-to-body align-center class="paper-share-modal"
            modal-class="paper-share-overlay">
            <div class="paper-share-dialog" v-loading="shareDialog.loading">
                <div class="share-flow-steps">
                    <div class="share-flow-step is-active">
                        <span>1</span>
                        <strong>配置规则</strong>
                    </div>
                    <div class="share-flow-step" :class="{ 'is-active': shareDialog.result }">
                        <span>2</span>
                        <strong>生成分享码</strong>
                    </div>
                    <div class="share-flow-step" :class="{ 'is-active': shareDialog.result }">
                        <span>3</span>
                        <strong>复制给对方</strong>
                    </div>
                </div>
                <div class="share-paper-summary">
                    <div>
                        <div class="share-paper-label">当前试卷</div>
                        <div class="share-paper-title">{{ shareDialog.category?.name }}</div>
                        <div class="share-paper-meta">
                            {{ shareDialog.category?.duration ? `${shareDialog.category.duration} 分钟` : '不限时' }} ·
                            {{ shareDialog.category?.passingScore || 60 }} 分及格
                        </div>
                    </div>
                    <el-tag type="info">{{ shareDialog.category?.count || 0 }} 道题目</el-tag>
                </div>

                <el-form :model="shareDialog.form" label-width="96px" class="paper-share-form">
                    <el-form-item label="接收权限">
                        <el-radio-group v-model="shareDialog.form.permission">
                            <el-radio-button value="view">只读副本</el-radio-button>
                            <el-radio-button value="edit">可编辑副本</el-radio-button>
                        </el-radio-group>
                    </el-form-item>
                    <el-form-item label="有效期">
                        <el-radio-group v-model="shareDialog.form.expireMode">
                            <el-radio-button value="1d">1天</el-radio-button>
                            <el-radio-button value="7d">7天</el-radio-button>
                            <el-radio-button value="30d">30天</el-radio-button>
                            <el-radio-button value="forever">永久</el-radio-button>
                            <el-radio-button value="custom">自定义</el-radio-button>
                        </el-radio-group>
                    </el-form-item>
                    <el-form-item v-if="shareDialog.form.expireMode === 'custom'" label="过期时间">
                        <el-date-picker v-model="shareDialog.form.customExpiresAt" type="datetime"
                            value-format="YYYY-MM-DDTHH:mm:ss.SSSZ" placeholder="请选择过期时间"
                            class="full-width-control"></el-date-picker>
                    </el-form-item>
                    <el-form-item label="接收次数">
                        <div class="share-limit-row">
                            <el-switch v-model="shareDialog.form.maxAcceptEnabled"></el-switch>
                            <span class="switch-inline-label">{{ shareDialog.form.maxAcceptEnabled ? '限制接收次数' : '不限次数' }}</span>
                            <el-input-number v-if="shareDialog.form.maxAcceptEnabled"
                                v-model="shareDialog.form.maxAcceptCount" :min="1" :max="10000"></el-input-number>
                        </div>
                    </el-form-item>
                    <el-form-item label="备注">
                        <el-input v-model="shareDialog.form.note" maxlength="200" show-word-limit
                            placeholder="可选，方便你区分这次分享"></el-input>
                    </el-form-item>
                </el-form>

                <div class="share-rule-strip">
                    <div>
                        <span>权限</span>
                        <strong>{{ sharePermissionPreview }}</strong>
                    </div>
                    <div>
                        <span>有效期</span>
                        <strong>{{ shareExpirePreview }}</strong>
                    </div>
                    <div>
                        <span>接收次数</span>
                        <strong>{{ shareAcceptLimitPreview }}</strong>
                    </div>
                </div>

                <div class="share-generate-row">
                    <el-button type="primary" icon="Share" :loading="shareDialog.saving"
                        @click="createPaperShare">生成分享码</el-button>
                </div>

                <div v-if="shareDialog.result" class="share-result-panel">
                    <div class="share-result-main">
                        <div class="share-code">{{ shareDialog.result.shareCodeText || formatShareCode(shareDialog.result.shareCode) }}</div>
                        <div class="share-meta">
                            {{ formatSharePermission(shareDialog.result.permission) }} · {{ formatDateTime(shareDialog.result.expiresAt) }}
                        </div>
                        <div class="share-result-actions">
                            <el-button size="small" @click="copyText(shareDialog.result.shareCodeText || shareDialog.result.shareCode, '分享码已复制')">复制分享码</el-button>
                            <el-button size="small" @click="copyText(shareDialog.result.shareUrl, '分享链接已复制')">复制链接</el-button>
                        </div>
                    </div>
                    <div id="paper-share-qrcode" class="share-qrcode"></div>
                </div>

                <el-divider content-position="left">分享记录</el-divider>
                <el-table class="share-record-table" :data="shareDialog.shares" size="small" max-height="260" empty-text="暂无分享记录"
                    :row-class-name="getPaperShareRowClass" @row-click="selectPaperShare">
                    <el-table-column label="分享码" width="120">
                        <template #default="{ row }">
                            <button type="button" class="share-table-code"
                                @click.stop="selectPaperShare(row)">
                                {{ row.shareCodeText || formatShareCode(row.shareCode) }}
                            </button>
                        </template>
                    </el-table-column>
                    <el-table-column label="权限" width="110">
                        <template #default="{ row }">{{ formatSharePermission(row.permission) }}</template>
                    </el-table-column>
                    <el-table-column label="有效期" min-width="170">
                        <template #default="{ row }">{{ formatDateTime(row.expiresAt) }}</template>
                    </el-table-column>
                    <el-table-column label="状态" width="95">
                        <template #default="{ row }">
                            <el-tag size="small" :type="getShareStateType(row)">{{ formatShareState(row) }}</el-tag>
                        </template>
                    </el-table-column>
                    <el-table-column label="接收" width="80">
                        <template #default="{ row }">
                            {{ row.acceptedCount || 0 }}<span v-if="row.maxAcceptCount">/{{ row.maxAcceptCount }}</span>
                        </template>
                    </el-table-column>
                    <el-table-column label="操作" width="176" class-name="share-actions-cell">
                        <template #default="{ row }">
                            <div class="share-row-actions">
                                <el-button class="share-row-action" size="small" text @click.stop="selectPaperShare(row)">查看</el-button>
                                <el-button class="share-row-action" size="small" text @click.stop="copyText(row.shareCodeText || row.shareCode, '分享码已复制')">复制</el-button>
                                <el-button v-if="row.state === 'active'" class="share-row-action is-danger" size="small" text type="danger"
                                    @click.stop="revokePaperShare(row)">撤销</el-button>
                            </div>
                        </template>
                    </el-table-column>
                </el-table>
            </div>
            <template #footer>
                <span class="dialog-footer operation-footer">
                    <el-button @click="shareDialog.visible = false">关闭</el-button>
                </span>
            </template>
        </el-dialog>

        <!-- Category Analysis Dialog -->
        <el-dialog v-model="analysisDialog.visible" :title="`${analysisDialog.category?.name || '试卷'} · 数据分析`"
            width="960px" destroy-on-close :close-on-click-modal="false" append-to-body class="analysis-dialog">
            <div class="category-analysis-dialog" v-loading="analysisDialog.loading">
                <div class="analysis-hero">
                    <div>
                        <span>试卷质量分析</span>
                        <strong>{{ analysisDialog.category?.name || '未命名试卷' }}</strong>
                        <small>{{ analysisDialogSummary }}</small>
                    </div>
                    <el-tag type="info">{{ analysisDialog.category?.count || 0 }} 道题目</el-tag>
                </div>
                <div class="analysis-stat-grid">
                    <div class="analysis-stat-card is-primary">
                        <span class="analysis-stat-value">{{ analysisDialog.data?.summary?.totalAttempts || 0 }}</span>
                        <span class="analysis-stat-label">提交次数</span>
                    </div>
                    <div class="analysis-stat-card is-success">
                        <span class="analysis-stat-value">{{ analysisDialog.data?.summary?.averageScore || 0 }}</span>
                        <span class="analysis-stat-label">平均分</span>
                    </div>
                    <div class="analysis-stat-card is-warning">
                        <span class="analysis-stat-value">{{ analysisDialog.data?.summary?.passRate || 0 }}%</span>
                        <span class="analysis-stat-label">通过率</span>
                    </div>
                    <div class="analysis-stat-card is-violet">
                        <span class="analysis-stat-value">{{ analysisDialog.data?.summary?.averageAccuracy || 0 }}%</span>
                        <span class="analysis-stat-label">平均正确率</span>
                    </div>
                </div>

                <div class="analysis-section">
                    <div class="analysis-section-title">近两周趋势</div>
                    <div class="analysis-bars">
                        <div class="analysis-bar-item" v-for="item in analysisTrendItems" :key="item.date">
                            <div class="analysis-bar-track">
                                <span class="analysis-bar-fill" :class="item.heightClass"></span>
                            </div>
                            <div class="analysis-bar-date">{{ item.date }}</div>
                            <div class="analysis-bar-score">{{ item.averageScore || '-' }}</div>
                        </div>
                    </div>
                </div>

                <div class="analysis-grid">
                    <div class="analysis-section">
                        <div class="analysis-section-title">题型正确率</div>
                        <el-table :data="analysisDialog.data?.typeStats || []" size="small" max-height="260" empty-text="暂无题型数据">
                            <el-table-column prop="typeName" label="题型" width="90"></el-table-column>
                            <el-table-column label="正确率" width="100">
                                <template #default="{ row }">{{ row.accuracy }}%</template>
                            </el-table-column>
                            <el-table-column label="错题" width="80">
                                <template #default="{ row }">{{ row.wrong }}</template>
                            </el-table-column>
                            <el-table-column label="总计">
                                <template #default="{ row }">{{ row.total }}</template>
                            </el-table-column>
                        </el-table>
                    </div>
                    <div class="analysis-section">
                        <div class="analysis-section-title">高频错题</div>
                        <el-table :data="analysisDialog.data?.weakQuestions || []" size="small" max-height="260" empty-text="暂无错题数据">
                            <el-table-column label="题目" min-width="220" show-overflow-tooltip>
                                <template #default="{ row }">{{ row.content || '未命名题目' }}</template>
                            </el-table-column>
                            <el-table-column prop="typeName" label="题型" width="80"></el-table-column>
                            <el-table-column label="错误率" width="90">
                                <template #default="{ row }">{{ row.wrongRate }}%</template>
                            </el-table-column>
                            <el-table-column label="错次" width="72">
                                <template #default="{ row }">{{ row.wrong }}</template>
                            </el-table-column>
                        </el-table>
                    </div>
                </div>
            </div>
            <template #footer>
                <span class="dialog-footer operation-footer">
                    <el-button @click="analysisDialog.visible = false">关闭</el-button>
                </span>
            </template>
        </el-dialog>

        <!-- Accept Paper Share Dialog -->
        <el-dialog v-model="acceptShareDialog.visible" title="接受分享" width="520px" destroy-on-close
            :close-on-click-modal="false" append-to-body class="accept-share-modal">
            <div class="accept-share-dialog" v-loading="acceptShareDialog.loading">
                <div class="operation-dialog-intro">
                    <div>
                        <span>分享导入</span>
                        <strong>识别分享码并保存到个人题库</strong>
                        <small>接收后会生成独立副本，不会影响原试卷。</small>
                    </div>
                </div>

                <div class="accept-code-entry">
                    <el-input v-model="acceptShareDialog.shareCode" placeholder="请输入分享码"
                        @keyup.enter="previewPaperShare">
                        <template #append>
                            <el-button @click="previewPaperShare">识别</el-button>
                        </template>
                    </el-input>
                </div>

                <div v-if="acceptShareDialog.preview" class="accept-preview-panel">
                    <div class="accept-preview-head">
                        <div>
                            <div class="accept-preview-title">{{ acceptShareDialog.sourceCategory?.name || '未命名试卷' }}</div>
                            <div class="accept-preview-meta">
                                {{ acceptShareDialog.sourceCategory?.count || 0 }} 道题目 · {{ formatSharePermission(acceptShareDialog.preview.permission) }}
                            </div>
                        </div>
                        <el-tag :type="acceptShareDialog.alreadyAccepted ? 'info' : 'success'">
                            {{ acceptShareDialog.alreadyAccepted ? '已接收' : '可接收' }}
                        </el-tag>
                    </div>
                    <div class="accept-preview-grid">
                        <div>
                            <span>有效期</span>
                            <strong>{{ formatDateTime(acceptShareDialog.preview.expiresAt) }}</strong>
                        </div>
                        <div>
                            <span>保存位置</span>
                            <strong>{{ acceptShareSaveLocation }}</strong>
                        </div>
                    </div>
                    <el-alert v-if="acceptShareDialog.alreadyAccepted" type="info" show-icon :closable="false"
                        title="你已经接收过这份分享，再次确认会定位到已有副本。"></el-alert>
                    <el-alert v-else type="success" show-icon :closable="false"
                        title="接收后会自动放入“来自分享”分组，你也可以在试卷列表里移动到其他分组。"></el-alert>
                </div>
            </div>
            <template #footer>
                <span class="dialog-footer operation-footer">
                    <el-button @click="acceptShareDialog.visible = false">取消</el-button>
                    <el-button @click="previewPaperShare">识别分享码</el-button>
                    <el-button type="primary" :loading="acceptShareDialog.accepting"
                        :disabled="!acceptShareDialog.preview" @click="acceptPaperShare">接受分享</el-button>
                </span>
            </template>
        </el-dialog>

        <!-- Wechat Bind Dialog -->
        <el-dialog v-if="hasAdminSecurityActions" v-model="bindDialog.visible" title="绑定微信" width="360px" :close-on-click-modal="false" append-to-body
            @close="stopBindRequests">
            <div class="bind-dialog-content">
                <div id="bind-qrcode"></div>

                <div class="bind-status-text">
                    {{ bindDialog.statusText }}
                </div>
            </div>
        </el-dialog>

        <!-- Create Feedback Dialog -->
        <el-dialog v-model="feedbackCreateDialog.visible" title="提交问题反馈" width="560px" destroy-on-close
            :close-on-click-modal="false" append-to-body>
            <el-form :model="feedbackCreateForm" label-width="84px">
                <el-form-item label="问题类型">
                    <el-select v-model="feedbackCreateForm.category" class="full-width-control">
                        <el-option label="功能异常" value="bug"></el-option>
                        <el-option label="功能建议" value="feature"></el-option>
                        <el-option label="题库内容" value="content"></el-option>
                        <el-option label="账号问题" value="account"></el-option>
                        <el-option label="其他" value="other"></el-option>
                    </el-select>
                </el-form-item>
                <el-form-item label="标题">
                    <el-input v-model="feedbackCreateForm.title" maxlength="100" show-word-limit
                        placeholder="请简要描述遇到的问题"></el-input>
                </el-form-item>
                <el-form-item label="详细说明">
                    <el-input v-model="feedbackCreateForm.content" type="textarea" :rows="7"
                        maxlength="2000" show-word-limit
                        placeholder="请说明操作步骤、期望结果和实际情况，方便管理员定位。"></el-input>
                </el-form-item>
                <el-form-item label="联系方式">
                    <el-input v-model="feedbackCreateForm.contact" maxlength="120"
                        placeholder="选填，微信/手机号/邮箱均可"></el-input>
                </el-form-item>
            </el-form>
            <template #footer>
                <span class="dialog-footer">
                    <el-button @click="feedbackCreateDialog.visible = false">取消</el-button>
                    <el-button type="primary" :loading="feedbackCreateDialog.saving"
                        @click="submitFeedback">提交反馈</el-button>
                </span>
            </template>
        </el-dialog>

        <!-- Feedback Detail Dialog -->
        <el-dialog v-model="feedbackDetailDialog.visible" :title="isConsoleMode ? '反馈详情' : '处理反馈'"
            width="740px" destroy-on-close :close-on-click-modal="false" append-to-body class="feedback-detail-dialog">
            <div v-if="feedbackDetailDialog.item" class="feedback-detail">
                <div class="feedback-detail-head">
                    <div>
                        <div class="feedback-detail-title">{{ feedbackDetailDialog.item.title }}</div>
                        <div class="feedback-detail-meta">
                            {{ formatFeedbackCategory(feedbackDetailDialog.item.category) }} ·
                            {{ formatDateTime(feedbackDetailDialog.item.createTime) }}
                        </div>
                    </div>
                    <el-tag :type="getFeedbackStatusType(feedbackDetailDialog.item.status)">
                        {{ formatFeedbackStatus(feedbackDetailDialog.item.status) }}
                    </el-tag>
                </div>

                <div v-if="!isConsoleMode" class="feedback-user-panel">
                    <div class="feedback-user-cell">
                        <img class="exam-user-avatar cartoon-user-avatar" :src="getUserCartoonAvatar(feedbackDetailDialog.item.user || { studyId: feedbackDetailDialog.item.ownerStudyId })" alt="">
                        <div>
                            <div>{{ feedbackDetailDialog.item.user?.nickname || '未命名用户' }}</div>
                            <div class="feedback-user-meta">学习ID {{ feedbackDetailDialog.item.user?.studyId || feedbackDetailDialog.item.ownerStudyId || '--' }}</div>
                        </div>
                    </div>
                    <div v-if="feedbackDetailDialog.item.contact" class="feedback-contact">
                        联系方式：{{ feedbackDetailDialog.item.contact }}
                    </div>
                </div>

                <div class="feedback-message-block">
                    <div class="feedback-message-label">反馈内容</div>
                    <div class="feedback-message-content">{{ feedbackDetailDialog.item.content }}</div>
                </div>

                <div v-if="feedbackDetailDialog.item.replyContent" class="feedback-message-block is-reply">
                    <div class="feedback-message-label">
                        管理员回复
                        <span v-if="feedbackDetailDialog.item.repliedAt">
                            · {{ formatDateTime(feedbackDetailDialog.item.repliedAt) }}
                        </span>
                    </div>
                    <div class="feedback-message-content">{{ feedbackDetailDialog.item.replyContent }}</div>
                </div>

                <div v-if="!isConsoleMode" class="feedback-reply-box">
                    <div class="feedback-message-label">回复用户</div>
                    <el-input v-model="feedbackReplyForm.replyContent" type="textarea" :rows="6"
                        maxlength="2000" show-word-limit
                        placeholder="请输入回复内容，用户会在个人题库后台看到。"></el-input>
                    <el-checkbox v-model="feedbackReplyForm.closeAfterReply">回复后关闭该反馈</el-checkbox>
                </div>
            </div>
            <template #footer>
                <span class="dialog-footer operation-footer">
                    <el-button @click="feedbackDetailDialog.visible = false">关闭</el-button>
                    <el-button v-if="!isConsoleMode && feedbackDetailDialog.item?.status !== 'closed'"
                        @click="closeFeedback(feedbackDetailDialog.item)">仅关闭</el-button>
                    <el-button v-if="!isConsoleMode" type="primary" :loading="feedbackDetailDialog.saving"
                        @click="replyFeedback">保存回复</el-button>
                </span>
            </template>
        </el-dialog>

        <!-- Batch Delete Confirm Dialog -->
        <el-dialog v-model="deleteDialog.visible" title="确认删除" width="420px" :close-on-click-modal="false"
            append-to-body class="danger-confirm-dialog">
            <div class="danger-confirm">
                <div class="danger-confirm-icon">
                    <el-icon><Warning /></el-icon>
                </div>
                <div class="danger-confirm-title">删除 {{ selectedExamResults.length }} 条考试记录</div>
                <div class="danger-confirm-desc">删除后将无法恢复，相关成绩流水不会再出现在统计和用户详情中。</div>

                <div class="math-challenge">
                    <span>请完成验证</span>
                    <strong>{{ deleteDialog.mathQuestion }}</strong>
                    <el-input v-model="deleteDialog.userInput" placeholder="请输入计算结果" size="large"
                        @keyup.enter="confirmBatchDelete">
                    </el-input>
                </div>
            </div>
            <template #footer>
                <span class="dialog-footer operation-footer">
                    <el-button @click="deleteDialog.visible = false">取消</el-button>
                    <el-button type="danger" @click="confirmBatchDelete" :loading="loading">确认删除</el-button>
                </span>
            </template>
        </el-dialog>

        <!-- User Detail Dialog -->
        <el-dialog v-model="userDetailDialog.visible" title="考生详情" width="760px" :close-on-click-modal="false"
            append-to-body class="user-detail-dialog">
            <div v-loading="userDetailDialog.loading" class="user-detail-dialog-body">
                <template v-if="userDetailDialog.user">
                    <div class="user-detail-hero">
                        <img class="detail-cartoon-avatar" :src="getUserCartoonAvatar(userDetailDialog.user)" alt="">
                        <div class="user-detail-hero-main">
                            <div class="user-detail-name">{{ userDetailDialog.user.nickname || '未命名考生' }}</div>
                            <div class="user-detail-meta-row">
                                <el-tag effect="plain">学习ID {{ userDetailDialog.user.studyId || formatStudyId(userDetailDialog.user.openid) }}</el-tag>
                                <span>最近活跃 {{ formatUserLastActiveTime(userDetailDialog.user.lastActiveTime) }}</span>
                            </div>
                        </div>
                    </div>

                    <div class="user-detail-stat-grid">
                        <div class="user-detail-stat-card">
                            <span>总考试次数</span>
                            <strong>{{ userDetailDialog.stats?.totalExams || 0 }}</strong>
                        </div>
                        <div class="user-detail-stat-card is-success">
                            <span>平均分</span>
                            <strong>{{ userDetailDialog.stats?.avgScore || 0 }}</strong>
                        </div>
                        <div class="user-detail-stat-card is-warning">
                            <span>最高分</span>
                            <strong>{{ userDetailDialog.stats?.highestScore || 0 }}</strong>
                        </div>
                        <div class="user-detail-stat-card is-primary">
                            <span>及格率</span>
                            <strong>{{ userDetailDialog.stats?.passRate || 0 }}%</strong>
                        </div>
                    </div>

                    <div v-if="userDetailDialog.trendData?.labels?.length > 0" class="user-detail-section">
                        <div class="dialog-section-title">成绩趋势（最近7次）</div>
                        <MiniLineChart
                            :labels="userTrendChartData.labels"
                            :values="userTrendChartData.values"
                            unit="分"
                            :height="200"
                        />
                    </div>

                    <div v-if="userDetailDialog.history?.length > 0" class="user-detail-section">
                        <div class="dialog-section-title">考试记录</div>
                        <el-table key="user-history-table" :data="userDetailDialog.history.slice(0, 10)" size="small"
                            max-height="300">
                            <el-table-column prop="categoryName" label="试卷" min-width="120"></el-table-column>
                            <el-table-column label="成绩" width="80">
                                <template #default="scope">
                                    <span class="detail-score-text" :class="getScoreToneClass(scope.row.score)">
                                        {{ scope.row.score }}
                                    </span>
                                </template>
                            </el-table-column>
                            <el-table-column label="正确率" width="80">
                                <template #default="scope">
                                    {{ scope.row.correctCount }}/{{ scope.row.totalCount }}
                                </template>
                            </el-table-column>
                            <el-table-column label="时间" width="150">
                                <template #default="scope">
                                    {{ new Date(scope.row.createTime).toLocaleString() }}
                                </template>
                            </el-table-column>
                        </el-table>
                    </div>
                    <el-empty v-else description="暂无考试记录"></el-empty>
                </template>
            </div>
            <template #footer>
                <span class="dialog-footer operation-footer">
                    <el-button @click="userDetailDialog.visible = false">关闭</el-button>
                    <el-button type="primary" :disabled="!userDetailDialog.user"
                        @click="viewUserHistory(userDetailDialog.user)">查看完整记录</el-button>
                </span>
            </template>
        </el-dialog>

        <!-- Personal Category Detail Dialog -->
        <el-dialog v-model="personalCategoryDialog.visible" title="个人题库只读查看" width="980px"
            :close-on-click-modal="false" append-to-body top="5vh">
            <div v-loading="personalCategoryDialog.loading" class="personal-category-dialog">
                <template v-if="personalCategoryDialog.category">
                    <div class="personal-category-summary">
                        <div>
                            <div class="personal-category-detail-title">
                                {{ personalCategoryDialog.category.name || '未命名题库' }}
                            </div>
                            <div class="personal-category-detail-meta">
                                {{ personalCategoryDialog.category.owner?.nickname || '未命名用户' }}
                                · 学习ID {{ personalCategoryDialog.category.owner?.studyId || '--' }}
                            </div>
                        </div>
                        <div class="personal-category-summary-tags">
                            <el-tag :type="personalCategoryDialog.category.isPublished !== false ? 'success' : 'info'">
                                {{ personalCategoryDialog.category.isPublished !== false ? '已发布' : '已隐藏' }}
                            </el-tag>
                            <el-tag :type="personalCategoryDialog.category.sourceType === 'shared' ? 'warning' : 'success'">
                                {{ personalCategoryDialog.category.sourceLabel }}
                            </el-tag>
                            <el-tag type="info">只读</el-tag>
                        </div>
                    </div>

                    <el-descriptions :column="3" border class="personal-category-descriptions">
                        <el-descriptions-item label="题目数">
                            {{ personalCategoryDialog.stats?.questionCount || personalCategoryDialog.category.count || 0 }}
                        </el-descriptions-item>
                        <el-descriptions-item label="练习记录">
                            {{ personalCategoryDialog.stats?.practiceCount || 0 }}
                        </el-descriptions-item>
                        <el-descriptions-item label="分组">
                            {{ personalCategoryDialog.category.majorCategory?.name || '未分组' }}
                        </el-descriptions-item>
                        <el-descriptions-item label="创建时间">
                            {{ formatDateTime(personalCategoryDialog.category.createTime) }}
                        </el-descriptions-item>
                        <el-descriptions-item label="更新时间">
                            {{ formatDateTime(personalCategoryDialog.category.updateTime) }}
                        </el-descriptions-item>
                        <el-descriptions-item label="权限边界">
                            只读查看
                        </el-descriptions-item>
                    </el-descriptions>

                    <div class="personal-question-head">
                        <div class="personal-question-title">题目预览</div>
                        <div class="personal-question-total">共 {{ personalCategoryDialog.questionsTotal || 0 }} 道</div>
                    </div>
                    <el-table key="personal-question-table" class="full-width-table" :data="personalCategoryDialog.questions"
                        v-loading="personalCategoryDialog.questionsLoading" size="small" max-height="420"
                        empty-text="暂无题目">
                        <el-table-column label="#" width="70" align="center">
                            <template #default="{ $index }">
                                {{ (personalCategoryDialog.questionsPage - 1) * personalCategoryDialog.questionsLimit + $index + 1 }}
                            </template>
                        </el-table-column>
                        <el-table-column label="题型" width="90">
                            <template #default="{ row }">{{ formatQuestionType(row.type) }}</template>
                        </el-table-column>
                        <el-table-column prop="content" label="题目内容" min-width="260" show-overflow-tooltip></el-table-column>
                        <el-table-column label="答案" min-width="150" show-overflow-tooltip>
                            <template #default="{ row }">{{ formatQuestionAnswer(row.answer) }}</template>
                        </el-table-column>
                        <el-table-column prop="analysis" label="解析" min-width="220" show-overflow-tooltip>
                            <template #default="{ row }">{{ row.analysis || '暂无解析' }}</template>
                        </el-table-column>
                    </el-table>

                    <div v-if="personalCategoryDialog.questionsTotal > personalCategoryDialog.questionsLimit"
                        class="pagination-container">
                        <el-pagination background layout="prev, pager, next"
                            :total="personalCategoryDialog.questionsTotal"
                            :page-size="personalCategoryDialog.questionsLimit"
                            :current-page="personalCategoryDialog.questionsPage"
                            @current-change="loadPersonalCategoryQuestions">
                        </el-pagination>
                    </div>
                </template>
            </div>
            <template #footer>
                <span class="dialog-footer">
                    <el-button @click="personalCategoryDialog.visible = false">关闭</el-button>
                </span>
            </template>
        </el-dialog>

        <el-dialog v-model="userAssignmentDialog.visible" title="分配科目与试卷" width="820px"
            :close-on-click-modal="false" append-to-body top="5vh" class="assignment-dialog">
            <div v-loading="userAssignmentDialog.loading" class="assignment-dialog-body">
                <div v-if="userAssignmentDialog.user" class="assignment-user-card">
                    <img class="detail-cartoon-avatar" :src="getUserCartoonAvatar(userAssignmentDialog.user)" alt="">
                    <div class="assignment-user-main">
                        <div class="assignment-user-name">{{ userAssignmentDialog.user.nickname || '未命名考生' }}</div>
                        <div class="assignment-user-meta">
                            学习ID {{ userAssignmentDialog.user.studyId || formatStudyId(userAssignmentDialog.user.openid) }}
                        </div>
                    </div>
                    <div class="assignment-mini-metrics">
                        <div>
                            <span>可分配科目</span>
                            <strong>{{ userAssignmentDialog.options.majorCategories.length }}</strong>
                        </div>
                        <div>
                            <span>可分配试卷</span>
                            <strong>{{ assignmentDialogStats.visibleCount }}</strong>
                        </div>
                        <div>
                            <span>已选择</span>
                            <strong>{{ assignmentDialogStats.selectedCount }}</strong>
                        </div>
                    </div>
                </div>

                <el-form label-width="92px" class="assignment-form">
                    <el-form-item label="筛选科目">
                        <el-select
                            v-model="userAssignmentDialog.filterMajorIds"
                            multiple
                            filterable
                            clearable
                            collapse-tags
                            collapse-tags-tooltip
                            placeholder="请选择要筛选的科目（不选则显示全部试卷）"
                            class="full-width-control"
                        >
                            <el-option
                                v-for="item in userAssignmentDialog.options.majorCategories"
                                :key="item._id"
                                :label="item.name"
                                :value="item._id"
                            ></el-option>
                        </el-select>
                        <div class="form-helper-text">
                            提示：选择科目后，下方将仅显示该科目下的试卷供您勾选分配。
                        </div>
                    </el-form-item>

                    <el-form-item label="分配试卷">
                        <el-checkbox-group
                            v-model="userAssignmentDialog.form.categoryIds"
                            class="full-width-control assignment-checkbox-group"
                        >
                            <div
                                v-for="group in groupedAssignmentCategories"
                                :key="group.id"
                                class="assignment-group"
                            >
                                <div class="assignment-group-head">
                                    <strong>{{ group.name }}</strong>
                                    <span>{{ group.items.length }} 份试卷</span>
                                </div>
                                <div class="assignment-option-grid">
                                    <el-checkbox
                                        v-for="item in group.items"
                                        :key="item._id"
                                        :label="item._id"
                                    >
                                        {{ item.name }}
                                    </el-checkbox>
                                </div>
                            </div>
                        </el-checkbox-group>
                        <el-empty v-if="groupedAssignmentCategories.length === 0" description="暂无可分配试卷"></el-empty>
                        <div class="form-helper-text">
                            可额外单独勾选某些试卷；勾选试卷时会自动保留其所属科目结构，方便在小程序中展示。
                        </div>
                    </el-form-item>
                </el-form>
            </div>
            <template #footer>
                <span class="dialog-footer">
                    <el-button @click="userAssignmentDialog.visible = false">取消</el-button>
                    <el-button type="primary" :loading="userAssignmentDialog.saving" @click="saveUserAssignments">保存分配</el-button>
                </span>
            </template>
        </el-dialog>

        <el-dialog v-model="cohortDialog.visible" :title="cohortDialog.id ? '编辑班组' : '新建班组'" width="620px"
            :close-on-click-modal="false" append-to-body>
            <el-form label-width="88px">
                <el-form-item label="班组名称" required>
                    <el-input v-model="cohortDialog.form.name" maxlength="100" show-word-limit></el-input>
                </el-form-item>
                <el-form-item label="成员">
                    <el-select v-model="cohortDialog.form.memberOpenids" multiple filterable collapse-tags
                        collapse-tags-tooltip class="full-width-control" placeholder="选择考生">
                        <el-option v-for="user in learningPlanOptions.users" :key="user.openid"
                            :label="`${user.nickname || '未命名考生'} · ${user.studyId}`" :value="user.openid"></el-option>
                    </el-select>
                </el-form-item>
                <el-form-item label="备注">
                    <el-input v-model="cohortDialog.form.description" type="textarea" :rows="3" maxlength="500" show-word-limit></el-input>
                </el-form-item>
                <el-form-item v-if="cohortDialog.id" label="状态">
                    <el-select v-model="cohortDialog.form.status" class="full-width-control">
                        <el-option label="使用中" value="active"></el-option>
                        <el-option label="已归档" value="archived"></el-option>
                    </el-select>
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button @click="cohortDialog.visible = false">取消</el-button>
                <el-button type="primary" :loading="cohortDialog.saving" @click="saveCohort">保存</el-button>
            </template>
        </el-dialog>

        <el-dialog v-model="learningPlanDialog.visible" :title="learningPlanDialog.id ? '编辑学习计划' : '新建学习计划'"
            width="720px" :close-on-click-modal="false" append-to-body top="5vh">
            <el-form label-width="96px">
                <el-form-item label="计划名称" required>
                    <el-input v-model="learningPlanDialog.form.title" maxlength="120" show-word-limit></el-input>
                </el-form-item>
                <el-form-item label="试卷" required>
                    <el-select v-model="learningPlanDialog.form.categoryIds" multiple filterable collapse-tags
                        collapse-tags-tooltip class="full-width-control" placeholder="选择试卷">
                        <el-option v-for="category in learningPlanOptions.categories" :key="category._id"
                            :label="learningCategoryLabel(category)" :value="category._id"></el-option>
                    </el-select>
                </el-form-item>
                <el-form-item label="班组">
                    <el-select v-model="learningPlanDialog.form.cohortIds" multiple filterable collapse-tags
                        collapse-tags-tooltip class="full-width-control" placeholder="选择班组">
                        <el-option v-for="cohort in learningPlanOptions.cohorts" :key="cohort._id"
                            :label="`${cohort.name} · ${cohort.memberCount || 0} 人`" :value="cohort._id"></el-option>
                    </el-select>
                </el-form-item>
                <el-form-item label="单独分配">
                    <el-select v-model="learningPlanDialog.form.directUserOpenids" multiple filterable collapse-tags
                        collapse-tags-tooltip class="full-width-control" placeholder="选择额外考生">
                        <el-option v-for="user in learningPlanOptions.users" :key="user.openid"
                            :label="`${user.nickname || '未命名考生'} · ${user.studyId}`" :value="user.openid"></el-option>
                    </el-select>
                </el-form-item>
                <div class="learning-plan-form-row">
                    <el-form-item label="截止时间">
                        <el-date-picker v-model="learningPlanDialog.form.dueAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ssZ"
                            class="full-width-control" placeholder="不设截止时间"></el-date-picker>
                    </el-form-item>
                    <el-form-item label="目标分数">
                        <el-input-number v-model="learningPlanDialog.form.targetScore" :min="0" :max="100" :step="5"></el-input-number>
                    </el-form-item>
                </div>
                <el-form-item label="计划说明">
                    <el-input v-model="learningPlanDialog.form.description" type="textarea" :rows="3" maxlength="1000" show-word-limit></el-input>
                </el-form-item>
                <el-form-item v-if="learningPlanDialog.id" label="状态">
                    <el-select v-model="learningPlanDialog.form.status" class="full-width-control">
                        <el-option label="进行中" value="active"></el-option>
                        <el-option label="已归档" value="archived"></el-option>
                    </el-select>
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button @click="learningPlanDialog.visible = false">取消</el-button>
                <el-button type="primary" :loading="learningPlanDialog.saving" @click="saveLearningPlan">保存</el-button>
            </template>
        </el-dialog>

        <!-- User Delete Confirm Dialog -->
        <el-dialog v-model="userDeleteDialog.visible" title="确认删除考生" width="420px" :close-on-click-modal="false"
            append-to-body class="danger-confirm-dialog">
            <div class="danger-confirm">
                <div class="danger-confirm-icon is-critical">
                    <el-icon><Warning /></el-icon>
                </div>
                <div class="danger-confirm-title">删除 {{ selectedUsers.length }} 位考生</div>
                <div class="danger-confirm-desc">此操作会同时删除考生资料、考试记录和相关学习数据，请确认已经完成备份或不再需要。</div>

                <div class="math-challenge">
                    <span>请完成验证</span>
                    <strong>{{ userDeleteDialog.mathQuestion }}</strong>
                    <el-input v-model="userDeleteDialog.userInput" placeholder="请输入计算结果"
                        size="large" @keyup.enter="confirmDeleteUsers">
                    </el-input>
                </div>
            </div>
            <template #footer>
                <span class="dialog-footer operation-footer">
                    <el-button @click="userDeleteDialog.visible = false">取消</el-button>
                    <el-button type="danger" @click="confirmDeleteUsers" :loading="loading">确认删除</el-button>
                </span>
            </template>
        </el-dialog>

        <!-- Change Password Dialog -->
        <el-dialog v-if="hasAdminSecurityActions" v-model="passwordDialog.visible" title="修改密码" width="420px" :close-on-click-modal="false"
            append-to-body destroy-on-close>
            <el-form :model="passwordForm" label-width="100px">
                <el-form-item label="旧密码">
                    <el-input v-model="passwordForm.oldPassword" type="password" placeholder="请输入当前密码"
                        show-password></el-input>
                </el-form-item>
                <el-form-item label="新密码">
                    <el-input v-model="passwordForm.newPassword" type="password" placeholder="至少 12 位，含大小写字母、数字和符号"
                        show-password></el-input>
                </el-form-item>
                <el-form-item label="确认新密码">
                    <el-input v-model="passwordForm.confirmPassword" type="password" placeholder="请再次输入新密码"
                        show-password @keyup.enter="submitChangePassword"></el-input>
                </el-form-item>
            </el-form>
            <template #footer>
                <span class="dialog-footer">
                    <el-button @click="passwordDialog.visible = false">取消</el-button>
                    <el-button type="primary" @click="submitChangePassword"
                        :loading="passwordDialog.loading">确认修改</el-button>
                </span>
            </template>
        </el-dialog>
    </div>
</template>

<script setup>

import { defineAsyncComponent, ref, reactive, onMounted, onBeforeUnmount, computed, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { session, loadRuntimeConfig } from '@/utils/session';
import { createAdminApi } from '@/api/admin';
import { createMockAdminApi } from '@/api/adminMock';
import { createCartoonAvatar } from '@/utils/cartoonAvatar';
import { isUiPreviewMode } from '@/utils/uiPreview';
import { IS_PLATFORM_SSO, logoutPlatformSession, resolveAppUrl } from '@/utils/runtime';
import { getCurrentTheme, toggleTheme } from '@/utils/theme';
import DashboardNavMenu from '@/components/DashboardNavMenu.vue';
import { usePasswordDialog } from '@/features/account/usePasswordDialog';
import { useExamResults } from '@/features/exam-results/useExamResults';
import { usePersonalCategories } from '@/features/personal-categories/usePersonalCategories';
import { useFeedback } from '@/features/feedback/useFeedback';
import { usePaperShares } from '@/features/paper-share/usePaperShares';
import { useLearningOperations } from '@/features/learning-operations/useLearningOperations';
import { useWechatBinding } from '@/features/wechat-binding/useWechatBinding';
import { useUserAssignments } from '@/features/user-assignments/useUserAssignments';

const MiniLineChart = defineAsyncComponent(() => import('@/components/MiniLineChart.vue'));
const QuestionQualityView = defineAsyncComponent(() => import('@/components/QuestionQualityView.vue'));

const route = useRoute();
const router = useRouter();
const faviconUrl = resolveAppUrl('/favicon.png');
const EXAM_DETAIL_BODY_CLASS = 'exam-detail-active';

// Interceptors are configured globally in main.js via setupHttp


        
        
        const isDarkTheme = ref(getCurrentTheme() === 'dark');
        const handleThemeToggle = () => {
            isDarkTheme.value = toggleTheme() === 'dark';
        };

        const activeMenu = ref('dashboard');
        const loading = ref(false);
        const viewLoading = reactive({
            dashboard: false,
            dashboardRecent: false,
            majorCategories: false,
            categories: false,
            examResults: false,
            users: false,
            learningPlans: false,
            personalCategories: false,
            feedbacks: false,
        });
        const categories = ref([]);
        const majorCategories = ref([]);
        const categorySearchKeyword = ref('');

        // New Views and Selection
        const isExamView = ref(false);
        const selectedMajorCategory = ref(null);

        // Auth Check
        const hasSession = session.hasSession();
        if (!hasSession) {
            const shareCode = new URLSearchParams(window.location.search).get('shareCode');
            router.replace({
                path: '/login',
                query: shareCode ? { shareCode } : {},
            });
        }

        const authType = ref(session.getAuthType());
        const isConsoleMode = computed(() => authType.value === 'console');
        const isDemoManage = computed(() => activeMenu.value === 'demo-manage');
        const manageMenuLabel = computed(() => (isConsoleMode.value ? '管理分组/题库' : '管理科目/试卷'));
        const majorLabel = computed(() => (isDemoManage.value ? '示例分组' : (isConsoleMode.value ? '分组' : '科目')));
        const categoryLabel = computed(() => (isDemoManage.value ? '示例题库' : (isConsoleMode.value ? '题库' : '试卷')));
        const feedbackMenuLabel = computed(() => (isConsoleMode.value ? '问题反馈' : '反馈处理'));
        const activePanelTitle = computed(() => {
            if (isExamView.value) {
                return selectedMajorCategory.value?.name || categoryLabel.value;
            }

            const titles = {
                dashboard: '数据概览',
                'major-categories': manageMenuLabel.value,
                'demo-manage': '示例题库管理',
                'exam-results': '考试记录',
                users: '考生管理',
                'learning-plans': '学习计划',
                'personal-categories': '个人题库监管',
                'question-quality': '题库质量',
                feedbacks: feedbackMenuLabel.value,
            };
            return titles[activeMenu.value] || '管理后台';
        });
        const feedbackBadgeCount = ref(0);
        const fourthStatLabel = computed(() => (isConsoleMode.value ? '已发布题库' : '累计考试'));
        const hasAdminSecurityActions = computed(() => !isConsoleMode.value);
        let fourthStatValue;
        let displayName;
        let roleText;
        const allowedMenus = computed(() => (
            isConsoleMode.value
                ? ['dashboard', 'major-categories', 'question-quality', 'feedbacks']
                : ['dashboard', 'major-categories', 'exam-results', 'users', 'learning-plans', 'personal-categories', 'question-quality', 'feedbacks']
        ));
        const uiPreviewMode = isUiPreviewMode();
        const adminApi = uiPreviewMode
            ? createMockAdminApi({ getIsConsoleMode: () => isConsoleMode.value, getIsDemoManage: () => isDemoManage.value })
            : createAdminApi({ getIsConsoleMode: () => isConsoleMode.value, getIsDemoManage: () => isDemoManage.value });
        const canAccessMenu = (menu) => {
            if (menu === 'demo-manage') {
                return !isConsoleMode.value;
            }
            return allowedMenus.value.includes(menu);
        };

        const firstQueryValue = (value) => {
            if (Array.isArray(value)) {
                return value[0] || '';
            }
            return value || '';
        };

        const qualityIssueCodes = new Set([
            'missing_analysis',
            'missing_answer',
            'insufficient_options',
            'duplicate_option_label',
            'empty_option',
            'answer_not_in_options',
            'single_answer_count',
            'duplicate_content',
            'stale_question',
        ]);
        const parseQualityInteger = (value, min, max, fallback) => {
            const number = Number.parseInt(String(firstQueryValue(value)), 10);
            return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
        };
        const normalizeQualityScope = (value) => {
            if (isConsoleMode.value) return 'personal';
            return firstQueryValue(value) === 'demo' ? 'demo' : 'admin';
        };
        const normalizeQualityIssue = (value) => {
            const issue = String(firstQueryValue(value));
            return qualityIssueCodes.has(issue) ? issue : '';
        };
        const qualityRouteState = computed(() => ({
            scopeType: normalizeQualityScope(route.query.qualityScopeType),
            issue: normalizeQualityIssue(route.query.qualityIssue),
            page: parseQualityInteger(route.query.qualityPage, 1, 1000, 1),
            limit: parseQualityInteger(route.query.qualityLimit, 1, 100, 20),
        }));

        const syncDashboardRouteState = (extraQuery = {}) => {
            const query = {
                ...route.query,
                menu: activeMenu.value,
                ...extraQuery,
            };

            Object.keys(query).forEach((key) => {
                if (query[key] === undefined || query[key] === null || query[key] === '') {
                    delete query[key];
                }
            });

            router.replace({ path: '/', query }).catch(() => {});
        };

        const resetDashboardViewport = () => {
            nextTick(() => {
                requestAnimationFrame(() => {
                    window.scrollTo({ left: 0, top: 0 });
                });
            });
        };

        

        

        

        // Safe user info retrieval
        const getSafeAdminUser = () => {
            return session.getUser();
        };

        const loggedInUser = ref(getSafeAdminUser());
        displayName = computed(() => (
            loggedInUser.value.displayName
            || loggedInUser.value.username
            || loggedInUser.value.nickname
            || (isConsoleMode.value ? '我的题库' : '管理员')
        ));
        roleText = computed(() => {
            if (!isConsoleMode.value) {
                return loggedInUser.value.isWechatBound ? '微信已绑定' : '微信未绑定';
            }

            const map = {
                creator: '个人题库创建者',
                ops_admin: '题库运营身份',
                super_admin: '题库超级身份',
            };
            return map[loggedInUser.value.role] || '个人题库身份';
        });

        const handleLogout = async () => {
            const confirmation = isConsoleMode.value ? '确定退出个人题库后台吗？' : '确定退出登录吗？';
            try {
                await ElMessageBox.confirm(confirmation, '提示', { type: 'warning' });
            } catch {
                return;
            }

            try {
                if (IS_PLATFORM_SSO) {
                    await logoutPlatformSession();
                    session.clear();
                    return;
                }
                await adminApi.logout();
                session.clear();
                router.push('/login');
            } catch (error) {
                ElMessage.error(error.response?.data?.message || error.message || '退出失败，请检查网络后重试');
            }
        };

        // Dashboard Data
        const dashboardStats = reactive({
            error: false,
            counts: {
                majorCategories: 0,
                categories: 0,
                questions: 0,
                examResults: 0,
                publishedCategories: 0,
                practiceRecords: 0,
            },
            chartData: {}
        });
        fourthStatValue = computed(() => (dashboardStats.error
            ? '--'
            : (isConsoleMode.value
                ? (dashboardStats.counts.publishedCategories || 0)
                : (dashboardStats.counts.examResults || 0))));
        let qrcodeModulePromise = null;
        const viewRequestControllers = new Map();

        const beginViewRequest = (key) => {
            viewRequestControllers.get(key)?.abort();
            const controller = new AbortController();
            viewRequestControllers.set(key, controller);
            viewLoading[key] = true;
            return controller;
        };

        const finishViewRequest = (key, controller) => {
            if (viewRequestControllers.get(key) !== controller) return;
            viewRequestControllers.delete(key);
            viewLoading[key] = false;
        };

        const quietRequestConfig = (controller) => ({
            signal: controller.signal,
            showGlobalError: false,
        });

        const buildFallbackDates = () => Array.from({ length: 7 }, (_, index) => {
            const date = new Date();
            date.setDate(date.getDate() - (6 - index));
            return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        });

        const activityTrendChart = computed(() => {
            const data = dashboardStats.chartData || {};
            const labels = Array.isArray(data.dates) && data.dates.length > 0 ? data.dates : buildFallbackDates();
            const rawValues = Array.isArray(data.values) ? data.values : [];
            const values = labels.map((_, index) => Number(rawValues[index]) || 0);
            return {
                labels,
                values,
                today: values[values.length - 1] || 0,
                peakValue: Math.max(...values, 0),
                total: values.reduce((sum, value) => sum + value, 0),
            };
        });

        const formatHintNumber = (value, fractionDigits = 0) => {
            const number = Number(value) || 0;
            if (!number) {
                return '0';
            }
            return number.toFixed(fractionDigits).replace(/\.0+$/, '');
        };

        const dashboardStatLabels = computed(() => ({
            majorCategories: isConsoleMode.value ? '总分组' : '总科目',
            categories: isConsoleMode.value ? '总题库' : '总试卷',
            questions: '总题目',
            examResults: fourthStatLabel.value,
        }));

        const dashboardStatHints = computed(() => {
            const counts = dashboardStats.counts || {};
            const majorCount = Number(counts.majorCategories) || 0;
            const categoryCount = Number(counts.categories) || 0;
            const questionCount = Number(counts.questions) || 0;
            const questionsPerCategory = categoryCount ? questionCount / categoryCount : 0;

            if (isConsoleMode.value) {
                return {
                    majorCategories: `${categoryCount} 个题库`,
                    categories: `${Number(counts.publishedCategories) || 0} 个已发布`,
                    questions: `${formatHintNumber(questionsPerCategory, 1)} 道/题库`,
                    examResults: `练习记录 ${Number(counts.practiceRecords) || 0} 次`,
                };
            }

            const categoriesPerMajor = majorCount ? categoryCount / majorCount : 0;
            return {
                majorCategories: `${categoryCount} 份试卷归档`,
                categories: `${formatHintNumber(categoriesPerMajor, 1)} 份/科目`,
                questions: `${formatHintNumber(questionsPerCategory, 1)} 道/试卷`,
                examResults: `近7天 ${activityTrendChart.value.total} 次`,
            };
        });

        const dashboardTrendSummary = computed(() => {
            const chart = activityTrendChart.value;
            if (!chart.total) {
                return '近 7 天暂无做题记录';
            }
            return `近 7 天累计 ${chart.total} 次，今日 ${chart.today} 次，峰值 ${chart.peakValue} 次`;
        });

        const isTodayTimestamp = (value) => {
            const timestamp = getRecentTimestamp(value);
            if (!timestamp) {
                return false;
            }
            const date = new Date(timestamp);
            const today = new Date();
            return date.getFullYear() === today.getFullYear()
                && date.getMonth() === today.getMonth()
                && date.getDate() === today.getDate();
        };

        const dashboardRecent = reactive({
            loading: false,
            exams: [],
            users: [],
            feedbacks: [],
        });

        const getRecentTimestamp = (value) => {
            if (!value) {
                return 0;
            }
            const timestamp = new Date(value).getTime();
            return Number.isFinite(timestamp) ? timestamp : 0;
        };

        const formatRecentTime = (value) => {
            const timestamp = getRecentTimestamp(value);
            if (!timestamp) {
                return '刚刚';
            }
            const diff = Math.max(0, Date.now() - timestamp);
            if (diff < 60 * 1000) {
                return '刚刚';
            }
            if (diff < 60 * 60 * 1000) {
                return `${Math.floor(diff / (60 * 1000))} 分钟前`;
            }
            if (diff < 24 * 60 * 60 * 1000) {
                return `${Math.floor(diff / (60 * 60 * 1000))} 小时前`;
            }
            if (diff < 48 * 60 * 60 * 1000) {
                return '昨天';
            }
            const date = new Date(timestamp);
            return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        };

        const getApiList = (settledResult) => {
            if (settledResult?.status !== 'fulfilled' || settledResult.value?.data?.code !== 0) {
                return [];
            }
            const payload = settledResult.value.data.data;
            if (Array.isArray(payload)) {
                return payload;
            }
            return payload?.list || payload?.items || [];
        };

        const dashboardRecentItems = computed(() => {
            const examItems = (dashboardRecent.exams || []).map((item, index) => {
                const timestampValue = item.createTime || item.submitTime || item.updatedAt;
                const userName = item.nickname || item.user?.nickname || item.name || '未命名考生';
                const paperName = item.categoryName || item.examName || item.paperName || '未命名试卷';
                const scoreText = item.score === undefined || item.score === null ? '成绩待统计' : `${item.score} 分`;
                return {
                    id: `exam-${item._id || index}`,
                    kind: 'exam',
                    title: `${userName} 完成考试`,
                    meta: `${paperName} · ${scoreText}`,
                    timestamp: getRecentTimestamp(timestampValue),
                    timeText: formatRecentTime(timestampValue),
                };
            });

            const userItems = (dashboardRecent.users || []).map((item, index) => {
                const timestampValue = item.createTime || item.createdAt || item.lastActiveTime;
                const userName = item.nickname || item.name || item.username || '新用户';
                const studyId = item.studyId || formatStudyId(item.openid);
                return {
                    id: `user-${item.openid || item._id || index}`,
                    kind: 'user',
                    title: `${userName} 加入学习`,
                    meta: studyId ? `学习ID ${studyId}` : '学习资料已建立',
                    timestamp: getRecentTimestamp(timestampValue),
                    timeText: formatRecentTime(timestampValue),
                };
            });

            const feedbackItems = (dashboardRecent.feedbacks || []).map((item, index) => {
                const timestampValue = item.updateTime || item.repliedAt || item.createTime || item.createdAt;
                const userName = item.user?.nickname || item.nickname || item.user?.studyId || item.ownerStudyId || '用户';
                return {
                    id: `feedback-${item._id || index}`,
                    kind: 'feedback',
                    title: item.title || '新的问题反馈',
                    meta: `${formatFeedbackStatus(item.status)} · ${userName}`,
                    timestamp: getRecentTimestamp(timestampValue),
                    timeText: formatRecentTime(timestampValue),
                };
            });

            return [...examItems, ...userItems, ...feedbackItems]
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 6);
        });

        const dashboardActionCards = computed(() => {
            const counts = dashboardStats.counts || {};
            const pendingFeedback = Number(feedbackBadgeCount.value) || 0;
            const recentNewUsers = (dashboardRecent.users || [])
                .filter((item) => isTodayTimestamp(item.createTime || item.createdAt))
                .length;
            const lowScoreExams = (dashboardRecent.exams || [])
                .filter((item) => Number(item.score) > 0 && Number(item.score) < 60)
                .length;

            if (isConsoleMode.value) {
                return [
                    {
                        id: 'console-feedback',
                        kind: 'feedback',
                        tone: pendingFeedback > 0 ? 'warning' : 'neutral',
                        value: pendingFeedback,
                        label: '未读回复',
                        detail: pendingFeedback > 0 ? '点击查看最新反馈' : '反馈处理正常',
                        target: 'feedbacks',
                    },
                    {
                        id: 'console-published',
                        kind: 'category',
                        tone: 'success',
                        value: Number(counts.publishedCategories) || 0,
                        label: '已发布题库',
                        detail: `${Number(counts.categories) || 0} 个题库可管理`,
                        target: 'major-categories',
                    },
                    {
                        id: 'console-practice',
                        kind: 'exam',
                        tone: 'primary',
                        value: Number(counts.practiceRecords) || 0,
                        label: '累计练习',
                        detail: '来自个人题库数据',
                        target: 'major-categories',
                    },
                ];
            }

            return [
                {
                    id: 'pending-feedback',
                    kind: 'feedback',
                    tone: pendingFeedback > 0 ? 'warning' : 'neutral',
                    value: pendingFeedback,
                    label: '待处理反馈',
                    detail: pendingFeedback > 0 ? '建议优先处理' : '暂无待办反馈',
                    target: 'feedbacks',
                },
                {
                    id: 'today-exams',
                    kind: 'exam',
                    tone: activityTrendChart.value.today > 0 ? 'primary' : 'neutral',
                    value: activityTrendChart.value.today,
                    label: '今日考试',
                    detail: `近 7 天累计 ${activityTrendChart.value.total} 次`,
                    target: 'exam-results',
                },
                {
                    id: 'today-users',
                    kind: 'user',
                    tone: recentNewUsers > 0 ? 'success' : 'neutral',
                    value: recentNewUsers,
                    label: '今日新增用户',
                    detail: '来自最近用户记录',
                    target: 'users',
                },
                {
                    id: 'low-score',
                    kind: 'trend',
                    tone: lowScoreExams > 0 ? 'danger' : 'neutral',
                    value: lowScoreExams,
                    label: '近期低分',
                    detail: lowScoreExams > 0 ? '可关注试卷质量' : '近期成绩稳定',
                    target: 'exam-results',
                },
            ];
        });

        const loadDashboardRecent = async () => {
            const controller = beginViewRequest('dashboardRecent');
            dashboardRecent.loading = true;
            try {
                const config = quietRequestConfig(controller);
                if (isConsoleMode.value) {
                    const feedbackResult = await Promise.allSettled([
                        adminApi.listFeedbacks({ page: 1, limit: 6 }, config),
                    ]);
                    if (controller.signal.aborted) return;
                    dashboardRecent.exams = [];
                    dashboardRecent.users = [];
                    dashboardRecent.feedbacks = getApiList(feedbackResult[0]);
                    return;
                }

                const [examResult, userResult, feedbackResult] = await Promise.allSettled([
                    adminApi.listExamResults({ page: 1, pageSize: 6 }, config),
                    adminApi.listUsers({ page: 1, pageSize: 6 }, config),
                    adminApi.listFeedbacks({ page: 1, limit: 6 }, config),
                ]);
                if (controller.signal.aborted) return;

                dashboardRecent.exams = getApiList(examResult);
                dashboardRecent.users = getApiList(userResult);
                dashboardRecent.feedbacks = getApiList(feedbackResult);
            } finally {
                if (viewRequestControllers.get('dashboardRecent') === controller) {
                    dashboardRecent.loading = false;
                }
                finishViewRequest('dashboardRecent', controller);
            }
        };

        const loadQrcode = async () => {
            if (!qrcodeModulePromise) {
                qrcodeModulePromise = import('qrcode');
            }
            const module = await qrcodeModulePromise;
            return module.default || module;
        };

        // --- Bind Wechat Dialog ---
        const runtimeConfig = reactive({
            scanLogin: {
                enabled: false,
                apiBase: ''
            }
        });
        const getScanLoginConfig = () => runtimeConfig.scanLogin;

        const mobileMenuVisible = ref(false);
        const userMenuVisible = ref(false);

        // --- Dialog States ---
        const categoryDialog = reactive({ visible: false, isEdit: false, moveOnly: false });
        const majorCategoryDialog = reactive({ visible: false, isEdit: false, isAssignedEdit: false });
        const shareDialog = reactive({
            visible: false,
            loading: false,
            saving: false,
            category: null,
            shares: [],
            result: null,
            selectedShareId: '',
            form: {
                permission: 'view',
                expireMode: '7d',
                customExpiresAt: '',
                maxAcceptEnabled: false,
                maxAcceptCount: 0,
                note: ''
            }
        });
        const analysisDialog = reactive({
            visible: false,
            loading: false,
            category: null,
            data: null,
        });
        const categoryDialogModeText = computed(() => {
            if (categoryDialog.moveOnly) {
                return `调整${categoryLabel.value}归属`;
            }
            return categoryDialog.isEdit
                ? `维护${categoryLabel.value}基础信息`
                : `创建新的${categoryLabel.value}`;
        });
        const sharePermissionPreview = computed(() => formatSharePermission(shareDialog.form.permission));
        const shareExpirePreview = computed(() => {
            if (shareDialog.form.expireMode === 'forever') {
                return '永久有效';
            }
            if (shareDialog.form.expireMode === 'custom') {
                return shareDialog.form.customExpiresAt
                    ? formatDateTime(shareDialog.form.customExpiresAt)
                    : '待选择';
            }
            const map = {
                '1d': '1天',
                '7d': '7天',
                '30d': '30天',
            };
            return map[shareDialog.form.expireMode] || '7天';
        });
        const shareAcceptLimitPreview = computed(() => (
            shareDialog.form.maxAcceptEnabled
                ? `${Number(shareDialog.form.maxAcceptCount || 0)} 次`
                : '不限制'
        ));
        const analysisDialogSummary = computed(() => {
            const summary = analysisDialog.data?.summary || {};
            if (!summary.totalAttempts) {
                return '暂无足够考试数据，后续提交后会自动生成分析。';
            }
            return `${summary.totalAttempts} 次提交，平均 ${summary.averageScore || 0} 分，通过率 ${summary.passRate || 0}%`;
        });
        const analysisTrendItems = computed(() => {
            const trendData = analysisDialog.data?.trendData || {};
            const dates = trendData.dates || [];
            const attempts = trendData.attempts || [];
            const averageScores = trendData.averageScores || [];
            const maxAttempts = Math.max(...attempts, 1);

            return dates.map((date, index) => {
                const height = Math.max(8, Math.round(((attempts[index] || 0) / maxAttempts) * 100));
                return {
                    date,
                    attempts: attempts[index] || 0,
                    averageScore: averageScores[index] || 0,
                    heightClass: `is-height-${Math.max(1, Math.ceil(height / 10))}`,
                };
            });
        });
        const acceptShareDialog = reactive({
            visible: false,
            loading: false,
            accepting: false,
            shareCode: '',
            preview: null,
            sourceCategory: null,
            alreadyAccepted: false,
            importedCategory: null
        });
        const acceptShareSaveLocation = computed(() => {
            const categoryName = acceptShareDialog.importedCategory?.name
                || acceptShareDialog.sourceCategory?.name
                || '';
            return categoryName
                ? `我的题库 / 来自分享 / ${categoryName}`
                : '我的题库 / 来自分享';
        });

        // --- Forms ---
        const categoryForm = reactive({
            _id: '',
            name: '',
            description: '',
            duration: 0,
            passingScore: 60,
            isPublished: true,
            majorCategoryId: ''
        });

        const majorCategoryForm = reactive({
            _id: '',
            name: '',
            sortOrder: 0,
            showOnHome: true
        });

        // --- Computed ---
        const getMajorCategoryId = (value) => {
            if (!value) return '';
            return String(value._id || value);
        };
        const normalizeShareCode = (value) => String(value || '').trim().replace(/[\s-]/g, '').toUpperCase();
        const formatShareCode = (value) => {
            const code = normalizeShareCode(value);
            return code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
        };
        const formatDateTime = (value) => {
            if (!value) return '永久有效';
            return new Date(value).toLocaleString();
        };
        const formatUserLastActiveTime = (value) => {
            if (!value) return '--';
            return new Date(value).toLocaleString();
        };
        const formatDateShort = (value) => {
            if (!value) return '--';
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) return '--';
            return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        };
        const formatShareState = (share) => {
            const map = {
                active: '可接收',
                expired: '已过期',
                revoked: '已撤销',
                limited: '次数已满'
            };
            return map[share?.state] || '未知';
        };
        const getShareStateType = (share) => {
            const map = {
                active: 'success',
                expired: 'info',
                revoked: 'danger',
                limited: 'warning'
            };
            return map[share?.state] || 'info';
        };
        const formatSharePermission = (permission) => (
            permission === 'edit' ? '可编辑副本' : '只读副本'
        );
        const formatQuestionType = (type) => {
            const map = {
                single: '单选',
                multiple: '多选',
                judge: '判断',
                fill: '填空',
            };
            return map[type] || '未知';
        };
        const formatQuestionAnswer = (answer) => (
            Array.isArray(answer) ? answer.join('、') : String(answer || '')
        );
        const formatFeedbackCategory = (category) => {
            const map = {
                bug: '功能异常',
                feature: '功能建议',
                content: '题库内容',
                account: '账号问题',
                other: '其他',
            };
            return map[category] || '其他';
        };
        const formatFeedbackStatus = (status) => {
            const map = {
                open: '待回复',
                replied: '已回复',
                closed: '已关闭',
            };
            return map[status] || '未知';
        };
        const getFeedbackStatusType = (status) => {
            const map = {
                open: 'warning',
                replied: 'success',
                closed: 'info',
            };
            return map[status] || 'info';
        };
        const isFeedbackReplyUnread = (item) => {
            if (!isConsoleMode.value || !item?.repliedAt) {
                return false;
            }
            const readAt = item.replyReadAt ? new Date(item.replyReadAt).getTime() : 0;
            const repliedAt = new Date(item.repliedAt).getTime();
            return Number.isFinite(repliedAt) && readAt < repliedAt;
        };
        const hasFourExamActions = (exam) => {
            if (!exam) return false;
            let count = 1; // 管理/查看题目
            const hasEditAction = !exam.readOnly || exam.canMove;
            const hasShareAction = !isDemoManage.value && !exam.readOnly;
            const hasDeleteAction = !exam.readOnly || exam.canDelete;
            if (hasEditAction) count += 1;
            if (hasShareAction) count += 1;
            if (hasDeleteAction) count += 1;
            return count >= 4;
        };
        const isAssignedMajorCategory = (cat) => (
            Boolean(cat)
            && (cat.accessType === 'assigned'
                || cat.librarySource === 'assigned'
                || cat.canUpdatePreferences === true)
        );
        const canEditMajorCategory = (cat) => Boolean(cat) && (!cat.readOnly || isAssignedMajorCategory(cat));

        // Computed for filtered categories
        const filteredCategories = computed(() => {
            if (!selectedMajorCategory.value) return categories.value;
            const selectedId = String(selectedMajorCategory.value._id);
            return categories.value.filter(cat => getMajorCategoryId(cat.majorCategoryId) === selectedId);
        });
        const categorySearchText = computed(() => String(categorySearchKeyword.value || '').trim().toLowerCase());
        const visibleMajorCategories = computed(() => {
            if (!categorySearchText.value) {
                return majorCategories.value;
            }
            return majorCategories.value.filter((item) => String(item.name || '')
                .toLowerCase()
                .includes(categorySearchText.value));
        });
        const visibleFilteredCategories = computed(() => {
            if (!categorySearchText.value) {
                return filteredCategories.value;
            }
            return filteredCategories.value.filter((item) => [
                item.name,
                item.description,
                item._id,
            ].some((value) => String(value || '').toLowerCase().includes(categorySearchText.value)));
        });
        const getMajorCategoryStats = (major) => {
            const majorId = String(major?._id || '');
            const exams = categories.value.filter((item) => getMajorCategoryId(item.majorCategoryId) === majorId);
            return {
                examCount: exams.length,
                publishedCount: exams.filter((item) => item.isPublished !== false).length,
                questionCount: exams.reduce((sum, item) => sum + (Number(item.count) || 0), 0),
            };
        };
        // --- Lifecycle ---
        onMounted(async () => {
            document.body.classList.remove(EXAM_DETAIL_BODY_CLASS);
            const runtime = await loadRuntimeConfig();
            Object.assign(runtimeConfig.scanLogin, runtime.scanLogin || {});
            if (hasSession) {
                // Check for menu param
                const urlParams = new URLSearchParams(window.location.search);
                const menuParam = firstQueryValue(route.query.menu) || urlParams.get('menu');
                const routeMajorCategoryId = firstQueryValue(route.query.majorCategoryId) || urlParams.get('majorCategoryId') || '';
                const incomingShareCode = normalizeShareCode(firstQueryValue(route.query.shareCode) || urlParams.get('shareCode') || '');

                if (menuParam && canAccessMenu(menuParam)) {
                    // 'categories' 已整合到 'major-categories'，自动重定向
                    activeMenu.value = menuParam === 'categories' ? 'major-categories' : menuParam;
                }

                if (incomingShareCode && isConsoleMode.value) {
                    activeMenu.value = 'major-categories';
                }

                // Initial data load based on active menu
                if (activeMenu.value === 'dashboard') await loadDashboardData();
                else if (activeMenu.value === 'categories') await loadCategories();
                else if (activeMenu.value === 'major-categories' || activeMenu.value === 'demo-manage') {
                    await loadMajorCategories();
                    if (routeMajorCategoryId) {
                        const selected = majorCategories.value.find((item) => String(item._id) === String(routeMajorCategoryId));
                        if (selected) {
                            selectedMajorCategory.value = selected;
                            isExamView.value = true;
                            await loadCategories();
                        }
                    }
                }
                else if (activeMenu.value === 'exam-results') await loadExamResults();
                else if (activeMenu.value === 'users') await loadUsers();
                else if (activeMenu.value === 'learning-plans') await loadLearningOperations();
                else if (activeMenu.value === 'personal-categories') await loadPersonalCategories();
                else if (activeMenu.value === 'feedbacks') await loadFeedbacks();

                if (incomingShareCode) {
                    if (isConsoleMode.value) {
                        openAcceptShareDialog(incomingShareCode);
                        await previewPaperShare();
                    } else {
                        ElMessage.warning('请使用个人题库后台账号接收分享');
                    }
                }

                await loadFeedbackSummary();
            }
            // Fetch user info to update bind status
            if (hasSession && !IS_PLATFORM_SSO) {
                refreshUserInfo();
            }
            resetDashboardViewport();
        });

        onBeforeUnmount(() => {
            stopBindRequests();
            viewRequestControllers.forEach((controller) => controller.abort());
            viewRequestControllers.clear();
            if (userSearchTimer) {
                clearTimeout(userSearchTimer);
                userSearchTimer = null;
            }
        });

        // --- Methods: Data Loading ---
        const loadDashboardData = async () => {
            const controller = beginViewRequest('dashboard');
            try {
                dashboardStats.error = false;
                const res = await adminApi.getDashboardData(quietRequestConfig(controller));
                if (controller.signal.aborted) return;
                if (res.data.code === 0) {
                    Object.assign(dashboardStats.counts, {
                        majorCategories: 0,
                        categories: 0,
                        questions: 0,
                        examResults: 0,
                        publishedCategories: 0,
                        practiceRecords: 0,
                    }, res.data.data.counts || {});
                    dashboardStats.chartData = res.data.data.chartData || {};
                } else {
                    dashboardStats.error = true;
                }
                await loadDashboardRecent();
            } catch (err) {
                if (controller.signal.aborted) return;
                dashboardStats.error = true;
                ElMessage.error('加载数据失败');
            } finally {
                finishViewRequest('dashboard', controller);
            }
        };

        const loadMajorCategories = async () => {
            const controller = beginViewRequest('majorCategories');
            try {
                const res = await adminApi.listMajorCategories(
                    { includeAll: true },
                    quietRequestConfig(controller),
                );
                if (controller.signal.aborted) return;
                majorCategories.value = res.data.data;
                await loadCategories();
            } catch (err) {
                if (controller.signal.aborted) return;
                ElMessage.error(`加载${majorLabel.value}失败`);
            } finally {
                finishViewRequest('majorCategories', controller);
            }
        };

        const loadCategories = async () => {
            const controller = beginViewRequest('categories');
            try {
                const res = await adminApi.listCategories(quietRequestConfig(controller));
                if (controller.signal.aborted) return;
                categories.value = res.data.data;
            } catch (err) {
                if (controller.signal.aborted) return;
                ElMessage.error(`加载${categoryLabel.value}失败`);
            } finally {
                finishViewRequest('categories', controller);
            }
        };

        const loadFeedbackSummary = async () => {
            try {
                const res = await adminApi.getFeedbackSummary();
                if (res.data.code === 0) {
                    const data = res.data.data || {};
                    feedbackBadgeCount.value = isConsoleMode.value
                        ? (Number(data.unreadReplyCount) || 0)
                        : (Number(data.pendingCount) || 0);
                }
            } catch (err) {
                feedbackBadgeCount.value = 0;
            }
        };

        const handleMenuSelect = (index) => {
            if (!canAccessMenu(index)) {
                return;
            }

            activeMenu.value = index;
            mobileMenuVisible.value = false;
            syncDashboardRouteState({ majorCategoryId: undefined });

            // Lazy load data based on view
            if (index === 'dashboard') {
                loadDashboardData();
            }
            if (index === 'categories' && categories.value.length === 0) loadCategories();
            if (index === 'major-categories' || index === 'demo-manage') {
                isExamView.value = false;
                selectedMajorCategory.value = null;
                loadMajorCategories();
            }
            if (index === 'exam-results') {
                loadExamResults();
                if (categories.value.length === 0) loadCategories(); // Load categories for filter
            }
            if (index === 'users' && users.list.length === 0) loadUsers();
            if (index === 'learning-plans') loadLearningOperations();
            if (index === 'personal-categories') loadPersonalCategories(personalCategories.page || 1);
            if (index === 'feedbacks') loadFeedbacks();
        };


        // --- Methods: Major Category Logic ---
        const openMajorCategoryDialog = (row = null) => {
            if (row?.readOnly && !isAssignedMajorCategory(row)) {
                ElMessage.warning(`管理员分配的${majorLabel.value}只能查看，不能编辑`);
                return;
            }

            majorCategoryDialog.visible = true;
            majorCategoryDialog.isEdit = !!row;
            majorCategoryDialog.isAssignedEdit = isAssignedMajorCategory(row);
            if (row) {
                Object.assign(majorCategoryForm, {
                    _id: row._id,
                    name: row.name,
                    sortOrder: row.sortOrder || 0,
                    showOnHome: row.showOnHome !== false  // 默认为 true
                });
            } else {
                Object.assign(majorCategoryForm, {
                    _id: '',
                    name: '',
                    sortOrder: 0,
                    showOnHome: true
                });
            }
        };

        const saveMajorCategory = async () => {
            const data = {
                sortOrder: majorCategoryForm.sortOrder,
                showOnHome: majorCategoryForm.showOnHome,
            };
            if (!majorCategoryDialog.isAssignedEdit) {
                data.name = majorCategoryForm.name;
            }
            Object.assign(data, adminApi.scopePayload());
            try {
                await adminApi.saveMajorCategory(
                    majorCategoryDialog.isEdit ? majorCategoryForm._id : '',
                    data
                );
                ElMessage.success('保存成功');
                majorCategoryDialog.visible = false;
                loadMajorCategories();
            } catch (err) {
                ElMessage.error('保存失败');
            }
        };

        const deleteMajorCategory = async (row) => {
            if (row?.readOnly) {
                ElMessage.warning(`管理员分配的${majorLabel.value}不能删除`);
                return;
            }

            try {
                await ElMessageBox.confirm(`确定删除该${majorLabel.value}吗？`, '提示', { type: 'warning' });
                await adminApi.deleteMajorCategory(row._id);
                ElMessage.success('删除成功');
                loadMajorCategories();
            } catch (err) {
                if (err !== 'cancel') ElMessage.error('删除失败: ' + (err.response?.data?.message || err.message));
            }
        };

        const switchToExamView = async (subject) => {
            selectedMajorCategory.value = subject;
            isExamView.value = true;
            syncDashboardRouteState({ majorCategoryId: subject?._id || undefined });
            if (categories.value.length === 0) {
                await loadCategories();
            }
            resetDashboardViewport();
        };

        const backToSubjectList = () => {
            isExamView.value = false;
            selectedMajorCategory.value = null;
            syncDashboardRouteState({ majorCategoryId: undefined });
            resetDashboardViewport();
        };

        // --- Methods: Category Logic ---
        const openCategoryDialog = async (row = null) => {
            if ((row?.readOnly && !row?.canMove) || (!row && selectedMajorCategory.value?.readOnly)) {
                ElMessage.warning(`管理员分配的${categoryLabel.value}只能查看，不能编辑`);
                return;
            }

            // Ensure major categories are loaded for the dropdown
            if (majorCategories.value.length === 0) {
                await loadMajorCategories();
            }

            categoryDialog.visible = true;
            categoryDialog.isEdit = !!row;
            categoryDialog.moveOnly = !!(row?.readOnly && row?.canMove);
            if (row) {
                Object.assign(categoryForm, {
                    _id: row._id,
                    name: row.name,
                    description: row.description || '',
                    duration: row.duration || 0,
                    passingScore: row.passingScore || 60,
                    isPublished: row.isPublished !== false,
                    majorCategoryId: getMajorCategoryId(row.majorCategoryId)
                });
            } else {
                categoryDialog.moveOnly = false;
                Object.assign(categoryForm, {
                    _id: '',
                    name: '',
                    description: '',
                    duration: 0,
                    passingScore: 60,
                    isPublished: true,
                    majorCategoryId: selectedMajorCategory.value ? selectedMajorCategory.value._id : ''
                });
            }
        };

        const saveCategory = async () => {
            const data = categoryDialog.moveOnly
                ? { majorCategoryId: categoryForm.majorCategoryId || null }
                : {
                    name: categoryForm.name,
                    description: categoryForm.description,
                    duration: categoryForm.duration,
                    passingScore: categoryForm.passingScore,
                    isPublished: categoryForm.isPublished,
                    majorCategoryId: categoryForm.majorCategoryId || null
                };
            Object.assign(data, adminApi.scopePayload());
            try {
                await adminApi.saveCategory(
                    categoryDialog.isEdit ? categoryForm._id : '',
                    data
                );
                ElMessage.success(categoryDialog.moveOnly ? '分类已调整' : '保存成功');
                categoryDialog.visible = false;
                loadCategories();
            } catch (err) {
                ElMessage.error('保存失败');
            }
        };

        const deleteCategory = async (row) => {
            if (row?.readOnly && !row?.canDelete) {
                ElMessage.warning(`管理员分配的${categoryLabel.value}不能删除`);
                return;
            }

            try {
                const message = isConsoleMode.value
                    ? `确定删除该${categoryLabel.value}吗？其中的题目和练习记录也会一起删除。`
                    : `确定删除该${categoryLabel.value}吗？`;
                await ElMessageBox.confirm(message, '提示', { type: 'warning' });
                await adminApi.deleteCategory(row._id);
                ElMessage.success('删除成功');
                loadCategories();
            } catch (err) {
                if (err !== 'cancel') ElMessage.error('删除失败: ' + (err.response?.data?.message || err.message));
            }
        };

        const renderQrcodeToElement = async (el, text, size = 180) => {
            if (!el || !text) return;

            const QRCode = await loadQrcode();
            el.innerHTML = '';
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            canvas.style.width = `${size}px`;
            canvas.style.height = `${size}px`;
            el.appendChild(canvas);

            await QRCode.toCanvas(canvas, text, {
                width: size,
                margin: 1,
                errorCorrectionLevel: 'H',
                color: {
                    dark: '#111827',
                    light: '#ffffff',
                },
            });
        };

        // --- Methods: Paper Share Logic ---
        const {
            selectPaperShare,
            getPaperShareRowClass,
            openShareDialog,
            openCategoryAnalysis,
            createPaperShare,
            copyText,
            revokePaperShare,
        } = usePaperShares({
            adminApi,
            shareDialog,
            analysisDialog,
            isDemoManage,
            renderQrcodeToElement,
        });

        const openAcceptShareDialog = (code = '') => {
            acceptShareDialog.visible = true;
            acceptShareDialog.shareCode = normalizeShareCode(code);
            acceptShareDialog.preview = null;
            acceptShareDialog.sourceCategory = null;
            acceptShareDialog.alreadyAccepted = false;
            acceptShareDialog.importedCategory = null;
        };

        const previewPaperShare = async () => {
            const code = normalizeShareCode(acceptShareDialog.shareCode);
            if (!code) {
                ElMessage.warning('请输入分享码');
                return;
            }

            acceptShareDialog.loading = true;
            try {
                const res = await adminApi.previewPaperShare(code);
                const data = res.data.data || {};
                acceptShareDialog.shareCode = data.share?.shareCode || code;
                acceptShareDialog.preview = data.share || null;
                acceptShareDialog.sourceCategory = data.sourceCategory || null;
                acceptShareDialog.alreadyAccepted = !!data.alreadyAccepted;
                acceptShareDialog.importedCategory = data.importedCategory || null;
            } catch (err) {
                acceptShareDialog.preview = null;
                acceptShareDialog.sourceCategory = null;
                ElMessage.error(err.response?.data?.message || '分享码无效');
            } finally {
                acceptShareDialog.loading = false;
            }
        };

        const acceptPaperShare = async () => {
            const code = normalizeShareCode(acceptShareDialog.shareCode);
            if (!code) {
                ElMessage.warning('请输入分享码');
                return;
            }

            acceptShareDialog.accepting = true;
            try {
                const res = await adminApi.acceptPaperShare(code);
                const data = res.data.data || {};
                const saveLocationText = acceptShareSaveLocation.value;
                ElMessage.success(data.created
                    ? `分享接收成功，已保存到：${saveLocationText}`
                    : `你已接收过该分享，保存位置：${saveLocationText}`);
                acceptShareDialog.visible = false;
                activeMenu.value = 'major-categories';
                await Promise.all([loadMajorCategories(), loadCategories()]);
                const majorId = getMajorCategoryId(data.category?.majorCategoryId);
                selectedMajorCategory.value = majorCategories.value.find((item) => String(item._id) === String(majorId))
                    || majorCategories.value.find((item) => item.name === '来自分享')
                    || null;
                isExamView.value = Boolean(selectedMajorCategory.value);
            } catch (err) {
                ElMessage.error(err.response?.data?.message || '接收分享失败');
            } finally {
                acceptShareDialog.accepting = false;
            }
        };

        // --- Methods: Navigation ---
        const openQuestionQualityTarget = ({
            categoryId,
            questionId,
            scopeType: targetScope,
            issue,
            page,
            limit,
        } = {}) => {
            if (!categoryId || !questionId) {
                ElMessage.warning('题目定位信息不完整');
                return;
            }

            const qualityScopeType = normalizeQualityScope(targetScope);
            const qualityIssue = normalizeQualityIssue(issue);
            const query = {
                id: categoryId,
                questionId,
                returnMenu: 'question-quality',
                returnQualityScopeType: qualityScopeType,
                returnQualityPage: parseQualityInteger(page, 1, 1000, 1),
                returnQualityLimit: parseQualityInteger(limit, 1, 100, 20),
            };

            if (qualityIssue) query.returnQualityIssue = qualityIssue;

            if (isConsoleMode.value) {
                query.scopeType = 'personal';
            } else if (qualityScopeType === 'demo') {
                query.scopeType = 'demo';
            }

            router.push({ path: '/exam-detail', query });
        };

        const goToExamDetail = (examId) => {
            const query = {
                id: examId,
                returnMenu: activeMenu.value,
            };

            if (selectedMajorCategory.value?._id) {
                query.returnMajorCategoryId = selectedMajorCategory.value._id;
            }

            if (isConsoleMode.value) {
                query.scopeType = 'personal';
            } else if (isDemoManage.value) {
                query.scopeType = 'demo';
            }

            router.push({ path: '/exam-detail', query });
        };

        // --- Exam Results Logic ---
        const {
            examResults,
            examResultsFilter,
            selectedExamResults,
            examResultsTable,
            deleteDialog,
            handleExamResultSelection,
            clearExamResultSelection,
            openDeleteDialog,
            confirmBatchDelete,
            loadExamResults,
        } = useExamResults({
            adminApi,
            isConsoleMode,
            loading,
            beginViewRequest,
            finishViewRequest,
            quietRequestConfig,
        });

        // --- Feedback Logic ---
        const {
            feedbacks,
            feedbackFilter,
            feedbackCreateDialog,
            feedbackCreateForm,
            feedbackDetailDialog,
            feedbackReplyForm,
            loadFeedbacks,
            openFeedbackCreateDialog,
            submitFeedback,
            openFeedbackDetail,
            replyFeedback,
            closeFeedback,
        } = useFeedback({
            adminApi,
            isConsoleMode,
            beginViewRequest,
            finishViewRequest,
            quietRequestConfig,
            loadFeedbackSummary,
            isFeedbackReplyUnread,
        });

        // --- Personal Category Supervision Logic ---
        const {
            personalCategories,
            personalCategoryFilter,
            personalCategoryDialog,
            loadPersonalCategories,
            loadPersonalCategoryQuestions,
            openPersonalCategoryDetail,
        } = usePersonalCategories({
            adminApi,
            isConsoleMode,
            beginViewRequest,
            finishViewRequest,
            quietRequestConfig,
        });

        // --- User Management Logic ---
        const users = reactive({ list: [], total: 0 });
        const userSearchKeyword = ref('');
        const selectedUsers = ref([]);
        const usersTable = ref(null);
        let userSearchTimer = null;
        const formatStudyId = (openid = '') => String(openid || '').slice(0, 8).toUpperCase();
        const getUserCartoonAvatar = (user = {}) => {
            const seed = [
                user?.openid,
                user?.userId,
                user?.ownerOpenid,
                user?.studyId,
                user?.ownerStudyId,
                user?.username,
                user?.nickname,
                user?.displayName,
            ].filter(Boolean).join('|') || 'anonymous-user';
            return createCartoonAvatar(seed);
        };
        const getScoreToneClass = (score) => {
            const value = Number(score) || 0;
            if (value >= 90) {
                return 'excellent';
            }
            return value >= 60 ? 'pass' : 'fail';
        };
        const getAccuracyPercentage = (row = {}) => {
            const total = Number(row.totalCount) || 0;
            if (!total) {
                return 0;
            }
            return Math.round(((Number(row.correctCount) || 0) / total) * 100);
        };

        const examResultsListStats = computed(() => {
            const rows = examResults.list || [];
            const rowCount = rows.length;
            const scoreTotal = rows.reduce((sum, item) => sum + (Number(item.score) || 0), 0);
            const passCount = rows.filter((item) => (Number(item.score) || 0) >= 60).length;
            return {
                averageScore: rowCount ? Math.round(scoreTotal / rowCount) : 0,
                passRate: rowCount ? Math.round((passCount / rowCount) * 100) : 0,
                lowScoreCount: rows.filter((item) => (Number(item.score) || 0) < 60).length,
            };
        });

        const isWithinRecentDays = (value, days) => {
            const timestamp = new Date(value).getTime();
            if (!Number.isFinite(timestamp)) {
                return false;
            }
            return Date.now() - timestamp <= days * 24 * 60 * 60 * 1000;
        };

        const usersListStats = computed(() => {
            const rows = users.list || [];
            return {
                recentActiveCount: rows.filter((item) => isWithinRecentDays(item.lastActiveTime, 7)).length,
                assignedCount: rows.filter((item) => (
                    (Number(item.assignedMajorCategoryCount) || 0) > 0
                    || (Number(item.assignedCategoryCount) || 0) > 0
                )).length,
                examCount: rows.reduce((sum, item) => sum + (Number(item.examCount) || 0), 0),
            };
        });

        const personalCategoryListStats = computed(() => {
            const rows = personalCategories.list || [];
            return {
                publishedCount: rows.filter((item) => item.isPublished !== false).length,
                sharedCount: rows.filter((item) => item.sourceType === 'shared').length,
                questionCount: rows.reduce((sum, item) => sum + (Number(item.count) || 0), 0),
            };
        });

        const feedbackListStats = computed(() => {
            const rows = feedbacks.list || [];
            return {
                openCount: rows.filter((item) => item.status === 'open').length,
                repliedCount: rows.filter((item) => item.status === 'replied').length,
                unreadReplyCount: rows.filter((item) => isFeedbackReplyUnread(item)).length,
            };
        });

        // 用户详情弹窗
        const userDetailDialog = reactive({
            visible: false,
            loading: false,
            user: null,
            stats: null,
            trendData: null,
            history: []
        });
        const userTrendChartData = computed(() => {
            const data = userDetailDialog.trendData || {};
            const labels = Array.isArray(data.labels) ? data.labels : [];
            const scores = Array.isArray(data.scores) ? data.scores : [];
            return {
                labels,
                values: labels.map((_, index) => Number(scores[index]) || 0),
            };
        });

        // 用户删除弹窗
        const userDeleteDialog = reactive({
            visible: false,
            mathQuestion: '',
            mathAnswer: null,
            userInput: ''
        });
        // --- Learning Operations Logic ---
        const {
            learningPlans,
            cohorts,
            learningOpsTab,
            learningPlanOptions,
            cohortDialog,
            learningPlanDialog,
            learningOpsStats,
            formatLearningDeadline,
            learningPlanStateText,
            learningPlanStateType,
            learningCategoryLabel,
            loadLearningOperations,
            openCohortDialog,
            saveCohort,
            archiveCohort,
            openLearningPlanDialog,
            saveLearningPlan,
            archiveLearningPlan,
        } = useLearningOperations({
            adminApi,
            isConsoleMode,
            beginViewRequest,
            finishViewRequest,
            quietRequestConfig,
        });

        const loadUsers = async (page = 1) => {
            if (isConsoleMode.value) {
                return;
            }
            const controller = beginViewRequest('users');
            try {
                const res = await adminApi.listUsers({
                    page,
                    pageSize: 20,
                    keyword: userSearchKeyword.value || undefined
                }, quietRequestConfig(controller));
                if (controller.signal.aborted) return;
                if (res.data.code === 0) {
                    users.list = (res.data.data.list || []).map((item) => ({
                        ...item,
                        studyId: item.studyId || formatStudyId(item.openid),
                    }));
                    users.total = res.data.data.total;
                }
            } catch (err) {
                if (controller.signal.aborted) return;
                ElMessage.error('加载考生列表失败');
            } finally {
                finishViewRequest('users', controller);
            }
        };

        const openDashboardTarget = async (target) => {
            if (!target || !canAccessMenu(target)) {
                return;
            }

            activeMenu.value = target;
            mobileMenuVisible.value = false;
            syncDashboardRouteState({ majorCategoryId: undefined });

            if (target === 'exam-results') {
                await loadExamResults();
            } else if (target === 'users') {
                await loadUsers();
            } else if (target === 'feedbacks') {
                await loadFeedbacks();
            }
            resetDashboardViewport();
        };

        const handleDashboardAction = async (item) => {
            await openDashboardTarget(item?.target);
        };

        const handleDashboardRecentItem = async (item) => {
            const targetMap = {
                exam: 'exam-results',
                user: 'users',
                feedback: 'feedbacks',
            };
            await openDashboardTarget(targetMap[item?.kind]);
        };

        // 搜索用户
        const searchUsers = () => {
            if (isConsoleMode.value) {
                return;
            }
            if (userSearchTimer) {
                clearTimeout(userSearchTimer);
                userSearchTimer = null;
            }
            loadUsers(1);
        };

        const handleUserSearchInput = () => {
            if (isConsoleMode.value) {
                return;
            }
            if (userSearchTimer) {
                clearTimeout(userSearchTimer);
            }
            userSearchTimer = setTimeout(() => {
                loadUsers(1);
                userSearchTimer = null;
            }, 320);
        };

        // 表格多选
        const handleUserSelection = (selection) => {
            selectedUsers.value = selection;
        };

        const clearUserSelection = () => {
            usersTable.value?.clearSelection?.();
            selectedUsers.value = [];
        };

        // 查看用户详情
        const openUserDetail = async (user) => {
            if (isConsoleMode.value) {
                return;
            }
            userDetailDialog.visible = true;
            userDetailDialog.loading = true;
            userDetailDialog.user = null;
            userDetailDialog.stats = null;

            try {
                const res = await adminApi.getUserDetails(user.openid);
                if (res.data.code === 0) {
                    const data = res.data.data;
                    userDetailDialog.user = {
                        ...data.user,
                        studyId: data.user?.studyId || formatStudyId(data.user?.openid),
                    };
                    userDetailDialog.stats = data.stats;
                    userDetailDialog.trendData = data.trendData;
                    userDetailDialog.history = data.history;
                }
            } catch (err) {
                ElMessage.error('加载考生详情失败');
                userDetailDialog.visible = false;
            } finally {
                userDetailDialog.loading = false;
            }
        };

        // 生成数学题（用户删除验证）
        const generateUserMathQuestion = () => {
            const a = Math.floor(Math.random() * 20) + 1;
            const b = Math.floor(Math.random() * 20) + 1;
            const ops = ['+', '-', '×'];
            const op = ops[Math.floor(Math.random() * ops.length)];
            let answer;
            switch (op) {
                case '+': answer = a + b; break;
                case '-': answer = a - b; break;
                case '×': answer = a * b; break;
            }
            userDeleteDialog.mathQuestion = `${a} ${op} ${b} = ?`;
            userDeleteDialog.mathAnswer = answer;
            userDeleteDialog.userInput = '';
        };

        // 打开删除用户弹窗
        const openUserDeleteDialog = () => {
            if (isConsoleMode.value) {
                return;
            }
            if (selectedUsers.value.length === 0) {
                ElMessage.warning('请先选择要删除的考生');
                return;
            }
            generateUserMathQuestion();
            userDeleteDialog.visible = true;
        };

        // 确认批量删除用户
        const confirmDeleteUsers = async () => {
            if (isConsoleMode.value) {
                return;
            }
            const userAnswer = parseInt(userDeleteDialog.userInput);
            if (isNaN(userAnswer) || userAnswer !== userDeleteDialog.mathAnswer) {
                ElMessage.error('验证答案错误，请重新输入');
                generateUserMathQuestion();
                return;
            }

            try {
                loading.value = true;
                const openids = selectedUsers.value.map(u => u.openid);
                const res = await adminApi.deleteUsers(openids);

                if (res.data.code === 0) {
                    ElMessage.success(res.data.message);
                    userDeleteDialog.visible = false;
                    selectedUsers.value = [];
                    loadUsers();
                }
            } catch (err) {
                ElMessage.error('删除失败');
            } finally {
                loading.value = false;
            }
        };

        // 清空用户记录
        const clearUserRecords = async (user) => {
            if (isConsoleMode.value) {
                return;
            }
            try {
                await ElMessageBox.confirm(
                    `确定清空 "${user.nickname || '未命名考生'}" 的所有学习记录吗？此操作不可恢复！`,
                    '警告',
                    { type: 'warning', confirmButtonText: '确认清空', cancelButtonText: '取消' }
                );

                const res = await adminApi.clearUserRecords(user.openid);
                if (res.data.code === 0) {
                    ElMessage.success(res.data.message);
                    loadUsers();
                }
            } catch (err) {
                if (err !== 'cancel') {
                    ElMessage.error('清空记录失败');
                }
            }
        };



        const viewUserHistory = (user) => {
            if (isConsoleMode.value) {
                return;
            }
            if (!user) {
                return;
            }
            // Switch to exam results view and filter by this user
            userDetailDialog.visible = false;
            activeMenu.value = 'exam-results';
            examResultsFilter.userId = user.openid;
            examResultsFilter.categoryId = ''; // Reset category filter
            loadExamResults();
            ElMessage.info(`正在查看考生 ${user.nickname || user.studyId || formatStudyId(user.openid)} 的做题记录`);
        };

        const refreshUserInfo = async () => {
            try {
                const res = await adminApi.getProfile();
                if (res.data.code === 0) {
                    loggedInUser.value = res.data.data;
                    authType.value = session.getAuthType();
                    session.setUser(res.data.data);
                }
            } catch (e) {
                // 个人信息刷新失败不阻塞后台主流程，登录态以会话接口为准。
            }
        };

        // --- User Assignment Logic ---
        const {
            userAssignmentDialog,
            groupedAssignmentCategories,
            assignmentDialogStats,
            openUserAssignmentDialog,
            saveUserAssignments,
        } = useUserAssignments({
            adminApi,
            isConsoleMode,
            loadUsers,
        });

        // --- Wechat Binding Logic ---
        const {
            bindDialog,
            openBindDialog,
            stopBindRequests,
            unbindWechat,
        } = useWechatBinding({
            adminApi,
            isConsoleMode,
            getScanLoginConfig,
            renderQrcodeToElement,
            refreshUserInfo,
        });

        // --- Methods: Change Password ---
        const {
            passwordDialog,
            passwordForm,
            openPasswordDialog,
            submitChangePassword,
        } = usePasswordDialog({
            adminApi,
            isConsoleMode,
            isPlatformSso: IS_PLATFORM_SSO,
            onChanged: () => {
                setTimeout(() => {
                    session.clear();
                    router.push('/login');
                }, 1500);
            },
        });

        
</script>

<style>
@import '@my-platform/pearl-tokens/tokens.css';
@import '@my-platform/pearl-tokens/components.css';
@import '@/assets/css/pearl-shell.css';
@import '@/assets/css/pearl-admin.css';
@import '@/assets/css/pearl-views.css';
</style>
