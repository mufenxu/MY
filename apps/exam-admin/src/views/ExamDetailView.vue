<template>
    <div class="exam-detail-page" v-loading="loading">
        <el-container class="exam-shell">
            <el-header class="exam-topbar">
                <div class="topbar-main">
                    <div class="topbar-title-group">
                        <el-button class="topbar-back" @click="goBack" icon="ArrowLeft" circle aria-label="返回"></el-button>
                        <div class="paper-title-block">
                            <span class="paper-kicker">试卷编辑</span>
                            <h1>{{ examInfo.name || '未命名试卷' }}</h1>
                        </div>
                    </div>

                    <div class="editor-status-strip">
                        <el-tag type="info" effect="plain">完成 {{ completedQuestionCount }}/{{ questions.length }}</el-tag>
                        <el-tag v-if="isDirty" type="warning" effect="light">未保存</el-tag>
                        <el-tag v-if="invalidQuestionCount > 0" type="danger" effect="light">
                            待补全 {{ invalidQuestionCount }}
                        </el-tag>
                        <el-tag v-else-if="questions.length > 0" type="success" effect="light">可发布</el-tag>
                        <button
                            v-if="invalidQuestionCount > 0"
                            type="button"
                            class="status-jump-button"
                            @click="jumpToFirstInvalidQuestion">
                            定位
                        </button>
                    </div>

                    <div v-if="canEdit" class="topbar-actions">
                        <div class="desktop-toolbar">
                            <el-tooltip content="新增单选题" placement="bottom">
                                <el-button class="add-question-btn" plain @click="addQuestion('single')">
                                    <el-icon><CircleCheck /></el-icon>
                                    <span>单选</span>
                                </el-button>
                            </el-tooltip>
                            <el-tooltip content="新增多选题" placement="bottom">
                                <el-button class="add-question-btn" plain @click="addQuestion('multiple')">
                                    <el-icon><List /></el-icon>
                                    <span>多选</span>
                                </el-button>
                            </el-tooltip>
                            <el-tooltip content="新增判断题" placement="bottom">
                                <el-button class="add-question-btn" plain @click="addQuestion('judge')">
                                    <el-icon><Check /></el-icon>
                                    <span>判断</span>
                                </el-button>
                            </el-tooltip>
                            <el-tooltip content="新增填空题" placement="bottom">
                                <el-button class="add-question-btn" plain @click="addQuestion('fill')">
                                    <el-icon><EditPen /></el-icon>
                                    <span>填空</span>
                                </el-button>
                            </el-tooltip>
                        </div>
                        <el-button class="import-question-btn" plain @click="openBatchDialog">
                            <el-icon><Upload /></el-icon>
                            <span>批量导入</span>
                        </el-button>
                        <el-button v-if="canBatchGenerateAi" class="ai-batch-entry" plain @click="openAiBatchDialog">
                            <el-icon><MagicStick /></el-icon>
                            <span>批量AI解析</span>
                        </el-button>
                        <el-button class="edit-info-btn" link @click="openEditDialog">
                            <el-icon><Edit /></el-icon>
                            <span>编辑信息</span>
                        </el-button>
                        <el-button type="primary" class="save-exam-btn" @click="saveExam" :loading="saving">
                            保存试卷
                        </el-button>
                    </div>
                </div>
            </el-header>

            <el-container class="editor-workbench">
                <el-aside width="286px" class="paper-overview">
                    <section class="overview-card overview-progress">
                        <div class="overview-card-head">
                            <span>完成度</span>
                            <strong>{{ completionPercent }}%</strong>
                        </div>
                        <el-progress :percentage="completionPercent" :show-text="false" :stroke-width="8"
                            :status="invalidQuestionCount > 0 ? 'warning' : 'success'"></el-progress>
                        <div class="overview-stats">
                            <div>
                                <strong>{{ questions.length }}</strong>
                                <span>题目</span>
                            </div>
                            <div>
                                <strong>{{ completedQuestionCount }}</strong>
                                <span>完成</span>
                            </div>
                            <div>
                                <strong>{{ invalidQuestionCount }}</strong>
                                <span>待补</span>
                            </div>
                        </div>
                        <button
                            v-if="invalidQuestionCount > 0"
                            type="button"
                            class="overview-next-action"
                            @click="jumpToFirstInvalidQuestion">
                            继续补全第 {{ firstInvalidQuestionIndex + 1 }} 题
                        </button>
                    </section>

                    <section class="overview-card type-overview">
                        <div class="overview-card-title">题型分布</div>
                        <div class="type-count-grid">
                            <div>
                                <span>单选</span>
                                <strong>{{ questionTypeCounts.single }}</strong>
                            </div>
                            <div>
                                <span>多选</span>
                                <strong>{{ questionTypeCounts.multiple }}</strong>
                            </div>
                            <div>
                                <span>判断</span>
                                <strong>{{ questionTypeCounts.judge }}</strong>
                            </div>
                            <div>
                                <span>填空</span>
                                <strong>{{ questionTypeCounts.fill }}</strong>
                            </div>
                        </div>
                    </section>

                    <section class="overview-card question-map-card">
                        <div class="overview-card-head">
                            <span>题号导航</span>
                            <small>{{ selectedIndex >= 0 ? `当前 #${selectedIndex + 1}` : '未选择' }}</small>
                        </div>
                        <div class="question-map-legend">
                            <span><i class="is-current"></i>当前</span>
                            <span><i class="is-done"></i>完成</span>
                            <span><i class="is-invalid"></i>待补</span>
                        </div>
                        <div class="question-map">
                            <button
                                v-for="(question, index) in questions"
                                :key="question._id || index"
                                type="button"
                                class="question-map-item"
                                :class="{
                                    active: selectedIndex === index,
                                    invalid: canEdit && !validateQuestion(question),
                                    done: validateQuestion(question),
                                }"
                                @click="jumpToQuestion(index)"
                            >
                                {{ index + 1 }}
                            </button>
                        </div>
                    </section>
                </el-aside>
                <el-main class="question-stage">
                    <div class="stage-header">
                        <div>
                            <span class="stage-eyebrow">题目编排</span>
                            <h2>{{ examInfo.name || '未命名试卷' }}</h2>
                            <p>共 {{ questions.length }} 道题，当前正在编辑第 {{ selectedIndex >= 0 ? selectedIndex + 1 : '-' }} 题。</p>
                        </div>
                        <div class="stage-side-status" v-if="questions.length > 0">
                            <button
                                v-if="invalidQuestionCount > 0"
                                type="button"
                                class="stage-jump-button"
                                @click="jumpToFirstInvalidQuestion">
                                跳到待补全
                            </button>
                            <div class="stage-completion">
                                <strong>{{ completionPercent }}%</strong>
                                <span>{{ invalidQuestionCount > 0 ? `${invalidQuestionCount} 题待补全` : '题目已补全' }}</span>
                            </div>
                        </div>
                    </div>
                    <div ref="questionListEl" class="canvas-container" @scroll.passive="handleQuestionListScroll">
                        <div v-if="questions.length === 0" class="empty-tip">
                            <el-icon><DocumentAdd /></el-icon>
                            <strong>{{ canEdit ? '当前试卷还没有题目' : '暂无题目' }}</strong>
                            <span>新增题目后会显示在这里。</span>
                        </div>

                        <div
                            v-for="item in renderedQuestionItems"
                            :key="item.question._id || `question-${item.index}`"
                            class="question-card editor-question-card"
                            :data-question-index="item.index"
                            role="button"
                            tabindex="0"
                            :aria-current="selectedIndex === item.index ? 'true' : undefined"
                            :aria-label="`选择第 ${item.index + 1} 题`"
                            :class="{
                                active: selectedIndex === item.index,
                                invalid: canEdit && !validateQuestion(item.question),
                            }"
                            @click="selectQuestion(item.index)"
                            @keydown.enter.self.prevent="selectQuestion(item.index)"
                            @keydown.space.self.prevent="selectQuestion(item.index)"
                        >
                            <div class="q-header">
                                <div class="q-titleline">
                                    <span class="q-index">{{ item.index + 1 }}</span>
                                    <el-tag size="small" :type="getQuestionTypeTag(item.question.type)">
                                        {{ getQuestionTypeName(item.question.type) }}
                                    </el-tag>
                                    <span class="q-state" :class="{ done: validateQuestion(item.question) }">
                                        {{ validateQuestion(item.question) ? '已完成' : '待补全' }}
                                    </span>
                                </div>
                                <el-button v-if="canEdit" class="question-delete-btn" type="danger" link size="small"
                                    @click.stop="deleteQuestion(item.index)">
                                    删除
                                </el-button>
                            </div>

                            <div class="q-content">{{ item.question.content || '请输入题目内容' }}</div>

                            <div v-if="item.question.type !== 'fill'" class="question-options-preview">
                                <div
                                    v-for="(opt, oIdx) in item.question.options"
                                    :key="oIdx"
                                    class="option-preview"
                                    :class="{ answer: opt.isAnswer }"
                                >
                                    <span class="option-letter">{{ opt.label }}</span>
                                    <span class="option-text">{{ opt.value || '未填写' }}</span>
                                </div>
                            </div>

                            <div v-else class="fill-answer-preview">
                                <span>参考答案</span>
                                <strong>{{ item.question.fillAnswer || '未填写' }}</strong>
                            </div>

                            <div v-if="item.question.analysis" class="q-analysis-preview">
                                <span>解析</span>
                                <p>{{ item.question.analysis }}</p>
                            </div>
                        </div>

                        <div v-if="hasMoreRenderedQuestions" class="question-list-more">
                            <el-button text type="primary" @click="renderMoreQuestions()">
                                继续加载 {{ remainingQuestionCount }} 道题
                            </el-button>
                        </div>
                    </div>
                </el-main>

                <el-aside width="440px" class="prop-aside">
                    <div v-if="selectedIndex >= 0 && questions[selectedIndex]" class="prop-panel">
                        <div class="prop-header">
                            <div class="prop-header-main">
                                <span class="prop-kicker">{{ canEdit ? '编辑题目' : '查看题目' }}</span>
                                <div class="prop-title">第 {{ selectedIndex + 1 }} 题设置</div>
                                <div class="prop-subtitle">{{ getQuestionTypeName(questions[selectedIndex].type) }} · {{ currentQuestionValid ? '信息完整' : '仍需补全' }}</div>
                            </div>
                            <div class="prop-index-badge">#{{ selectedIndex + 1 }}</div>
                        </div>

                        <div class="inspector-summary">
                            <div>
                                <span>题型</span>
                                <strong>{{ getQuestionTypeName(questions[selectedIndex].type) }}</strong>
                            </div>
                            <div v-if="questions[selectedIndex].type !== 'fill'">
                                <span>选项</span>
                                <strong>{{ questions[selectedIndex].options.length }}</strong>
                            </div>
                            <div>
                                <span>答案</span>
                                <strong>{{ selectedAnswerSummary }}</strong>
                            </div>
                        </div>

                        <div class="prop-section prop-form-item">
                            <div class="prop-section-title">
                                <span>题目类型</span>
                                <span class="prop-section-tip">切换后自动整理选项</span>
                            </div>
                            <el-radio-group v-model="questions[selectedIndex].type" @change="handleTypeChange"
                                :disabled="!canEdit"
                                class="type-radio-group">
                                <el-radio-button value="single">单选</el-radio-button>
                                <el-radio-button value="multiple">多选</el-radio-button>
                                <el-radio-button value="judge">判断</el-radio-button>
                                <el-radio-button value="fill">填空</el-radio-button>
                            </el-radio-group>
                        </div>

                        <div class="prop-section prop-form-item prop-section--primary">
                            <div class="prop-section-title">
                                <span>题干内容</span>
                            </div>
                            <el-input v-model="questions[selectedIndex].content" type="textarea" :rows="5"
                                :readonly="!canEdit" placeholder="请输入题目描述..." resize="none" class="prop-content-input"
                                @input="markQuestionChanged"></el-input>
                        </div>

                        <div class="prop-section prop-form-item" v-if="questions[selectedIndex].type !== 'fill'">
                            <div class="prop-section-title">
                                <span>选项与答案</span>
                                <span class="prop-section-tip">勾选即为正确答案</span>
                            </div>
                            <div class="option-list">
                                <div v-for="(opt, idx) in questions[selectedIndex].options" :key="idx"
                                    class="option-item" :class="{ 'is-checked': opt.isAnswer }">
                                    <div class="option-meta">
                                        <el-checkbox v-model="opt.isAnswer" @change="handleAnswerChange(opt)"
                                            :disabled="!canEdit"
                                            class="option-check">
                                            <span class="option-label">{{ opt.label }}</span>
                                        </el-checkbox>
                                    </div>
                                    <div class="option-input-wrapper">
                                        <el-input v-model="opt.value" type="textarea"
                                            :readonly="!canEdit"
                                            :autosize="{ minRows: 1, maxRows: 4 }" placeholder="选项内容"
                                            resize="none" @input="markQuestionChanged"></el-input>
                                    </div>
                                    <el-button v-if="canEdit && questions[selectedIndex].type !== 'judge'"
                                        class="option-delete-btn" type="danger" link
                                        :aria-label="`删除选项 ${opt.label || idx + 1}`"
                                        @click="removeOption(idx)">
                                        <el-icon><Delete /></el-icon>
                                    </el-button>
                                </div>
                            </div>

                            <el-button v-if="canEdit && questions[selectedIndex].type !== 'judge'" class="add-option-btn"
                                icon="Plus" @click="addOption">
                                添加选项
                            </el-button>
                        </div>

                        <div class="prop-section prop-form-item" v-if="questions[selectedIndex].type === 'fill'">
                            <div class="prop-section-title">
                                <span>正确答案</span>
                            </div>
                            <el-input v-model="questions[selectedIndex].fillAnswer" :readonly="!canEdit" placeholder="请输入正确答案"
                                @input="markQuestionChanged"></el-input>
                        </div>

                        <div class="prop-section prop-form-item">
                            <div class="prop-section-title">
                                <span>解析</span>
                                <div class="prop-section-actions">
                                    <span class="prop-section-tip">可选</span>
                                    <el-button
                                        v-if="canEdit && isPersistedQuestion(questions[selectedIndex])"
                                        size="small"
                                        type="primary"
                                        plain
                                        @click="openAiAnalysisDialog"
                                    >
                                        <el-icon><MagicStick /></el-icon>
                                        AI解析
                                    </el-button>
                                </div>
                            </div>
                            <el-input v-model="questions[selectedIndex].analysis" type="textarea" :rows="4"
                                :readonly="!canEdit" placeholder="输入题目解析..." resize="none" class="prop-analysis-input"
                                @input="markQuestionChanged"></el-input>
                        </div>
                    </div>
                    <div v-else class="empty-prop">
                        <el-icon size="48" color="#c7d2e4"><Edit /></el-icon>
                        <strong>选择一道题目开始编辑</strong>
                        <span>左侧题号导航可快速定位，未完成题会有状态提示。</span>
                    </div>
                </el-aside>
            </el-container>
        </el-container>

        <!-- 移动端添加按钮 -->
        <el-button v-if="canEdit" type="primary" class="mobile-fab" @click="mobileAddVisible = true" circle aria-label="添加题目">
            <el-icon><Plus /></el-icon>
        </el-button>

        <!-- 移动端抽屉 (Redesign) -->
        <el-drawer v-if="canEdit" v-model="mobileAddVisible" direction="btt" size="auto" :with-header="false"
            aria-label="添加题目" class="custom-mobile-drawer" :show-close="false">
            <div class="mobile-drawer-content">
                <div class="mobile-drawer-header">
                    <span class="title">添加题目</span>
                    <div class="close-btn" @click="mobileAddVisible = false">
                        <el-icon><Close /></el-icon>
                    </div>
                </div>

                <div class="mobile-tool-grid">
                    <div class="mobile-tool-item" @click="addQuestion('single'); mobileAddVisible = false">
                        <div class="tool-icon-wrapper blue">
                            <el-icon><CircleCheck /></el-icon>
                        </div>
                        <span class="tool-label">单选题</span>
                    </div>
                    <div class="mobile-tool-item" @click="addQuestion('multiple'); mobileAddVisible = false">
                        <div class="tool-icon-wrapper purple">
                            <el-icon><CopyDocument /></el-icon>
                        </div>
                        <span class="tool-label">多选题</span>
                    </div>
                    <div class="mobile-tool-item" @click="addQuestion('judge'); mobileAddVisible = false">
                        <div class="tool-icon-wrapper green">
                            <el-icon><Check /></el-icon>
                        </div>
                        <span class="tool-label">判断题</span>
                    </div>
                    <div class="mobile-tool-item" @click="addQuestion('fill'); mobileAddVisible = false">
                        <div class="tool-icon-wrapper orange">
                            <el-icon><EditPen /></el-icon>
                        </div>
                        <span class="tool-label">填空题</span>
                    </div>
                </div>

                <div class="mobile-tool-divider">其他功能</div>

                <div class="mobile-tool-row" @click="openBatchDialog(); mobileAddVisible = false">
                    <div class="tool-icon-wrapper teal mobile-row-icon">
                        <el-icon><Upload /></el-icon>
                    </div>
                    <div class="tool-info">
                        <span class="tool-row-title">批量导入</span>
                        <span class="tool-row-desc">支持智能识别文本题目</span>
                    </div>
                    <el-icon class="arrow-icon"><ArrowRight /></el-icon>
                </div>

                <div v-if="canBatchGenerateAi" class="mobile-tool-row" @click="openAiBatchDialog(); mobileAddVisible = false">
                    <div class="tool-icon-wrapper purple mobile-row-icon">
                        <el-icon><MagicStick /></el-icon>
                    </div>
                    <div class="tool-info">
                        <span class="tool-row-title">批量AI解析</span>
                        <span class="tool-row-desc">提前生成可复用的 AI 解析</span>
                    </div>
                    <el-icon class="arrow-icon"><ArrowRight /></el-icon>
                </div>

                <div class="mobile-tool-row" @click="openEditDialog(); mobileAddVisible = false">
                    <div class="tool-icon-wrapper blue mobile-row-icon">
                        <el-icon><Edit /></el-icon>
                    </div>
                    <div class="tool-info">
                        <span class="tool-row-title">编辑信息</span>
                        <span class="tool-row-desc">维护名称、时长和及格分数</span>
                    </div>
                    <el-icon class="arrow-icon"><ArrowRight /></el-icon>
                </div>
            </div>
        </el-drawer>

        <!-- 移动端/平板端题目编辑 -->
        <el-drawer
            v-model="mobilePropVisible"
            direction="rtl"
            size="100%"
            :with-header="false"
            :show-close="false"
            aria-label="题目编辑面板"
            class="mobile-editor-drawer"
        >
            <div v-if="selectedIndex >= 0 && questions[selectedIndex]" class="mobile-editor-sheet">
                <div class="mobile-editor-header">
                    <div class="mobile-editor-heading">
                        <span>{{ canEdit ? '编辑题目' : '查看题目' }}</span>
                        <strong>第 {{ selectedIndex + 1 }} 题设置</strong>
                        <small>{{ getQuestionTypeName(questions[selectedIndex].type) }} · {{ currentQuestionValid ? '信息完整' : '仍需补全' }}</small>
                    </div>
                    <div class="mobile-editor-badge">#{{ selectedIndex + 1 }}</div>
                    <el-button class="mobile-editor-close" circle aria-label="关闭题目编辑面板" @click="mobilePropVisible = false">
                        <el-icon><Close /></el-icon>
                    </el-button>
                </div>

                <div class="mobile-editor-body">
                    <div class="mobile-editor-summary">
                        <div>
                            <span>题型</span>
                            <strong>{{ getQuestionTypeName(questions[selectedIndex].type) }}</strong>
                        </div>
                        <div v-if="questions[selectedIndex].type !== 'fill'">
                            <span>选项</span>
                            <strong>{{ questions[selectedIndex].options.length }}</strong>
                        </div>
                        <div>
                            <span>答案</span>
                            <strong>{{ selectedAnswerSummary }}</strong>
                        </div>
                    </div>

                    <el-form class="mobile-editor-form" label-position="top">
                        <section class="mobile-editor-section">
                            <div class="mobile-section-title">
                                <span>题目类型</span>
                                <small>切换后自动整理选项</small>
                            </div>
                            <el-radio-group
                                v-model="questions[selectedIndex].type"
                                @change="handleTypeChange"
                                :disabled="!canEdit"
                                class="type-radio-group mobile-type-radio"
                            >
                                <el-radio-button value="single">单选</el-radio-button>
                                <el-radio-button value="multiple">多选</el-radio-button>
                                <el-radio-button value="judge">判断</el-radio-button>
                                <el-radio-button value="fill">填空</el-radio-button>
                            </el-radio-group>
                        </section>

                        <section class="mobile-editor-section mobile-editor-section--primary">
                            <div class="mobile-section-title">
                                <span>题干内容</span>
                            </div>
                            <el-input
                                v-model="questions[selectedIndex].content"
                                type="textarea"
                                :rows="5"
                                :readonly="!canEdit"
                                placeholder="请输入题目描述..."
                                resize="none"
                                class="mobile-content-input"
                                @input="markQuestionChanged"
                            ></el-input>
                        </section>

                        <section class="mobile-editor-section" v-if="questions[selectedIndex].type !== 'fill'">
                            <div class="mobile-section-title">
                                <span>选项与答案</span>
                                <small>勾选即为正确答案</small>
                            </div>
                            <div class="mobile-option-list">
                                <div
                                    v-for="(opt, idx) in questions[selectedIndex].options"
                                    :key="idx"
                                    class="mobile-option-item"
                                    :class="{ 'is-checked': opt.isAnswer }"
                                >
                                    <el-checkbox
                                        v-model="opt.isAnswer"
                                        :disabled="!canEdit"
                                        class="mobile-option-check"
                                        @change="handleAnswerChange(opt)"
                                    >
                                        <span>{{ opt.label }}</span>
                                    </el-checkbox>
                                    <el-input
                                        v-model="opt.value"
                                        type="textarea"
                                        :autosize="{ minRows: 1, maxRows: 4 }"
                                        :readonly="!canEdit"
                                        placeholder="选项内容"
                                        resize="none"
                                        class="mobile-option-input"
                                        @input="markQuestionChanged"
                                    ></el-input>
                                    <el-button
                                        v-if="canEdit && questions[selectedIndex].type !== 'judge'"
                                        class="mobile-option-delete"
                                        type="danger"
                                        link
                                        :aria-label="`删除选项 ${opt.label || idx + 1}`"
                                        @click="removeOption(idx)"
                                    >
                                        <el-icon><Delete /></el-icon>
                                    </el-button>
                                </div>
                            </div>
                            <el-button
                                v-if="canEdit && questions[selectedIndex].type !== 'judge'"
                                class="mobile-add-option-btn"
                                icon="Plus"
                                @click="addOption"
                            >
                                添加选项
                            </el-button>
                        </section>

                        <section class="mobile-editor-section" v-if="questions[selectedIndex].type === 'fill'">
                            <div class="mobile-section-title">
                                <span>正确答案</span>
                            </div>
                            <el-input
                                v-model="questions[selectedIndex].fillAnswer"
                                :readonly="!canEdit"
                                placeholder="请输入正确答案"
                                @input="markQuestionChanged"
                            ></el-input>
                        </section>

                        <section class="mobile-editor-section">
                            <div class="mobile-section-title">
                                <span>解析</span>
                                <div class="mobile-section-actions">
                                    <small>可选</small>
                                    <el-button
                                        v-if="canEdit && isPersistedQuestion(questions[selectedIndex])"
                                        size="small"
                                        type="primary"
                                        plain
                                        @click="openAiAnalysisDialog"
                                    >
                                        <el-icon><MagicStick /></el-icon>
                                        AI解析
                                    </el-button>
                                </div>
                            </div>
                            <el-input
                                v-model="questions[selectedIndex].analysis"
                                type="textarea"
                                :rows="4"
                                :readonly="!canEdit"
                                placeholder="输入题目解析..."
                                resize="none"
                                class="mobile-analysis-input"
                                @input="markQuestionChanged"
                            ></el-input>
                        </section>
                    </el-form>
                </div>
            </div>
        </el-drawer>

        <!-- 批量导入 -->
        <el-dialog
            v-if="canEdit"
            v-model="batchDialog.visible"
            title="批量导入题目"
            width="1180px"
            destroy-on-close
            class="batch-import-dialog batch-import-workbench-dialog"
        >
            <div class="batch-workbench">
                <section class="batch-pane batch-source-pane">
                    <div class="batch-pane-head">
                        <div>
                            <strong>原文输入</strong>
                            <span>{{ batchAutoParseStatus }}</span>
                        </div>
                        <div class="tip-actions">
                            <el-button
                                text
                                type="primary"
                                class="tip-upload-btn"
                                :loading="batchSpreadsheetImporting"
                                @click="triggerBatchFileImport">
                                <el-icon><Upload /></el-icon>
                                <span>Excel/CSV</span>
                            </el-button>
                            <el-button text type="primary" class="tip-copy-btn" @click="copyBatchFormatGuide">
                                复制 AI 模板
                            </el-button>
                            <el-button text type="primary" class="tip-toggle-btn" @click="batchFormatExpanded = !batchFormatExpanded">
                                {{ batchFormatExpanded ? '收起格式' : '格式说明' }}
                            </el-button>
                            <input
                                ref="batchFileInputRef"
                                class="batch-file-input"
                                type="file"
                                accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                @change="handleBatchFileChange">
                        </div>
                    </div>

                    <div class="batch-source-input">
                        <el-input
                            v-model="batchForm.text"
                            type="textarea"
                            :rows="18"
                            placeholder="在此粘贴题目内容..."
                            class="batch-input batch-code-input"
                            @input="handleBatchTextInput"
                        ></el-input>
                    </div>

                    <div class="batch-format-tip">
                        <div class="tip-quick">
                            <div class="tip-quick-row">
                                <span class="tip-label">题头</span>
                                <div class="tip-content">
                                    <code>1. 题目内容</code>
                                    <code>1) 题目内容</code>
                                    <code>第1题 题目内容</code>
                                    <code>1. 多选题：题目内容</code>
                                    <code>直接题干内容</code>
                                </div>
                            </div>
                            <div class="tip-quick-row">
                                <span class="tip-label">选项</span>
                                <div class="tip-content">
                                    <code>A. 内容</code>
                                    <code>A: 内容</code>
                                    <code>(A) 内容</code>
                                    <code>A 内容</code>
                                </div>
                            </div>
                            <div class="tip-quick-row">
                                <span class="tip-label">答案</span>
                                <div class="tip-content">
                                    <code>答案: A</code>
                                    <code>答案: ABCD</code>
                                    <code>正确答案: A</code>
                                    <code>答案: 正确/错误</code>
                                </div>
                            </div>
                            <div class="tip-quick-row">
                                <span class="tip-label">表格</span>
                                <div class="tip-content">
                                    <code>题干</code>
                                    <code>题型</code>
                                    <code>A/B/C/D</code>
                                    <code>答案</code>
                                    <code>解析</code>
                                </div>
                            </div>
                        </div>

                        <el-collapse-transition>
                            <div v-show="batchFormatExpanded" class="tip-expanded">
                                <div class="tip-rules">
                                    <div class="tip-rule-row">
                                        <span class="tip-label">题干行</span>
                                        <div class="tip-content">
                                            <code>题目: 内容</code>
                                            <code>题干: 内容</code>
                                            <code>问题: 内容</code>
                                            <code>question: 内容</code>
                                            <code>q: 内容</code>
                                        </div>
                                    </div>
                                    <div class="tip-rule-row">
                                        <span class="tip-label">选项</span>
                                        <div class="tip-content">
                                            <code>A、内容</code>
                                            <code>选项A: 内容</code>
                                            <code>A. ... B. ... C. ...</code>
                                        </div>
                                    </div>
                                    <div class="tip-rule-row">
                                        <span class="tip-label">答案</span>
                                        <div class="tip-content">
                                            <code>参考答案: A</code>
                                            <code>答案是: A</code>
                                            <code>答案: A、C、D</code>
                                            <code>答案: A/C/D</code>
                                            <code>答案: A和C和D</code>
                                            <code>答案: 选项A,B</code>
                                        </div>
                                    </div>
                                    <div class="tip-rule-row">
                                        <span class="tip-label">解析/忽略</span>
                                        <div class="tip-content">
                                            <code>解析: 内容</code>
                                            <code>本题得分: 2</code>
                                            <code>得分: 2</code>
                                        </div>
                                    </div>
                                </div>
                                <div class="tip-note">判断题会自动映射为 A=正确、B=错误；会自动清理题头前缀中的残留符号。</div>
                                <div class="tip-template-head">给 AI 的整理模板</div>
                                <el-input
                                    type="textarea"
                                    :rows="6"
                                    readonly
                                    :model-value="batchFormatGuide"
                                    class="tip-template-input"
                                ></el-input>
                            </div>
                        </el-collapse-transition>
                    </div>
                </section>

                <section class="batch-pane batch-review-pane">
                    <div class="batch-review-head">
                        <div>
                            <strong>识别与校验</strong>
                            <span v-if="batchPreview.length > 0">预览内容可直接编辑，修改后会重新质检。</span>
                            <span v-else>粘贴内容后会自动生成预览。</span>
                        </div>
                        <div class="batch-import-options">
                            <el-checkbox v-model="batchImportOptions.skipDuplicates" @change="handleBatchPreviewChanged">
                                跳过重复题
                            </el-checkbox>
                            <el-checkbox v-model="batchImportOptions.onlyValid" @change="handleBatchPreviewChanged">
                                只导入无错误题
                            </el-checkbox>
                        </div>
                    </div>

                    <div v-if="batchPreview.length === 0" class="batch-preview-empty">
                        <el-icon><Upload /></el-icon>
                        <strong>等待识别题目</strong>
                        <span>左侧粘贴题库文本后，这里会展示质检结果和可编辑预览。</span>
                    </div>

                    <template v-else>
                        <div class="batch-review-summary">
                            <div class="quality-metric">
                                <span>本次识别</span>
                                <strong>{{ batchQualityStats.importTotal }}</strong>
                                <small>道题</small>
                            </div>
                            <div class="quality-metric">
                                <span>导入后总数</span>
                                <strong>{{ batchQualityStats.afterImportTotal }}</strong>
                                <small>道题</small>
                            </div>
                            <div class="quality-metric" :class="{ 'is-danger': batchBlockingIssueCount > 0 }">
                                <span>必须处理</span>
                                <strong>{{ batchBlockingIssueCount }}</strong>
                                <small>项</small>
                            </div>
                            <div class="quality-metric" :class="{ 'is-warning': batchWarningIssueCount > 0 }">
                                <span>建议检查</span>
                                <strong>{{ batchWarningIssueCount }}</strong>
                                <small>项</small>
                            </div>
                            <div class="quality-metric importable-metric">
                                <span>将导入</span>
                                <strong>{{ batchImportableCount }}</strong>
                                <small>/ {{ batchPreview.length }} 道</small>
                            </div>
                        </div>

                        <div class="batch-type-tags">
                            <el-tag size="small" effect="plain">单选 {{ batchQualityStats.typeCounts.single }}</el-tag>
                            <el-tag size="small" type="warning" effect="plain">多选 {{ batchQualityStats.typeCounts.multiple }}</el-tag>
                            <el-tag size="small" type="success" effect="plain">判断 {{ batchQualityStats.typeCounts.judge }}</el-tag>
                            <el-tag size="small" type="info" effect="plain">填空 {{ batchQualityStats.typeCounts.fill }}</el-tag>
                        </div>

                        <div v-if="batchPreviewIssues.length > 0" class="batch-quality-issues">
                            <div class="quality-issues-head">
                                <span>质检定位</span>
                                <small>点击问题可定位并展开编辑</small>
                            </div>
                            <div class="quality-issue-list">
                                <button
                                    v-for="issue in batchPreviewIssues"
                                    :key="issue.id"
                                    type="button"
                                    class="quality-issue-row"
                                    :class="`is-${issue.severity}`"
                                    @click="locateBatchIssue(issue)">
                                    <el-tag size="small" :type="getBatchIssueTagType(issue)" effect="light">
                                        {{ getBatchIssueLabel(issue.type) }}
                                    </el-tag>
                                    <span class="quality-issue-title">第 {{ issue.questionNumber }} 题</span>
                                    <span class="quality-issue-detail">{{ issue.detail }}</span>
                                    <el-icon class="quality-locate-icon"><Location /></el-icon>
                                </button>
                            </div>
                        </div>

                        <div class="preview-list">
                            <div
                                v-for="(q, idx) in batchPreview"
                                :key="idx"
                                class="preview-item"
                                :data-batch-preview-index="idx"
                                :class="{
                                    'has-blocking': getBatchPreviewSeverity(idx) === 'error',
                                    'has-warning': getBatchPreviewSeverity(idx) === 'warning',
                                    'is-located': batchActivePreviewIndex === idx,
                                }">
                                <div class="preview-row-main">
                                    <span class="preview-index">第{{ idx + 1 }}题</span>
                                    <el-tag size="small" :type="getQuestionTypeTag(q.type)">
                                        {{ getQuestionTypeName(q.type) }}
                                    </el-tag>
                                    <div v-if="(batchPreviewIssueMap[idx] || []).length > 0" class="preview-issue-tags">
                                        <el-tag
                                            v-for="issue in batchPreviewIssueMap[idx]"
                                            :key="issue.id"
                                            size="small"
                                            :type="getBatchIssueTagType(issue)"
                                            effect="light">
                                            {{ getBatchIssueLabel(issue.type) }}
                                        </el-tag>
                                    </div>
                                    <span class="preview-text">{{ q.content }}</span>
                                    <el-button size="small" text type="primary" class="preview-edit-toggle"
                                        @click.stop="toggleBatchPreviewEditor(idx)">
                                        {{ batchEditingPreviewIndex === idx ? '收起' : '编辑' }}
                                    </el-button>
                                </div>
                                <div v-if="batchEditingPreviewIndex === idx" class="preview-edit-panel" @click.stop>
                                    <div class="preview-edit-field preview-edit-field--type">
                                        <span>题型</span>
                                        <el-radio-group v-model="q.type" size="small" class="preview-type-radio"
                                            @change="handleBatchPreviewTypeChange(q, $event)">
                                            <el-radio-button value="single">单选</el-radio-button>
                                            <el-radio-button value="multiple">多选</el-radio-button>
                                            <el-radio-button value="judge">判断</el-radio-button>
                                            <el-radio-button value="fill">填空</el-radio-button>
                                        </el-radio-group>
                                    </div>
                                    <div class="preview-edit-field preview-edit-field--full">
                                        <span>题干</span>
                                        <el-input v-model="q.content" type="textarea" :autosize="{ minRows: 2, maxRows: 5 }"
                                            placeholder="题目内容" resize="none" @input="handleBatchPreviewChanged"></el-input>
                                    </div>
                                    <div v-if="q.type !== 'fill'" class="preview-edit-field preview-edit-field--full">
                                        <div class="preview-edit-field-head">
                                            <span>选项与答案</span>
                                            <el-button v-if="q.type !== 'judge'" size="small" text type="primary"
                                                :disabled="q.options.length >= BATCH_OPTION_LABELS.length"
                                                @click="addBatchPreviewOption(q)">
                                                添加选项
                                            </el-button>
                                        </div>
                                        <div class="preview-edit-options">
                                            <div v-for="(opt, optIdx) in q.options" :key="`${idx}-${opt.label}-${optIdx}`"
                                                class="preview-edit-option" :class="{ 'is-checked': opt.isAnswer }">
                                                <el-checkbox v-model="opt.isAnswer" class="preview-edit-check"
                                                    @change="handleBatchPreviewAnswerChange(q, opt)">
                                                    <span class="preview-edit-option-label">{{ opt.label }}</span>
                                                </el-checkbox>
                                                <el-input v-model="opt.value" type="textarea"
                                                    :autosize="{ minRows: 1, maxRows: 3 }" placeholder="选项内容" resize="none"
                                                    @input="handleBatchPreviewChanged"></el-input>
                                                <el-button v-if="q.type !== 'judge'" class="preview-edit-delete" type="danger"
                                                    link :disabled="q.options.length <= 2"
                                                    :aria-label="`删除预览选项 ${opt.label || optIdx + 1}`"
                                                    @click="removeBatchPreviewOption(q, optIdx)">
                                                    <el-icon><Delete /></el-icon>
                                                </el-button>
                                            </div>
                                        </div>
                                    </div>
                                    <div v-else class="preview-edit-field preview-edit-field--full">
                                        <span>填空答案</span>
                                        <el-input v-model="q.fillAnswer" placeholder="请输入填空题答案"
                                            @input="handleBatchPreviewChanged"></el-input>
                                    </div>
                                    <div class="preview-edit-field preview-edit-field--full">
                                        <span>解析</span>
                                        <el-input v-model="q.analysis" type="textarea" :autosize="{ minRows: 2, maxRows: 5 }"
                                            placeholder="可选" resize="none" @input="handleBatchPreviewChanged"></el-input>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </template>
                </section>
            </div>

            <template #footer>
                <div class="batch-dialog-footer">
                    <div v-if="batchPreview.length > 0" class="batch-dialog-footer-note">
                        <strong>{{ batchImportableCount }}</strong>
                        <span>道可导入</span>
                        <span v-if="batchBlockingIssueCount > 0">· {{ batchBlockingIssueCount }} 项必须处理</span>
                        <span v-else-if="batchWarningIssueCount > 0">· {{ batchWarningIssueCount }} 项建议检查</span>
                    </div>
                    <el-button @click="batchDialog.visible = false" class="footer-btn-cancel">取消</el-button>
                    <el-button type="primary" @click="parseQuestionsHandler" class="footer-btn-parse">
                        解析
                    </el-button>
                    <el-button type="success" @click="confirmBatchImport"
                        :disabled="batchPreview.length === 0 || batchImportableCount === 0 || (batchBlockingIssueCount > 0 && !batchImportOptions.onlyValid)"
                        class="footer-btn-confirm">
                        {{ batchConfirmButtonText }}
                    </el-button>
                </div>
            </template>
        </el-dialog>

        <!-- 编辑试卷 -->
        <el-dialog v-if="canEdit" v-model="editDialog.visible" title="编辑试卷信息" width="500px">
            <el-form :model="editForm" label-width="100px">
                <el-form-item label="试卷名称">
                    <el-input v-model="editForm.name"></el-input>
                </el-form-item>
                <el-form-item label="考试时长(分)">
                    <el-input-number v-model="editForm.duration" :min="0" placeholder="0为不限制"></el-input-number>
                </el-form-item>
                <el-form-item label="及格分数">
                    <el-input-number v-model="editForm.passingScore" :min="0" :max="100"></el-input-number>
                </el-form-item>
            </el-form>

            <template #footer>
                <span class="dialog-footer">
                    <el-button @click="editDialog.visible = false">取消</el-button>
                    <el-button type="primary" @click="updateExamInfo">保存</el-button>
                </span>
            </template>
        </el-dialog>

        <el-dialog
            v-model="aiBatchDialog.visible"
            title="批量生成AI解析"
            width="560px"
            :close-on-click-modal="!aiBatchDialog.loading"
            :close-on-press-escape="!aiBatchDialog.loading"
            :before-close="handleAiBatchDialogClose"
        >
            <div class="ai-batch-dialog">
                <el-alert
                    title="批量生成的是题目级 AI 解析，会持久保存在数据库；普通用户点击 AI 补充时会直接读取。"
                    type="info"
                    :closable="false"
                    show-icon
                />

                <el-form class="ai-batch-form" label-width="110px">
                    <el-form-item label="生成范围">
                        <el-radio-group v-model="aiBatchForm.mode" :disabled="aiBatchDialog.loading">
                            <el-radio-button value="all">整卷自动</el-radio-button>
                            <el-radio-button value="selected">指定题目</el-radio-button>
                        </el-radio-group>
                    </el-form-item>
                    <el-form-item label="本次生成">
                        <el-input-number
                            v-model="aiBatchForm.limit"
                            :min="1"
                            :max="10"
                            :disabled="aiBatchDialog.loading || aiBatchForm.mode === 'selected'"
                        />
                        <span class="ai-batch-tip">{{ aiBatchForm.mode === 'selected' ? '指定题目按勾选数量生成，最多 10 道。' : '建议每次 5-10 道，避免等待太久。' }}</span>
                    </el-form-item>
                    <el-form-item label="覆盖已有解析">
                        <el-switch v-model="aiBatchForm.forceRefresh" :disabled="aiBatchDialog.loading" />
                        <span class="ai-batch-tip">开启后会重新请求 AI 并覆盖数据库里的旧解析。</span>
                    </el-form-item>
                </el-form>

                <div v-if="aiBatchForm.mode === 'selected'" class="ai-batch-picker">
                    <div class="ai-batch-picker-head">
                        <span>选择题目</span>
                        <div class="ai-batch-picker-actions">
                            <el-button text type="primary" :disabled="aiBatchDialog.loading" @click="selectCurrentAiBatchQuestion">选当前题</el-button>
                            <el-button text :disabled="aiBatchDialog.loading" @click="aiBatchForm.questionIds = []">清空</el-button>
                        </div>
                    </div>
                    <el-checkbox-group
                        v-model="aiBatchForm.questionIds"
                        :max="10"
                        :disabled="aiBatchDialog.loading"
                        class="ai-batch-question-list"
                    >
                        <el-checkbox
                            v-for="item in aiBatchQuestionOptions"
                            :key="item.id"
                            :value="item.id"
                            class="ai-batch-question-option"
                        >
                            <span class="ai-batch-question-index">#{{ item.index + 1 }}</span>
                            <span class="ai-batch-question-type">{{ getQuestionTypeName(item.type) }}</span>
                            <span class="ai-batch-question-content">{{ item.content || '未填写题目内容' }}</span>
                        </el-checkbox>
                    </el-checkbox-group>
                    <div class="ai-batch-tip">已选择 {{ aiBatchForm.questionIds.length }} 道；未保存的新题不会出现在这里。</div>
                </div>

                <div v-if="aiBatchDialog.loading" class="ai-batch-generating">
                    <div class="ai-batch-generating-visual" aria-hidden="true">
                        <span class="ai-batch-generating-ring"></span>
                        <el-icon><MagicStick /></el-icon>
                    </div>
                    <div class="ai-batch-generating-copy">
                        <strong>正在生成 AI 解析</strong>
                        <span>{{ aiBatchGeneratingText }}</span>
                    </div>
                    <div class="ai-batch-generating-progress" aria-hidden="true">
                        <span></span>
                    </div>
                </div>

                <div v-if="aiBatchDialog.summary" class="ai-batch-summary">
                    <div class="ai-batch-summary-item">
                        <strong>{{ aiBatchDialog.summary.generated || 0 }}</strong>
                        <span>生成/覆盖</span>
                    </div>
                    <div class="ai-batch-summary-item">
                        <strong>{{ aiBatchDialog.summary.skipped || 0 }}</strong>
                        <span>已跳过</span>
                    </div>
                    <div class="ai-batch-summary-item">
                        <strong>{{ aiBatchDialog.summary.pending || 0 }}</strong>
                        <span>待继续</span>
                    </div>
                    <div class="ai-batch-summary-item is-danger">
                        <strong>{{ aiBatchDialog.summary.failed || 0 }}</strong>
                        <span>失败</span>
                    </div>
                </div>

                <div v-if="aiBatchDialog.summary?.failures?.length" class="ai-batch-failures">
                    <div v-for="item in aiBatchDialog.summary.failures" :key="item.questionId">
                        {{ item.questionId }}：{{ item.message }}
                    </div>
                </div>
            </div>

            <template #footer>
                <span class="dialog-footer">
                    <el-button :disabled="aiBatchDialog.loading" @click="aiBatchDialog.visible = false">关闭</el-button>
                    <el-button type="primary" :loading="aiBatchDialog.loading" @click="generateAiBatch">
                        {{ aiBatchDialog.loading ? '生成中...' : '开始生成' }}
                    </el-button>
                </span>
            </template>
        </el-dialog>

        <el-dialog
            v-model="aiAnalysisDialog.visible"
            title="AI解析"
            width="680px"
            class="ai-analysis-panel"
            append-to-body
            :lock-scroll="false"
        >
            <div class="ai-analysis-dialog">
                <div class="ai-analysis-head">
                    <div>
                        <div class="ai-analysis-title">第 {{ aiAnalysisDialog.questionIndex + 1 }} 题 AI 解析</div>
                        <div class="ai-analysis-subtitle">读取数据库中已保存的补充解析，可一键采纳为正式题库解析。</div>
                    </div>
                    <el-tag :type="aiAnalysisDialog.record ? 'success' : 'info'" effect="plain">
                        {{ aiAnalysisDialog.record ? '已生成' : '未生成' }}
                    </el-tag>
                </div>

                <div v-if="aiAnalysisDialog.loading" class="ai-analysis-loading">
                    <el-icon class="is-loading"><Loading /></el-icon>
                    <div>
                        <strong>正在读取 AI 解析</strong>
                        <span>正在获取已保存内容，请稍候。</span>
                    </div>
                </div>

                <el-empty
                    v-else-if="!aiAnalysisDialog.record"
                    description="暂无 AI 解析"
                />

                <div v-else class="ai-analysis-card">
                    <div class="ai-analysis-card-head">
                        <div class="ai-analysis-meta">
                            <el-tag size="small" type="success" effect="plain">{{ aiAnalysisDialog.record.model || '未知模型' }}</el-tag>
                            <span>生成 {{ formatDateTime(aiAnalysisDialog.record.lastGeneratedAt || aiAnalysisDialog.record.createTime || aiAnalysisDialog.record.updateTime) }}</span>
                            <span>查看 {{ aiAnalysisDialog.record.viewCount || 0 }} 次</span>
                        </div>
                        <div class="ai-analysis-actions">
                            <el-button size="small" type="primary" @click="adoptAiAnalysis">
                                采纳为正式解析
                            </el-button>
                            <el-button size="small" type="danger" plain @click="deleteAiAnalysis">
                                删除
                            </el-button>
                        </div>
                    </div>
                    <div class="ai-analysis-content">{{ aiAnalysisDialog.record.analysis }}</div>
                </div>
            </div>
        </el-dialog>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { session } from '@/utils/session';
import { createExamDetailApi } from '@/api/examDetail';
import { createMockExamDetailApi } from '@/api/examDetailMock';
import { isUiPreviewMode } from '@/utils/uiPreview';
import { useAiAnalysis } from '@/features/exam-editor/useAiAnalysis';
import { useBatchImport } from '@/features/exam-editor/useBatchImport';
import { useExamDetailData } from '@/features/exam-editor/useExamDetailData';
import { useQuestionEditor } from '@/features/exam-editor/useQuestionEditor';
import { useQuestionRendering } from '@/features/exam-editor/useQuestionRendering';
import {
    cloneBatchQuestionForImport,
    formatBatchSourceRange,
    formatDateTime,
    getBatchIssueLabel,
    getBatchIssueTagType,
    getQuestionTypeName,
    getQuestionTypeTag,
    isPersistedQuestion,
    validateQuestion,
} from '@/features/exam-editor/questionUtils';

const route = useRoute();
const router = useRouter();
const EXAM_DETAIL_BODY_CLASS = 'exam-detail-active';
const RESPONSIVE_EDITOR_BREAKPOINT = 1080;

if (typeof document !== 'undefined') {
    document.body.classList.add(EXAM_DETAIL_BODY_CLASS);
}

const authType = session.getAuthType();
const isConsoleMode = authType === 'console';
const loggedInUser = session.getUser();
const examId = ref(route.query.id || '');
const scopeType = ref(isConsoleMode ? 'personal' : (route.query.scopeType === 'demo' ? 'demo' : 'admin'));

const examApiFactory = isUiPreviewMode() ? createMockExamDetailApi : createExamDetailApi;
const examApi = examApiFactory({
    getExamId: () => examId.value,
    getScopeType: () => scopeType.value,
    getIsConsoleMode: () => isConsoleMode,
});

const questions = ref([]);
const selectedIndex = ref(-1);
const mobilePropVisible = ref(false);
const mobileAddVisible = ref(false);

const isResponsiveEditor = () => typeof window !== 'undefined' && window.innerWidth <= RESPONSIVE_EDITOR_BREAKPOINT;

if (!session.hasSession()) {
    router.replace('/login');
}

const canBatchGenerateAi = computed(() => (
    !isConsoleMode || ['ops_admin', 'super_admin'].includes(loggedInUser.role)
));
const {
    hasMoreRenderedQuestions,
    questionListEl,
    remainingQuestionCount,
    renderedQuestionItems,
    ensureQuestionRendered,
    handleQuestionListScroll,
    renderMoreQuestions,
    resetRenderedQuestionWindow,
    scrollQuestionIntoView,
} = useQuestionRendering({ questions, selectedIndex });
const {
    canEdit,
    completedQuestionCount,
    completionPercent,
    currentQuestion,
    currentQuestionValid,
    editDialog,
    editForm,
    examInfo,
    firstInvalidQuestionIndex,
    invalidQuestionCount,
    isDirty,
    loading,
    questionTypeCounts,
    saving,
    selectedAnswerSummary,
    cleanupExamDetailData,
    loadExamInfo,
    loadQuestions,
    markQuestionChanged,
    openEditDialog,
    resetSelectionAfterLoad,
    saveExam,
    updateExamInfo,
} = useExamDetailData({
    examApi,
    isResponsiveEditor,
    mobilePropVisible,
    questions,
    resetRenderedQuestionWindow,
    scrollQuestionIntoView,
    selectedIndex,
});
const {
    BATCH_OPTION_LABELS,
    batchActivePreviewIndex,
    batchAutoParseStatus,
    batchBlockingIssueCount,
    batchConfirmButtonText,
    batchDialog,
    batchEditingPreviewIndex,
    batchFileInputRef,
    batchFormatExpanded,
    batchFormatGuide,
    batchForm,
    batchImportOptions,
    batchImportableCount,
    batchImportableQuestions,
    batchPreview,
    batchPreviewIssueMap,
    batchPreviewIssues,
    batchQualityStats,
    batchSkippedCount,
    batchSpreadsheetImporting,
    batchWarningIssueCount,
    addBatchPreviewOption,
    cleanupBatchImport,
    clearBatchAutoParseTimer,
    copyBatchFormatGuide,
    getBatchPreviewSeverity,
    handleBatchFileChange,
    handleBatchPreviewAnswerChange,
    handleBatchPreviewChanged,
    handleBatchPreviewTypeChange,
    handleBatchTextInput,
    locateBatchIssue,
    openBatchImportDialog,
    removeBatchPreviewOption,
    runBatchParse,
    toggleBatchPreviewEditor,
    triggerBatchFileImport,
} = useBatchImport({ canEdit, existingQuestions: questions });

const {
    aiAnalysisDialog,
    aiBatchDialog,
    aiBatchForm,
    aiBatchGeneratingText,
    aiBatchQuestionOptions,
    adoptAiAnalysis,
    deleteAiAnalysis,
    generateAiBatch,
    handleAiBatchDialogClose,
    openAiAnalysisDialog,
    openAiBatchDialog,
    selectCurrentAiBatchQuestion,
} = useAiAnalysis({
    canBatchGenerateAi,
    canEdit,
    currentQuestion,
    examApi,
    isDirty,
    questions,
    selectedIndex,
});

const getDashboardReturnRoute = () => {
    const fallbackMenu = scopeType.value === 'demo' ? 'demo-manage' : 'major-categories';
    const returnMenu = String(route.query.returnMenu || fallbackMenu);
    const returnMajorCategoryId = route.query.returnMajorCategoryId
        ? String(route.query.returnMajorCategoryId)
        : '';
    const query = { menu: returnMenu };

    if (returnMajorCategoryId) {
        query.majorCategoryId = returnMajorCategoryId;
    }

    return { path: '/', query };
};

const {
    addOption,
    addQuestion,
    deleteQuestion,
    handleAnswerChange,
    handleTypeChange,
    removeOption,
    selectQuestion,
} = useQuestionEditor({
    canEdit,
    currentQuestion,
    ensureQuestionRendered,
    isResponsiveEditor,
    markQuestionChanged,
    mobilePropVisible,
    questions,
    resetSelectionAfterLoad,
    scrollQuestionIntoView,
    selectedIndex,
});

const jumpToQuestion = (index) => {
    selectedIndex.value = index;
    scrollQuestionIntoView(index);
    if (isResponsiveEditor()) {
        mobilePropVisible.value = true;
    }
};

const jumpToFirstInvalidQuestion = () => {
    if (firstInvalidQuestionIndex.value < 0) {
        return;
    }
    jumpToQuestion(firstInvalidQuestionIndex.value);
};

const openBatchDialog = () => {
    if (!canEdit.value) {
        ElMessage.warning('管理员分配的试卷只能查看，不能导入题目');
        return;
    }
    openBatchImportDialog();
    mobileAddVisible.value = false;
};

const parseQuestionsHandler = () => {
    clearBatchAutoParseTimer();
    runBatchParse({ silent: false });
};

const confirmBatchImport = () => {
    if (!canEdit.value) {
        return;
    }

    const firstBlockingIssue = batchPreviewIssues.value.find((issue) => issue.severity === 'error');
    if (firstBlockingIssue && !batchImportOptions.onlyValid) {
        locateBatchIssue(firstBlockingIssue);
        ElMessage.warning('请先处理无答案或选项格式异常；也可以勾选“只导入无错误题”');
        return;
    }

    const importQuestions = batchImportableQuestions.value.map(cloneBatchQuestionForImport);
    if (importQuestions.length === 0) {
        ElMessage.warning('当前没有可导入的题目');
        return;
    }

    questions.value.push(...importQuestions);
    batchDialog.visible = false;
    const skippedText = batchSkippedCount.value > 0 ? `，跳过 ${batchSkippedCount.value} 道` : '';
    ElMessage.success(`已添加 ${importQuestions.length} 道题目${skippedText}`);
    if (questions.value.length > 0) {
        selectedIndex.value = questions.value.length - importQuestions.length;
        scrollQuestionIntoView(selectedIndex.value);
    }
    markQuestionChanged();
};

const goBack = () => {
    if (isDirty.value && canEdit.value) {
        ElMessageBox.confirm('当前试卷还有未保存的题目修改，确定离开吗？', '未保存修改', {
            confirmButtonText: '离开',
            cancelButtonText: '继续编辑',
            type: 'warning',
        }).then(() => {
            isDirty.value = false;
            goBack();
        }).catch(() => { });
        return;
    }

    router.push(getDashboardReturnRoute());
};

const handleBeforeUnload = (event) => {
    if (!isDirty.value || !canEdit.value) {
        return undefined;
    }

    event.preventDefault();
    event.returnValue = '';
    return '';
};

onMounted(async () => {
    window.addEventListener('beforeunload', handleBeforeUnload);
    if (!examId.value) {
        ElMessage.error('题库 ID 不存在');
        setTimeout(goBack, 800);
        return;
    }

    await Promise.all([loadExamInfo(), loadQuestions()]);
});

onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', handleBeforeUnload);
    cleanupExamDetailData();
    cleanupBatchImport();
});
</script>

<style>
@import '@/assets/css/exam-detail.css';
@import '@/assets/css/exam-detail-redesign.css';
@import '@/assets/css/exam-detail-premium.css';
@import '@/assets/css/exam-detail-workbench.css';
</style>
