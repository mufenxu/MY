<template>
<div class="dashboard-page">

        <!-- Mobile Header -->
        <div class="mobile-header">
            <div class="logo mobile-header-logo">
                <span class="logo-mark"><img :src="faviconUrl" alt="好爱学习"></span>
                <span>好爱学习</span>
            </div>
            <button type="button" class="mobile-menu-trigger" aria-label="打开导航菜单" @click="mobileMenuVisible = true">
                <span></span>
                <span></span>
                <span></span>
                <span></span>
            </button>
        </div>

        <!-- Mobile Menu Drawer -->
        <el-drawer v-model="mobileMenuVisible" direction="ltr" size="260px" :with-header="false"
            aria-label="导航菜单" class="mobile-menu-drawer">
            <el-aside width="100%" class="mobile-drawer-aside">
                <div class="logo">
                    <span class="logo-mark"><img :src="faviconUrl" alt="好爱学习"></span>
                    <span>好爱学习</span>
                </div>
                <DashboardNavMenu
                    :active-menu="activeMenu"
                    :console-mode="isConsoleMode"
                    :manage-menu-label="manageMenuLabel"
                    :feedback-menu-label="feedbackMenuLabel"
                    :feedback-badge-count="feedbackBadgeCount"
                    @select="handleMenuSelect"
                />
                <div class="aside-footer mobile-aside-footer">
                    <a
                        v-if="IS_PLATFORM_SSO"
                        class="platform-console-link platform-console-link-mobile"
                        href="/console"
                        aria-label="返回统一服务控制台"
                    >
                        <el-icon><Grid /></el-icon>
                        <span>统一控制台</span>
                    </a>
                    <div class="user-info">
                        <el-icon>
                            <User />
                        </el-icon>
                        <span>{{ displayName }}</span>
                    </div>
                    <el-button type="danger" plain class="mobile-logout-button" @click="handleLogout">
                        <el-icon class="button-leading-icon">
                            <SwitchButton />
                        </el-icon> 退出
                    </el-button>
                </div>
            </el-aside>
        </el-drawer>

        <el-container>
            <!-- Desktop Aside -->
            <el-aside width="260px" class="desktop-aside">
                <div class="logo">
                    <span class="logo-mark"><img :src="faviconUrl" alt="好爱学习"></span>
                    <span>好爱学习</span>
                </div>
                <DashboardNavMenu
                    :active-menu="activeMenu"
                    :console-mode="isConsoleMode"
                    :manage-menu-label="manageMenuLabel"
                    :feedback-menu-label="feedbackMenuLabel"
                    :feedback-badge-count="feedbackBadgeCount"
                    @select="handleMenuSelect"
                />

                <!-- User Account Menu -->
                <div class="aside-footer">
                    <el-tooltip v-if="IS_PLATFORM_SSO" content="返回统一服务控制台" placement="bottom">
                        <a class="platform-console-link" href="/console" aria-label="返回统一服务控制台">
                            <el-icon><Grid /></el-icon>
                            <span>统一控制台</span>
                        </a>
                    </el-tooltip>
                    <el-popover
                        v-model:visible="userMenuVisible"
                        trigger="click"
                        placement="bottom-end"
                        width="230"
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
                            <button type="button" class="user-profile-card">
                                <img class="profile-cartoon-avatar" :src="getUserCartoonAvatar(loggedInUser)" alt="">
                                <div class="user-profile-info">
                                    <div class="user-profile-name">{{ displayName }}</div>
                                    <div class="user-profile-status" :class="{ 'is-bound': !isConsoleMode && loggedInUser.isWechatBound }">
                                        <el-icon v-if="!isConsoleMode && loggedInUser.isWechatBound">
                                            <SuccessFilled />
                                        </el-icon>
                                        <el-icon v-else-if="!isConsoleMode">
                                            <Warning />
                                        </el-icon>
                                        <el-icon v-else>
                                            <User />
                                        </el-icon>
                                        <span>{{ roleText }}</span>
                                    </div>
                                </div>
                                <el-icon class="user-profile-arrow"><ArrowDown /></el-icon>
                            </button>
                        </template>
                    </el-popover>
                </div>
            </el-aside>

            <el-container>
                <el-main>

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
                                <div class="empty-icon">📁</div>
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
                                <div class="empty-icon">📝</div>
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
                                <el-table-column label="成绩" width="150" align="center">
                                    <template #default="scope">
                                        <div class="score-badge" :class="getScoreToneClass(scope.row.score)">
                                            <span class="score-value">{{ scope.row.score }}</span>
                                            <span class="score-unit">分</span>
                                        </div>
                                    </template>
                                </el-table-column>
                                <el-table-column label="答题详情" width="190" align="center">
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
                </el-main>
            </el-container>
        </el-container>



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
                    <el-switch v-model="majorCategoryForm.showOnHome" active-text="显示" inactive-text="隐藏"
                        class="success-switch"></el-switch>
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
                    <el-switch v-model="categoryForm.isPublished" active-text="已发布" inactive-text="已隐藏"></el-switch>
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
                            <el-switch v-model="shareDialog.form.maxAcceptEnabled" active-text="限制"
                                inactive-text="不限"></el-switch>
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
import { fetchWithTimeout, IS_PLATFORM_SSO, logoutPlatformSession, resolveAppUrl } from '@/utils/runtime';
import { createSequentialPoller } from '@/utils/sequentialPoller';
import DashboardNavMenu from '@/components/DashboardNavMenu.vue';

const MiniLineChart = defineAsyncComponent(() => import('@/components/MiniLineChart.vue'));
const QuestionQualityView = defineAsyncComponent(() => import('@/components/QuestionQualityView.vue'));

const route = useRoute();
const router = useRouter();
const faviconUrl = resolveAppUrl('/favicon.png');
const EXAM_DETAIL_BODY_CLASS = 'exam-detail-active';

// Interceptors are configured globally in main.js via setupHttp


        
        
        const activeMenu = ref('dashboard');
        const loading = ref(false);
        const viewLoading = reactive({
            dashboard: false,
            dashboardRecent: false,
            majorCategories: false,
            categories: false,
            examResults: false,
            users: false,
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
        const feedbackBadgeCount = ref(0);
        const fourthStatLabel = computed(() => (isConsoleMode.value ? '已发布题库' : '累计考试'));
        const hasAdminSecurityActions = computed(() => !isConsoleMode.value);
        let fourthStatValue;
        let consolePracticeCount;
        let displayName;
        let roleText;
        const allowedMenus = computed(() => (
            isConsoleMode.value
                ? ['dashboard', 'major-categories', 'question-quality', 'feedbacks']
                : ['dashboard', 'major-categories', 'exam-results', 'users', 'personal-categories', 'question-quality', 'feedbacks']
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
        consolePracticeCount = computed(() => (dashboardStats.error ? '--' : (dashboardStats.counts.practiceRecords || 0)));
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
        const bindDialog = reactive({
            visible: false,
            qrToken: '',
            pollToken: '',
            statusText: '正在获取二维码...'
        });
        let bindPoller = null;
        let bindPollErrorCount = 0;
        let bindCreateController = null;
        let bindCreateSequence = 0;
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

        const formatAvatar = (url) => {
            const defaultAvatar = 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0';
            if (!url || url.startsWith('wxfile://')) return defaultAvatar;
            return url;
        };

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

        const refreshData = () => {
            if (activeMenu.value === 'dashboard') loadDashboardData();
            if (activeMenu.value === 'major-categories' || activeMenu.value === 'demo-manage') {
                loadMajorCategories();
            }
            if (activeMenu.value === 'categories') loadCategories();
            if (activeMenu.value === 'exam-results') loadExamResults(1);
            if (activeMenu.value === 'users') loadUsers(1);
            if (activeMenu.value === 'personal-categories') loadPersonalCategories(personalCategories.page || 1);
            if (activeMenu.value === 'feedbacks') loadFeedbacks();
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

        const resetShareForm = () => {
            Object.assign(shareDialog.form, {
                permission: 'view',
                expireMode: '7d',
                customExpiresAt: '',
                maxAcceptEnabled: false,
                maxAcceptCount: 0,
                note: ''
            });
            shareDialog.result = null;
            shareDialog.selectedShareId = '';
        };

        const buildShareExpiresAt = () => {
            const mode = shareDialog.form.expireMode;
            if (mode === 'forever') return null;
            if (mode === 'custom') {
                return shareDialog.form.customExpiresAt || null;
            }

            const daysMap = {
                '1d': 1,
                '7d': 7,
                '30d': 30
            };
            const days = daysMap[mode] || 7;
            return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
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

        const renderShareQrcode = (scrollToResult = false) => {
            nextTick(async () => {
                const el = document.getElementById('paper-share-qrcode');
                if (!el || !shareDialog.result) return;
                const text = shareDialog.result.shareUrl || shareDialog.result.shareCode;
                try {
                    await renderQrcodeToElement(el, text, 180);
                    if (scrollToResult) {
                        document.querySelector('.share-result-panel')?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'nearest',
                        });
                    }
                } catch (err) {
                    console.error('Render share QR code error:', err);
                    ElMessage.error('二维码生成失败，请复制分享链接');
                }
            });
        };

        const getPaperShareIdentity = (share) => String(share?._id || share?.shareCode || '');

        const selectPaperShare = (share) => {
            if (!share) return;
            shareDialog.result = { ...share };
            shareDialog.selectedShareId = getPaperShareIdentity(share);
            renderShareQrcode(true);
        };

        const getPaperShareRowClass = ({ row }) => (
            shareDialog.selectedShareId && getPaperShareIdentity(row) === shareDialog.selectedShareId
                ? 'is-selected-share'
                : ''
        );

        const loadPaperShares = async () => {
            if (!shareDialog.category?._id) return;
            shareDialog.loading = true;
            try {
                const res = await adminApi.listPaperShares(shareDialog.category._id);
                shareDialog.shares = res.data.data || [];
            } catch (err) {
                ElMessage.error('加载分享记录失败');
            } finally {
                shareDialog.loading = false;
            }
        };

        const openShareDialog = async (exam) => {
            if (isDemoManage.value) {
                ElMessage.warning('示例题库不支持分享');
                return;
            }
            if (exam?.readOnly) {
                ElMessage.warning('只读试卷不能继续分享');
                return;
            }

            shareDialog.category = exam;
            shareDialog.visible = true;
            resetShareForm();
            shareDialog.shares = [];
            await loadPaperShares();
        };

        const openCategoryAnalysis = async (exam) => {
            if (!exam?._id) return;

            analysisDialog.category = exam;
            analysisDialog.visible = true;
            analysisDialog.loading = true;
            analysisDialog.data = null;

            try {
                const res = await adminApi.getCategoryAnalysis(exam._id);
                analysisDialog.data = res.data.data;
            } catch (err) {
                console.error('Load category analysis error:', err);
                ElMessage.error(err.response?.data?.message || '加载试卷分析失败');
            } finally {
                analysisDialog.loading = false;
            }
        };

        const createPaperShare = async () => {
            if (!shareDialog.category?._id) return;
            const expiresAt = buildShareExpiresAt();
            if (shareDialog.form.expireMode === 'custom' && !expiresAt) {
                ElMessage.warning('请选择自定义过期时间');
                return;
            }

            shareDialog.saving = true;
            try {
                const res = await adminApi.createPaperShare(shareDialog.category._id, {
                    permission: shareDialog.form.permission,
                    expiresAt,
                    maxAcceptCount: shareDialog.form.maxAcceptEnabled
                        ? Number(shareDialog.form.maxAcceptCount || 0)
                        : 0,
                    note: shareDialog.form.note || ''
                });
                shareDialog.result = res.data.data;
                shareDialog.selectedShareId = getPaperShareIdentity(shareDialog.result);
                ElMessage.success('分享已生成');
                await loadPaperShares();
                renderShareQrcode();
            } catch (err) {
                ElMessage.error(err.response?.data?.message || '生成分享失败');
            } finally {
                shareDialog.saving = false;
            }
        };

        const copyText = async (text, successText = '已复制') => {
            const value = String(text || '');
            if (!value) return;
            try {
                if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(value);
                } else {
                    const textarea = document.createElement('textarea');
                    textarea.value = value;
                    textarea.setAttribute('readonly', '');
                    textarea.style.position = 'fixed';
                    textarea.style.opacity = '0';
                    textarea.style.left = '-9999px';
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                }
                ElMessage.success(successText);
            } catch (err) {
                ElMessage.error('复制失败，请手动复制');
            }
        };

        const revokePaperShare = async (share) => {
            try {
                await ElMessageBox.confirm('撤销后该分享码将不能继续被接收，确定撤销吗？', '撤销分享', { type: 'warning' });
                await adminApi.revokePaperShare(share._id);
                ElMessage.success('分享已撤销');
                await loadPaperShares();
            } catch (err) {
                if (err !== 'cancel') {
                    ElMessage.error(err.response?.data?.message || '撤销失败');
                }
            }
        };

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
        const examResults = reactive({ list: [], total: 0 });
        const examResultsFilter = reactive({ categoryId: '', userId: '' });
        const selectedExamResults = ref([]);  // 选中的记录
        const examResultsTable = ref(null);

        // 批量删除弹窗
        const deleteDialog = reactive({
            visible: false,
            mathQuestion: '',    // 数学题
            mathAnswer: null,    // 正确答案
            userInput: ''        // 用户输入
        });

        // 处理表格多选
        const handleExamResultSelection = (selection) => {
            selectedExamResults.value = selection;
        };

        const clearExamResultSelection = () => {
            examResultsTable.value?.clearSelection?.();
            selectedExamResults.value = [];
        };

        // 生成数学题
        const generateMathQuestion = () => {
            const a = Math.floor(Math.random() * 20) + 1;
            const b = Math.floor(Math.random() * 20) + 1;
            const operators = ['+', '-', '×'];
            const op = operators[Math.floor(Math.random() * operators.length)];

            let answer;
            switch (op) {
                case '+': answer = a + b; break;
                case '-': answer = a - b; break;
                case '×': answer = a * b; break;
            }

            deleteDialog.mathQuestion = `${a} ${op} ${b} = ?`;
            deleteDialog.mathAnswer = answer;
            deleteDialog.userInput = '';
        };

        // 打开删除确认弹窗
        const openDeleteDialog = () => {
            if (isConsoleMode.value) {
                return;
            }
            if (selectedExamResults.value.length === 0) {
                ElMessage.warning('请先选择要删除的记录');
                return;
            }
            generateMathQuestion();
            deleteDialog.visible = true;
        };

        // 确认批量删除
        const confirmBatchDelete = async () => {
            if (isConsoleMode.value) {
                return;
            }
            const userAnswer = parseInt(deleteDialog.userInput);
            if (isNaN(userAnswer) || userAnswer !== deleteDialog.mathAnswer) {
                ElMessage.error('验证答案错误，请重新输入');
                generateMathQuestion();  // 生成新题目
                return;
            }

            try {
                loading.value = true;
                const ids = selectedExamResults.value.map(item => item._id);
                const res = await adminApi.deleteExamResults(ids);

                if (res.data.code === 0) {
                    ElMessage.success(res.data.message);
                    deleteDialog.visible = false;
                    selectedExamResults.value = [];
                    loadExamResults();  // 刷新列表
                }
            } catch (err) {
                ElMessage.error('删除失败: ' + (err.response?.data?.message || err.message));
            } finally {
                loading.value = false;
            }
        };

        const loadExamResults = async (page = 1) => {
            if (isConsoleMode.value) {
                return;
            }
            const controller = beginViewRequest('examResults');
            try {
                const res = await adminApi.listExamResults({
                    page,
                    pageSize: 20,
                    categoryId: examResultsFilter.categoryId || undefined,
                    userId: examResultsFilter.userId || undefined
                }, quietRequestConfig(controller));
                if (controller.signal.aborted) return;
                if (res.data.code === 0) {
                    examResults.list = res.data.data.list;
                    examResults.total = res.data.data.total;
                }
            } catch (err) {
                if (controller.signal.aborted) return;
                ElMessage.error('加载考试记录失败');
            } finally {
                finishViewRequest('examResults', controller);
            }
        };

        // --- Feedback Logic ---
        const feedbacks = reactive({ list: [], total: 0, page: 1, limit: 20 });
        const feedbackFilter = reactive({
            status: '',
            keyword: '',
        });
        const feedbackCreateDialog = reactive({
            visible: false,
            saving: false,
        });
        const feedbackCreateForm = reactive({
            category: 'bug',
            title: '',
            content: '',
            contact: '',
        });
        const feedbackDetailDialog = reactive({
            visible: false,
            saving: false,
            item: null,
        });
        const feedbackReplyForm = reactive({
            replyContent: '',
            closeAfterReply: false,
        });

        const loadFeedbacks = async (page = 1) => {
            const controller = beginViewRequest('feedbacks');
            try {
                const res = await adminApi.listFeedbacks({
                    page,
                    limit: feedbacks.limit,
                    status: feedbackFilter.status || undefined,
                    keyword: isConsoleMode.value ? undefined : (feedbackFilter.keyword || undefined),
                }, quietRequestConfig(controller));
                if (controller.signal.aborted) return;
                if (res.data.code === 0) {
                    feedbacks.list = res.data.data.list || [];
                    feedbacks.total = res.data.data.total || 0;
                    feedbacks.page = res.data.data.page || page;
                    feedbacks.limit = res.data.data.limit || feedbacks.limit;
                    await loadFeedbackSummary();
                }
            } catch (err) {
                if (controller.signal.aborted) return;
                ElMessage.error('加载反馈失败');
            } finally {
                finishViewRequest('feedbacks', controller);
            }
        };

        const openFeedbackCreateDialog = () => {
            if (!isConsoleMode.value) {
                return;
            }
            Object.assign(feedbackCreateForm, {
                category: 'bug',
                title: '',
                content: '',
                contact: '',
            });
            feedbackCreateDialog.visible = true;
        };

        const submitFeedback = async () => {
            if (!isConsoleMode.value) {
                return;
            }
            if (!feedbackCreateForm.title.trim() || !feedbackCreateForm.content.trim()) {
                ElMessage.warning('请填写反馈标题和详细说明');
                return;
            }

            try {
                feedbackCreateDialog.saving = true;
                const res = await adminApi.createFeedback({
                    category: feedbackCreateForm.category,
                    title: feedbackCreateForm.title.trim(),
                    content: feedbackCreateForm.content.trim(),
                    contact: feedbackCreateForm.contact.trim(),
                });
                if (res.data.code === 0) {
                    ElMessage.success('反馈已提交');
                    feedbackCreateDialog.visible = false;
                    await loadFeedbacks(1);
                    await loadFeedbackSummary();
                }
            } catch (err) {
                ElMessage.error(err.response?.data?.message || '提交反馈失败');
            } finally {
                feedbackCreateDialog.saving = false;
            }
        };

        const openFeedbackDetail = async (item) => {
            feedbackDetailDialog.item = item;
            feedbackReplyForm.replyContent = item.replyContent || '';
            feedbackReplyForm.closeAfterReply = false;
            feedbackDetailDialog.visible = true;

            if (isFeedbackReplyUnread(item)) {
                try {
                    const res = await adminApi.markFeedbackReplyRead(item._id);
                    if (res.data.code === 0) {
                        const readAt = res.data.data?.replyReadAt || new Date().toISOString();
                        item.replyReadAt = readAt;
                        if (feedbackDetailDialog.item?._id === item._id) {
                            feedbackDetailDialog.item.replyReadAt = readAt;
                        }
                        await loadFeedbackSummary();
                    }
                } catch (err) {
                    // Reading the detail should not be blocked by a best-effort read receipt update.
                }
            }
        };

        const replyFeedback = async () => {
            if (isConsoleMode.value || !feedbackDetailDialog.item?._id) {
                return;
            }
            if (!feedbackReplyForm.replyContent.trim()) {
                ElMessage.warning('请输入回复内容');
                return;
            }

            try {
                feedbackDetailDialog.saving = true;
                const res = await adminApi.replyFeedback(feedbackDetailDialog.item._id, {
                    replyContent: feedbackReplyForm.replyContent.trim(),
                    closeAfterReply: feedbackReplyForm.closeAfterReply,
                });
                if (res.data.code === 0) {
                    ElMessage.success('回复已保存');
                    feedbackDetailDialog.visible = false;
                    await loadFeedbacks(feedbacks.page);
                    await loadFeedbackSummary();
                }
            } catch (err) {
                ElMessage.error(err.response?.data?.message || '保存回复失败');
            } finally {
                feedbackDetailDialog.saving = false;
            }
        };

        const closeFeedback = async (item) => {
            if (isConsoleMode.value || !item?._id) {
                return;
            }

            try {
                await ElMessageBox.confirm('确定关闭这条反馈吗？关闭后仍可查看历史回复。', '关闭反馈', {
                    type: 'warning',
                    confirmButtonText: '确认关闭',
                    cancelButtonText: '取消',
                });
                const res = await adminApi.updateFeedbackStatus(item._id, { status: 'closed' });
                if (res.data.code === 0) {
                    ElMessage.success('反馈已关闭');
                    feedbackDetailDialog.visible = false;
                    await loadFeedbacks(feedbacks.page);
                    await loadFeedbackSummary();
                }
            } catch (err) {
                if (err !== 'cancel') {
                    ElMessage.error(err.response?.data?.message || '关闭反馈失败');
                }
            }
        };

        // --- Personal Category Supervision Logic ---
        const personalCategories = reactive({
            list: [],
            total: 0,
            page: 1,
            limit: 20,
        });
        const personalCategoryFilter = reactive({
            keyword: '',
            ownerStudyId: '',
            publishStatus: 'all',
            source: 'all',
        });
        const personalCategoryDialog = reactive({
            visible: false,
            loading: false,
            questionsLoading: false,
            category: null,
            stats: null,
            questions: [],
            questionsTotal: 0,
            questionsPage: 1,
            questionsLimit: 50,
        });

        const buildPersonalCategoryParams = (page = 1) => ({
            page,
            limit: personalCategories.limit,
            keyword: personalCategoryFilter.keyword || undefined,
            ownerStudyId: personalCategoryFilter.ownerStudyId || undefined,
            publishStatus: personalCategoryFilter.publishStatus || 'all',
            source: personalCategoryFilter.source || 'all',
        });

        const loadPersonalCategories = async (page = 1) => {
            if (isConsoleMode.value) {
                return;
            }
            const controller = beginViewRequest('personalCategories');
            try {
                const res = await adminApi.listPersonalCategories(
                    buildPersonalCategoryParams(page),
                    quietRequestConfig(controller),
                );
                if (controller.signal.aborted) return;
                if (res.data.code === 0) {
                    const data = res.data.data || {};
                    personalCategories.list = data.list || [];
                    personalCategories.total = data.total || 0;
                    personalCategories.page = data.page || page;
                    personalCategories.limit = data.limit || personalCategories.limit;
                }
            } catch (err) {
                if (controller.signal.aborted) return;
                ElMessage.error(err.response?.data?.message || '加载个人题库失败');
            } finally {
                finishViewRequest('personalCategories', controller);
            }
        };

        const loadPersonalCategoryQuestions = async (page = 1) => {
            const categoryId = personalCategoryDialog.category?._id;
            if (!categoryId) {
                return;
            }
            personalCategoryDialog.questionsLoading = true;
            try {
                const res = await adminApi.listPersonalCategoryQuestions(categoryId, {
                    page,
                    limit: personalCategoryDialog.questionsLimit,
                });
                if (res.data.code === 0) {
                    const data = res.data.data || {};
                    personalCategoryDialog.questions = data.list || [];
                    personalCategoryDialog.questionsTotal = data.total || 0;
                    personalCategoryDialog.questionsPage = data.page || page;
                    personalCategoryDialog.questionsLimit = data.limit || personalCategoryDialog.questionsLimit;
                    if (data.category) {
                        personalCategoryDialog.category = data.category;
                    }
                }
            } catch (err) {
                ElMessage.error(err.response?.data?.message || '加载题目失败');
            } finally {
                personalCategoryDialog.questionsLoading = false;
            }
        };

        const openPersonalCategoryDetail = async (row) => {
            if (!row?._id || isConsoleMode.value) {
                return;
            }

            personalCategoryDialog.visible = true;
            personalCategoryDialog.loading = true;
            personalCategoryDialog.category = row;
            personalCategoryDialog.stats = null;
            personalCategoryDialog.questions = [];
            personalCategoryDialog.questionsTotal = 0;
            personalCategoryDialog.questionsPage = 1;

            try {
                const res = await adminApi.getPersonalCategory(row._id);
                if (res.data.code === 0) {
                    const data = res.data.data || {};
                    personalCategoryDialog.category = data.category || row;
                    personalCategoryDialog.stats = data.stats || null;
                }
                await loadPersonalCategoryQuestions(1);
            } catch (err) {
                ElMessage.error(err.response?.data?.message || '加载个人题库详情失败');
                personalCategoryDialog.visible = false;
            } finally {
                personalCategoryDialog.loading = false;
            }
        };

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
        const userAssignmentDialog = reactive({
            visible: false,
            loading: false,
            saving: false,
            user: null,
            filterMajorIds: [],
            form: {
                majorCategoryIds: [],
                categoryIds: [],
            },
            options: {
                majorCategories: [],
                categories: [],
            },
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
            } catch (e) { }
        };

        // --- Methods: Bind Logic ---
        const openBindDialog = () => {
            if (isConsoleMode.value) {
                ElMessage.info('个人题库身份使用扫码登录，无需单独绑定微信');
                return;
            }
            if (!getScanLoginConfig().enabled) {
                ElMessage.warning('扫码绑定暂未开启');
                return;
            }
            bindDialog.visible = true;
            bindDialog.statusText = '正在获取二维码...';
            // Clear old code
            nextTick(() => {
                if (document.getElementById('bind-qrcode')) {
                    document.getElementById('bind-qrcode').innerHTML = '';
                }
            });
            initBindQrcode();
        };

        const initBindQrcode = async () => {
            stopBindRequests();
            bindPollErrorCount = 0;

            if (!getScanLoginConfig().enabled) {
                bindDialog.statusText = '扫码绑定未开启';
                return;
            }

            const requestSequence = bindCreateSequence;
            const controller = new AbortController();
            bindCreateController = controller;

            const oldQrToken = sessionStorage.getItem('bind_qr_token') || '';

            try {
                const requestBody = {
                    intent: 'admin_bind',
                };
                if (oldQrToken) {
                    requestBody.oldQrToken = oldQrToken;
                }
                const res = await fetchWithTimeout(`${getScanLoginConfig().apiBase}/qrcode/create`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody),
                    signal: controller.signal,
                });
                const payload = await res.json();
                if (controller.signal.aborted || requestSequence !== bindCreateSequence) return;
                const data = payload.data || payload;
                if (res.ok && payload.code === 0 && data.qrToken && data.pollToken) {
                    bindDialog.qrToken = data.qrToken;
                    bindDialog.pollToken = data.pollToken;
                    sessionStorage.setItem('bind_qr_token', data.qrToken);
                    sessionStorage.setItem('bind_qr_poll_token', data.pollToken);

                    const codeContent = data.qrCodeText || `miniprogram-login://scan?qrToken=${data.qrToken}`;

                    nextTick(async () => {
                        try {
                            if (controller.signal.aborted || requestSequence !== bindCreateSequence) return;
                            await renderQrcodeToElement(document.getElementById('bind-qrcode'), codeContent, 180);
                            if (controller.signal.aborted || requestSequence !== bindCreateSequence) return;
                        } catch (err) {
                            console.error('Render bind QR code error:', err);
                            bindDialog.statusText = '浜岀淮鐮佺敓鎴愬け璐ワ紝璇峰埛鏂板悗閲嶈瘯';
                        }
                    });

                    bindDialog.statusText = '请在小程序“我的 -> 扫码登录电脑端”中扫码';
                    startBindPolling();
                } else {
                    bindDialog.statusText = '二维码获取失败: ' + ((payload && payload.message) || '未知错误');
                }
            } catch (err) {
                if (controller.signal.aborted || requestSequence !== bindCreateSequence) return;
                bindDialog.statusText = '网络请求失败，请稍后重试';
            } finally {
                if (bindCreateController === controller) {
                    bindCreateController = null;
                }
            }
        };

        const categoryMajorIdMap = computed(() => {
            const map = {};
            (userAssignmentDialog.options.categories || []).forEach((item) => {
                const majorId = item.majorCategoryId?._id || item.majorCategoryId || '';
                map[item._id] = majorId ? String(majorId) : '';
            });
            return map;
        });

        const groupedAssignmentCategories = computed(() => {
            const groups = {};
            const majorMap = {};
            (userAssignmentDialog.options.majorCategories || []).forEach((item) => {
                majorMap[item._id] = item;
            });

            const filterSet = new Set(userAssignmentDialog.filterMajorIds || []);

            (userAssignmentDialog.options.categories || []).forEach((item) => {
                const majorId = item.majorCategoryId?._id || item.majorCategoryId || '';
                
                if (filterSet.size > 0 && !filterSet.has(String(majorId))) {
                    return;
                }

                const groupKey = majorId ? String(majorId) : 'ungrouped';
                if (!groups[groupKey]) {
                    groups[groupKey] = {
                        id: groupKey,
                        name: majorId ? (majorMap[groupKey]?.name || '未命名科目') : '未分组试卷',
                        sortOrder: majorId ? (majorMap[groupKey]?.sortOrder || 0) : 999999,
                        items: [],
                    };
                }
                groups[groupKey].items.push(item);
            });

            return Object.values(groups)
                .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh-Hans-CN'))
                .map((group) => ({
                    ...group,
                    items: group.items.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN')),
                }));
        });

        const assignmentDialogStats = computed(() => {
            const selectedIds = new Set(userAssignmentDialog.form.categoryIds || []);
            const visibleCount = groupedAssignmentCategories.value
                .reduce((sum, group) => sum + group.items.length, 0);

            return {
                selectedCount: selectedIds.size,
                visibleCount,
            };
        });

        const openUserAssignmentDialog = async (user) => {
            if (isConsoleMode.value) {
                return;
            }
            userAssignmentDialog.visible = true;
            userAssignmentDialog.loading = true;
            userAssignmentDialog.user = user;
            userAssignmentDialog.filterMajorIds = [];
            userAssignmentDialog.form.majorCategoryIds = [];
            userAssignmentDialog.form.categoryIds = [];
            userAssignmentDialog.options.majorCategories = [];
            userAssignmentDialog.options.categories = [];

            try {
                const res = await adminApi.getUserAssignments(user.openid);
                if (res.data.code === 0) {
                    const data = res.data.data || {};
                    const majorIds = (data.assignment?.majorCategoryIds || []).map(String);
                    const catIds = new Set((data.assignment?.categoryIds || []).map(String));
                    
                    if (majorIds.length > 0) {
                        const majorIdSet = new Set(majorIds);
                        (data.availableCategories || []).forEach(cat => {
                            const catMajorId = cat.majorCategoryId?._id || cat.majorCategoryId || '';
                            if (majorIdSet.has(String(catMajorId))) {
                                catIds.add(String(cat._id));
                            }
                        });
                    }
                    
                    userAssignmentDialog.form.majorCategoryIds = [];
                    userAssignmentDialog.form.categoryIds = Array.from(catIds);
                    userAssignmentDialog.options.majorCategories = data.availableMajorCategories || [];
                    userAssignmentDialog.options.categories = data.availableCategories || [];
                }
            } catch (err) {
                ElMessage.error('加载分配数据失败');
                userAssignmentDialog.visible = false;
            } finally {
                userAssignmentDialog.loading = false;
            }
        };

        const saveUserAssignments = async () => {
            if (isConsoleMode.value || !userAssignmentDialog.user?.openid) {
                return;
            }

            try {
                userAssignmentDialog.saving = true;
                const res = await adminApi.saveUserAssignments(userAssignmentDialog.user.openid, {
                    majorCategoryIds: [],
                    categoryIds: userAssignmentDialog.form.categoryIds,
                });
                if (res.data.code === 0) {
                    ElMessage.success('分配保存成功');
                    userAssignmentDialog.visible = false;
                    loadUsers();
                }
            } catch (err) {
                ElMessage.error(err.response?.data?.message || '分配保存失败');
            } finally {
                userAssignmentDialog.saving = false;
            }
        };

        const startBindPolling = () => {
            stopBindPolling();
            bindPoller = createSequentialPoller(async (signal) => {
                    const res = await fetchWithTimeout(
                        `${getScanLoginConfig().apiBase}/qrcode/status?qrToken=${encodeURIComponent(bindDialog.qrToken)}&pollToken=${encodeURIComponent(bindDialog.pollToken)}`,
                        { cache: 'no-store', signal },
                        8000,
                    );
                    const payload = await res.json();
                    if (!res.ok || payload.code !== 0) {
                        throw new Error(payload.message || '二维码状态获取失败');
                    }
                    bindPollErrorCount = 0;
                    const data = payload.data || payload;

                    if (data.status === 'scanned') {
                        bindDialog.statusText = '已扫码，请在手机确认';
                    } else if (data.status === 'confirmed') {
                        sessionStorage.removeItem('bind_qr_token');
                        sessionStorage.removeItem('bind_qr_poll_token');
                        bindDialog.statusText = '验证成功，正在绑定...';
                        await doBind(data.tempAuthCode);
                        return false;
                    } else if (data.status === 'expired' || data.status === 'cancelled') {
                        sessionStorage.removeItem('bind_qr_token');
                        sessionStorage.removeItem('bind_qr_poll_token');
                        bindDialog.statusText = '二维码已过期，请刷新';
                        return false;
                    }
                    return true;
            }, {
                interval: 2000,
                onError: () => {
                    bindPollErrorCount += 1;
                    if (bindPollErrorCount >= 3) {
                        bindDialog.statusText = '二维码状态获取失败，请刷新后重试';
                        return false;
                    }
                    return true;
                },
            });
            bindPoller.start();
        };

        const stopBindPolling = () => {
            bindPoller?.stop();
            bindPoller = null;
        };

        const stopBindCreation = () => {
            bindCreateSequence += 1;
            bindCreateController?.abort();
            bindCreateController = null;
        };

        const stopBindRequests = () => {
            stopBindPolling();
            stopBindCreation();
        };

        const doBind = async (tempAuthCode) => {
            try {
                const res = await adminApi.bindWechat(tempAuthCode);
                if (res.data.code === 0) {
                    ElMessage.success('绑定成功');
                    bindDialog.visible = false;
                    refreshUserInfo();
                } else {
                    bindDialog.statusText = res.data.message;
                    ElMessage.error(res.data.message);
                }
            } catch (err) {
                ElMessage.error(err.response?.data?.message || '绑定失败');
                bindDialog.statusText = '绑定失败';
            }
        };

        const unbindWechat = async () => {
            if (isConsoleMode.value) {
                return;
            }
            try {
                await ElMessageBox.confirm('确定解除与微信的绑定吗？解除后将无法使用扫码登录。', '提示', {
                    confirmButtonText: '确定解绑',
                    cancelButtonText: '取消',
                    type: 'warning'
                });

                const res = await adminApi.unbindWechat();
                if (res.data.code === 0) {
                    ElMessage.success('解绑成功');
                    refreshUserInfo();
                }
            } catch (err) {
                if (err !== 'cancel') {
                    ElMessage.error(err.response?.data?.message || '解绑失败');
                }
            }
        };

        // --- Methods: Change Password ---
        const passwordDialog = reactive({
            visible: false,
            loading: false
        });
        const passwordForm = reactive({
            oldPassword: '',
            newPassword: '',
            confirmPassword: ''
        });

        const openPasswordDialog = () => {
            if (isConsoleMode.value) {
                ElMessage.info('个人题库身份不使用账号密码登录');
                return;
            }
            passwordForm.oldPassword = '';
            passwordForm.newPassword = '';
            passwordForm.confirmPassword = '';
            passwordDialog.visible = true;
        };

        const submitChangePassword = async () => {
            if (isConsoleMode.value) {
                return;
            }
            if (!passwordForm.oldPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
                ElMessage.warning('请填写完整信息');
                return;
            }
            if (passwordForm.newPassword.length < 12) {
                ElMessage.warning('新密码长度不能少于 12 位');
                return;
            }
            if (!/[a-z]/.test(passwordForm.newPassword)
                || !/[A-Z]/.test(passwordForm.newPassword)
                || !/\d/.test(passwordForm.newPassword)
                || !/[^A-Za-z0-9]/.test(passwordForm.newPassword)) {
                ElMessage.warning('新密码需包含大小写字母、数字和特殊符号');
                return;
            }
            if (passwordForm.newPassword !== passwordForm.confirmPassword) {
                ElMessage.warning('两次输入的新密码不一致');
                return;
            }

            try {
                passwordDialog.loading = true;
                const res = await adminApi.changePassword({
                    oldPassword: passwordForm.oldPassword,
                    newPassword: passwordForm.newPassword
                });
                if (res.data.code === 0) {
                    ElMessage.success(IS_PLATFORM_SSO ? '考试后台独立密码已修改' : '密码修改成功，请重新登录');
                    passwordDialog.visible = false;
                    if (IS_PLATFORM_SSO) return;
                    setTimeout(() => {
                        session.clear();
                        router.push('/login');
                    }, 1500);
                }
            } catch (err) {
                ElMessage.error(err.response?.data?.message || '修改密码失败');
            } finally {
                passwordDialog.loading = false;
            }
        };

        
</script>

<style>
@import '@/assets/css/admin.css';
@import '@/assets/css/admin-redesign.css';
@import '@/assets/css/admin-premium.css';

.dashboard-page {
    min-height: 100vh;
    background:
        linear-gradient(rgba(42, 91, 140, 0.045) 1px, transparent 1px),
        linear-gradient(90deg, rgba(42, 91, 140, 0.035) 1px, transparent 1px),
        linear-gradient(180deg, #f7fafc 0%, #eef4f8 100%);
    background-size: 36px 36px, 36px 36px, auto;
    background-position: -1px -1px, -1px -1px, 0 0;
}

.profile-cartoon-avatar,
.cartoon-user-avatar,
.detail-cartoon-avatar {
    display: block;
    flex: 0 0 auto;
    object-fit: cover;
    box-shadow: inset 0 0 0 1px rgba(15, 41, 77, 0.08);
}

.profile-cartoon-avatar {
    width: 32px;
    height: 32px;
    border-radius: 12px;
}

body .cartoon-user-avatar.exam-user-avatar {
    padding: 0;
    border: 1px solid rgba(15, 41, 77, 0.08);
    background: transparent;
}

.detail-cartoon-avatar {
    width: 60px;
    height: 60px;
    border: 1px solid rgba(15, 41, 77, 0.08);
    border-radius: 16px;
}

.dashboard-container .stat-info {
    min-width: 0;
}

.dashboard-container .stat-hint {
    margin-top: 6px;
    color: #64748b;
    font-size: 12px;
    line-height: 1.35;
    font-weight: 650;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.mobile-header-logo {
    height: auto;
    margin-bottom: 0;
}

.mobile-drawer-aside {
    height: 100%;
}

.mobile-aside-footer {
    padding: 16px;
}

.platform-console-link {
    height: 38px;
    padding: 0 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border: 1px solid rgba(50, 117, 180, 0.2);
    border-radius: 10px;
    background: rgba(232, 243, 255, 0.78);
    color: #2563eb;
    font-size: 13px;
    font-weight: 800;
    line-height: 1;
    text-decoration: none;
    white-space: nowrap;
    transition: background-color 0.18s ease, border-color 0.18s ease;
}

.platform-console-link:hover,
.platform-console-link:focus-visible {
    border-color: rgba(37, 99, 235, 0.38);
    background: #eaf2ff;
    outline: none;
}

.platform-console-link-mobile {
    width: 100%;
    margin-bottom: 10px;
}

.mobile-logout-button,
.full-width-control,
.full-width-table {
    width: 100% !important;
}

.button-leading-icon {
    margin-right: 4px;
}

.empty-back-button {
    margin-left: 10px;
}

.bind-dialog-content {
    min-height: 242px;
    padding: 22px 0 18px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 15px;
}

.bind-status-text {
    color: #4e5c6d;
    font-size: 13px;
    line-height: 1.6;
    text-align: center;
}

.detail-score-text {
    font-weight: 850;
}

.detail-score-text.excellent,
.detail-score-text.pass {
    color: #0f8f72;
}

.detail-score-text.fail {
    color: #c2412d;
}

.accuracy-track .accuracy-progress {
    width: 96px;
    height: 7px;
    display: block;
    overflow: hidden;
    border: 0;
    border-radius: 999px;
    background: #e9eef5;
    appearance: none;
}

.accuracy-track .accuracy-progress::-webkit-progress-bar {
    background: #e9eef5;
}

.accuracy-track .accuracy-progress::-webkit-progress-value {
    border-radius: inherit;
    background: linear-gradient(90deg, #1b6ef3, #12a594);
}

.accuracy-track .accuracy-progress::-moz-progress-bar {
    border-radius: inherit;
    background: linear-gradient(90deg, #1b6ef3, #12a594);
}

.assignment-checkbox-group {
    display: block;
}

.dashboard-action-strip {
    margin: -2px 0 18px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
}

.dashboard-action-card {
    min-width: 0;
    min-height: 92px;
    padding: 14px;
    border: 1px solid #e5edf5;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.84);
    color: inherit;
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    text-align: left;
    cursor: pointer;
    box-shadow: 0 8px 24px rgba(15, 41, 77, 0.04);
    transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;
}

.dashboard-action-card:hover,
.dashboard-action-card:focus-visible {
    transform: translateY(-2px);
    border-color: #c7d8e9;
    background: #ffffff;
    box-shadow: 0 14px 34px rgba(15, 41, 77, 0.08);
}

.dashboard-action-icon {
    width: 38px;
    height: 38px;
    border-radius: 13px;
    display: grid;
    place-items: center;
    background: #eef4fb;
    color: #2468b2;
    font-size: 18px;
}

.dashboard-action-card.is-success .dashboard-action-icon {
    background: #e4f7ed;
    color: #047857;
}

.dashboard-action-card.is-warning .dashboard-action-icon {
    background: #fff4df;
    color: #b45309;
}

.dashboard-action-card.is-danger .dashboard-action-icon {
    background: #feecec;
    color: #c2410c;
}

.dashboard-action-card.is-neutral .dashboard-action-icon {
    background: #f1f5f9;
    color: #64748b;
}

.dashboard-action-copy {
    min-width: 0;
    display: grid;
    gap: 3px;
}

.dashboard-action-copy strong {
    color: #0f172a;
    font-size: 24px;
    line-height: 1;
    font-weight: 850;
}

.dashboard-action-copy span {
    color: #26364b;
    font-size: 13px;
    line-height: 1.35;
    font-weight: 800;
}

.dashboard-action-copy small {
    min-width: 0;
    color: #64748b;
    font-size: 12px;
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.dashboard-insight-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(300px, 360px);
    gap: 18px;
    align-items: stretch;
}

.dashboard-chart-section {
    min-width: 0;
}

.chart-section-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 12px;
}

.section-subtitle {
    margin-top: 6px;
    color: #64748b;
    font-size: 13px;
    line-height: 1.5;
}

.chart-kpis {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
}

.chart-kpis > div {
    min-width: 76px;
    padding: 8px 10px;
    border: 1px solid #e5edf5;
    border-radius: 12px;
    background: #f8fafc;
}

.chart-kpis span,
.dashboard-recent-main small,
.dashboard-recent-item time {
    color: #64748b;
    font-size: 12px;
    line-height: 1.35;
}

.chart-kpis strong {
    display: block;
    margin-top: 3px;
    color: #0f172a;
    font-size: 20px;
    line-height: 1;
    font-weight: 850;
}

.dashboard-side-panel {
    min-width: 0;
    min-height: 360px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--admin-line, #e5edf5);
    border-radius: var(--admin-radius, 16px);
    background: rgba(255, 255, 255, 0.94);
    box-shadow: var(--admin-shadow-xs, 0 8px 24px rgba(15, 41, 77, 0.06));
}

.dashboard-side-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
}

.dashboard-side-head .el-button {
    flex: 0 0 auto;
}

.dashboard-recent-empty {
    min-height: 220px;
    flex: 1;
    display: grid;
    place-items: center;
    border: 1px dashed #d8e5ef;
    border-radius: 14px;
    color: #94a3b8;
    font-size: 14px;
    text-align: center;
}

.dashboard-recent-item {
    width: 100%;
    min-height: 58px;
    padding: 10px 8px;
    border: 0;
    border-radius: 14px;
    background: transparent;
    color: inherit;
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.18s ease, transform 0.18s ease;
}

.dashboard-recent-item + .dashboard-recent-item {
    margin-top: 4px;
}

.dashboard-recent-item:hover,
.dashboard-recent-item:focus-visible {
    background: #f5f8fb;
    transform: translateX(2px);
}

.dashboard-recent-icon {
    width: 36px;
    height: 36px;
    border-radius: 12px;
    display: grid;
    place-items: center;
}

.dashboard-recent-icon.is-exam {
    color: #1d4ed8;
    background: #eaf2ff;
}

.dashboard-recent-icon.is-user {
    color: #047857;
    background: #e3f8ef;
}

.dashboard-recent-icon.is-feedback {
    color: #b45309;
    background: #fff3df;
}

.dashboard-recent-main {
    min-width: 0;
    display: grid;
    gap: 4px;
}

.dashboard-recent-main strong,
.dashboard-recent-main small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.dashboard-recent-main strong {
    color: #0f172a;
    font-size: 14px;
    line-height: 1.35;
    font-weight: 800;
}

.dashboard-recent-item time {
    justify-self: end;
    white-space: nowrap;
}

.dashboard-page .page-header-actions,
.admin-list-toolbar,
.exam-results-toolbar,
.feedback-toolbar,
.personal-category-toolbar {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    flex-wrap: wrap;
}

.exam-results-total {
    min-height: 34px;
    padding: 0 10px;
    border-radius: 11px;
    background: #f5f8fb;
    color: #64748b;
    display: inline-flex;
    align-items: center;
    font-size: 13px;
    font-weight: 750;
    white-space: nowrap;
}

.admin-list-toolbar .el-input,
.admin-list-toolbar .el-select,
.exam-results-toolbar .el-input,
.exam-results-toolbar .el-select,
.feedback-toolbar .el-input,
.feedback-toolbar .el-select,
.personal-category-toolbar .el-input,
.personal-category-toolbar .el-select {
    --el-component-size: 36px;
}

.data-table-card {
    overflow: hidden;
}

.data-table-card .el-card__body {
    padding: 0 !important;
}

.data-table-card .el-table {
    --el-table-border-color: #e8eef5;
    --el-table-header-bg-color: #f8fafc;
    --el-table-row-hover-bg-color: #f5f8fb;
}

.data-table-card .el-table th.el-table__cell {
    height: 48px;
    background: #f8fafc !important;
    color: #475569;
    font-size: 13px;
    font-weight: 800;
}

.data-table-card .el-table td.el-table__cell {
    height: 62px;
    color: #26364b;
    border-bottom-color: #edf2f7 !important;
}

.data-table-card .el-table .cell {
    line-height: 1.45;
}

.data-table-card .el-table__row {
    transition: background-color 0.18s ease;
}

.data-table-card .el-table__empty-block {
    min-height: 260px;
    background: linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%);
}

.data-table-card .el-table__empty-text {
    color: #94a3b8;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    font-weight: 700;
}

.data-table-card .el-table__empty-text::before {
    content: "";
    width: 46px;
    height: 46px;
    border-radius: 15px;
    background:
        linear-gradient(#dbe8f5, #dbe8f5) center 15px / 22px 2px no-repeat,
        linear-gradient(#dbe8f5, #dbe8f5) center 23px / 18px 2px no-repeat,
        linear-gradient(#dbe8f5, #dbe8f5) center 31px / 24px 2px no-repeat,
        #f1f6fb;
    box-shadow: inset 0 0 0 1px #dbe8f5;
}

.row-actions {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
}

.row-actions .el-button {
    min-height: 28px;
    padding: 0 8px;
    border-radius: 9px;
    font-weight: 700;
}

.assignment-tags,
.personal-category-name,
.feedback-title-line {
    flex-wrap: wrap;
}

.feedback-table .el-table__row {
    cursor: pointer;
}

.category-card-search {
    width: 220px;
}

.category-card-note {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px dashed #dce7f2;
    color: #64748b;
    font-size: 12px;
    line-height: 1.5;
}

body .exam-card {
    min-height: 262px;
}

body .exam-card .exam-card-title {
    min-height: 44px;
}

.exam-card-meta-grid {
    margin-top: 16px;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
}

.exam-card-meta-grid div {
    min-width: 0;
    padding: 11px 10px;
    border: 1px solid #e5edf5;
    border-radius: 12px;
    background: #f8fafc;
}

.exam-card-meta-grid span,
.exam-card-meta-grid strong {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.exam-card-meta-grid span {
    color: #64748b;
    font-size: 11px;
    line-height: 1.25;
    font-weight: 700;
}

.exam-card-meta-grid strong {
    margin-top: 6px;
    color: #0f172a;
    font-size: 13px;
    line-height: 1.25;
    font-weight: 820;
}

body .exam-card .exam-card-actions {
    padding-top: 18px;
}

.share-flow-steps {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
}

.share-flow-step {
    min-width: 0;
    padding: 10px 12px;
    border: 1px solid #e5edf5;
    border-radius: 14px;
    background: #f8fafc;
    color: #64748b;
    display: flex;
    align-items: center;
    gap: 9px;
}

.share-flow-step span {
    width: 24px;
    height: 24px;
    border-radius: 999px;
    background: #e2e8f0;
    color: #64748b;
    display: grid;
    place-items: center;
    font-size: 12px;
    font-weight: 850;
}

.share-flow-step strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    line-height: 1.25;
    font-weight: 800;
}

.share-flow-step.is-active {
    border-color: #cfe0f7;
    background: #f4f8ff;
    color: #1d63e9;
}

.share-flow-step.is-active span {
    background: #1d63e9;
    color: #ffffff;
}

body .paper-share-dialog .share-paper-summary {
    margin-top: 12px;
}

body .paper-share-dialog .share-result-panel {
    border-color: #bfe6d1;
    background: linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%);
}

body .paper-share-dialog .share-code {
    letter-spacing: 0;
}

@media (max-width: 1180px) {
    .dashboard-action-strip {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .dashboard-insight-grid {
        grid-template-columns: 1fr;
    }

    .dashboard-side-panel {
        min-height: 0;
    }
}

@media (max-width: 640px) {
    .dashboard-action-strip {
        grid-template-columns: 1fr;
    }

    .chart-section-head,
    .dashboard-side-head {
        flex-direction: column;
        align-items: stretch;
    }

    .chart-kpis {
        justify-content: stretch;
    }

    .chart-kpis > div {
        flex: 1 1 120px;
    }

    .dashboard-recent-item {
        grid-template-columns: 36px minmax(0, 1fr);
    }

    .dashboard-recent-item time {
        grid-column: 2;
        justify-self: start;
    }

    .admin-list-toolbar,
    .exam-results-toolbar,
    .feedback-toolbar,
    .personal-category-toolbar {
        width: 100%;
        justify-content: stretch;
    }

    .admin-list-toolbar > *,
    .exam-results-toolbar > *,
    .feedback-toolbar > *,
    .personal-category-toolbar > *,
    .category-card-search {
        width: 100% !important;
    }

    .share-flow-steps {
        grid-template-columns: 1fr;
    }
}

@media (min-width: 1025px) {
    .desktop-aside {
        box-sizing: border-box !important;
        grid-template-columns: max-content minmax(0, 1fr) max-content !important;
        column-gap: clamp(14px, 1.4vw, 28px) !important;
        padding-right: max(32px, calc((100vw - 1680px) / 2)) !important;
        padding-left: max(32px, calc((100vw - 1680px) / 2)) !important;
    }

    .desktop-aside .logo,
    .desktop-aside .aside-footer {
        min-width: max-content !important;
    }

    .desktop-aside .el-menu {
        min-width: 0 !important;
        max-width: 100% !important;
        justify-content: safe center !important;
        padding-right: 8px !important;
        padding-left: 8px !important;
        scroll-padding-right: 16px;
        scroll-padding-left: 16px;
    }

    .desktop-aside .el-menu::before,
    .desktop-aside .el-menu::after {
        content: "";
        display: block;
        flex: 0 0 4px;
    }

    .desktop-aside .el-menu-item {
        box-sizing: border-box !important;
        white-space: nowrap !important;
    }

    .desktop-aside .user-profile-card {
        max-width: 190px !important;
    }
}

@media (min-width: 1025px) and (max-width: 1360px) {
    .desktop-aside {
        column-gap: 10px !important;
        padding-right: 22px !important;
        padding-left: 22px !important;
    }

    .desktop-aside .logo {
        gap: 8px !important;
    }

    .desktop-aside .el-menu {
        gap: 2px !important;
    }

    .desktop-aside .el-menu-item {
        padding-right: 10px !important;
        padding-left: 10px !important;
        gap: 6px !important;
        font-size: 13px !important;
    }

    .desktop-aside .user-profile-name {
        max-width: 96px !important;
    }
}

@media (min-width: 1025px) and (max-width: 1180px) {
    .desktop-aside .logo span:last-child {
        max-width: 78px !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
    }

    .desktop-aside .user-profile-name {
        max-width: 78px !important;
    }
}

body .exam-card {
    position: relative;
}

body .exam-card .exam-card-header {
    padding-right: 0;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}

body .exam-card .exam-analysis-tag {
    appearance: none;
    height: 32px;
    padding: 0;
    padding-inline: 13px;
    border-radius: 999px;
    background: #eef6ff;
    border: 0;
    color: #1d64b7;
    box-shadow: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    font: inherit;
    font-size: 13px;
    line-height: 32px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
}

body .exam-card .exam-analysis-tag:hover,
body .exam-card .exam-analysis-tag:focus {
    background: #e0f0ff;
    color: #164f93;
}

body .exam-card .exam-analysis-tag .el-icon {
    margin: 0;
    font-size: 13px;
}

.category-analysis-dialog {
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.analysis-stat-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
}

.analysis-stat-card,
.analysis-section {
    border: 1px solid #e5edf5;
    border-radius: 12px;
    background: #f8fafc;
}

.analysis-stat-card {
    min-height: 92px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 8px;
}

.analysis-stat-value {
    color: #0f766e;
    font-size: 28px;
    line-height: 1;
    font-weight: 800;
}

.analysis-stat-label {
    color: #64748b;
    font-size: 13px;
}

.analysis-section {
    padding: 16px;
}

.analysis-section-title {
    margin-bottom: 14px;
    color: #0f172a;
    font-size: 15px;
    font-weight: 700;
}

.analysis-bars {
    min-height: 180px;
    display: grid;
    grid-template-columns: repeat(14, minmax(0, 1fr));
    gap: 8px;
    align-items: end;
}

.analysis-bar-item {
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
}

.analysis-bar-track {
    width: 100%;
    height: 112px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
}

.analysis-bar-fill {
    width: 18px;
    min-height: 8px;
    display: block;
    border-radius: 999px 999px 4px 4px;
    background: linear-gradient(180deg, #38bdf8 0%, #2563eb 100%);
}

.analysis-bar-fill.is-height-1 {
    height: 10%;
}

.analysis-bar-fill.is-height-2 {
    height: 20%;
}

.analysis-bar-fill.is-height-3 {
    height: 30%;
}

.analysis-bar-fill.is-height-4 {
    height: 40%;
}

.analysis-bar-fill.is-height-5 {
    height: 50%;
}

.analysis-bar-fill.is-height-6 {
    height: 60%;
}

.analysis-bar-fill.is-height-7 {
    height: 70%;
}

.analysis-bar-fill.is-height-8 {
    height: 80%;
}

.analysis-bar-fill.is-height-9 {
    height: 90%;
}

.analysis-bar-fill.is-height-10 {
    height: 100%;
}

.analysis-bar-date,
.analysis-bar-score {
    color: #94a3b8;
    font-size: 11px;
    line-height: 1.2;
    white-space: nowrap;
}

.analysis-bar-score {
    color: #475569;
    font-weight: 700;
}

.analysis-grid {
    display: grid;
    grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
    gap: 18px;
}

.feedback-toolbar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    flex-wrap: wrap;
}

.feedback-menu-item {
    position: relative !important;
    overflow: visible !important;
    padding-right: 34px !important;
}

.desktop-aside .feedback-menu-item {
    padding-right: 34px !important;
}

.mobile-menu-drawer .feedback-menu-item {
    padding-right: 42px !important;
}

.nav-badge {
    position: absolute;
    top: 2px;
    right: 8px;
    z-index: 2;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border: 2px solid #ffffff;
    border-radius: 999px;
    background: #ef4444;
    color: #ffffff;
    font-size: 11px;
    line-height: 14px;
    font-weight: 800;
    text-align: center;
    box-shadow: 0 6px 14px rgba(239, 68, 68, 0.28);
}

.feedback-filter-select {
    width: 132px;
}

.feedback-title-cell {
    min-width: 0;
    display: grid;
    gap: 8px;
}

.feedback-title-line {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    color: #0f172a;
    font-weight: 700;
}

.feedback-summary {
    max-width: 720px;
    color: #64748b;
    font-size: 13px;
    line-height: 1.5;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.feedback-user-cell {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
}

.feedback-user-meta {
    max-width: 160px;
    color: #94a3b8;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.feedback-detail {
    display: grid;
    gap: 16px;
}

.feedback-detail-head,
.feedback-user-panel {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 16px;
    border: 1px solid #e5edf5;
    border-radius: 12px;
    background: #f8fafc;
}

.feedback-detail-title {
    color: #0f172a;
    font-size: 20px;
    line-height: 1.4;
    font-weight: 800;
}

.feedback-detail-meta,
.feedback-contact {
    margin-top: 6px;
    color: #64748b;
    font-size: 13px;
    line-height: 1.5;
}

.feedback-message-block,
.feedback-reply-box {
    padding: 16px;
    border: 1px solid #e5edf5;
    border-radius: 12px;
    background: #ffffff;
}

.feedback-message-block.is-reply {
    border-color: #cdebdc;
    background: #f0fdf4;
}

.feedback-message-label {
    margin-bottom: 10px;
    color: #475569;
    font-size: 13px;
    font-weight: 800;
}

.feedback-message-label span {
    color: #94a3b8;
    font-weight: 600;
}

.feedback-message-content {
    color: #0f172a;
    line-height: 1.8;
    white-space: pre-wrap;
    word-break: break-word;
}

.feedback-reply-box {
    display: grid;
    gap: 12px;
}

.personal-category-toolbar {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 10px;
}

.personal-category-toolbar .table-search-input,
.personal-study-id-input {
    width: 220px;
}

.personal-filter-select {
    width: 132px;
}

.personal-category-card .el-table__row {
    cursor: default;
}

.personal-category-name,
.personal-owner-cell,
.personal-category-summary,
.personal-question-head {
    display: flex;
    align-items: center;
}

.personal-category-name {
    gap: 8px;
    min-width: 0;
}

.personal-category-name > span:first-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.personal-owner-cell {
    gap: 10px;
    min-width: 0;
}

.personal-category-detail-meta {
    color: #64748b;
    font-size: 12px;
    line-height: 1.5;
    word-break: break-all;
}

.personal-category-dialog {
    display: grid;
    gap: 16px;
}

.personal-category-summary {
    justify-content: space-between;
    gap: 16px;
    padding: 16px;
    border: 1px solid #e5edf5;
    border-radius: 12px;
    background: #f8fafc;
}

.personal-category-detail-title {
    color: #0f172a;
    font-size: 20px;
    line-height: 1.4;
    font-weight: 800;
}

.personal-category-summary-tags {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
}

.personal-category-descriptions {
    width: 100%;
}

.personal-question-head {
    justify-content: space-between;
    margin-top: 4px;
}

.personal-question-title {
    color: #0f172a;
    font-weight: 800;
}

.personal-question-total {
    color: #64748b;
    font-size: 13px;
}

@media (max-width: 900px) {
    .analysis-stat-grid,
    .analysis-grid {
        grid-template-columns: 1fr;
    }

    .feedback-toolbar {
        width: 100%;
        justify-content: stretch;
    }

    .feedback-filter-select,
    .feedback-toolbar .table-search-input,
    .feedback-toolbar .el-button {
        width: 100%;
    }

    .feedback-detail-head,
    .feedback-user-panel,
    .personal-category-summary {
        flex-direction: column;
    }

    .personal-category-toolbar,
    .personal-category-toolbar .table-search-input,
    .personal-study-id-input,
    .personal-filter-select,
    .personal-category-toolbar .el-button {
        width: 100%;
    }
}

/* Final admin polish: quiet, dense, and built for repeated题库运营 work. */
:root {
    --admin-bg: #f6f8fb;
    --admin-bg-2: #eef3f8;
    --admin-surface: #ffffff;
    --admin-surface-soft: #f8fafc;
    --admin-text: #151a21;
    --admin-text-soft: #4e5c6d;
    --admin-text-muted: #7a8797;
    --admin-line: #dfe7ef;
    --admin-line-strong: #c8d5e2;
    --admin-primary: #2563eb;
    --admin-primary-hover: #1d4ed8;
    --admin-primary-soft: #eaf2ff;
    --admin-green: #0f8f72;
    --admin-green-soft: #e7f8f2;
    --admin-amber: #b66a12;
    --admin-amber-soft: #fff4df;
    --admin-coral: #c2412d;
    --admin-coral-soft: #fff0ed;
    --admin-violet: #6d5bd0;
    --admin-violet-soft: #f0edff;
    --admin-radius: 8px;
    --admin-shadow-xs: 0 1px 2px rgba(18, 28, 38, 0.05);
    --admin-shadow-sm: 0 8px 22px rgba(18, 28, 38, 0.07);
    --admin-shadow-md: 0 18px 46px rgba(18, 28, 38, 0.11);
    --admin-ease: cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes admin-panel-in {
    from {
        opacity: 0;
        transform: translateY(10px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

body:not(.exam-detail-active) {
    min-height: 100vh !important;
    background:
        linear-gradient(rgba(37, 99, 235, 0.035) 1px, transparent 1px),
        linear-gradient(90deg, rgba(15, 143, 114, 0.03) 1px, transparent 1px),
        linear-gradient(180deg, #fbfcfe 0%, var(--admin-bg) 44%, #f3f7fb 100%) !important;
    background-size: 28px 28px, 28px 28px, auto !important;
    background-position: -1px -1px, -1px -1px, 0 0 !important;
    color: var(--admin-text) !important;
    -webkit-font-smoothing: antialiased;
}

.dashboard-page {
    min-height: 100vh;
    background: transparent !important;
    color: var(--admin-text);
}

.dashboard-page > .el-container,
.dashboard-page > .el-container > .el-container {
    min-height: 100vh !important;
    background: transparent !important;
}

@media (min-width: 769px) {
    .dashboard-page .desktop-aside {
        height: 76px !important;
        min-height: 76px !important;
        padding-right: max(28px, calc((100vw - 1480px) / 2)) !important;
        padding-left: max(28px, calc((100vw - 1480px) / 2)) !important;
        border-bottom: 1px solid rgba(210, 221, 232, 0.8) !important;
        background: rgba(255, 255, 255, 0.9) !important;
        box-shadow: 0 8px 28px rgba(18, 28, 38, 0.055) !important;
        backdrop-filter: blur(18px) saturate(1.2) !important;
        -webkit-backdrop-filter: blur(18px) saturate(1.2) !important;
    }

    .dashboard-page .desktop-aside .logo {
        gap: 11px !important;
        color: var(--admin-text) !important;
        font-size: 18px !important;
        font-weight: 900 !important;
    }

    .dashboard-page .desktop-aside .logo span:last-child {
        color: var(--admin-text) !important;
        background: none !important;
        -webkit-text-fill-color: currentColor !important;
    }

    .dashboard-page .desktop-aside .logo-mark {
        width: 38px !important;
        height: 38px !important;
        border-radius: var(--admin-radius) !important;
        border: 1px solid rgba(210, 221, 232, 0.78) !important;
        background: #ffffff !important;
        box-shadow: var(--admin-shadow-xs) !important;
    }

    .dashboard-page .desktop-aside .el-menu {
        gap: 4px !important;
        justify-content: center !important;
    }

    .dashboard-page .desktop-aside .el-menu-item {
        height: 38px !important;
        padding: 0 13px !important;
        border-radius: var(--admin-radius) !important;
        color: var(--admin-text-soft) !important;
        font-size: 14px !important;
        font-weight: 760 !important;
        transition:
            color 0.18s ease,
            background-color 0.18s ease,
            border-color 0.18s ease,
            transform 0.18s ease !important;
    }

    .dashboard-page .desktop-aside .el-menu-item:hover,
    .dashboard-page .desktop-aside .el-menu-item:focus-visible {
        border-color: var(--admin-line) !important;
        background: #f3f7fb !important;
        color: var(--admin-text) !important;
        transform: translateY(-1px);
    }

    .dashboard-page .desktop-aside .el-menu-item.is-active {
        border-color: #bed2ee !important;
        background: var(--admin-primary-soft) !important;
        color: var(--admin-primary) !important;
        box-shadow: inset 0 -2px 0 rgba(37, 99, 235, 0.26) !important;
    }

    .dashboard-page .desktop-aside .user-profile-card {
        height: 42px !important;
        padding: 4px 9px 4px 4px !important;
        border-radius: var(--admin-radius) !important;
        border-color: transparent !important;
    }

    .dashboard-page .desktop-aside .user-profile-card:hover,
    .dashboard-page .desktop-aside .user-profile-card:focus-visible {
        border-color: var(--admin-line) !important;
        background: #f4f7fa !important;
    }

    .dashboard-page .desktop-aside .profile-cartoon-avatar {
        width: 34px !important;
        height: 34px !important;
        border-radius: var(--admin-radius) !important;
    }
}

.dashboard-page .el-main {
    max-width: 1480px !important;
    padding: 112px max(28px, calc((100vw - 1480px) / 2)) 72px !important;
    background: transparent !important;
}

.dashboard-page .dashboard-container,
.major-categories-view,
.exam-results-view,
.users-view,
.personal-categories-view,
.feedback-view,
.dashboard-page .el-main > div {
    animation: admin-panel-in 0.42s var(--admin-ease) both;
}

.ui-preview-pill {
    min-height: 22px;
    padding: 0 8px;
    border: 1px solid #cfe0f7;
    border-radius: 999px;
    background: var(--admin-primary-soft);
    color: var(--admin-primary);
    display: inline-flex;
    align-items: center;
    font-size: 12px;
    font-weight: 820;
}

.content-toolbar {
    width: 100%;
    box-sizing: border-box;
    margin-bottom: 16px;
    padding: 10px;
    border: 1px solid rgba(210, 221, 232, 0.9);
    border-radius: var(--admin-radius);
    background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(248, 251, 254, 0.78)),
        rgba(255, 255, 255, 0.82);
    box-shadow: var(--admin-shadow-xs);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    display: grid;
    align-items: center;
    gap: 10px 14px;
}

.category-toolbar-shell {
    grid-template-columns: minmax(0, 1fr) auto;
}

.category-toolbar-shell .page-header-actions {
    grid-column: 2;
    justify-self: end;
}

.toolbar-context-strip {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.toolbar-back-button {
    color: var(--admin-text-muted) !important;
}

.admin-list-toolbar-shell {
    grid-template-columns: minmax(280px, 0.84fr) minmax(360px, 1.16fr);
}

.admin-list-toolbar-shell .admin-list-toolbar,
.admin-list-toolbar-shell .exam-results-toolbar,
.admin-list-toolbar-shell .feedback-toolbar,
.admin-list-toolbar-shell .personal-category-toolbar {
    justify-self: end;
}

.list-metric-strip {
    margin: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
}

.list-metric-strip > div {
    min-width: 0;
    padding: 9px 11px;
    border: 1px solid rgba(226, 232, 240, 0.92);
    border-radius: calc(var(--admin-radius) - 4px);
    background: rgba(248, 250, 252, 0.88);
    box-shadow: none;
    display: grid;
    align-content: center;
}

.list-metric-strip span,
.list-metric-strip strong {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.list-metric-strip span {
    color: var(--admin-text-muted);
    font-size: 11px;
    line-height: 1.25;
    font-weight: 760;
}

.list-metric-strip strong {
    margin-top: 4px;
    color: var(--admin-text);
    font-size: 19px;
    line-height: 1;
    font-weight: 900;
}

.content-toolbar .page-header-actions,
.content-toolbar .admin-list-toolbar,
.content-toolbar .exam-results-toolbar,
.content-toolbar .feedback-toolbar,
.content-toolbar .personal-category-toolbar {
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
}

.dashboard-page .el-button {
    min-height: 36px;
    border-radius: var(--admin-radius) !important;
    font-weight: 760 !important;
    transition:
        transform 0.18s ease,
        box-shadow 0.18s ease,
        background-color 0.18s ease,
        border-color 0.18s ease,
        color 0.18s ease !important;
}

.dashboard-page .el-button:not(.is-disabled):hover,
.dashboard-page button:not(:disabled):hover {
    transform: translateY(-1px);
}

.dashboard-page .el-button--primary {
    border-color: var(--admin-primary) !important;
    background: var(--admin-primary) !important;
    box-shadow: 0 9px 18px rgba(37, 99, 235, 0.16) !important;
}

.dashboard-page .el-button--primary:hover,
.dashboard-page .el-button--primary:focus {
    border-color: var(--admin-primary-hover) !important;
    background: var(--admin-primary-hover) !important;
}

.dashboard-page .el-input__wrapper,
.dashboard-page .el-select .el-input__wrapper,
.dashboard-page .el-date-editor.el-input__wrapper {
    min-height: 36px !important;
    border: 1px solid var(--admin-line) !important;
    border-radius: var(--admin-radius) !important;
    background: #ffffff !important;
    box-shadow: none !important;
    transition:
        border-color 0.18s ease,
        box-shadow 0.18s ease,
        background-color 0.18s ease !important;
}

.dashboard-page .el-input__wrapper:hover,
.dashboard-page .el-select .el-input__wrapper:hover,
.dashboard-page .el-date-editor.el-input__wrapper:hover {
    border-color: var(--admin-line-strong) !important;
}

.dashboard-page .el-input__wrapper.is-focus,
.dashboard-page .el-select .el-input__wrapper.is-focus,
.dashboard-page .el-date-editor.el-input__wrapper.is-focus {
    border-color: rgba(37, 99, 235, 0.58) !important;
    box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.09) !important;
}

.dashboard-stats-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
    gap: 14px !important;
    margin-bottom: 16px !important;
}

.stat-card,
.dashboard-action-card,
.chart-section,
.dashboard-side-panel,
.table-card,
.category-card,
.exam-card {
    border: 1px solid rgba(210, 221, 232, 0.88) !important;
    border-radius: var(--admin-radius) !important;
    background: rgba(255, 255, 255, 0.94) !important;
    box-shadow: var(--admin-shadow-xs) !important;
    transition:
        transform 0.22s var(--admin-ease),
        border-color 0.22s ease,
        box-shadow 0.22s ease,
        background-color 0.22s ease !important;
}

.stat-card:hover,
.dashboard-action-card:hover,
.chart-section:hover,
.dashboard-side-panel:hover,
.table-card:hover,
.category-card:hover,
.exam-card:hover {
    border-color: #bdd0e5 !important;
    box-shadow: var(--admin-shadow-sm) !important;
    transform: translateY(-3px) !important;
}

.stat-card {
    --stat-accent: var(--admin-primary);
    position: relative;
    min-height: 128px !important;
    padding: 20px !important;
    overflow: hidden;
    animation: admin-panel-in 0.42s var(--admin-ease) both;
}

.stat-card::after {
    content: "";
    position: absolute;
    inset: 0;
    border: 2px solid var(--stat-accent);
    border-radius: inherit;
    opacity: 0.42;
    pointer-events: none;
    transition: opacity 0.22s ease, box-shadow 0.22s ease;
}

.stat-card:hover::after {
    opacity: 0.72;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--stat-accent) 24%, transparent);
}

.stat-card.green::after {
    --stat-accent: var(--admin-green);
}

.stat-card.orange::after {
    --stat-accent: var(--admin-amber);
}

.stat-card.purple::after {
    --stat-accent: var(--admin-violet);
}

.stat-card:nth-child(2) {
    animation-delay: 0.04s;
}

.stat-card:nth-child(3) {
    animation-delay: 0.08s;
}

.stat-card:nth-child(4) {
    animation-delay: 0.12s;
}

.stat-icon {
    width: 46px !important;
    height: 46px !important;
    border-radius: var(--admin-radius) !important;
}

.stat-card.blue .stat-icon {
    color: var(--admin-primary) !important;
    background: var(--admin-primary-soft) !important;
}

.stat-card.green .stat-icon {
    color: var(--admin-green) !important;
    background: var(--admin-green-soft) !important;
}

.stat-card.orange .stat-icon {
    color: var(--admin-amber) !important;
    background: var(--admin-amber-soft) !important;
}

.stat-card.purple .stat-icon {
    color: var(--admin-violet) !important;
    background: var(--admin-violet-soft) !important;
}

.stat-value {
    color: var(--admin-text) !important;
    font-size: clamp(27px, 2.4vw, 34px) !important;
    font-weight: 900 !important;
}

.stat-label {
    color: var(--admin-text-soft) !important;
    font-size: 13px !important;
    font-weight: 800 !important;
}

.stat-hint {
    margin-top: 4px;
    color: var(--admin-text-muted) !important;
    font-size: 12px !important;
    line-height: 1.45 !important;
}

.dashboard-action-strip {
    gap: 12px !important;
    margin-bottom: 16px !important;
}

.dashboard-action-card {
    min-height: 94px !important;
    padding: 16px !important;
    text-align: left;
}

.dashboard-action-icon,
.dashboard-recent-icon,
.category-card-icon,
.empty-icon {
    border-radius: var(--admin-radius) !important;
}

.dashboard-action-copy strong {
    color: var(--admin-text) !important;
    font-size: 23px !important;
}

.dashboard-action-copy span,
.dashboard-recent-main strong {
    color: var(--admin-text) !important;
}

.dashboard-action-copy small,
.dashboard-recent-main small,
.dashboard-recent-item time,
.section-subtitle {
    color: var(--admin-text-muted) !important;
}

.dashboard-insight-grid {
    grid-template-columns: minmax(0, 1fr) minmax(320px, 390px) !important;
    gap: 14px !important;
}

.chart-section,
.dashboard-side-panel {
    min-height: 384px !important;
    padding: 20px !important;
}

.chart-section-head,
.dashboard-side-head {
    margin-bottom: 14px !important;
}

.section-title {
    color: var(--admin-text) !important;
    font-size: 16px !important;
    font-weight: 860 !important;
}

.chart-kpis > div,
.exam-card-meta-grid div,
.category-meta-item,
.overview-stats div,
.type-count-grid div,
.analysis-stat-card,
.analysis-section,
.feedback-detail-head,
.feedback-user-panel,
.feedback-message-block,
.feedback-reply-box,
.personal-category-summary {
    border-color: var(--admin-line) !important;
    border-radius: var(--admin-radius) !important;
    background: var(--admin-surface-soft) !important;
}

.dashboard-recent-empty {
    border-color: var(--admin-line) !important;
    border-radius: var(--admin-radius) !important;
    background: repeating-linear-gradient(
        -45deg,
        #f8fafc 0,
        #f8fafc 8px,
        #f3f6fa 8px,
        #f3f6fa 16px
    ) !important;
    color: var(--admin-text-muted) !important;
}

.dashboard-recent-item {
    border-radius: var(--admin-radius) !important;
}

.dashboard-recent-item:hover,
.dashboard-recent-item:focus-visible {
    background: #f4f7fb !important;
    transform: translateX(3px);
}

.category-cards-grid,
.exam-cards-grid {
    grid-template-columns: repeat(auto-fill, minmax(292px, 1fr)) !important;
    gap: 14px !important;
}

.category-card,
.exam-card {
    min-height: 232px !important;
    padding: 20px !important;
}

.category-card-top,
.exam-card-header {
    margin-bottom: 16px !important;
}

.category-card-title,
.exam-card-title,
.feedback-detail-title,
.personal-category-detail-title {
    color: var(--admin-text) !important;
    font-weight: 880 !important;
    letter-spacing: 0 !important;
}

.category-card-title,
.exam-card-title {
    font-size: 18px !important;
    line-height: 1.36 !important;
}

.exam-card-desc {
    min-height: 42px;
    margin: -4px 0 14px;
    display: -webkit-box;
    overflow: hidden;
    color: var(--admin-text-muted);
    font-size: 13px;
    line-height: 1.55;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
}

.category-card-main,
.exam-card {
    min-width: 0;
}

.category-card-actions,
.exam-card-actions {
    gap: 8px !important;
}

.category-icon-action,
.category-card-primary-action,
.exam-card-actions .el-button {
    border-radius: var(--admin-radius) !important;
}

.category-status-tag,
.exam-analysis-tag,
.nav-badge,
.exam-results-total {
    border-radius: 999px !important;
}

.table-card {
    overflow: hidden !important;
}

.data-table-card .el-card__body {
    background: #ffffff !important;
}

.data-table-card .el-table {
    --el-table-border-color: var(--admin-line);
    --el-table-header-bg-color: #f6f8fb;
    --el-table-row-hover-bg-color: #f7faff;
    color: var(--admin-text-soft) !important;
}

.data-table-card .el-table th.el-table__cell {
    height: 50px !important;
    background: #f6f8fb !important;
    color: var(--admin-text-soft) !important;
    font-size: 12px !important;
    font-weight: 850 !important;
    letter-spacing: 0 !important;
}

.data-table-card .el-table td.el-table__cell {
    height: 64px !important;
    color: var(--admin-text) !important;
}

.data-table-card .el-table__row {
    transition:
        background-color 0.18s ease,
        transform 0.18s ease !important;
}

.data-table-card .el-table__row:hover {
    transform: translateX(2px);
}

.row-actions .el-button {
    min-height: 30px !important;
    border-radius: var(--admin-radius) !important;
}

.pagination-container,
.selection-strip {
    border-radius: var(--admin-radius) !important;
}

.selection-strip {
    border: 1px solid var(--admin-line) !important;
    background: rgba(255, 255, 255, 0.82) !important;
}

body:not(.exam-detail-active) .el-dialog,
body:not(.exam-detail-active) .el-message-box,
body:not(.exam-detail-active) .el-popover.el-popper {
    border: 1px solid rgba(210, 221, 232, 0.92) !important;
    border-radius: var(--admin-radius) !important;
    box-shadow: var(--admin-shadow-md) !important;
}

body:not(.exam-detail-active) .el-dialog {
    overflow: hidden !important;
}

body:not(.exam-detail-active) .el-dialog__header,
body:not(.exam-detail-active) .el-message-box__header {
    padding: 18px 20px 10px !important;
    border-bottom: 1px solid var(--admin-line) !important;
    background: #fbfcfe !important;
}

body:not(.exam-detail-active) .el-dialog__title,
body:not(.exam-detail-active) .el-message-box__title {
    color: var(--admin-text) !important;
    font-weight: 880 !important;
}

body:not(.exam-detail-active) .el-dialog__body {
    padding: 18px 20px !important;
}

body:not(.exam-detail-active) .el-dialog__footer,
body:not(.exam-detail-active) .el-message-box__btns {
    padding: 12px 20px 18px !important;
    border-top: 1px solid var(--admin-line) !important;
    background: #fbfcfe !important;
}

body:not(.exam-detail-active) .el-overlay {
    background-color: rgba(20, 28, 38, 0.38) !important;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
}

.share-flow-step,
.analysis-stat-card,
.analysis-section,
.feedback-message-block,
.feedback-reply-box {
    box-shadow: none !important;
}

.profile-cartoon-avatar,
.feedback-user-cell .el-avatar,
.personal-owner-cell .el-avatar {
    border-radius: var(--admin-radius) !important;
    box-shadow: inset 0 0 0 1px rgba(210, 221, 232, 0.8);
}

.operation-footer {
    width: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
}

.operation-dialog-intro,
.share-paper-summary,
.analysis-hero,
.accept-preview-panel {
    border: 1px solid var(--admin-line) !important;
    border-radius: var(--admin-radius) !important;
    background: var(--admin-surface-soft) !important;
}

.operation-dialog-intro,
.analysis-hero {
    padding: 16px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
}

.operation-dialog-intro > div > span,
.analysis-hero > div > span,
.share-paper-label {
    display: block;
    color: var(--admin-primary);
    font-size: 12px;
    line-height: 1.2;
    font-weight: 850;
}

.operation-dialog-intro > div > strong,
.analysis-hero > div > strong {
    display: block;
    margin-top: 7px;
    color: var(--admin-text);
    font-size: 18px;
    line-height: 1.35;
    font-weight: 880;
}

.operation-dialog-intro > div > small,
.analysis-hero > div > small,
.share-paper-meta {
    display: block;
    margin-top: 6px;
    color: var(--admin-text-muted);
    font-size: 13px;
    line-height: 1.55;
}

.admin-dialog-form {
    margin-top: 14px;
    padding: 16px 16px 2px;
    border: 1px solid var(--admin-line);
    border-radius: var(--admin-radius);
    background: #ffffff;
}

.success-switch {
    --el-switch-on-color: var(--admin-green);
}

.paper-share-dialog,
.accept-share-dialog,
.category-analysis-dialog {
    gap: 16px !important;
}

.share-paper-summary {
    padding: 16px !important;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
}

.share-paper-title,
.accept-preview-title {
    color: var(--admin-text) !important;
    font-size: 18px !important;
    line-height: 1.35 !important;
    font-weight: 880 !important;
}

.paper-share-form {
    padding: 16px 16px 2px;
    border: 1px solid var(--admin-line);
    border-radius: var(--admin-radius);
    background: #ffffff;
}

.share-rule-strip {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
}

.share-rule-strip > div,
.accept-preview-grid > div {
    min-width: 0;
    padding: 13px 14px;
    border: 1px solid var(--admin-line);
    border-radius: var(--admin-radius);
    background: #ffffff;
    box-shadow: var(--admin-shadow-xs);
}

.share-rule-strip span,
.accept-preview-grid span {
    display: block;
    color: var(--admin-text-muted);
    font-size: 12px;
    line-height: 1.25;
    font-weight: 760;
}

.share-rule-strip strong,
.accept-preview-grid strong {
    display: block;
    min-width: 0;
    margin-top: 6px;
    overflow: hidden;
    color: var(--admin-text);
    font-size: 15px;
    line-height: 1.35;
    font-weight: 860;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.share-generate-row {
    display: flex;
    justify-content: flex-end;
}

.share-result-panel {
    border-radius: var(--admin-radius) !important;
}

.analysis-hero > div > strong {
    font-size: 20px;
}

.analysis-stat-card {
    border-top: 3px solid var(--admin-primary) !important;
    background: #ffffff !important;
}

.analysis-stat-card.is-success {
    border-top-color: var(--admin-green) !important;
}

.analysis-stat-card.is-warning {
    border-top-color: var(--admin-amber) !important;
}

.analysis-stat-card.is-violet {
    border-top-color: var(--admin-violet) !important;
}

.analysis-stat-value {
    color: var(--admin-text) !important;
}

.analysis-section {
    background: #ffffff !important;
}

.accept-code-entry {
    padding: 14px;
    border: 1px solid var(--admin-line);
    border-radius: var(--admin-radius);
    background: #ffffff;
}

.accept-preview-panel {
    padding: 16px;
    display: grid;
    gap: 14px;
}

.accept-preview-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
}

.accept-preview-meta {
    margin-top: 6px;
    color: var(--admin-text-muted);
    font-size: 13px;
    line-height: 1.45;
}

.accept-preview-grid {
    display: grid;
    grid-template-columns: 0.9fr 1.1fr;
    gap: 10px;
}

.user-detail-dialog-body,
.assignment-dialog-body {
    display: grid;
    gap: 16px;
}

.assignment-dialog-body {
    max-height: 70vh;
    overflow-y: auto;
    overflow-x: hidden;
    padding-right: 4px;
}

.user-detail-hero,
.assignment-user-card,
.user-detail-section {
    border: 1px solid var(--admin-line);
    border-radius: var(--admin-radius);
    background: var(--admin-surface-soft);
}

.user-detail-hero,
.assignment-user-card {
    padding: 16px;
    display: grid;
    grid-template-columns: 60px minmax(0, 1fr);
    align-items: center;
    gap: 14px;
}

.assignment-user-card {
    grid-template-columns: 60px minmax(0, 1fr) minmax(260px, 330px);
}

.user-detail-name,
.assignment-user-name {
    color: var(--admin-text);
    font-size: 19px;
    line-height: 1.35;
    font-weight: 880;
}

.user-detail-meta-row,
.assignment-user-meta {
    margin-top: 8px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    color: var(--admin-text-muted);
    font-size: 13px;
    line-height: 1.45;
}

.user-detail-stat-grid,
.assignment-mini-metrics {
    display: grid;
    gap: 10px;
}

.user-detail-stat-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
}

.assignment-mini-metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
}

.user-detail-stat-card,
.assignment-mini-metrics div {
    min-width: 0;
    padding: 13px 14px;
    border: 1px solid var(--admin-line);
    border-radius: var(--admin-radius);
    background: #ffffff;
    box-shadow: var(--admin-shadow-xs);
}

.user-detail-stat-card {
    border-top: 3px solid var(--admin-primary);
}

.user-detail-stat-card.is-success {
    border-top-color: var(--admin-green);
}

.user-detail-stat-card.is-warning {
    border-top-color: var(--admin-amber);
}

.user-detail-stat-card.is-primary {
    border-top-color: var(--admin-violet);
}

.user-detail-stat-card span,
.assignment-mini-metrics span {
    display: block;
    color: var(--admin-text-muted);
    font-size: 12px;
    line-height: 1.25;
    font-weight: 760;
}

.user-detail-stat-card strong,
.assignment-mini-metrics strong {
    display: block;
    margin-top: 7px;
    color: var(--admin-text);
    font-size: 24px;
    line-height: 1;
    font-weight: 900;
}

.user-detail-section {
    padding: 16px;
    background: #ffffff;
}

.dialog-section-title {
    margin-bottom: 12px;
    color: var(--admin-text);
    font-size: 15px;
    line-height: 1.35;
    font-weight: 860;
}

.assignment-form {
    padding: 16px 16px 4px;
    border: 1px solid var(--admin-line);
    border-radius: var(--admin-radius);
    background: #ffffff;
}

.form-helper-text {
    margin-top: 7px;
    color: var(--admin-text-muted);
    font-size: 12px;
    line-height: 1.5;
}

.assignment-group {
    margin-bottom: 12px;
    padding: 13px;
    border: 1px solid var(--admin-line);
    border-radius: var(--admin-radius);
    background: var(--admin-surface-soft);
}

.assignment-group-head {
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.assignment-group-head strong {
    min-width: 0;
    overflow: hidden;
    color: var(--admin-text);
    font-size: 14px;
    line-height: 1.35;
    font-weight: 860;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.assignment-group-head span {
    flex: 0 0 auto;
    color: var(--admin-text-muted);
    font-size: 12px;
    font-weight: 720;
}

.assignment-option-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 8px;
}

.assignment-option-grid .el-checkbox {
    min-height: 38px;
    margin-right: 0 !important;
    padding: 7px 10px;
    border: 1px solid var(--admin-line);
    border-radius: var(--admin-radius);
    background: #ffffff;
    transition:
        border-color 0.18s ease,
        background-color 0.18s ease,
        box-shadow 0.18s ease;
}

.assignment-option-grid .el-checkbox.is-checked {
    border-color: rgba(37, 99, 235, 0.5);
    background: var(--admin-primary-soft);
    box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.08);
}

.assignment-option-grid .el-checkbox__label {
    min-width: 0;
    color: var(--admin-text-soft);
    line-height: 1.35;
    white-space: normal;
}

.danger-confirm {
    display: grid;
    justify-items: center;
    gap: 14px;
    text-align: center;
}

.danger-confirm-icon {
    width: 48px;
    height: 48px;
    border-radius: var(--admin-radius);
    display: grid;
    place-items: center;
    color: var(--admin-amber);
    background: var(--admin-amber-soft);
    font-size: 24px;
}

.danger-confirm-icon.is-critical {
    color: var(--admin-coral);
    background: var(--admin-coral-soft);
}

.danger-confirm-title {
    color: var(--admin-text);
    font-size: 18px;
    line-height: 1.35;
    font-weight: 880;
}

.danger-confirm-desc {
    max-width: 340px;
    color: var(--admin-text-muted);
    font-size: 13px;
    line-height: 1.65;
}

.math-challenge {
    width: 100%;
    padding: 14px;
    border: 1px solid var(--admin-line);
    border-radius: var(--admin-radius);
    background: var(--admin-surface-soft);
}

.math-challenge span,
.math-challenge strong {
    display: block;
}

.math-challenge span {
    color: var(--admin-text-muted);
    font-size: 12px;
    font-weight: 760;
}

.math-challenge strong {
    margin: 8px 0 12px;
    color: var(--admin-primary);
    font-size: 26px;
    line-height: 1;
    font-weight: 900;
}

.math-challenge .el-input {
    max-width: 220px;
}

@media (max-width: 1180px) {
    .dashboard-insight-grid {
        grid-template-columns: 1fr !important;
    }
}

@media (max-width: 900px) {
    .dashboard-page .mobile-header {
        height: 60px !important;
        padding: 0 14px !important;
        display: flex !important;
        border-bottom: 1px solid rgba(210, 221, 232, 0.86) !important;
        background: rgba(255, 255, 255, 0.92) !important;
        box-shadow: 0 8px 20px rgba(18, 28, 38, 0.05) !important;
        backdrop-filter: blur(14px) !important;
        -webkit-backdrop-filter: blur(14px) !important;
    }

    .dashboard-page .mobile-header .logo-mark {
        width: 34px !important;
        height: 34px !important;
        border-radius: var(--admin-radius) !important;
    }

    .dashboard-page .mobile-menu-trigger {
        width: 40px !important;
        height: 40px !important;
        border-radius: var(--admin-radius) !important;
        border: 1px solid var(--admin-line) !important;
        background: #ffffff !important;
        color: var(--admin-text) !important;
    }

    .dashboard-page .desktop-aside {
        display: none !important;
    }

    .dashboard-page .el-main {
        max-width: none !important;
        padding: 20px 14px 42px !important;
    }

    .content-toolbar,
    .category-toolbar-shell,
    .admin-list-toolbar-shell {
        grid-template-columns: 1fr !important;
        align-items: stretch;
        gap: 10px;
        padding: 9px;
        margin-bottom: 12px;
    }

    .category-toolbar-shell .page-header-actions,
    .admin-list-toolbar-shell .admin-list-toolbar,
    .admin-list-toolbar-shell .exam-results-toolbar,
    .admin-list-toolbar-shell .feedback-toolbar,
    .admin-list-toolbar-shell .personal-category-toolbar {
        grid-column: 1;
        justify-self: stretch;
    }

    .user-detail-hero,
    .assignment-user-card {
        grid-template-columns: 1fr;
    }

    .assignment-mini-metrics {
        width: 100%;
    }

    .operation-dialog-intro,
    .share-paper-summary,
    .analysis-hero,
    .accept-preview-head {
        flex-direction: column;
        align-items: stretch;
    }

    .dashboard-page .page-header-actions,
    .admin-list-toolbar,
    .exam-results-toolbar,
    .feedback-toolbar,
    .personal-category-toolbar {
        width: 100% !important;
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 8px !important;
    }

    .dashboard-page .page-header-actions > *,
    .admin-list-toolbar > *,
    .exam-results-toolbar > *,
    .feedback-toolbar > *,
    .personal-category-toolbar > * {
        width: 100% !important;
        min-width: 0 !important;
        margin: 0 !important;
    }
}

@media (max-width: 720px) {
    .dashboard-stats-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 10px !important;
    }

    .stat-card {
        min-height: 104px !important;
        padding: 13px !important;
        gap: 10px !important;
    }

    .stat-icon {
        width: 38px !important;
        height: 38px !important;
    }

    .stat-value {
        font-size: 24px !important;
    }

    .stat-label {
        font-size: 12px !important;
        white-space: normal !important;
    }

    .stat-hint {
        display: none !important;
    }

    .dashboard-action-strip,
    .category-cards-grid,
    .exam-cards-grid {
        grid-template-columns: 1fr !important;
    }

    .chart-section,
    .dashboard-side-panel,
    .category-card,
    .exam-card {
        padding: 16px !important;
    }

    .chart-kpis {
        width: 100%;
        justify-content: stretch !important;
    }

    .chart-kpis > div {
        flex: 1 1 0;
    }

    .data-table-card .el-table,
    .exam-results-table,
    .share-record-table {
        min-width: 760px !important;
    }

    .user-detail-stat-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .assignment-mini-metrics,
    .assignment-option-grid,
    .share-rule-strip,
    .accept-preview-grid {
        grid-template-columns: 1fr;
    }
}

@media (max-width: 520px) {
    .dashboard-page .page-header-actions,
    .admin-list-toolbar,
    .exam-results-toolbar,
    .feedback-toolbar,
    .personal-category-toolbar {
        grid-template-columns: 1fr !important;
    }

    .dashboard-stats-grid {
        gap: 8px !important;
    }

    .list-metric-strip {
        grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .user-detail-stat-grid {
        grid-template-columns: 1fr;
    }

    .stat-card {
        min-height: 92px !important;
        padding: 11px !important;
    }

    .dashboard-action-card {
        min-height: 86px !important;
    }

    .category-card-actions,
    .exam-card-actions {
        grid-template-columns: 1fr !important;
    }

    .category-card-actions .el-button,
    .exam-card-actions .el-button {
        width: 100% !important;
    }
}

/* Final top navigation polish. */
@media (min-width: 901px) {
    .dashboard-page .desktop-aside {
        height: 64px !important;
        min-height: 64px !important;
        padding-right: max(30px, calc((100vw - 1480px) / 2)) !important;
        padding-left: max(30px, calc((100vw - 1480px) / 2)) !important;
        overflow: visible !important;
        border-bottom: 1px solid rgba(198, 211, 224, 0.62) !important;
        background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.82) 0%, rgba(248, 251, 254, 0.68) 100%) !important;
        box-shadow:
            0 18px 48px rgba(20, 32, 51, 0.07),
            inset 0 1px 0 rgba(255, 255, 255, 0.78) !important;
        backdrop-filter: blur(22px) saturate(1.18) !important;
        -webkit-backdrop-filter: blur(22px) saturate(1.18) !important;
        isolation: isolate;
    }

    .dashboard-page .desktop-aside::before {
        content: "";
        position: absolute;
        inset: 0;
        z-index: 0;
        pointer-events: none;
        background:
            linear-gradient(90deg, rgba(36, 104, 178, 0.1), rgba(18, 128, 92, 0.07), rgba(245, 158, 11, 0.08));
        opacity: 0.32;
    }

    .dashboard-page .desktop-aside > * {
        position: relative;
        z-index: 1;
    }

    .dashboard-page .desktop-aside::after {
        display: none !important;
    }

    .dashboard-page .desktop-aside .logo {
        gap: 10px !important;
        font-size: 18px !important;
        font-weight: 850 !important;
    }

    .dashboard-page .desktop-aside .logo-mark {
        width: 32px !important;
        height: 32px !important;
        border-color: rgba(255, 255, 255, 0.74) !important;
        background: rgba(255, 255, 255, 0.72) !important;
        box-shadow:
            0 10px 24px rgba(36, 104, 178, 0.1),
            inset 0 0 0 1px rgba(36, 104, 178, 0.06) !important;
    }

    .dashboard-page .desktop-aside .el-menu {
        gap: 5px !important;
        padding: 0 10px !important;
    }

    .dashboard-page .desktop-aside .el-menu-item {
        position: relative;
        height: 34px !important;
        padding: 0 13px !important;
        border-color: transparent !important;
        background: transparent !important;
        color: rgba(20, 32, 51, 0.68) !important;
        font-weight: 760 !important;
        line-height: 34px !important;
        box-shadow: none !important;
    }

    .dashboard-page .desktop-aside .el-menu-item::after {
        display: none !important;
    }

    .dashboard-page .desktop-aside .el-menu-item:hover,
    .dashboard-page .desktop-aside .el-menu-item:focus-visible {
        border-color: rgba(255, 255, 255, 0.74) !important;
        background: rgba(255, 255, 255, 0.58) !important;
        color: var(--admin-text) !important;
        transform: none !important;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.58) !important;
    }

    .dashboard-page .desktop-aside .el-menu-item.is-active {
        border-color: rgba(36, 104, 178, 0.18) !important;
        background: rgba(232, 242, 255, 0.72) !important;
        color: var(--admin-primary) !important;
        box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.72) !important;
    }

    .dashboard-page .desktop-aside .el-menu-item.is-active::after {
        display: none !important;
    }

    .dashboard-page .desktop-aside .user-profile-card {
        height: 36px !important;
        padding: 4px 10px 4px 4px !important;
        border: 1px solid rgba(255, 255, 255, 0.66) !important;
        background: rgba(255, 255, 255, 0.46) !important;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.58) !important;
    }

    .dashboard-page .desktop-aside .user-profile-card:hover,
    .dashboard-page .desktop-aside .user-profile-card:focus-visible {
        border-color: rgba(36, 104, 178, 0.18) !important;
        background: rgba(255, 255, 255, 0.74) !important;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.68) !important;
    }

    .dashboard-page .desktop-aside .profile-cartoon-avatar {
        width: 28px !important;
        height: 28px !important;
        border-radius: 8px !important;
    }

    .dashboard-page .desktop-aside .user-profile-arrow {
        color: rgba(92, 107, 124, 0.72) !important;
    }

    .dashboard-page .el-main {
        padding-top: 92px !important;
    }
}

@media (max-width: 900px) {
    .dashboard-page .mobile-header {
        height: 56px !important;
        border-bottom: 1px solid rgba(198, 211, 224, 0.66) !important;
        background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.84), rgba(248, 251, 254, 0.7)) !important;
        box-shadow:
            0 12px 30px rgba(20, 32, 51, 0.06),
            inset 0 1px 0 rgba(255, 255, 255, 0.74) !important;
        backdrop-filter: blur(20px) saturate(1.16) !important;
        -webkit-backdrop-filter: blur(20px) saturate(1.16) !important;
    }

    .dashboard-page .mobile-header .logo {
        font-weight: 850 !important;
    }

    .dashboard-page .mobile-header .logo-mark {
        border: 1px solid rgba(255, 255, 255, 0.72) !important;
        background: rgba(255, 255, 255, 0.72) !important;
        box-shadow: 0 8px 18px rgba(36, 104, 178, 0.09) !important;
    }

    .dashboard-page .mobile-menu-trigger {
        border-color: rgba(255, 255, 255, 0.72) !important;
        background: rgba(255, 255, 255, 0.58) !important;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.62) !important;
    }
}

/* Final compact exam cards. */
.dashboard-page .exam-cards-grid {
    gap: 12px !important;
}

body .dashboard-page .exam-card {
    min-height: 0 !important;
    padding: 16px !important;
}

body .dashboard-page .exam-card .exam-card-header {
    gap: 8px !important;
    margin-bottom: 12px !important;
}

body .dashboard-page .exam-card .exam-analysis-tag {
    height: 28px !important;
    padding-inline: 11px !important;
    font-size: 12px !important;
    line-height: 28px !important;
}

body .dashboard-page .exam-card .exam-card-title {
    min-height: 46px !important;
    font-size: 17px !important;
    line-height: 1.34 !important;
}

.dashboard-page .exam-card-desc {
    min-height: 24px !important;
    margin: -2px 0 10px !important;
    font-size: 13px !important;
    line-height: 1.45 !important;
}

body .dashboard-page .exam-card .exam-card-count {
    margin: 0 0 12px !important;
}

.dashboard-page .exam-card-count .count-number {
    font-size: 30px !important;
    line-height: 1 !important;
}

.dashboard-page .exam-card-count .count-label {
    font-size: 13px !important;
}

.dashboard-page .exam-card-meta-grid {
    margin-top: 0 !important;
    gap: 8px !important;
}

.dashboard-page .exam-card-meta-grid div {
    padding: 8px 10px !important;
}

.dashboard-page .exam-card-meta-grid strong {
    margin-top: 4px !important;
    font-size: 12px !important;
}

body .dashboard-page .exam-card .exam-card-actions {
    margin-top: 14px !important;
    padding-top: 0 !important;
}

body .dashboard-page .exam-card .exam-card-actions .el-button {
    height: 34px !important;
}

@media (max-width: 720px) {
    body .dashboard-page .exam-card {
        padding: 14px !important;
    }

    body .dashboard-page .exam-card .exam-card-title {
        min-height: 0 !important;
    }
}

/* Final mobile dashboard chart layout fix. */
@media (max-width: 640px) {
    .dashboard-page .dashboard-chart-section {
        min-height: 0 !important;
        overflow: visible !important;
    }

    .dashboard-page .dashboard-chart-section .chart-section-head {
        margin-bottom: 12px !important;
    }

    .dashboard-page .dashboard-chart-section .chart-container {
        height: auto !important;
        min-height: 0 !important;
        overflow: visible !important;
    }

    .dashboard-page .dashboard-chart-section .mini-line-chart {
        height: 248px !important;
        margin-bottom: 4px;
    }
}

/* Final mobile app bar rebuild. */
@media (max-width: 900px) {
    .dashboard-page .mobile-header {
        position: sticky !important;
        top: 0 !important;
        z-index: 130 !important;
        width: 100% !important;
        height: auto !important;
        min-height: calc(54px + env(safe-area-inset-top, 0px)) !important;
        padding: calc(8px + env(safe-area-inset-top, 0px)) 14px 8px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        border: 0 !important;
        border-bottom: 1px solid rgba(197, 210, 224, 0.58) !important;
        border-radius: 0 !important;
        background: rgba(248, 251, 255, 0.78) !important;
        box-shadow: 0 10px 28px rgba(15, 31, 54, 0.06) !important;
        backdrop-filter: blur(18px) saturate(1.14) !important;
        -webkit-backdrop-filter: blur(18px) saturate(1.14) !important;
    }

    .dashboard-page .mobile-header .logo,
    .dashboard-page .mobile-header-logo {
        min-width: 0 !important;
        height: 38px !important;
        margin: 0 !important;
        padding: 0 !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 10px !important;
        color: #111827 !important;
        font-size: 18px !important;
        font-weight: 900 !important;
        line-height: 1 !important;
        letter-spacing: 0 !important;
    }

    .dashboard-page .mobile-header .logo span:last-child {
        max-width: calc(100vw - 126px);
        overflow: hidden !important;
        color: currentColor !important;
        background: none !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
        -webkit-text-fill-color: currentColor !important;
    }

    .dashboard-page .mobile-header .logo-mark {
        width: 36px !important;
        height: 36px !important;
        min-width: 36px !important;
        border: 1px solid rgba(255, 255, 255, 0.9) !important;
        border-radius: 12px !important;
        background: rgba(255, 255, 255, 0.72) !important;
        box-shadow:
            0 8px 18px rgba(37, 99, 235, 0.1),
            inset 0 1px 0 rgba(255, 255, 255, 0.72) !important;
        overflow: hidden !important;
    }

    .dashboard-page .mobile-header .logo-mark img {
        width: 100% !important;
        height: 100% !important;
        display: block !important;
        object-fit: cover !important;
    }

    .dashboard-page .mobile-menu-trigger {
        position: relative;
        width: 36px !important;
        height: 36px !important;
        min-width: 36px !important;
        padding: 0 !important;
        display: grid !important;
        grid-template-columns: repeat(2, 5px) !important;
        grid-auto-rows: 5px !important;
        place-content: center !important;
        gap: 5px !important;
        border: 1px solid rgba(219, 229, 240, 0.78) !important;
        border-radius: 999px !important;
        background: rgba(255, 255, 255, 0.54) !important;
        color: #1f5fbf !important;
        box-shadow:
            0 6px 16px rgba(15, 31, 54, 0.045),
            inset 0 1px 0 rgba(255, 255, 255, 0.8) !important;
        cursor: pointer;
        transition:
            background-color 0.16s ease,
            border-color 0.16s ease,
            transform 0.16s ease,
            box-shadow 0.16s ease !important;
    }

    .dashboard-page .mobile-menu-trigger span {
        width: 5px;
        height: 5px;
        display: block;
        border-radius: 2px;
        background: currentColor;
        box-shadow: 0 0 0 1px rgba(31, 95, 191, 0.04);
        opacity: 0.92;
        transition: transform 0.16s ease, opacity 0.16s ease;
    }

    .dashboard-page .mobile-menu-trigger:hover,
    .dashboard-page .mobile-menu-trigger:focus-visible {
        border-color: rgba(36, 104, 178, 0.26) !important;
        background: rgba(255, 255, 255, 0.86) !important;
        color: #174f9f !important;
        outline: none !important;
        box-shadow:
            0 8px 18px rgba(15, 31, 54, 0.07),
            inset 0 1px 0 rgba(255, 255, 255, 0.8) !important;
    }

    .dashboard-page .mobile-menu-trigger:hover span,
    .dashboard-page .mobile-menu-trigger:focus-visible span {
        opacity: 1;
        transform: scale(1.08);
    }

    .dashboard-page .mobile-menu-trigger:active {
        transform: scale(0.97);
    }
}

@media (max-width: 420px) {
    .dashboard-page .mobile-header {
        min-height: calc(52px + env(safe-area-inset-top, 0px)) !important;
        padding-right: 12px !important;
        padding-left: 12px !important;
    }

    .dashboard-page .mobile-header .logo,
    .dashboard-page .mobile-header-logo {
        font-size: 17px !important;
    }

    .dashboard-page .mobile-header .logo-mark {
        width: 34px !important;
        height: 34px !important;
        min-width: 34px !important;
    }
}

/* Final tablet shell alignment: keep one scroll container so the page no longer
   reserves two right-side gutters and looks shifted left on tablets. */
body:not(.exam-detail-active) {
    overflow-x: clip !important;
    overflow-y: visible !important;
    scrollbar-gutter: auto !important;
}

body:not(.exam-detail-active) #app,
body:not(.exam-detail-active) .dashboard-page,
body:not(.exam-detail-active) .dashboard-page > .el-container,
body:not(.exam-detail-active) .dashboard-page > .el-container > .el-container {
    width: 100% !important;
    max-width: none !important;
    overflow-x: clip !important;
    overflow-y: visible !important;
}

@media (min-width: 721px) and (max-width: 1024px) {
    body:not(.exam-detail-active) .dashboard-page .desktop-aside {
        display: none !important;
    }

    body:not(.exam-detail-active) .dashboard-page .mobile-header {
        display: flex !important;
        padding-right: calc(22px + env(safe-area-inset-right, 0px)) !important;
        padding-left: calc(22px + env(safe-area-inset-left, 0px)) !important;
    }

    body:not(.exam-detail-active) .dashboard-page .mobile-menu-trigger {
        position: relative;
        width: 38px !important;
        height: 38px !important;
        min-width: 38px !important;
        padding: 0 !important;
        display: grid !important;
        grid-template-columns: repeat(2, 5px) !important;
        grid-auto-rows: 5px !important;
        place-content: center !important;
        gap: 5px !important;
        border: 1px solid rgba(219, 229, 240, 0.78) !important;
        border-radius: 999px !important;
        background: rgba(255, 255, 255, 0.62) !important;
        color: #1f5fbf !important;
    }

    body:not(.exam-detail-active) .dashboard-page .mobile-menu-trigger span {
        width: 5px;
        height: 5px;
        display: block;
        border-radius: 2px;
        background: currentColor;
        opacity: 0.92;
    }

    body:not(.exam-detail-active) .dashboard-page .el-main {
        width: 100% !important;
        max-width: min(100%, 980px) !important;
        margin-right: auto !important;
        margin-left: auto !important;
        padding: 24px clamp(22px, 3.4vw, 34px) 52px !important;
    }

    body:not(.exam-detail-active) .dashboard-page .dashboard-container,
    body:not(.exam-detail-active) .dashboard-page .major-categories-view,
    body:not(.exam-detail-active) .dashboard-page .exam-results-view,
    body:not(.exam-detail-active) .dashboard-page .users-view,
    body:not(.exam-detail-active) .dashboard-page .personal-categories-view,
    body:not(.exam-detail-active) .dashboard-page .feedback-view,
    body:not(.exam-detail-active) .dashboard-page .el-main > div {
        width: 100% !important;
        margin-right: auto !important;
        margin-left: auto !important;
    }

    body:not(.exam-detail-active) .dashboard-page .dashboard-stats-grid,
    body:not(.exam-detail-active) .dashboard-page .dashboard-action-strip,
    body:not(.exam-detail-active) .dashboard-page .category-cards-grid,
    body:not(.exam-detail-active) .dashboard-page .exam-cards-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }

    body:not(.exam-detail-active) .dashboard-page .dashboard-insight-grid {
        grid-template-columns: 1fr !important;
    }
}

@media (prefers-reduced-motion: reduce) {
    .dashboard-page *,
    body:not(.exam-detail-active) .el-dialog,
    body:not(.exam-detail-active) .el-message-box {
        animation: none !important;
        transition: none !important;
        scroll-behavior: auto !important;
    }
}
</style>
