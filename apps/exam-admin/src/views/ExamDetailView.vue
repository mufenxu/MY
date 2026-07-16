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
                            :key="item.question._id"
                            class="question-card editor-question-card"
                            :data-question-index="item.index"
                            :class="{
                                active: selectedIndex === item.index,
                                invalid: canEdit && !validateQuestion(item.question),
                            }"
                            @click="selectQuestion(item.index)"
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
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { session } from '@/utils/session';
import { createExamDetailApi } from '@/api/examDetail';
import { createMockExamDetailApi } from '@/api/examDetailMock';
import { isUiPreviewMode } from '@/utils/uiPreview';
import { parseQuestions, formatForExamDetail, readQuestionsFromSpreadsheetFile } from '@/utils/batchImport';
import {
    QUESTION_OPTION_LABELS as BATCH_OPTION_LABELS,
    analyzeBatchPreviewQuality as analyzeBatchPreviewQualityData,
    cloneBatchQuestionForImport,
    createEmptyBatchQualityStats,
    createEmptyQuestion,
    formatBatchSourceRange,
    formatDateTime,
    getBatchIssueLabel,
    getBatchIssueTagType,
    getBatchPreviewSeverity as resolveBatchPreviewSeverity,
    getFirstSelectedPreviewOptionLabel,
    getQuestionTypeName,
    getQuestionTypeTag,
    isPersistedQuestion,
    normalizePreviewOptionLabels,
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

const loading = ref(false);
const saving = ref(false);
const questions = ref([]);
const selectedIndex = ref(-1);
const mobilePropVisible = ref(false);
const mobileAddVisible = ref(false);
const isDirty = ref(false);
let dirtyTrackingReady = false;
let suppressDirtyTracking = false;
let invalidCountRafId = 0;

const isResponsiveEditor = () => typeof window !== 'undefined' && window.innerWidth <= RESPONSIVE_EDITOR_BREAKPOINT;

const INITIAL_RENDERED_QUESTION_COUNT = 80;
const RENDER_QUESTION_BATCH_SIZE = 80;
const QUESTION_LIST_SCROLL_THRESHOLD = 640;
const renderedQuestionCount = ref(INITIAL_RENDERED_QUESTION_COUNT);
const questionListEl = ref(null);

if (!session.hasSession()) {
    router.replace('/login');
}

const examInfo = reactive({
    _id: '',
    name: '',
    duration: 0,
    passingScore: 60,
    readOnly: false,
});

const currentQuestion = computed(() => questions.value[selectedIndex.value] || null);
const canEdit = computed(() => !examInfo.readOnly);
const canBatchGenerateAi = computed(() => (
    !isConsoleMode || ['ops_admin', 'super_admin'].includes(loggedInUser.role)
));
const invalidQuestionCount = ref(0);
const completedQuestionCount = computed(() => (
    Math.max(questions.value.length - invalidQuestionCount.value, 0)
));
const completionPercent = computed(() => (
    questions.value.length
        ? Math.round((completedQuestionCount.value / questions.value.length) * 100)
        : 0
));
const invalidQuestionIndexes = computed(() => questions.value
    .map((question, index) => (validateQuestion(question) ? -1 : index))
    .filter((index) => index >= 0));
const firstInvalidQuestionIndex = computed(() => invalidQuestionIndexes.value[0] ?? -1);
const questionTypeCounts = computed(() => questions.value.reduce((counts, question) => {
    const type = question?.type || 'single';
    if (Object.prototype.hasOwnProperty.call(counts, type)) {
        counts[type] += 1;
    }
    return counts;
}, {
    single: 0,
    multiple: 0,
    judge: 0,
    fill: 0,
}));
const selectedAnswerSummary = computed(() => {
    const question = currentQuestion.value;
    if (!question) {
        return '未选择';
    }

    if (question.type === 'fill') {
        return String(question.fillAnswer || '').trim() || '未设置';
    }

    return question.options
        .filter((opt) => opt.isAnswer)
        .map((opt) => opt.label)
        .join('、') || '未设置';
});
const currentQuestionValid = computed(() => (
    currentQuestion.value ? validateQuestion(currentQuestion.value) : false
));
const renderedQuestionItems = computed(() => {
    const limit = Math.min(renderedQuestionCount.value, questions.value.length);
    const items = questions.value.slice(0, limit).map((question, index) => ({ question, index }));

    if (selectedIndex.value >= limit && selectedIndex.value < questions.value.length) {
        items.push({
            question: questions.value[selectedIndex.value],
            index: selectedIndex.value,
        });
    }

    return items;
});
const hasMoreRenderedQuestions = computed(() => renderedQuestionCount.value < questions.value.length);
const remainingQuestionCount = computed(() => Math.max(questions.value.length - renderedQuestionCount.value, 0));
const aiBatchQuestionOptions = computed(() => questions.value
    .map((question, index) => ({
        id: String(question?._id || ''),
        index,
        type: question?.type || '',
        content: String(question?.content || '').trim(),
    }))
    .filter((item) => item.id && !item.id.startsWith('temp_')));
const batchPreviewIssueMap = computed(() => batchPreviewIssues.value.reduce((map, issue) => {
    const index = issue.questionIndex;
    if (!map[index]) map[index] = [];
    map[index].push(issue);
    return map;
}, {}));
const batchBlockingIssueCount = computed(() => (
    batchPreviewIssues.value.filter((issue) => issue.severity === 'error').length
));
const batchWarningIssueCount = computed(() => (
    batchPreviewIssues.value.filter((issue) => issue.severity === 'warning').length
));
function shouldSkipBatchPreviewQuestion(index) {
    const issues = batchPreviewIssueMap.value[index] || [];
    if (batchImportOptions.skipDuplicates && issues.some((issue) => issue.type === 'duplicate')) {
        return true;
    }
    if (batchImportOptions.onlyValid && issues.some((issue) => issue.severity === 'error')) {
        return true;
    }
    return false;
}
const batchImportableQuestions = computed(() => (
    batchPreview.value.filter((_, index) => !shouldSkipBatchPreviewQuestion(index))
));
const batchImportableCount = computed(() => batchImportableQuestions.value.length);
const batchSkippedCount = computed(() => Math.max(batchPreview.value.length - batchImportableCount.value, 0));
const batchConfirmButtonText = computed(() => {
    if (batchPreview.value.length === 0) {
        return '添加';
    }
    if (batchBlockingIssueCount.value > 0 && !batchImportOptions.onlyValid) {
        return `需先处理 ${batchBlockingIssueCount.value} 项`;
    }
    const skipText = batchSkippedCount.value > 0 ? `，跳过 ${batchSkippedCount.value}` : '';
    return `添加 (${batchImportableCount.value})${skipText}`;
});
const batchAutoParseStatus = computed(() => {
    if (!String(batchForm.text || '').trim()) {
        return '粘贴题目后会自动解析';
    }
    if (batchSpreadsheetFileName.value && batchPreview.value.length > 0) {
        return `已从 ${batchSpreadsheetFileName.value} 识别 ${batchPreview.value.length} 道题`;
    }
    if (batchPreview.value.length > 0) {
        return `已自动识别 ${batchPreview.value.length} 道题`;
    }
    return '正在等待自动解析';
});

const batchDialog = reactive({ visible: false });
const batchForm = reactive({ text: '' });
const batchFileInputRef = ref(null);
const batchSpreadsheetImporting = ref(false);
const batchSpreadsheetFileName = ref('');
const batchImportOptions = reactive({
    skipDuplicates: true,
    onlyValid: false,
});
const batchPreview = ref([]);
const batchPreviewIssues = ref([]);
const batchQualityStats = ref(createEmptyBatchQualityStats());
const batchActivePreviewIndex = ref(-1);
const batchEditingPreviewIndex = ref(-1);
const batchFormatExpanded = ref(false);
let batchIssueHighlightTimer = 0;
let batchAutoParseTimer = 0;
const batchFormatGuide = [
    '请把原始题库文本整理成以下可导入格式（逐题输出，不要解释）：',
    '',
    '1. [题型] 题目内容',
    '题干: [可选，与上一行二选一]',
    '选项:',
    'A. ...',
    'B. ...',
    'C. ...',
    'D. ...',
    '答案: [单选填 A；多选填 ABD；判断填 正确/错误；填空填文本答案]',
    '解析: [可选]',
    '',
    '可用题头示例：',
    '1. 题目内容 / 1) 题目内容 / 第1题 题目内容 / (1) 题目内容 / 直接题干内容',
    '无题号时，请让题干下一行紧跟选项或答案，系统会自动分题。',
    '',
    '可用答案示例：',
    '答案: A',
    '答案: ABCD',
    '正确答案: A',
    '参考答案: A',
    '答案是: A',
    '答案: ACD（少选不得分）',
    '',
    '要求：',
    '1) 保留题号顺序。',
    '2) 删除“（少选不得分）/（多选）/分值”等答案备注。',
    '3) 不确定题型时，按“题干 + 选项 + 答案”完整输出。',
    '',
    'Excel/CSV 首行建议：题干、题型、A、B、C、D、答案、解析。',
].join('\n');

const editDialog = reactive({ visible: false });
const editForm = reactive({
    name: '',
    duration: 0,
    passingScore: 60,
});
const aiBatchDialog = reactive({
    visible: false,
    loading: false,
    summary: null,
});
const aiBatchForm = reactive({
    mode: 'all',
    limit: 10,
    forceRefresh: false,
    questionIds: [],
});
const aiBatchGeneratingText = computed(() => {
    const count = aiBatchForm.mode === 'selected'
        ? aiBatchForm.questionIds.length
        : aiBatchForm.limit;
    const actionText = aiBatchForm.forceRefresh ? '重新生成并覆盖' : '生成缺失解析';
    return `本次最多${actionText} ${count} 道题，完成后会自动显示统计结果。`;
});
const aiAnalysisDialog = reactive({
    visible: false,
    loading: false,
    record: null,
    questionId: '',
    questionIndex: -1,
    requestKey: 0,
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

const copyBatchFormatGuide = async () => {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(batchFormatGuide);
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = batchFormatGuide;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }
        ElMessage.success('已复制 AI 整理模板');
    } catch (err) {
        console.error('Copy batch format guide error:', err);
        ElMessage.error('复制失败，请手动复制下方模板');
    }
};

const triggerBatchFileImport = () => {
    if (!canEdit.value || batchSpreadsheetImporting.value) return;
    batchFileInputRef.value?.click?.();
};

const isSupportedBatchSpreadsheetFile = (file) => (
    /\.(xlsx|csv)$/i.test(file?.name || '')
);

const handleBatchFileChange = async (event) => {
    const input = event?.target;
    const file = input?.files?.[0];
    if (input) input.value = '';
    if (!file) return;

    if (!isSupportedBatchSpreadsheetFile(file)) {
        ElMessage.warning('请选择 .xlsx 或 .csv 文件');
        return;
    }

    clearBatchAutoParseTimer();
    batchSpreadsheetImporting.value = true;
    try {
        const text = await readQuestionsFromSpreadsheetFile(file);
        if (!String(text || '').trim()) {
            batchForm.text = '';
            batchSpreadsheetFileName.value = '';
            clearBatchPreviewQuality();
            ElMessage.warning('未从文件中读取到可导入的题目，请检查首个工作表');
            return;
        }

        batchForm.text = text;
        batchSpreadsheetFileName.value = file.name;
        const parsedQuestions = runBatchParse({ silent: true });
        if (parsedQuestions.length === 0) {
            ElMessage.warning('文件已读取，但未识别到题目，请检查表头或内容');
            return;
        }
        ElMessage.success(`已从 ${file.name} 识别 ${parsedQuestions.length} 道题目`);
    } catch (err) {
        console.error('Batch spreadsheet import error:', err);
        ElMessage.error('读取 Excel/CSV 失败，请检查文件格式');
    } finally {
        batchSpreadsheetImporting.value = false;
    }
};

const analyzeBatchPreviewQuality = (previewQuestions) => {
    const { issues, stats } = analyzeBatchPreviewQualityData(previewQuestions, questions.value);
    batchPreviewIssues.value = issues;
    batchQualityStats.value = stats;
};

const getBatchPreviewSeverity = (index) => {
    return resolveBatchPreviewSeverity(batchPreviewIssueMap.value[index] || []);
};

const clearBatchPreviewQuality = () => {
    batchPreview.value = [];
    batchPreviewIssues.value = [];
    batchQualityStats.value = createEmptyBatchQualityStats();
    batchActivePreviewIndex.value = -1;
    batchEditingPreviewIndex.value = -1;
    if (batchIssueHighlightTimer) {
        window.clearTimeout(batchIssueHighlightTimer);
        batchIssueHighlightTimer = 0;
    }
};

const clearBatchAutoParseTimer = () => {
    if (batchAutoParseTimer) {
        window.clearTimeout(batchAutoParseTimer);
        batchAutoParseTimer = 0;
    }
};

const runBatchParse = ({ silent = false } = {}) => {
    if (!canEdit.value) {
        return [];
    }

    const text = batchForm.text;
    if (!text.trim()) {
        clearBatchPreviewQuality();
        if (!silent) {
            ElMessage.warning('请输入题目文本');
        }
        return [];
    }

    const rawQuestions = parseQuestions(text);
    const parsedQuestions = formatForExamDetail(rawQuestions);
    batchPreview.value = parsedQuestions;
    analyzeBatchPreviewQuality(parsedQuestions);
    batchActivePreviewIndex.value = -1;
    if (batchEditingPreviewIndex.value >= parsedQuestions.length) {
        batchEditingPreviewIndex.value = -1;
    }

    if (silent) {
        return parsedQuestions;
    }

    if (parsedQuestions.length === 0) {
        ElMessage.warning('未识别到题目，请检查格式');
    } else if (batchBlockingIssueCount.value > 0) {
        ElMessage.warning(`识别 ${parsedQuestions.length} 道题，发现 ${batchBlockingIssueCount.value} 项必须处理的问题`);
    } else {
        ElMessage.success(`成功识别 ${parsedQuestions.length} 道题目`);
    }

    return parsedQuestions;
};

const handleBatchTextInput = () => {
    clearBatchAutoParseTimer();
    batchSpreadsheetFileName.value = '';
    if (!String(batchForm.text || '').trim()) {
        clearBatchPreviewQuality();
        return;
    }
    batchAutoParseTimer = window.setTimeout(() => {
        batchAutoParseTimer = 0;
        runBatchParse({ silent: true });
    }, 500);
};

const handleBatchPreviewChanged = () => {
    if (batchPreview.value.length > 0) {
        analyzeBatchPreviewQuality(batchPreview.value);
    }
};

const toggleBatchPreviewEditor = (index) => {
    batchEditingPreviewIndex.value = batchEditingPreviewIndex.value === index ? -1 : index;
};

const handleBatchPreviewTypeChange = (question, newType) => {
    if (!question) return;

    const selectedLabel = getFirstSelectedPreviewOptionLabel(question);

    if (newType === 'judge') {
        question.options = [
            { label: 'A', value: '正确', isAnswer: selectedLabel === 'A' },
            { label: 'B', value: '错误', isAnswer: selectedLabel === 'B' },
        ];
        question.fillAnswer = '';
    } else if (newType === 'fill') {
        question.fillAnswer = question.fillAnswer || selectedLabel || '';
        question.options = [];
    } else {
        if (!Array.isArray(question.options) || question.options.length === 0) {
            question.options = BATCH_OPTION_LABELS.slice(0, 4).map((label) => ({
                label,
                value: '',
                isAnswer: false,
            }));
        } else {
            normalizePreviewOptionLabels(question);
        }
        question.fillAnswer = '';
        if (newType === 'single') {
            let found = false;
            question.options.forEach((opt) => {
                if (opt.isAnswer) {
                    if (found) {
                        opt.isAnswer = false;
                    }
                    found = true;
                }
            });
        }
    }

    handleBatchPreviewChanged();
};

const handleBatchPreviewAnswerChange = (question, changedOpt) => {
    if (!question || !changedOpt) return;
    if ((question.type === 'single' || question.type === 'judge') && changedOpt.isAnswer) {
        question.options.forEach((opt) => {
            if (opt !== changedOpt) {
                opt.isAnswer = false;
            }
        });
    }
    handleBatchPreviewChanged();
};

const addBatchPreviewOption = (question) => {
    if (!question || question.type === 'judge' || question.type === 'fill') return;
    if (question.options.length >= BATCH_OPTION_LABELS.length) {
        ElMessage.warning('最多支持 8 个选项');
        return;
    }

    question.options.push({
        label: BATCH_OPTION_LABELS[question.options.length],
        value: '',
        isAnswer: false,
    });
    handleBatchPreviewChanged();
};

const removeBatchPreviewOption = (question, optionIndex) => {
    if (!question || question.type === 'judge' || question.type === 'fill') return;
    if (question.options.length <= 2) {
        ElMessage.warning('至少保留 2 个选项');
        return;
    }

    question.options.splice(optionIndex, 1);
    normalizePreviewOptionLabels(question);
    handleBatchPreviewChanged();
};

const locateBatchIssue = (issue) => {
    batchActivePreviewIndex.value = issue.questionIndex;
    batchEditingPreviewIndex.value = issue.questionIndex;
    nextTick(() => {
        const node = document.querySelector(`[data-batch-preview-index="${issue.questionIndex}"]`);
        node?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    });

    if (batchIssueHighlightTimer) {
        window.clearTimeout(batchIssueHighlightTimer);
    }
    batchIssueHighlightTimer = window.setTimeout(() => {
        if (batchActivePreviewIndex.value === issue.questionIndex) {
            batchActivePreviewIndex.value = -1;
        }
        batchIssueHighlightTimer = 0;
    }, 2200);
};

const recalculateInvalidQuestionCount = () => {
    invalidQuestionCount.value = questions.value.reduce(
        (count, question) => count + (validateQuestion(question) ? 0 : 1),
        0,
    );
};

const scheduleQuestionSummaryRefresh = () => {
    if (invalidCountRafId) return;
    invalidCountRafId = requestAnimationFrame(() => {
        invalidCountRafId = 0;
        recalculateInvalidQuestionCount();
    });
};

const markQuestionChanged = () => {
    scheduleQuestionSummaryRefresh();
    if (dirtyTrackingReady && !suppressDirtyTracking && canEdit.value) {
        isDirty.value = true;
    }
};

const resetRenderedQuestionWindow = () => {
    renderedQuestionCount.value = Math.min(INITIAL_RENDERED_QUESTION_COUNT, questions.value.length);
};

const renderMoreQuestions = (batchSize = RENDER_QUESTION_BATCH_SIZE) => {
    renderedQuestionCount.value = Math.min(
        questions.value.length,
        renderedQuestionCount.value + batchSize,
    );
};

const ensureQuestionRendered = (index) => {
    if (index < 0 || index < renderedQuestionCount.value) {
        return;
    }

    renderedQuestionCount.value = Math.min(questions.value.length, index + 1);
};

const handleQuestionListScroll = (event) => {
    const target = event?.currentTarget;
    if (!target || !hasMoreRenderedQuestions.value) return;

    const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (distanceToBottom <= QUESTION_LIST_SCROLL_THRESHOLD) {
        renderMoreQuestions();
    }
};

const scrollQuestionIntoView = (index) => {
    ensureQuestionRendered(index);
    nextTick(() => {
        const container = questionListEl.value;
        const node = container?.querySelector?.(`[data-question-index="${index}"]`);
        node?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    });
};

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

const resetSelectionAfterLoad = () => {
    if (questions.value.length === 0) {
        selectedIndex.value = -1;
        mobilePropVisible.value = false;
        return;
    }

    if (selectedIndex.value < 0 || selectedIndex.value >= questions.value.length) {
        selectedIndex.value = 0;
    }
};

const loadExamInfo = async () => {
    try {
        const res = await examApi.loadExamInfo();
        if (res.data.code === 0) {
            Object.assign(examInfo, res.data.data);
        }
    } catch (err) {
        console.error('Load exam info error:', err);
        ElMessage.error('加载题库信息失败');
    }
};

const loadQuestions = async () => {
    loading.value = true;
    try {
        const res = await examApi.listQuestions();

        suppressDirtyTracking = true;
        questions.value = (res.data.data.list || []).map((q) => ({
            _id: q._id,
            type: q.type,
            content: q.content,
            options: (q.options || []).map((opt) => ({
                label: opt.label,
                value: opt.value,
                isAnswer: (q.answer || []).includes(opt.label),
            })),
            analysis: q.analysis || '',
            analysisSource: q.analysisSource || 'manual',
            fillAnswer: q.type === 'fill' ? (q.answer?.[0] || '') : '',
        }));
        resetRenderedQuestionWindow();
        resetSelectionAfterLoad();
        recalculateInvalidQuestionCount();
        isDirty.value = false;
        dirtyTrackingReady = true;
    } catch (err) {
        console.error('Load questions error:', err);
        ElMessage.error('加载题目失败');
    } finally {
        suppressDirtyTracking = false;
        loading.value = false;
    }
};

const waitForNextFrame = () => new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
        resolve();
        return;
    }

    window.requestAnimationFrame(() => resolve());
});

const getAiAnalysisTargetQuestion = () => {
    const questionId = String(aiAnalysisDialog.questionId || '');
    if (!questionId) {
        return currentQuestion.value;
    }

    return questions.value.find((question) => String(question?._id || '') === questionId) || currentQuestion.value;
};

const openAiAnalysisDialog = async () => {
    if (!canEdit.value) {
        ElMessage.warning('管理员分配的试卷只能查看，不能管理 AI 解析');
        return;
    }

    const question = currentQuestion.value;
    if (!isPersistedQuestion(question)) {
        ElMessage.warning('请先保存题目后再查看 AI 解析');
        return;
    }

    aiAnalysisDialog.questionId = String(question._id);
    aiAnalysisDialog.questionIndex = selectedIndex.value;
    const requestKey = aiAnalysisDialog.requestKey + 1;
    aiAnalysisDialog.requestKey = requestKey;
    aiAnalysisDialog.visible = true;
    aiAnalysisDialog.loading = true;
    aiAnalysisDialog.record = null;

    try {
        await nextTick();
        await waitForNextFrame();
        const res = await examApi.getAiAnalysis(question._id);
        if (aiAnalysisDialog.requestKey === requestKey && aiAnalysisDialog.questionId === String(question._id) && res.data.code === 0) {
            aiAnalysisDialog.record = res.data.data || null;
        }
    } catch (err) {
        console.error('Load AI analysis failed:', err);
        ElMessage.error(err.response?.data?.message || '加载 AI 解析失败');
    } finally {
        if (aiAnalysisDialog.requestKey === requestKey) {
            aiAnalysisDialog.loading = false;
        }
    }
};

const adoptAiAnalysis = async () => {
    const question = getAiAnalysisTargetQuestion();
    const record = aiAnalysisDialog.record;
    if (!isPersistedQuestion(question) || !record?._id) {
        return;
    }

    try {
        const res = await examApi.adoptAiAnalysis(question._id);
        if (res.data.code === 0) {
            question.analysis = res.data.data?.analysis || record.analysis || '';
            question.analysisSource = res.data.data?.analysisSource || 'ai';
            ElMessage.success('已采纳为正式解析');
        }
    } catch (err) {
        console.error('Adopt AI analysis failed:', err);
        ElMessage.error(err.response?.data?.message || '采纳失败');
    }
};

const deleteAiAnalysis = async () => {
    const question = getAiAnalysisTargetQuestion();
    const record = aiAnalysisDialog.record;
    if (!isPersistedQuestion(question) || !record?._id) {
        return;
    }

    try {
        await ElMessageBox.confirm('确定删除这条 AI 解析吗？删除后普通用户将无法再查看这条 AI 解析。', '删除 AI 解析', {
            confirmButtonText: '删除',
            cancelButtonText: '取消',
            type: 'warning',
        });

        const res = await examApi.deleteAiAnalysis(question._id);
        if (res.data.code === 0) {
            aiAnalysisDialog.record = null;
            ElMessage.success('已删除 AI 解析');
        }
    } catch (err) {
        if (err !== 'cancel') {
            console.error('Delete AI analysis failed:', err);
            ElMessage.error(err.response?.data?.message || '删除失败');
        }
    }
};

const openAiBatchDialog = () => {
    if (!canBatchGenerateAi.value) {
        ElMessage.warning('当前账号无权限批量生成 AI 解析');
        return;
    }

    if (isDirty.value && canEdit.value) {
        ElMessage.warning('请先保存试卷修改后再批量生成 AI 解析');
        return;
    }

    if (questions.value.length === 0) {
        ElMessage.warning('当前试卷暂无题目');
        return;
    }

    aiBatchDialog.visible = true;
    aiBatchDialog.summary = null;
    aiBatchForm.questionIds = aiBatchForm.questionIds.filter((id) => (
        aiBatchQuestionOptions.value.some((item) => item.id === id)
    ));
};

const handleAiBatchDialogClose = (done) => {
    if (aiBatchDialog.loading) {
        ElMessage.warning('AI解析正在生成中，请等待完成后再关闭');
        return;
    }
    done();
};

const selectCurrentAiBatchQuestion = () => {
    const question = currentQuestion.value;
    if (!isPersistedQuestion(question)) {
        ElMessage.warning('当前题目尚未保存，不能批量生成 AI 解析');
        return;
    }

    const id = String(question._id);
    if (!aiBatchForm.questionIds.includes(id)) {
        if (aiBatchForm.questionIds.length >= 10) {
            ElMessage.warning('一次最多选择 10 道题');
            return;
        }
        aiBatchForm.questionIds.push(id);
    }
};

const generateAiBatch = async () => {
    if (!canBatchGenerateAi.value) {
        ElMessage.warning('当前账号无权限批量生成 AI 解析');
        return;
    }

    if (aiBatchForm.mode === 'selected' && aiBatchForm.questionIds.length === 0) {
        ElMessage.warning('请先选择要生成 AI 解析的题目');
        return;
    }

    aiBatchDialog.loading = true;
    try {
        const payload = {
            limit: aiBatchForm.limit,
            forceRefresh: aiBatchForm.forceRefresh,
        };
        if (aiBatchForm.mode === 'selected') {
            payload.questionIds = aiBatchForm.questionIds.slice(0, 10);
            payload.limit = payload.questionIds.length;
        }

        const res = await examApi.generateAiAnalyses(payload);
        if (res.data.code === 0) {
            aiBatchDialog.summary = res.data.data || null;
            const summary = res.data.data || {};
            ElMessage.success(`AI解析生成完成：生成/覆盖 ${summary.generated || 0} 条，失败 ${summary.failed || 0} 条`);
        }
    } catch (err) {
        console.error('Generate AI analyses failed:', err);
        ElMessage.error(err.response?.data?.message || '批量生成失败');
    } finally {
        aiBatchDialog.loading = false;
    }
};

const openEditDialog = () => {
    if (!canEdit.value) {
        ElMessage.warning('管理员分配的试卷只能查看，不能编辑');
        return;
    }

    Object.assign(editForm, {
        name: examInfo.name,
        duration: examInfo.duration || 0,
        passingScore: examInfo.passingScore || 60,
    });
    editDialog.visible = true;
};

const updateExamInfo = async () => {
    if (!canEdit.value) {
        ElMessage.warning('管理员分配的试卷只能查看，不能编辑');
        return;
    }

    try {
        const res = await examApi.updateExamInfo({ ...editForm });

        if (res.data.code === 0) {
            Object.assign(examInfo, res.data.data);
            editDialog.visible = false;
            ElMessage.success('更新成功');
        }
    } catch (err) {
        console.error('Update exam info error:', err);
        ElMessage.error('更新失败');
    }
};

const addQuestion = (type) => {
    if (!canEdit.value) {
        ElMessage.warning('管理员分配的试卷只能查看，不能新增题目');
        return;
    }

    const newQuestion = createEmptyQuestion(type);

    questions.value.push(newQuestion);
    selectedIndex.value = questions.value.length - 1;
    markQuestionChanged();
    scrollQuestionIntoView(selectedIndex.value);
    if (isResponsiveEditor()) {
        mobilePropVisible.value = true;
    }
};

const selectQuestion = (index) => {
    selectedIndex.value = index;
    ensureQuestionRendered(index);
    if (isResponsiveEditor()) {
        mobilePropVisible.value = true;
    }
};

const deleteQuestion = (index) => {
    if (!canEdit.value) {
        ElMessage.warning('管理员分配的试卷只能查看，不能删除题目');
        return;
    }

    ElMessageBox.confirm('确定删除这道题吗？', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
    }).then(() => {
        questions.value.splice(index, 1);
        if (selectedIndex.value === index) {
            selectedIndex.value = -1;
        } else if (selectedIndex.value > index) {
            selectedIndex.value -= 1;
        }
        resetSelectionAfterLoad();
        markQuestionChanged();
    }).catch(() => { });
};

const handleAnswerChange = (changedOpt) => {
    if (!canEdit.value) {
        return;
    }

    const question = currentQuestion.value;
    if (!question) {
        return;
    }

    if (question.type === 'single' || question.type === 'judge') {
        if (changedOpt.isAnswer) {
            question.options.forEach((opt) => {
                if (opt !== changedOpt) {
                    opt.isAnswer = false;
                }
            });
        }
    }
    markQuestionChanged();
};

const handleTypeChange = (newType) => {
    if (!canEdit.value) {
        return;
    }

    const question = currentQuestion.value;
    if (!question) {
        return;
    }

    if (newType === 'judge') {
        question.options = [
            { label: 'A', value: '正确', isAnswer: false },
            { label: 'B', value: '错误', isAnswer: false },
        ];
        question.fillAnswer = '';
    } else if (newType === 'fill') {
        question.options = [];
        question.fillAnswer = question.fillAnswer || '';
    } else {
        if (!Array.isArray(question.options) || question.options.length === 0 || question.type === 'judge' || question.type === 'fill') {
            question.options = [
                { label: 'A', value: '', isAnswer: false },
                { label: 'B', value: '', isAnswer: false },
                { label: 'C', value: '', isAnswer: false },
                { label: 'D', value: '', isAnswer: false },
            ];
        }

        if (newType === 'single') {
            let found = false;
            question.options.forEach((opt) => {
                if (opt.isAnswer) {
                    if (found) {
                        opt.isAnswer = false;
                    }
                    found = true;
                }
            });
        }
    }

    question.type = newType;
    markQuestionChanged();
};

const addOption = () => {
    if (!canEdit.value) {
        return;
    }

    const question = currentQuestion.value;
    if (!question || question.type === 'judge' || question.type === 'fill') {
        return;
    }

    const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    if (question.options.length >= labels.length) {
        ElMessage.warning('最多支持 8 个选项');
        return;
    }

    question.options.push({
        label: labels[question.options.length],
        value: '',
        isAnswer: false,
    });
    markQuestionChanged();
};

const removeOption = (idx) => {
    if (!canEdit.value) {
        return;
    }

    const question = currentQuestion.value;
    if (!question) {
        return;
    }

    question.options.splice(idx, 1);
    const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    question.options.forEach((opt, index) => {
        opt.label = labels[index];
    });
    markQuestionChanged();
};

const saveExam = async () => {
    if (!canEdit.value) {
        ElMessage.warning('管理员分配的试卷只能查看，不能保存修改');
        return;
    }

    const invalidQuestion = questions.value.find((q) => !validateQuestion(q));
    if (invalidQuestion) {
        selectedIndex.value = questions.value.indexOf(invalidQuestion);
        scrollQuestionIntoView(selectedIndex.value);
        if (isResponsiveEditor()) {
            mobilePropVisible.value = true;
        }
        ElMessage.warning('请先补全题目内容、选项和答案后再保存');
        return;
    }

    saving.value = true;
    try {
        const payload = questions.value.map((q) => ({
            ...(isPersistedQuestion(q) ? { _id: q._id } : {}),
            type: q.type,
            content: String(q.content || '').trim(),
            options: q.type === 'fill'
                ? []
                : q.options.map((opt) => ({
                    label: opt.label,
                    value: String(opt.value || '').trim(),
                })),
            answer: q.type === 'fill'
                ? [String(q.fillAnswer || '').trim()]
                : q.options.filter((opt) => opt.isAnswer).map((opt) => opt.label),
            analysis: String(q.analysis || '').trim(),
        }));

        await examApi.saveQuestions(payload);

        ElMessage.success('保存成功');
        isDirty.value = false;
        await Promise.all([loadExamInfo(), loadQuestions()]);
    } catch (err) {
        console.error('Save exam error:', err);
        ElMessage.error('保存失败');
    } finally {
        saving.value = false;
    }
};

const openBatchDialog = () => {
    if (!canEdit.value) {
        ElMessage.warning('管理员分配的试卷只能查看，不能导入题目');
        return;
    }

    clearBatchAutoParseTimer();
    batchForm.text = '';
    batchSpreadsheetFileName.value = '';
    batchImportOptions.skipDuplicates = true;
    batchImportOptions.onlyValid = false;
    clearBatchPreviewQuality();
    batchFormatExpanded.value = false;
    batchDialog.visible = true;
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
    if (invalidCountRafId) {
        cancelAnimationFrame(invalidCountRafId);
        invalidCountRafId = 0;
    }
    if (batchIssueHighlightTimer) {
        window.clearTimeout(batchIssueHighlightTimer);
        batchIssueHighlightTimer = 0;
    }
    clearBatchAutoParseTimer();
});
</script>

<style>
@import '@/assets/css/exam-detail.css';
@import '@/assets/css/exam-detail-redesign.css';
@import '@/assets/css/exam-detail-premium.css';
.exam-detail-page {
    height: 100vh;
    background:
        linear-gradient(rgba(36, 104, 178, 0.042) 1px, transparent 1px),
        linear-gradient(90deg, rgba(18, 128, 92, 0.032) 1px, transparent 1px),
        linear-gradient(180deg, #f7fafc 0%, #eef4f8 100%);
    background-size: 36px 36px, 36px 36px, auto;
    background-position: -1px -1px, -1px -1px, 0 0;
}

body.exam-detail-active .question-card {
    content-visibility: auto;
    contain-intrinsic-size: 180px;
    contain: layout paint style;
}

body.exam-detail-active .question-list-more {
    display: flex;
    justify-content: center;
    padding: 8px 0 18px;
}

body.exam-detail-active .batch-quality-summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    margin: 2px 0 10px;
}

body.exam-detail-active .quality-metric {
    min-width: 0;
    padding: 10px 12px;
    border: 1px solid var(--editor-line);
    border-radius: var(--editor-radius);
    background: #ffffff;
}

body.exam-detail-active .quality-metric span,
body.exam-detail-active .quality-metric small {
    display: block;
    color: var(--editor-text-soft);
    font-size: 12px;
    line-height: 1.35;
}

body.exam-detail-active .quality-metric strong {
    display: block;
    margin: 2px 0;
    color: var(--editor-text);
    font-size: 22px;
    line-height: 1.05;
}

body.exam-detail-active .quality-metric.is-danger {
    border-color: rgba(199, 55, 55, 0.34);
    background: var(--editor-red-soft);
}

body.exam-detail-active .quality-metric.is-danger strong {
    color: var(--editor-red);
}

body.exam-detail-active .quality-metric.is-warning {
    border-color: rgba(167, 101, 18, 0.32);
    background: var(--editor-amber-soft);
}

body.exam-detail-active .quality-metric.is-warning strong {
    color: var(--editor-amber);
}

body.exam-detail-active .batch-type-tags,
body.exam-detail-active .preview-issue-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

body.exam-detail-active .batch-type-tags {
    margin-bottom: 10px;
}

body.exam-detail-active .batch-input-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 14px;
    margin-top: -6px;
    color: var(--editor-text-soft);
    font-size: 12px;
    line-height: 1.5;
}

body.exam-detail-active .mobile-tool-row .mobile-row-icon {
    width: 48px;
    height: 48px;
    margin-bottom: 0;
    font-size: 24px;
}

body.exam-detail-active .batch-code-input .el-textarea__inner {
    font-family: Consolas, Monaco, monospace;
    font-size: 14px;
}

body.exam-detail-active .batch-input.has-preview .el-textarea__inner {
    min-height: 138px !important;
    max-height: 170px;
}

body.exam-detail-active .batch-import-options {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 14px;
    margin-bottom: 10px;
    padding: 9px 10px;
    border: 1px solid var(--editor-line);
    border-radius: var(--editor-radius);
    background: #ffffff;
}

body.exam-detail-active .batch-import-options-copy {
    min-width: 160px;
    margin-right: auto;
    display: grid;
    gap: 2px;
}

body.exam-detail-active .batch-import-options-copy strong {
    color: var(--editor-text);
    font-size: 13px;
    line-height: 1.3;
}

body.exam-detail-active .batch-import-options-copy span {
    color: var(--editor-text-soft);
    font-size: 12px;
    line-height: 1.3;
}

body.exam-detail-active .batch-quality-issues {
    margin-bottom: 10px;
    border: 1px solid var(--editor-line);
    border-radius: var(--editor-radius);
    background: #ffffff;
    overflow: hidden;
}

body.exam-detail-active .quality-issues-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--editor-line);
    color: var(--editor-text);
    font-weight: 780;
}

body.exam-detail-active .quality-issues-head small {
    color: var(--editor-text-soft);
    font-size: 12px;
    font-weight: 500;
}

body.exam-detail-active .quality-issue-list {
    max-height: 178px;
    overflow: auto;
}

body.exam-detail-active .quality-issue-row {
    width: 100%;
    display: grid;
    grid-template-columns: auto auto auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 9px 12px;
    border: 0;
    border-bottom: 1px solid var(--editor-line);
    background: transparent;
    color: var(--editor-text);
    text-align: left;
    cursor: pointer;
}

body.exam-detail-active .quality-issue-row:last-child {
    border-bottom: 0;
}

body.exam-detail-active .quality-issue-row:hover {
    background: #f6f9fd;
}

body.exam-detail-active .quality-issue-row.is-error {
    background: rgba(255, 240, 240, 0.52);
}

body.exam-detail-active .quality-issue-row.is-warning {
    background: rgba(255, 245, 230, 0.42);
}

body.exam-detail-active .quality-issue-title,
body.exam-detail-active .quality-issue-source {
    white-space: nowrap;
    color: var(--editor-text-soft);
    font-size: 12px;
}

body.exam-detail-active .quality-issue-detail {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
}

body.exam-detail-active .quality-locate-icon {
    color: var(--editor-primary);
}

body.exam-detail-active .batch-import-dialog .preview-item {
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 8px !important;
}

body.exam-detail-active .preview-row-main {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
}

body.exam-detail-active .batch-import-dialog .preview-list {
    max-height: min(48vh, 520px) !important;
    overflow: auto;
    padding-bottom: 72px !important;
    scroll-padding-bottom: 84px;
}

body.exam-detail-active .preview-text {
    flex: 1 1 auto;
    min-width: 120px;
    word-break: break-word;
}

body.exam-detail-active .preview-edit-toggle {
    flex: 0 0 auto;
    margin-left: auto !important;
    padding: 0 6px !important;
}

body.exam-detail-active .preview-index,
body.exam-detail-active .preview-source {
    flex: 0 0 auto;
    color: var(--editor-text-soft);
    font-size: 12px;
}

body.exam-detail-active .preview-edit-panel {
    display: grid;
    gap: 10px;
    padding: 10px;
    border: 1px solid var(--editor-line);
    border-radius: var(--editor-radius);
    background: #ffffff;
}

body.exam-detail-active .preview-edit-field {
    min-width: 0;
    display: grid;
    gap: 6px;
}

body.exam-detail-active .preview-edit-field > span,
body.exam-detail-active .preview-edit-field-head > span {
    color: var(--editor-text-soft);
    font-size: 12px;
    font-weight: 760;
}

body.exam-detail-active .preview-edit-field--type {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
}

body.exam-detail-active .preview-edit-field-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
}

body.exam-detail-active .preview-type-radio {
    min-width: 0;
}

body.exam-detail-active .preview-type-radio .el-radio-button__inner {
    height: 28px;
    padding: 0 10px;
    line-height: 28px;
}

body.exam-detail-active .preview-edit-options {
    display: grid;
    gap: 8px;
}

body.exam-detail-active .preview-edit-option {
    display: grid;
    grid-template-columns: 58px minmax(0, 1fr) auto;
    align-items: start;
    gap: 8px;
    padding: 8px;
    border: 1px solid var(--editor-line);
    border-radius: var(--editor-radius);
    background: var(--editor-surface-subtle);
}

body.exam-detail-active .preview-edit-option.is-checked {
    border-color: rgba(36, 104, 178, 0.36);
    background: var(--editor-primary-soft);
}

body.exam-detail-active .preview-edit-check {
    min-height: 30px;
    margin-right: 0 !important;
}

body.exam-detail-active .preview-edit-option-label {
    color: var(--editor-text);
    font-weight: 820;
}

body.exam-detail-active .preview-edit-delete {
    min-width: 30px !important;
    width: 30px;
    height: 30px;
    padding: 0 !important;
}

body.exam-detail-active .batch-import-dialog .preview-item.has-blocking {
    border-color: rgba(199, 55, 55, 0.45) !important;
    background: var(--editor-red-soft) !important;
}

body.exam-detail-active .batch-import-dialog .preview-item.has-warning {
    border-color: rgba(167, 101, 18, 0.35) !important;
    background: var(--editor-amber-soft) !important;
}

body.exam-detail-active .batch-import-dialog .preview-item.is-located {
    box-shadow: 0 0 0 3px rgba(36, 104, 178, 0.18) !important;
    border-color: rgba(36, 104, 178, 0.58) !important;
}

body.exam-detail-active .batch-import-dialog .batch-dialog-footer .el-button {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    line-height: 1 !important;
    box-sizing: border-box !important;
}

body.exam-detail-active .batch-import-dialog .batch-dialog-footer .el-button > span {
    width: 100%;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    line-height: 1 !important;
}

body.exam-detail-active .prop-section-actions {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
}

body.exam-detail-active .mobile-ai-analysis-btn {
    margin-top: 10px;
}

body.exam-detail-active .ai-batch-dialog {
    display: grid;
    gap: 16px;
}

body.exam-detail-active .ai-batch-form {
    padding: 4px 0;
}

body.exam-detail-active .ai-batch-tip {
    margin-left: 10px;
    color: var(--editor-text-soft);
    font-size: 12px;
}

body.exam-detail-active .ai-batch-picker {
    display: grid;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--editor-line);
    border-radius: var(--editor-radius);
    background: #f8fafc;
}

body.exam-detail-active .ai-batch-picker-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    color: var(--editor-text);
    font-size: 13px;
    font-weight: 800;
}

body.exam-detail-active .ai-batch-picker-actions {
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

body.exam-detail-active .ai-batch-question-list {
    display: grid;
    gap: 8px;
    max-height: 240px;
    overflow: auto;
    padding-right: 4px;
}

body.exam-detail-active .ai-batch-question-option {
    width: 100%;
    min-height: 38px;
    margin-right: 0;
    padding: 8px 10px;
    border: 1px solid #e2e8f0;
    border-radius: var(--editor-radius);
    background: #ffffff;
    box-sizing: border-box;
}

body.exam-detail-active .ai-batch-question-option .el-checkbox__label {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    width: calc(100% - 20px);
}

body.exam-detail-active .ai-batch-question-index,
body.exam-detail-active .ai-batch-question-type {
    flex-shrink: 0;
    color: var(--editor-text-soft);
    font-size: 12px;
}

body.exam-detail-active .ai-batch-question-content {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--editor-text);
    font-size: 13px;
}

body.exam-detail-active .ai-batch-generating {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    padding: 14px;
    border: 1px solid rgba(64, 120, 190, 0.26);
    border-radius: var(--editor-radius);
    background: linear-gradient(180deg, #f8fbff 0%, #f5f7fb 100%);
    overflow: hidden;
}

body.exam-detail-active .ai-batch-generating-visual {
    position: relative;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    color: var(--editor-primary);
}

body.exam-detail-active .ai-batch-generating-visual .el-icon {
    position: relative;
    z-index: 1;
    font-size: 20px;
    animation: ai-batch-icon-pulse 1.2s ease-in-out infinite;
}

body.exam-detail-active .ai-batch-generating-ring {
    position: absolute;
    inset: 2px;
    border: 2px solid rgba(64, 120, 190, 0.16);
    border-top-color: var(--editor-primary);
    border-radius: 50%;
    animation: ai-batch-spin 0.85s linear infinite;
}

body.exam-detail-active .ai-batch-generating-copy {
    display: grid;
    gap: 4px;
    min-width: 0;
}

body.exam-detail-active .ai-batch-generating-copy strong {
    color: var(--editor-text);
    font-size: 14px;
    line-height: 1.35;
}

body.exam-detail-active .ai-batch-generating-copy span {
    color: var(--editor-text-soft);
    font-size: 12px;
    line-height: 1.6;
}

body.exam-detail-active .ai-batch-generating-progress {
    grid-column: 1 / -1;
    height: 6px;
    overflow: hidden;
    border-radius: 999px;
    background: #e5edf7;
}

body.exam-detail-active .ai-batch-generating-progress span {
    display: block;
    width: 42%;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, rgba(64, 120, 190, 0.2), rgba(64, 120, 190, 0.92), rgba(64, 120, 190, 0.2));
    animation: ai-batch-progress 1.2s ease-in-out infinite;
}

body.exam-detail-active .ai-batch-summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
}

body.exam-detail-active .ai-batch-summary-item {
    padding: 12px;
    border: 1px solid var(--editor-line);
    border-radius: var(--editor-radius);
    background: #f8fafc;
}

body.exam-detail-active .ai-batch-summary-item strong,
body.exam-detail-active .ai-batch-summary-item span {
    display: block;
}

body.exam-detail-active .ai-batch-summary-item strong {
    color: var(--editor-primary);
    font-size: 24px;
    line-height: 1;
}

body.exam-detail-active .ai-batch-summary-item span {
    margin-top: 6px;
    color: var(--editor-text-soft);
    font-size: 12px;
}

body.exam-detail-active .ai-batch-summary-item.is-danger strong {
    color: var(--editor-red);
}

body.exam-detail-active .ai-batch-failures {
    padding: 12px;
    border: 1px solid rgba(199, 55, 55, 0.34);
    border-radius: var(--editor-radius);
    background: var(--editor-red-soft);
    color: var(--editor-red);
    font-size: 13px;
    line-height: 1.7;
}

body.exam-detail-active .ai-analysis-dialog {
    min-height: 160px;
}

body.exam-detail-active .ai-analysis-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
    padding: 14px 16px;
    border: 1px solid var(--editor-line);
    border-radius: var(--editor-radius);
    background: #f8fafc;
}

body.exam-detail-active .ai-analysis-title {
    color: var(--editor-text);
    font-size: 16px;
    font-weight: 800;
}

body.exam-detail-active .ai-analysis-subtitle {
    margin-top: 4px;
    color: var(--editor-text-soft);
    font-size: 13px;
    line-height: 1.5;
}

body.exam-detail-active .ai-analysis-card {
    padding: 14px;
    border: 1px solid var(--editor-line);
    border-radius: var(--editor-radius);
    background: #ffffff;
    max-height: 55vh;
    overflow: auto;
}

body.exam-detail-active .ai-analysis-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
}

body.exam-detail-active .ai-analysis-meta,
body.exam-detail-active .ai-analysis-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

body.exam-detail-active .ai-analysis-meta {
    color: var(--editor-text-soft);
    font-size: 12px;
}

body.exam-detail-active .ai-analysis-content {
    color: var(--editor-text);
    font-size: 14px;
    line-height: 1.8;
    white-space: pre-wrap;
    word-break: break-word;
}

@keyframes ai-batch-spin {
    to {
        transform: rotate(360deg);
    }
}

@keyframes ai-batch-icon-pulse {
    0%,
    100% {
        transform: scale(1);
        opacity: 0.78;
    }

    50% {
        transform: scale(1.08);
        opacity: 1;
    }
}

@keyframes ai-batch-progress {
    0% {
        transform: translateX(-110%);
    }

    100% {
        transform: translateX(260%);
    }
}

@media (max-width: 768px) {
    body.exam-detail-active .batch-quality-summary {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    body.exam-detail-active .ai-batch-summary {
        grid-template-columns: 1fr;
    }

    body.exam-detail-active .ai-analysis-head,
    body.exam-detail-active .ai-analysis-card-head {
        flex-direction: column;
    }

    body.exam-detail-active .quality-issues-head,
    body.exam-detail-active .quality-issue-row,
    body.exam-detail-active .preview-row-main {
        align-items: flex-start;
    }

    body.exam-detail-active .quality-issue-row {
        grid-template-columns: auto minmax(0, 1fr) auto;
    }

    body.exam-detail-active .quality-issue-source,
    body.exam-detail-active .quality-issue-detail {
        grid-column: 2 / span 1;
    }

    body.exam-detail-active .preview-row-main {
        flex-wrap: wrap;
    }

    body.exam-detail-active .batch-import-options {
        align-items: flex-start;
        flex-direction: column;
    }

    body.exam-detail-active .batch-import-options-copy {
        width: 100%;
    }

    body.exam-detail-active .preview-edit-field--type,
    body.exam-detail-active .preview-edit-option {
        grid-template-columns: 1fr;
    }

    body.exam-detail-active .preview-edit-delete {
        justify-self: end;
    }
}

/* ============================================================
   2026 Exam Editor Workbench
   Final layer: dense, calm, three-column authoring workspace.
   ============================================================ */

body.exam-detail-active {
    --editor-primary: #2468b2;
    --editor-primary-strong: #174f93;
    --editor-primary-soft: #eef5ff;
    --editor-green: #14805e;
    --editor-green-soft: #ecf8f3;
    --editor-amber: #a76512;
    --editor-amber-soft: #fff7e8;
    --editor-red: #c73737;
    --editor-red-soft: #fff1f1;
    --editor-bg: #f3f6fa;
    --editor-surface: #ffffff;
    --editor-surface-subtle: #f8fafc;
    --editor-text: #152033;
    --editor-text-soft: #66758a;
    --editor-line: #dde5ef;
    --editor-line-strong: #c8d3e2;
    --editor-radius: 8px;
    --editor-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
    --editor-shadow-raised: 0 10px 24px rgba(15, 35, 65, 0.08);
    position: static !important;
    width: 100% !important;
    height: 100% !important;
    overflow: hidden !important;
    background: var(--editor-bg) !important;
    color: var(--editor-text);
    font-family: Inter, "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
}

body.exam-detail-active .exam-detail-page {
    height: 100dvh;
    min-height: 0;
    background:
        linear-gradient(rgba(36, 104, 178, 0.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(20, 128, 94, 0.035) 1px, transparent 1px),
        var(--editor-bg);
    background-size: 32px 32px, 32px 32px, auto;
    overflow: hidden;
}

body.exam-detail-active .exam-shell {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

body.exam-detail-active .exam-topbar {
    display: flex !important;
    align-items: center;
    height: 72px !important;
    min-height: 72px !important;
    padding: 0 24px !important;
    border-bottom: 1px solid var(--editor-line) !important;
    background: rgba(255, 255, 255, 0.94) !important;
    box-shadow: var(--editor-shadow) !important;
    backdrop-filter: none !important;
    z-index: 20;
}

body.exam-detail-active .topbar-main {
    width: 100%;
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(220px, 1fr) auto auto;
    align-items: center;
    gap: 14px;
}

body.exam-detail-active .topbar-title-group,
body.exam-detail-active .topbar-actions,
body.exam-detail-active .desktop-toolbar,
body.exam-detail-active .editor-status-strip {
    min-width: 0;
    display: flex;
    align-items: center;
}

body.exam-detail-active .topbar-title-group {
    gap: 12px;
}

body.exam-detail-active .topbar-back {
    width: 38px !important;
    height: 38px !important;
    border-radius: var(--editor-radius) !important;
    border-color: var(--editor-line) !important;
    background: #ffffff !important;
    color: var(--editor-text) !important;
    flex: 0 0 auto;
}

body.exam-detail-active .paper-title-block {
    min-width: 0;
    display: grid;
    gap: 2px;
}

body.exam-detail-active .paper-kicker,
body.exam-detail-active .stage-eyebrow,
body.exam-detail-active .prop-kicker {
    color: var(--editor-text-soft);
    font-size: 12px;
    font-weight: 760;
    line-height: 1.2;
    letter-spacing: 0;
}

body.exam-detail-active .paper-title-block h1,
body.exam-detail-active .stage-header h2 {
    margin: 0;
    overflow: hidden;
    color: var(--editor-text);
    font-size: 18px;
    font-weight: 850;
    line-height: 1.25;
    letter-spacing: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
}

body.exam-detail-active .editor-status-strip {
    gap: 6px;
}

body.exam-detail-active .status-jump-button,
body.exam-detail-active .overview-next-action,
body.exam-detail-active .stage-jump-button {
    border: 1px solid #f0c6c6;
    border-radius: 999px;
    background: var(--editor-red-soft);
    color: var(--editor-red);
    font: inherit;
    font-size: 12px;
    line-height: 1;
    font-weight: 780;
    cursor: pointer;
    transition: background-color 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
}

body.exam-detail-active .status-jump-button:hover,
body.exam-detail-active .overview-next-action:hover,
body.exam-detail-active .stage-jump-button:hover {
    border-color: #e7a2a2;
    background: #fff1f1;
    transform: translateY(-1px);
}

body.exam-detail-active .status-jump-button {
    height: 24px;
    padding: 0 9px;
}

body.exam-detail-active .editor-status-strip .el-tag {
    height: 24px !important;
    border: 0 !important;
    border-radius: 999px !important;
    font-weight: 760 !important;
}

body.exam-detail-active .editor-status-strip .el-tag--info,
body.exam-detail-active .editor-question-card .el-tag {
    background: var(--editor-primary-soft) !important;
    color: var(--editor-primary) !important;
}

body.exam-detail-active .editor-status-strip .el-tag--success {
    background: var(--editor-green-soft) !important;
    color: var(--editor-green) !important;
}

body.exam-detail-active .editor-status-strip .el-tag--warning {
    background: var(--editor-amber-soft) !important;
    color: var(--editor-amber) !important;
}

body.exam-detail-active .editor-status-strip .el-tag--danger {
    background: var(--editor-red-soft) !important;
    color: var(--editor-red) !important;
}

body.exam-detail-active .topbar-actions {
    justify-content: flex-end;
    gap: 8px;
}

body.exam-detail-active .desktop-toolbar {
    gap: 4px;
    padding: 4px;
    border: 1px solid var(--editor-line);
    border-radius: var(--editor-radius);
    background: var(--editor-surface-subtle);
}

body.exam-detail-active .desktop-toolbar .el-button,
body.exam-detail-active .import-question-btn,
body.exam-detail-active .ai-batch-entry,
body.exam-detail-active .save-exam-btn {
    height: 34px !important;
    min-height: 34px !important;
    margin: 0 !important;
    padding: 0 11px !important;
    border-radius: var(--editor-radius) !important;
    font-size: 13px !important;
    font-weight: 760 !important;
    letter-spacing: 0;
}

body.exam-detail-active .desktop-toolbar .el-button {
    border-color: transparent !important;
    background: transparent !important;
    color: var(--editor-text-soft) !important;
}

body.exam-detail-active .desktop-toolbar .el-button:hover {
    border-color: var(--editor-line) !important;
    background: #ffffff !important;
    color: var(--editor-primary) !important;
}

body.exam-detail-active .import-question-btn {
    border-color: #cde8dc !important;
    background: var(--editor-green-soft) !important;
    color: var(--editor-green) !important;
}

body.exam-detail-active .ai-batch-entry {
    border-color: #cfe0f7 !important;
    background: var(--editor-primary-soft) !important;
    color: var(--editor-primary) !important;
}

body.exam-detail-active .edit-info-btn {
    height: 34px !important;
    margin: 0 !important;
    padding: 0 6px !important;
    color: var(--editor-primary) !important;
    font-weight: 760 !important;
}

body.exam-detail-active .save-exam-btn {
    border-color: var(--editor-primary) !important;
    background: var(--editor-primary) !important;
    color: #ffffff !important;
}

body.exam-detail-active .editor-workbench {
    flex: 1 1 auto;
    min-height: 0;
    display: grid !important;
    grid-template-columns: 286px minmax(0, 1fr) minmax(390px, 440px);
    gap: 12px;
    padding: 12px 20px 16px;
    overflow: hidden !important;
}

body.exam-detail-active .paper-overview,
body.exam-detail-active .question-stage,
body.exam-detail-active .prop-aside {
    min-height: 0;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    overflow: hidden !important;
}

body.exam-detail-active .paper-overview {
    width: auto !important;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 10px;
}

body.exam-detail-active .overview-card,
body.exam-detail-active .canvas-container,
body.exam-detail-active .prop-aside > div {
    border: 1px solid var(--editor-line);
    border-radius: var(--editor-radius);
    background: rgba(255, 255, 255, 0.96);
    box-shadow: var(--editor-shadow);
}

body.exam-detail-active .overview-card {
    padding: 14px;
}

body.exam-detail-active .overview-card-head,
body.exam-detail-active .prop-section-title,
body.exam-detail-active .q-header,
body.exam-detail-active .batch-preview-head,
body.exam-detail-active .quality-issues-head,
body.exam-detail-active .ai-analysis-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
}

body.exam-detail-active .overview-card-head span,
body.exam-detail-active .overview-card-title,
body.exam-detail-active .prop-section-title {
    color: var(--editor-text);
    font-size: 14px;
    font-weight: 820;
    letter-spacing: 0;
}

body.exam-detail-active .overview-card-head strong {
    color: var(--editor-primary);
    font-size: 24px;
    line-height: 1;
}

body.exam-detail-active .overview-card-head small {
    color: var(--editor-text-soft);
    font-size: 12px;
}

body.exam-detail-active .overview-progress .el-progress {
    margin: 12px 0;
}

body.exam-detail-active .overview-stats,
body.exam-detail-active .type-count-grid,
body.exam-detail-active .inspector-summary {
    display: grid;
    gap: 8px;
}

body.exam-detail-active .overview-stats {
    grid-template-columns: repeat(3, minmax(0, 1fr));
}

body.exam-detail-active .overview-next-action {
    width: 100%;
    min-height: 36px;
    margin-top: 10px;
    padding: 0 12px;
}

body.exam-detail-active .overview-stats div,
body.exam-detail-active .type-count-grid div,
body.exam-detail-active .inspector-summary div {
    min-width: 0;
    padding: 10px;
    border: 1px solid var(--editor-line);
    border-radius: var(--editor-radius);
    background: var(--editor-surface-subtle);
}

body.exam-detail-active .overview-stats strong,
body.exam-detail-active .type-count-grid strong,
body.exam-detail-active .inspector-summary strong {
    display: block;
    overflow: hidden;
    color: var(--editor-text);
    font-size: 18px;
    font-weight: 850;
    line-height: 1.1;
    text-overflow: ellipsis;
    white-space: nowrap;
}

body.exam-detail-active .overview-stats span,
body.exam-detail-active .type-count-grid span,
body.exam-detail-active .inspector-summary span {
    display: block;
    margin-bottom: 4px;
    color: var(--editor-text-soft);
    font-size: 12px;
    font-weight: 650;
}

body.exam-detail-active .type-count-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-top: 10px;
}

body.exam-detail-active .question-map-card {
    min-height: 0;
    display: flex;
    flex-direction: column;
}

body.exam-detail-active .question-map-legend {
    margin-top: 10px;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    color: var(--editor-text-soft);
    font-size: 11px;
    font-weight: 700;
}

body.exam-detail-active .question-map-legend span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

body.exam-detail-active .question-map-legend i {
    width: 9px;
    height: 9px;
    border-radius: 999px;
    display: inline-block;
    box-shadow: inset 0 0 0 1px rgba(15, 41, 77, 0.08);
}

body.exam-detail-active .question-map-legend .is-current {
    background: var(--editor-primary);
}

body.exam-detail-active .question-map-legend .is-done {
    background: var(--editor-green-soft);
}

body.exam-detail-active .question-map-legend .is-invalid {
    background: var(--editor-red-soft);
}

body.exam-detail-active .question-map {
    min-height: 0;
    margin-top: 10px;
    padding-right: 2px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(34px, 1fr));
    gap: 6px;
    overflow: auto;
}

body.exam-detail-active .question-map-item {
    width: 100%;
    aspect-ratio: 1;
    border: 1px solid var(--editor-line);
    border-radius: var(--editor-radius);
    background: #ffffff;
    color: var(--editor-text-soft);
    font-size: 12px;
    font-weight: 820;
    cursor: pointer;
}

body.exam-detail-active .question-map-item:hover {
    border-color: var(--editor-line-strong);
    color: var(--editor-text);
}

body.exam-detail-active .question-map-item.active {
    border-color: var(--editor-primary);
    background: var(--editor-primary);
    color: #ffffff;
}

body.exam-detail-active .question-map-item.invalid:not(.active) {
    border-color: #f0c6c6;
    background: var(--editor-red-soft);
    color: var(--editor-red);
}

body.exam-detail-active .question-map-item.done:not(.invalid):not(.active) {
    border-color: #c5eadc;
    background: var(--editor-green-soft);
    color: var(--editor-green);
}

body.exam-detail-active .stage-side-status {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
}

body.exam-detail-active .stage-jump-button {
    min-height: 32px;
    padding: 0 12px;
    white-space: nowrap;
}

body.exam-detail-active .question-stage {
    display: grid !important;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 0;
}

body.exam-detail-active .canvas-container {
    width: 100%;
    height: 100%;
    min-height: 0;
    padding: 18px !important;
    border-top: 0 !important;
    border-radius: 0 0 var(--editor-radius) var(--editor-radius) !important;
    overflow-y: auto;
    overflow-x: hidden;
}

body.exam-detail-active .stage-header {
    position: relative;
    top: auto !important;
    z-index: 5;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
    margin: 0;
    padding: 18px;
    border: 1px solid var(--editor-line);
    border-bottom: 1px solid var(--editor-line);
    border-radius: var(--editor-radius) var(--editor-radius) 0 0;
    background: #ffffff !important;
    box-shadow: var(--editor-shadow);
}

body.exam-detail-active .stage-header p {
    margin: 6px 0 0;
    color: var(--editor-text-soft);
    font-size: 13px;
    line-height: 1.5;
}

body.exam-detail-active .stage-completion {
    flex: 0 0 auto;
    min-width: 112px;
    padding: 10px 12px;
    border: 1px solid var(--editor-line);
    border-radius: var(--editor-radius);
    background: var(--editor-surface-subtle);
    text-align: right;
}

body.exam-detail-active .stage-completion strong,
body.exam-detail-active .stage-completion span {
    display: block;
}

body.exam-detail-active .stage-completion strong {
    color: var(--editor-primary);
    font-size: 24px;
    line-height: 1;
}

body.exam-detail-active .stage-completion span {
    margin-top: 4px;
    color: var(--editor-text-soft);
    font-size: 12px;
}

body.exam-detail-active .editor-question-card {
    margin: 0 0 10px !important;
    padding: 16px !important;
    border: 1px solid var(--editor-line) !important;
    border-radius: var(--editor-radius) !important;
    background: #ffffff !important;
    box-shadow: var(--editor-shadow) !important;
    cursor: pointer;
    transition: border-color 0.16s ease, box-shadow 0.16s ease, background-color 0.16s ease;
}

body.exam-detail-active .editor-question-card:hover {
    transform: none !important;
    border-color: var(--editor-line-strong) !important;
    box-shadow: var(--editor-shadow-raised) !important;
}

body.exam-detail-active .editor-question-card.active {
    border-color: rgba(36, 104, 178, 0.58) !important;
    background: #f8fbff !important;
    box-shadow: 0 0 0 3px rgba(36, 104, 178, 0.12) !important;
}

body.exam-detail-active .editor-question-card.invalid:not(.active) {
    border-color: #efd1d1 !important;
}

body.exam-detail-active .q-titleline {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

body.exam-detail-active .q-index {
    width: 30px !important;
    height: 30px !important;
    border-radius: var(--editor-radius) !important;
    background: var(--editor-primary-soft) !important;
    color: var(--editor-primary) !important;
    font-size: 14px !important;
    font-weight: 850 !important;
}

body.exam-detail-active .editor-question-card.active .q-index {
    background: var(--editor-primary) !important;
    color: #ffffff !important;
}

body.exam-detail-active .q-state {
    height: 22px;
    display: inline-flex;
    align-items: center;
    padding: 0 8px;
    border-radius: 999px;
    background: var(--editor-red-soft);
    color: var(--editor-red);
    font-size: 12px;
    font-weight: 760;
}

body.exam-detail-active .q-state.done {
    background: var(--editor-green-soft);
    color: var(--editor-green);
}

body.exam-detail-active .question-delete-btn {
    margin-left: auto !important;
    color: var(--editor-red) !important;
}

body.exam-detail-active .q-content {
    margin: 12px 0 0 !important;
    color: var(--editor-text) !important;
    font-size: 15px !important;
    font-weight: 760;
    line-height: 1.7 !important;
    word-break: break-word;
}

body.exam-detail-active .question-options-preview {
    margin-top: 12px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
}

body.exam-detail-active .option-preview {
    min-width: 0;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 9px 10px;
    border: 1px solid var(--editor-line);
    border-radius: var(--editor-radius);
    background: var(--editor-surface-subtle);
    color: var(--editor-text-soft);
}

body.exam-detail-active .option-preview.answer {
    border-color: #b8d4f6;
    background: var(--editor-primary-soft);
    color: var(--editor-primary);
}

body.exam-detail-active .option-letter {
    width: 22px;
    height: 22px;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: #ffffff;
    font-size: 12px;
    font-weight: 850;
}

body.exam-detail-active .option-text {
    min-width: 0;
    color: inherit;
    font-size: 13px;
    line-height: 1.55;
    word-break: break-word;
}

body.exam-detail-active .fill-answer-preview,
body.exam-detail-active .q-analysis-preview {
    margin-top: 12px;
    padding: 10px 12px;
    border: 1px solid var(--editor-line);
    border-radius: var(--editor-radius);
    background: var(--editor-surface-subtle);
}

body.exam-detail-active .fill-answer-preview span,
body.exam-detail-active .q-analysis-preview span {
    display: block;
    color: var(--editor-text-soft);
    font-size: 12px;
    font-weight: 760;
}

body.exam-detail-active .fill-answer-preview strong {
    display: block;
    margin-top: 4px;
    color: var(--editor-primary);
    font-size: 14px;
    line-height: 1.5;
}

body.exam-detail-active .q-analysis-preview p {
    max-height: 46px;
    margin: 4px 0 0;
    overflow: hidden;
    color: var(--editor-text);
    font-size: 13px;
    line-height: 1.65;
}

body.exam-detail-active .prop-aside {
    width: auto !important;
}

body.exam-detail-active .prop-aside > div {
    height: 100%;
    padding: 0 28px 28px;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-gutter: stable;
}

body.exam-detail-active .prop-panel {
    display: grid;
    gap: 12px;
    min-width: 0;
    padding: 0 0 10px !important;
}

body.exam-detail-active .prop-header {
    position: sticky;
    top: 0;
    left: 0;
    right: 0;
    z-index: 6;
    width: 100%;
    max-width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    box-sizing: border-box;
    margin: 0 0 12px;
    padding: 18px 18px 14px 22px;
    border-bottom: 1px solid var(--editor-line);
    background: rgba(255, 255, 255, 0.96) !important;
    backdrop-filter: none !important;
    overflow: visible;
}

body.exam-detail-active .prop-header-main {
    min-width: 0;
    padding-left: 0 !important;
    transform: translateX(0);
}

body.exam-detail-active .prop-title {
    color: var(--editor-text) !important;
    font-size: 19px !important;
    font-weight: 850 !important;
    line-height: 1.35;
    letter-spacing: 0;
    overflow: visible;
}

body.exam-detail-active .prop-subtitle,
body.exam-detail-active .prop-section-tip {
    color: var(--editor-text-soft) !important;
    font-size: 12px;
    font-weight: 650;
}

body.exam-detail-active .prop-index-badge {
    min-width: 48px;
    height: 32px;
    flex: 0 0 auto;
    margin-right: 0;
    border: 1px solid #cfe0f7 !important;
    border-radius: var(--editor-radius) !important;
    background: var(--editor-primary-soft) !important;
    color: var(--editor-primary) !important;
    font-weight: 850 !important;
}

body.exam-detail-active .inspector-summary {
    grid-template-columns: repeat(3, minmax(0, 1fr));
}

body.exam-detail-active .prop-section {
    padding: 12px !important;
    border: 1px solid var(--editor-line) !important;
    border-radius: var(--editor-radius) !important;
    background: #ffffff !important;
    box-shadow: none !important;
}

body.exam-detail-active .prop-section--primary {
    border-color: #cfdbeb !important;
    background: #fbfdff !important;
}

body.exam-detail-active .type-radio-group {
    width: 100%;
    display: grid !important;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
}

body.exam-detail-active .type-radio-group .el-radio-button__inner {
    width: 100%;
    height: 34px !important;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--editor-line) !important;
    border-radius: var(--editor-radius) !important;
    background: #ffffff !important;
    color: var(--editor-text-soft) !important;
    font-weight: 760 !important;
    line-height: 1 !important;
}

body.exam-detail-active .type-radio-group .el-radio-button.is-active .el-radio-button__inner {
    border-color: rgba(36, 104, 178, 0.44) !important;
    background: var(--editor-primary-soft) !important;
    color: var(--editor-primary) !important;
    box-shadow: none !important;
}

body.exam-detail-active .prop-panel .el-input__wrapper,
body.exam-detail-active .prop-panel .el-textarea__inner {
    border: 1px solid var(--editor-line) !important;
    border-radius: var(--editor-radius) !important;
    background: #ffffff !important;
    box-shadow: none !important;
}

body.exam-detail-active .prop-panel .el-input__wrapper.is-focus,
body.exam-detail-active .prop-panel .el-textarea__inner:focus {
    border-color: rgba(36, 104, 178, 0.58) !important;
    box-shadow: 0 0 0 3px rgba(36, 104, 178, 0.12) !important;
}

body.exam-detail-active .prop-content-input .el-textarea__inner {
    min-height: 124px !important;
}

body.exam-detail-active .prop-analysis-input .el-textarea__inner {
    min-height: 98px !important;
}

body.exam-detail-active .option-list {
    display: grid;
    gap: 8px;
}

body.exam-detail-active .option-item {
    display: grid !important;
    grid-template-columns: 54px minmax(0, 1fr) 30px;
    align-items: center;
    gap: 8px !important;
    padding: 8px !important;
    border: 1px solid var(--editor-line) !important;
    border-radius: var(--editor-radius) !important;
    background: var(--editor-surface-subtle) !important;
    box-shadow: none !important;
}

body.exam-detail-active .option-item.is-checked {
    border-color: #b8d4f6 !important;
    background: var(--editor-primary-soft) !important;
}

body.exam-detail-active .option-meta {
    min-width: 0 !important;
}

body.exam-detail-active .option-check,
body.exam-detail-active .option-check .el-checkbox__label {
    min-width: 0 !important;
}

body.exam-detail-active .option-label {
    color: var(--editor-text) !important;
    font-weight: 850 !important;
}

body.exam-detail-active .option-item.is-checked .option-label {
    color: var(--editor-primary) !important;
}

body.exam-detail-active .option-delete-btn {
    width: 30px !important;
    height: 30px !important;
    min-width: 30px !important;
    margin: 0 !important;
    padding: 0 !important;
    border-radius: var(--editor-radius) !important;
    color: var(--editor-red) !important;
}

body.exam-detail-active .add-option-btn {
    width: 100%;
    height: 36px !important;
    margin: 10px 0 0 !important;
    border: 1px dashed var(--editor-line-strong) !important;
    border-radius: var(--editor-radius) !important;
    background: #ffffff !important;
    color: var(--editor-primary) !important;
    font-weight: 760 !important;
}

body.exam-detail-active .empty-tip,
body.exam-detail-active .empty-prop {
    min-height: 220px;
    display: grid !important;
    place-items: center;
    align-content: center;
    gap: 8px;
    padding: 28px;
    border: 1px dashed var(--editor-line-strong) !important;
    border-radius: var(--editor-radius) !important;
    background: var(--editor-surface-subtle) !important;
    color: var(--editor-text-soft);
    text-align: center;
}

body.exam-detail-active .empty-tip .el-icon,
body.exam-detail-active .empty-prop .el-icon {
    color: #b5c3d6;
    font-size: 38px;
}

body.exam-detail-active .empty-tip strong,
body.exam-detail-active .empty-prop strong {
    color: var(--editor-text);
    font-size: 15px;
}

body.exam-detail-active .empty-tip span,
body.exam-detail-active .empty-prop span {
    color: var(--editor-text-soft);
    font-size: 13px;
    line-height: 1.6;
}

body.exam-detail-active .mobile-fab {
    display: none !important;
    border-radius: var(--editor-radius) !important;
    background: var(--editor-primary) !important;
    box-shadow: 0 12px 26px rgba(36, 104, 178, 0.28) !important;
}

body.exam-detail-active .mobile-editor-drawer {
    display: none;
}

body.exam-detail-active .mobile-editor-drawer.el-drawer,
body.exam-detail-active .mobile-editor-drawer .el-drawer {
    width: min(86vw, 560px) !important;
    border-left: 1px solid var(--editor-line);
    background: #f5f9fc !important;
    box-shadow: -18px 0 42px rgba(15, 23, 42, 0.18) !important;
}

body.exam-detail-active .mobile-editor-drawer.el-drawer .el-drawer__body,
body.exam-detail-active .mobile-editor-drawer .el-drawer__body {
    height: 100%;
    min-height: 0;
    padding: 0 !important;
    overflow: hidden;
}

body.exam-detail-active .mobile-editor-sheet {
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    background:
        linear-gradient(rgba(36, 104, 178, 0.045) 1px, transparent 1px),
        linear-gradient(90deg, rgba(18, 128, 92, 0.03) 1px, transparent 1px),
        #f6f9fc;
    background-size: 32px 32px, 32px 32px, auto;
}

body.exam-detail-active .mobile-editor-header {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 10px;
    padding: 16px 16px 14px;
    border-bottom: 1px solid var(--editor-line);
    background: rgba(255, 255, 255, 0.96);
}

body.exam-detail-active .mobile-editor-heading {
    min-width: 0;
    display: grid;
    gap: 3px;
}

body.exam-detail-active .mobile-editor-heading span,
body.exam-detail-active .mobile-editor-heading small,
body.exam-detail-active .mobile-section-title small,
body.exam-detail-active .mobile-section-actions small,
body.exam-detail-active .mobile-editor-summary span {
    color: var(--editor-text-soft);
    font-size: 12px;
    font-weight: 700;
    line-height: 1.3;
}

body.exam-detail-active .mobile-editor-heading strong {
    overflow: hidden;
    color: var(--editor-text);
    font-size: 19px;
    font-weight: 850;
    line-height: 1.24;
    text-overflow: ellipsis;
    white-space: nowrap;
}

body.exam-detail-active .mobile-editor-badge {
    min-width: 48px;
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #cfe0f7;
    border-radius: var(--editor-radius);
    background: var(--editor-primary-soft);
    color: var(--editor-primary);
    font-size: 16px;
    font-weight: 850;
}

body.exam-detail-active .mobile-editor-close {
    width: 34px !important;
    height: 34px !important;
    min-width: 34px !important;
    border-radius: var(--editor-radius) !important;
    border-color: var(--editor-line) !important;
    background: #ffffff !important;
    color: var(--editor-text-soft) !important;
}

body.exam-detail-active .mobile-editor-body {
    min-height: 0;
    display: grid;
    gap: 12px;
    padding: 12px 14px calc(16px + env(safe-area-inset-bottom, 0px));
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
}

body.exam-detail-active .mobile-editor-summary {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
}

body.exam-detail-active .mobile-editor-summary div {
    min-width: 0;
    padding: 10px;
    border: 1px solid var(--editor-line);
    border-radius: var(--editor-radius);
    background: #ffffff;
}

body.exam-detail-active .mobile-editor-summary strong {
    display: block;
    overflow: hidden;
    margin-top: 4px;
    color: var(--editor-text);
    font-size: 18px;
    font-weight: 850;
    line-height: 1.15;
    text-overflow: ellipsis;
    white-space: nowrap;
}

body.exam-detail-active .mobile-editor-form {
    display: grid;
    gap: 12px;
}

body.exam-detail-active .mobile-editor-form .el-form-item {
    margin: 0 !important;
}

body.exam-detail-active .mobile-editor-section {
    min-width: 0;
    padding: 12px;
    border: 1px solid var(--editor-line);
    border-radius: var(--editor-radius);
    background: rgba(255, 255, 255, 0.98);
    box-shadow: var(--editor-shadow);
}

body.exam-detail-active .mobile-editor-section--primary {
    border-color: #cfdbeb;
    background: #fbfdff;
}

body.exam-detail-active .mobile-section-title {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
}

body.exam-detail-active .mobile-section-title > span {
    color: var(--editor-text);
    font-size: 15px;
    font-weight: 850;
    line-height: 1.35;
}

body.exam-detail-active .mobile-section-actions {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
}

body.exam-detail-active .mobile-type-radio {
    grid-template-columns: repeat(4, minmax(0, 1fr));
}

body.exam-detail-active .mobile-editor-sheet .el-input__wrapper,
body.exam-detail-active .mobile-editor-sheet .el-textarea__inner {
    border: 1px solid var(--editor-line) !important;
    border-radius: var(--editor-radius) !important;
    background: #ffffff !important;
    box-shadow: none !important;
}

body.exam-detail-active .mobile-editor-sheet .el-input__wrapper.is-focus,
body.exam-detail-active .mobile-editor-sheet .el-textarea__inner:focus {
    border-color: rgba(36, 104, 178, 0.58) !important;
    box-shadow: 0 0 0 3px rgba(36, 104, 178, 0.12) !important;
}

body.exam-detail-active .mobile-content-input .el-textarea__inner {
    min-height: 146px !important;
}

body.exam-detail-active .mobile-analysis-input .el-textarea__inner {
    min-height: 112px !important;
}

body.exam-detail-active .mobile-option-list {
    display: grid;
    gap: 10px;
}

body.exam-detail-active .mobile-option-item {
    min-width: 0;
    display: grid;
    grid-template-columns: 58px minmax(0, 1fr) 34px;
    align-items: center;
    gap: 10px;
    padding: 10px;
    border: 1px solid var(--editor-line);
    border-radius: var(--editor-radius);
    background: var(--editor-surface-subtle);
}

body.exam-detail-active .mobile-option-item.is-checked {
    border-color: #b8d4f6;
    background: var(--editor-primary-soft);
}

body.exam-detail-active .mobile-option-check {
    min-width: 0;
}

body.exam-detail-active .mobile-option-check .el-checkbox__label {
    min-width: 0;
    color: var(--editor-text);
    font-size: 15px;
    font-weight: 850;
}

body.exam-detail-active .mobile-option-item.is-checked .mobile-option-check .el-checkbox__label {
    color: var(--editor-primary);
}

body.exam-detail-active .mobile-option-input {
    min-width: 0;
}

body.exam-detail-active .mobile-option-delete {
    width: 34px !important;
    height: 34px !important;
    min-width: 34px !important;
    margin: 0 !important;
    padding: 0 !important;
    border-radius: var(--editor-radius) !important;
    background: #fff7f7 !important;
    color: var(--editor-red) !important;
}

body.exam-detail-active .mobile-add-option-btn {
    width: 100%;
    height: 40px !important;
    margin: 12px 0 0 !important;
    border: 1px dashed var(--editor-line-strong) !important;
    border-radius: var(--editor-radius) !important;
    background: #ffffff !important;
    color: var(--editor-primary) !important;
    font-weight: 800 !important;
}

html body.exam-detail-active .el-overlay,
body.exam-detail-active .el-overlay {
    background: rgba(15, 23, 42, 0.42) !important;
    backdrop-filter: initial !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
}

body.exam-detail-active .el-overlay-dialog,
body.exam-detail-active .el-overlay.is-message-box .el-overlay-message-box {
    align-items: center !important;
    justify-content: center !important;
    padding: 18px !important;
}

body.exam-detail-active .el-dialog,
body.exam-detail-active .el-message-box {
    border: 1px solid var(--editor-line) !important;
    border-radius: var(--editor-radius) !important;
    box-shadow: 0 22px 52px rgba(15, 23, 42, 0.24) !important;
    overflow: hidden !important;
}

body.exam-detail-active .el-dialog .el-dialog__header {
    padding: 16px 18px 8px !important;
    margin: 0 !important;
}

body.exam-detail-active .el-dialog .el-dialog__title {
    color: var(--editor-text) !important;
    font-size: 17px !important;
    font-weight: 850 !important;
    letter-spacing: 0 !important;
}

body.exam-detail-active .el-dialog .el-dialog__body {
    padding: 12px 18px 18px !important;
}

body.exam-detail-active .el-dialog .el-dialog__footer {
    padding: 12px 18px 16px !important;
    border-top: 1px solid var(--editor-line) !important;
    background: var(--editor-surface-subtle) !important;
}

body.exam-detail-active .dialog-footer,
body.exam-detail-active .el-dialog .el-dialog__footer span {
    display: flex !important;
    align-items: center;
    justify-content: flex-end;
    gap: 8px !important;
}

body.exam-detail-active .ai-analysis-dialog {
    min-height: 166px;
}

body.exam-detail-active .ai-analysis-head {
    margin-bottom: 12px;
    padding: 12px;
    border: 1px solid var(--editor-line);
    border-radius: var(--editor-radius);
    background: var(--editor-surface-subtle);
}

body.exam-detail-active .ai-analysis-title {
    color: var(--editor-text);
    font-size: 16px;
    font-weight: 850;
    line-height: 1.35;
}

body.exam-detail-active .ai-analysis-subtitle {
    margin-top: 4px;
    color: var(--editor-text-soft);
    font-size: 13px;
    line-height: 1.5;
}

body.exam-detail-active .ai-analysis-loading {
    min-height: 112px;
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    padding: 16px;
    border: 1px solid var(--editor-line);
    border-radius: var(--editor-radius);
    background: #ffffff;
}

body.exam-detail-active .ai-analysis-loading .el-icon {
    color: var(--editor-primary);
    font-size: 26px;
}

body.exam-detail-active .ai-analysis-loading strong,
body.exam-detail-active .ai-analysis-loading span {
    display: block;
}

body.exam-detail-active .ai-analysis-loading strong {
    color: var(--editor-text);
    font-size: 15px;
    line-height: 1.35;
}

body.exam-detail-active .ai-analysis-loading span {
    margin-top: 4px;
    color: var(--editor-text-soft);
    font-size: 13px;
    line-height: 1.5;
}

body.exam-detail-active .ai-analysis-card {
    max-height: min(50vh, 420px);
    padding: 14px;
    border: 1px solid var(--editor-line);
    border-radius: var(--editor-radius);
    background: #ffffff;
    overflow: auto;
}

body.exam-detail-active .ai-analysis-content {
    color: var(--editor-text);
    font-size: 14px;
    line-height: 1.75;
    white-space: pre-wrap;
    word-break: break-word;
}

@media (max-width: 1280px) {
    body.exam-detail-active .editor-workbench {
        grid-template-columns: 250px minmax(0, 1fr) minmax(360px, 400px);
        padding: 10px 14px 14px;
    }

    body.exam-detail-active .question-options-preview {
        grid-template-columns: 1fr;
    }
}

@media (max-width: 1080px) {
    body.exam-detail-active .topbar-main {
        grid-template-columns: minmax(0, 1fr) auto auto;
        gap: 10px;
    }

    body.exam-detail-active .exam-topbar {
        height: auto !important;
        min-height: 68px !important;
        padding: 10px 16px !important;
    }

    body.exam-detail-active .topbar-actions,
    body.exam-detail-active .editor-status-strip {
        width: auto;
        justify-content: flex-end;
        overflow-x: auto;
        scrollbar-width: none;
    }

    body.exam-detail-active .desktop-toolbar,
    body.exam-detail-active .import-question-btn,
    body.exam-detail-active .ai-batch-entry,
    body.exam-detail-active .edit-info-btn {
        display: none !important;
    }

    body.exam-detail-active .topbar-actions::-webkit-scrollbar,
    body.exam-detail-active .editor-status-strip::-webkit-scrollbar {
        display: none;
    }

    body.exam-detail-active .editor-workbench {
        grid-template-columns: minmax(0, 1fr);
        gap: 0;
        padding: 0 14px 14px;
    }

    body.exam-detail-active .paper-overview,
    body.exam-detail-active .prop-aside {
        display: none !important;
    }

    body.exam-detail-active .question-stage {
        width: 100%;
        max-width: 940px;
        margin: 0 auto !important;
        padding-top: 0 !important;
    }

    body.exam-detail-active .canvas-container {
        padding: 16px !important;
        padding-bottom: calc(86px + env(safe-area-inset-bottom, 0px)) !important;
        scroll-padding-top: 0 !important;
    }

    body.exam-detail-active .stage-header {
        margin: 0;
        padding: 16px;
        top: 0 !important;
        background: #ffffff !important;
    }

    body.exam-detail-active .mobile-fab {
        display: inline-flex !important;
        right: 16px !important;
        bottom: calc(16px + env(safe-area-inset-bottom, 0px)) !important;
        width: 52px !important;
        height: 52px !important;
        min-width: 52px !important;
    }

    body.exam-detail-active .mobile-editor-drawer {
        display: block;
    }

    body.exam-detail-active .mobile-editor-drawer.el-drawer,
    body.exam-detail-active .mobile-editor-drawer .el-drawer {
        width: min(86vw, 560px) !important;
    }
}

@media (max-width: 720px) {
    body.exam-detail-active .exam-detail-page {
        background:
            linear-gradient(rgba(36, 104, 178, 0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(18, 128, 92, 0.03) 1px, transparent 1px),
            #f6f9fc;
        background-size: 30px 30px, 30px 30px, auto;
    }

    body.exam-detail-active .exam-topbar {
        min-height: 58px !important;
        padding: 8px 10px !important;
        margin-bottom: 0 !important;
        border-radius: 0 !important;
    }

    body.exam-detail-active .topbar-main {
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 8px;
    }

    body.exam-detail-active .topbar-title-group {
        gap: 8px;
    }

    body.exam-detail-active .topbar-back {
        width: 34px !important;
        height: 34px !important;
        min-width: 34px !important;
    }

    body.exam-detail-active .paper-kicker {
        display: none;
    }

    body.exam-detail-active .paper-title-block h1 {
        font-size: 16px;
        line-height: 1.2;
    }

    body.exam-detail-active .desktop-toolbar {
        display: none !important;
    }

    body.exam-detail-active .editor-status-strip,
    body.exam-detail-active .import-question-btn,
    body.exam-detail-active .ai-batch-entry,
    body.exam-detail-active .edit-info-btn {
        display: none !important;
    }

    body.exam-detail-active .topbar-actions {
        width: auto;
        gap: 6px;
        justify-content: flex-end;
    }

    body.exam-detail-active .save-exam-btn {
        height: 34px !important;
        min-height: 34px !important;
        padding: 0 12px !important;
        font-size: 13px !important;
    }

    body.exam-detail-active .editor-workbench {
        gap: 0 !important;
        padding: 0 !important;
    }

    body.exam-detail-active .question-stage {
        max-width: none;
        margin-top: 0 !important;
        padding-top: 0 !important;
    }

    body.exam-detail-active .canvas-container {
        padding: 10px 10px calc(88px + env(safe-area-inset-bottom, 0px)) !important;
        margin-top: 0 !important;
        border: 0 !important;
        border-radius: 0 !important;
        background: #ffffff !important;
        box-shadow: none !important;
        scroll-padding-top: 0 !important;
    }

    body.exam-detail-active .stage-header {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 8px;
        margin: 0;
        padding: 10px 10px 12px;
        top: 0 !important;
        border-top: 0 !important;
        border-right: 0 !important;
        border-left: 0 !important;
        border-radius: 0;
        background: #ffffff !important;
        box-shadow: none !important;
    }

    body.exam-detail-active .stage-completion {
        width: auto;
        min-width: 86px;
        padding: 8px 9px;
        text-align: right;
    }

    body.exam-detail-active .stage-header h2 {
        font-size: 17px;
    }

    body.exam-detail-active .stage-header p {
        margin-top: 4px;
        font-size: 12px;
        line-height: 1.45;
    }

    body.exam-detail-active .stage-completion strong {
        font-size: 20px;
    }

    body.exam-detail-active .stage-completion span {
        font-size: 11px;
    }

    body.exam-detail-active .editor-question-card {
        margin-bottom: 10px !important;
        padding: 12px !important;
    }

    body.exam-detail-active .q-header {
        align-items: flex-start;
        gap: 8px;
    }

    body.exam-detail-active .q-titleline {
        flex: 1 1 auto;
        gap: 6px;
    }

    body.exam-detail-active .question-delete-btn {
        flex: 0 0 auto;
        min-width: 38px !important;
    }

    body.exam-detail-active .q-content {
        margin-top: 10px !important;
        font-size: 14px !important;
        line-height: 1.65 !important;
    }

    body.exam-detail-active .question-options-preview {
        grid-template-columns: 1fr;
        gap: 7px;
    }

    body.exam-detail-active .option-preview {
        padding: 8px;
    }

    body.exam-detail-active .mobile-fab {
        right: 14px !important;
        bottom: calc(14px + env(safe-area-inset-bottom, 0px)) !important;
        width: 50px !important;
        height: 50px !important;
        min-width: 50px !important;
    }

    body.exam-detail-active .mobile-editor-drawer.el-drawer,
    body.exam-detail-active .mobile-editor-drawer .el-drawer {
        width: 100vw !important;
        max-width: 100vw !important;
        border-left: 0;
        box-shadow: none !important;
    }

    body.exam-detail-active .mobile-editor-header {
        grid-template-columns: minmax(0, 1fr) auto auto;
        padding: 12px 10px;
    }

    body.exam-detail-active .mobile-editor-heading strong {
        font-size: 18px;
    }

    body.exam-detail-active .mobile-editor-badge,
    body.exam-detail-active .mobile-editor-close {
        min-width: 36px !important;
        width: 36px !important;
        height: 36px !important;
    }

    body.exam-detail-active .mobile-editor-badge {
        font-size: 15px;
    }

    body.exam-detail-active .mobile-editor-body {
        padding: 10px 10px calc(14px + env(safe-area-inset-bottom, 0px));
        gap: 10px;
    }

    body.exam-detail-active .mobile-editor-form {
        gap: 10px;
    }

    body.exam-detail-active .mobile-editor-section {
        padding: 10px;
    }

    body.exam-detail-active .mobile-content-input .el-textarea__inner {
        min-height: 170px !important;
    }

    body.exam-detail-active .mobile-option-item {
        grid-template-columns: 44px minmax(0, 1fr) 34px;
        gap: 8px;
        padding: 8px;
    }

    body.exam-detail-active .mobile-option-check .el-checkbox__label {
        font-size: 14px;
    }

    body.exam-detail-active .custom-mobile-drawer .el-drawer {
        max-height: 92vh !important;
        border-radius: var(--editor-radius) var(--editor-radius) 0 0 !important;
        overflow: hidden;
    }

    body.exam-detail-active .custom-mobile-drawer .el-drawer__body {
        padding: 0 !important;
    }

    body.exam-detail-active .mobile-drawer-content {
        padding: 16px !important;
        padding-bottom: calc(18px + env(safe-area-inset-bottom, 0px)) !important;
        overflow-y: auto;
    }

    body.exam-detail-active .mobile-drawer-header {
        margin-bottom: 16px;
    }

    body.exam-detail-active .mobile-tool-grid {
        gap: 10px;
        margin-bottom: 18px;
    }

    body.exam-detail-active .mobile-tool-item {
        min-height: 112px;
        padding: 16px 10px;
        border-radius: var(--editor-radius);
    }

    body.exam-detail-active .mobile-tool-row {
        padding: 12px;
        border-radius: var(--editor-radius);
    }

    body.exam-detail-active .el-dialog,
    body.exam-detail-active .el-message-box {
        width: calc(100vw - 24px) !important;
        max-width: calc(100vw - 24px) !important;
    }

    body.exam-detail-active .dialog-footer,
    body.exam-detail-active .el-dialog .el-dialog__footer span {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    body.exam-detail-active .dialog-footer .el-button,
    body.exam-detail-active .el-dialog .el-dialog__footer .el-button {
        width: 100% !important;
        min-width: 0 !important;
        margin: 0 !important;
    }
}

@media (max-width: 420px) {
    body.exam-detail-active .mobile-type-radio {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    body.exam-detail-active .mobile-editor-summary {
        grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    body.exam-detail-active .mobile-editor-summary div {
        padding: 8px 6px;
    }

    body.exam-detail-active .mobile-editor-summary strong {
        font-size: 16px;
    }
}

/* Batch import workbench: final overrides for the redesigned modal. */
body.exam-detail-active .batch-import-workbench-dialog.el-dialog,
body.exam-detail-active .batch-import-workbench-dialog .el-dialog {
    width: min(1180px, calc(100vw - 32px)) !important;
    height: min(880px, calc(100vh - 12px)) !important;
    max-height: calc(100vh - 12px) !important;
    margin: 6px auto !important;
    display: flex !important;
    flex-direction: column !important;
    overflow: hidden !important;
    border-radius: 16px !important;
    background: #f4f7fb !important;
}

body.exam-detail-active .batch-import-workbench-dialog .el-dialog__header {
    flex: 0 0 auto !important;
    padding: 16px 24px 12px !important;
    background: #ffffff !important;
    border-bottom: 1px solid #e3ebf6 !important;
}

body.exam-detail-active .batch-import-workbench-dialog .el-dialog__title {
    font-size: 22px !important;
    font-weight: 900 !important;
    color: #071d3b !important;
}

body.exam-detail-active .batch-import-workbench-dialog .el-dialog__body {
    flex: 1 1 auto !important;
    min-height: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    background: #f4f7fb !important;
}

body.exam-detail-active .batch-import-workbench-dialog .el-dialog__footer {
    flex: 0 0 auto !important;
    position: static !important;
    padding: 10px 24px !important;
    background: #ffffff !important;
    border-top: 1px solid #dce6f3 !important;
    box-shadow: 0 -10px 24px rgba(15, 41, 77, 0.06) !important;
}

body.exam-detail-active .batch-import-workbench-dialog .batch-workbench {
    height: 100% !important;
    min-height: 0 !important;
    display: grid !important;
    grid-template-columns: minmax(390px, 0.9fr) minmax(520px, 1.1fr) !important;
    background: #f4f7fb !important;
}

body.exam-detail-active .batch-import-workbench-dialog .batch-pane {
    min-width: 0 !important;
    min-height: 0 !important;
    overflow: hidden !important;
}

body.exam-detail-active .batch-import-workbench-dialog .batch-source-pane {
    display: grid !important;
    grid-template-rows: auto minmax(0, 1fr) auto !important;
    border-right: 1px solid #dfe8f5 !important;
    background: #ffffff !important;
}

body.exam-detail-active .batch-import-workbench-dialog .batch-review-pane {
    display: flex !important;
    flex-direction: column !important;
    gap: 8px !important;
    padding: 12px !important;
    background: linear-gradient(180deg, #f7fbff 0%, #f2f6fb 100%) !important;
}

body.exam-detail-active .batch-import-workbench-dialog .batch-pane-head,
body.exam-detail-active .batch-import-workbench-dialog .batch-review-head {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 12px !important;
    padding: 12px 14px !important;
    border-bottom: 1px solid #e3ebf6 !important;
    background: #ffffff !important;
}

body.exam-detail-active .batch-import-workbench-dialog .batch-review-head {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    padding-top: 9px !important;
    padding-bottom: 9px !important;
}

body.exam-detail-active .batch-import-workbench-dialog .batch-pane-kicker,
body.exam-detail-active .batch-import-workbench-dialog .batch-review-kicker {
    margin: 0 0 2px !important;
    font-size: 11px !important;
    font-weight: 800 !important;
    letter-spacing: 0 !important;
    color: #2b72bd !important;
}

body.exam-detail-active .batch-import-workbench-dialog .batch-pane-title,
body.exam-detail-active .batch-import-workbench-dialog .batch-review-title {
    margin: 0 !important;
    font-size: 17px !important;
    line-height: 1.25 !important;
    font-weight: 900 !important;
    color: #071d3b !important;
}

body.exam-detail-active .batch-import-workbench-dialog .batch-pane-subtitle,
body.exam-detail-active .batch-import-workbench-dialog .batch-review-subtitle {
    margin: 3px 0 0 !important;
    font-size: 12px !important;
    line-height: 1.35 !important;
    color: #5c7190 !important;
}

body.exam-detail-active .batch-import-workbench-dialog .batch-source-actions,
body.exam-detail-active .batch-import-workbench-dialog .batch-import-options {
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
    flex-wrap: wrap !important;
}

body.exam-detail-active .batch-import-workbench-dialog .tip-actions {
    display: flex !important;
    align-items: center !important;
    justify-content: flex-end !important;
    gap: 8px !important;
    flex-wrap: wrap !important;
}

body.exam-detail-active .batch-import-workbench-dialog .tip-upload-btn,
body.exam-detail-active .batch-import-workbench-dialog .tip-copy-btn,
body.exam-detail-active .batch-import-workbench-dialog .tip-toggle-btn {
    min-width: 0 !important;
    height: 30px !important;
    padding: 0 10px !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 5px !important;
    border: 1px solid #cfe0fb !important;
    border-radius: 8px !important;
    background: #f4f8ff !important;
    color: #1d63e9 !important;
    font-size: 12px !important;
    font-weight: 760 !important;
}

body.exam-detail-active .batch-import-workbench-dialog .tip-upload-btn {
    background: #eef8f3 !important;
    border-color: #bfe6d1 !important;
    color: #087a55 !important;
}

body.exam-detail-active .batch-import-workbench-dialog .batch-file-input {
    display: none !important;
}

body.exam-detail-active .batch-import-workbench-dialog .batch-import-options .el-checkbox {
    margin: 0 !important;
    padding: 4px 7px !important;
    border: 1px solid #d8e4f2 !important;
    border-radius: 8px !important;
    background: #ffffff !important;
}

body.exam-detail-active .batch-import-workbench-dialog .batch-import-options .el-checkbox__label {
    font-size: 12px !important;
    line-height: 1.2 !important;
}

body.exam-detail-active .batch-import-workbench-dialog .batch-source-input {
    min-height: 0 !important;
    padding: 12px 14px !important;
}

body.exam-detail-active .batch-import-workbench-dialog .batch-source-input .batch-input,
body.exam-detail-active .batch-import-workbench-dialog .batch-source-input .el-textarea,
body.exam-detail-active .batch-import-workbench-dialog .batch-source-input .el-textarea__inner {
    height: 100% !important;
    min-height: 0 !important;
}

body.exam-detail-active .batch-import-workbench-dialog .batch-source-input .el-textarea__inner {
    resize: none !important;
    padding: 16px !important;
    border-radius: 10px !important;
    border-color: #cbd9ea !important;
    font-size: 15px !important;
    line-height: 1.75 !important;
    color: #061a35 !important;
    box-shadow: inset 0 1px 3px rgba(15, 41, 77, 0.05) !important;
}

body.exam-detail-active .batch-import-workbench-dialog .batch-format-tip {
    min-height: 0 !important;
    max-height: 205px !important;
    margin: 0 !important;
    padding: 12px 14px 14px !important;
    overflow: auto !important;
    border: 0 !important;
    border-top: 1px solid #f0d8ad !important;
    border-radius: 0 !important;
    background: #fff7e8 !important;
}

body.exam-detail-active .batch-import-workbench-dialog .tip-head,
body.exam-detail-active .batch-import-workbench-dialog .tip-quick-row,
body.exam-detail-active .batch-import-workbench-dialog .tip-rule-row {
    display: grid !important;
    grid-template-columns: 92px minmax(0, 1fr) !important;
    align-items: start !important;
    gap: 10px !important;
}

body.exam-detail-active .batch-import-workbench-dialog .tip-head {
    grid-template-columns: minmax(0, 1fr) auto !important;
}

body.exam-detail-active .batch-import-workbench-dialog .tip-quick,
body.exam-detail-active .batch-import-workbench-dialog .tip-rules,
body.exam-detail-active .batch-import-workbench-dialog .tip-expanded {
    margin-top: 10px !important;
}

body.exam-detail-active .batch-import-workbench-dialog .tip-content {
    display: flex !important;
    flex-wrap: wrap !important;
    gap: 8px !important;
}

body.exam-detail-active .batch-import-workbench-dialog .tip-content code {
    max-width: 100% !important;
    padding: 5px 10px !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
}

body.exam-detail-active .batch-import-workbench-dialog .batch-review-summary {
    display: grid !important;
    grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
    gap: 8px !important;
    padding: 0 !important;
}

body.exam-detail-active .batch-import-workbench-dialog .summary-metric,
body.exam-detail-active .batch-import-workbench-dialog .batch-review-summary .quality-metric {
    min-width: 0 !important;
    min-height: 54px !important;
    padding: 6px 9px !important;
    border: 1px solid #d8e4f2 !important;
    border-radius: 10px !important;
    background: #ffffff !important;
    display: grid !important;
    align-content: center !important;
    gap: 2px !important;
}

body.exam-detail-active .batch-import-workbench-dialog .summary-metric.is-important,
body.exam-detail-active .batch-import-workbench-dialog .batch-review-summary .quality-metric.importable-metric {
    border-color: #0f8a58 !important;
    background: #ecfdf5 !important;
}

body.exam-detail-active .batch-import-workbench-dialog .summary-metric.is-warning,
body.exam-detail-active .batch-import-workbench-dialog .batch-review-summary .quality-metric.is-warning {
    border-color: #f0c36d !important;
    background: #fff7e5 !important;
}

body.exam-detail-active .batch-import-workbench-dialog .batch-review-summary .quality-metric.is-danger {
    border-color: #ef9a9a !important;
    background: #fff5f5 !important;
}

body.exam-detail-active .batch-import-workbench-dialog .summary-label,
body.exam-detail-active .batch-import-workbench-dialog .batch-review-summary .quality-metric span {
    font-size: 12px !important;
    color: #58708f !important;
}

body.exam-detail-active .batch-import-workbench-dialog .summary-value,
body.exam-detail-active .batch-import-workbench-dialog .batch-review-summary .quality-metric strong {
    margin-top: 0 !important;
    font-size: 20px !important;
    line-height: 1 !important;
    color: #061a35 !important;
}

body.exam-detail-active .batch-import-workbench-dialog .summary-unit,
body.exam-detail-active .batch-import-workbench-dialog .batch-review-summary .quality-metric small {
    margin-top: 0 !important;
    font-size: 11px !important;
    color: #5e7190 !important;
}

body.exam-detail-active .batch-import-workbench-dialog .batch-type-tags {
    display: flex !important;
    flex-wrap: wrap !important;
    gap: 6px !important;
    margin: 0 !important;
}

body.exam-detail-active .batch-import-workbench-dialog .type-tag {
    margin: 0 !important;
    padding: 4px 8px !important;
    border-radius: 999px !important;
    background: #e7f1ff !important;
    color: #07559f !important;
}

body.exam-detail-active .batch-import-workbench-dialog .type-tag.type-tag-warning {
    background: #fff1d6 !important;
    color: #9a5b00 !important;
}

body.exam-detail-active .batch-import-workbench-dialog .batch-quality-issues {
    flex: 0 0 auto !important;
    display: grid !important;
    grid-template-columns: auto minmax(0, 1fr) !important;
    align-items: center !important;
    gap: 10px !important;
    margin: 0 !important;
    padding: 7px 9px !important;
    border: 1px solid #f1c983 !important;
    border-radius: 10px !important;
    background: #fff8ec !important;
}

body.exam-detail-active .batch-import-workbench-dialog .quality-issue-list {
    max-height: 36px !important;
    overflow: auto !important;
}

body.exam-detail-active .batch-import-workbench-dialog .quality-issues-head,
body.exam-detail-active .batch-import-workbench-dialog .quality-issue-row {
    display: grid !important;
    grid-template-columns: auto auto minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: 8px !important;
}

body.exam-detail-active .batch-import-workbench-dialog .quality-issues-head {
    grid-template-columns: auto minmax(0, 1fr) !important;
    margin-bottom: 0 !important;
}

body.exam-detail-active .batch-import-workbench-dialog .quality-issues-head small {
    display: none !important;
}

body.exam-detail-active .batch-import-workbench-dialog .quality-issue-row {
    min-height: 30px !important;
    padding: 4px 6px !important;
}

body.exam-detail-active .batch-import-workbench-dialog .quality-issue-detail,
body.exam-detail-active .batch-import-workbench-dialog .quality-issue-source {
    min-width: 0 !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
}

body.exam-detail-active .batch-import-workbench-dialog .batch-preview-empty {
    flex: 1 1 auto !important;
    min-height: 0 !important;
    display: grid !important;
    place-items: center !important;
    border: 1px dashed #c8d8ea !important;
    border-radius: 12px !important;
    background: #ffffff !important;
}

body.exam-detail-active .batch-import-workbench-dialog .preview-list {
    flex: 1 1 auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: auto !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 8px !important;
    padding: 0 4px 0 0 !important;
    border: 0 !important;
    background: transparent !important;
}

body.exam-detail-active .batch-import-workbench-dialog .preview-item {
    flex: 0 0 auto !important;
    display: block !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 10px !important;
    border: 1px solid #d9e5f3 !important;
    border-radius: 10px !important;
    background: #ffffff !important;
}

body.exam-detail-active .batch-import-workbench-dialog .preview-item.has-warning {
    border-color: #f0c36d !important;
    background: #fffaf0 !important;
}

body.exam-detail-active .batch-import-workbench-dialog .preview-item.has-blocking {
    border-color: #ef9a9a !important;
    background: #fff5f5 !important;
}

body.exam-detail-active .batch-import-workbench-dialog .preview-row-main {
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
    min-width: 0 !important;
}

body.exam-detail-active .batch-import-workbench-dialog .preview-index,
body.exam-detail-active .batch-import-workbench-dialog .preview-source,
body.exam-detail-active .batch-import-workbench-dialog .preview-type {
    min-width: 0 !important;
}

body.exam-detail-active .batch-import-workbench-dialog .preview-index {
    flex: 0 0 auto !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    min-width: 58px !important;
    height: 26px !important;
    padding: 0 9px !important;
    border: 1px solid #cfe0f6 !important;
    border-radius: 999px !important;
    background: #eef6ff !important;
    font-size: 13px !important;
    line-height: 1 !important;
    font-weight: 800 !important;
    white-space: nowrap !important;
    color: #164579 !important;
}

body.exam-detail-active .batch-import-workbench-dialog .preview-source {
    flex: 0 0 auto !important;
    font-size: 12px !important;
    line-height: 1 !important;
    white-space: nowrap !important;
    color: #667c99 !important;
}

body.exam-detail-active .batch-import-workbench-dialog .preview-type {
    flex: 0 0 auto !important;
    justify-self: start !important;
    padding: 5px 9px !important;
}

body.exam-detail-active .batch-import-workbench-dialog .preview-row-main > .el-tag {
    flex: 0 0 auto !important;
    height: 24px !important;
    line-height: 22px !important;
}

body.exam-detail-active .batch-import-workbench-dialog .preview-issue-tags {
    flex: 0 0 auto !important;
    min-width: 0 !important;
    max-width: none !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 4px !important;
    flex-wrap: nowrap !important;
    overflow: visible !important;
    margin: 0 !important;
}

body.exam-detail-active .batch-import-workbench-dialog .preview-issue-tags .el-tag {
    flex: 0 0 auto !important;
    min-width: 58px !important;
    height: 24px !important;
    line-height: 22px !important;
    margin: 0 !important;
    justify-content: center !important;
}

body.exam-detail-active .batch-import-workbench-dialog .preview-text {
    flex: 1 1 auto !important;
    min-width: 0 !important;
    font-size: 14px !important;
    line-height: 1.5 !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    color: #0c2548 !important;
}

body.exam-detail-active .batch-import-workbench-dialog .preview-actions {
    display: flex !important;
    justify-content: flex-end !important;
}

body.exam-detail-active .batch-import-workbench-dialog .preview-edit-toggle {
    flex: 0 0 auto !important;
    min-width: 56px !important;
}

body.exam-detail-active .batch-import-workbench-dialog .preview-issue-row {
    margin-top: 8px !important;
    padding-left: 0 !important;
}

body.exam-detail-active .batch-import-workbench-dialog .preview-edit-panel {
    margin-top: 12px !important;
    padding: 12px !important;
    max-height: min(360px, calc(100vh - 360px)) !important;
    overflow: auto !important;
    border-radius: 10px !important;
    border: 1px solid #d8e4f2 !important;
    background: #f8fbff !important;
}

body.exam-detail-active .batch-import-workbench-dialog .preview-edit-panel .el-textarea__inner {
    min-height: 52px !important;
    line-height: 1.5 !important;
}

body.exam-detail-active .batch-import-workbench-dialog .preview-edit-options {
    max-height: 150px !important;
    overflow: auto !important;
}

body.exam-detail-active .batch-import-workbench-dialog .batch-dialog-footer {
    display: flex !important;
    align-items: center !important;
    justify-content: flex-end !important;
    gap: 12px !important;
}

body.exam-detail-active .batch-import-workbench-dialog .batch-dialog-footer-note {
    min-width: 0 !important;
    margin-right: auto !important;
    padding: 8px 12px !important;
    border: 1px solid #d8e4f2 !important;
    border-radius: 12px !important;
    background: #f8fbff !important;
    color: #58708f !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 5px !important;
    font-size: 13px !important;
    font-weight: 760 !important;
    white-space: nowrap !important;
}

body.exam-detail-active .batch-import-workbench-dialog .batch-dialog-footer-note strong {
    color: #087a55 !important;
    font-size: 18px !important;
    line-height: 1 !important;
}

body.exam-detail-active .batch-import-workbench-dialog .batch-dialog-footer .el-button {
    width: auto !important;
    min-width: 122px !important;
    height: 44px !important;
    margin: 0 !important;
}

@media (max-width: 1080px) {
    body.exam-detail-active .batch-import-workbench-dialog.el-dialog,
    body.exam-detail-active .batch-import-workbench-dialog .el-dialog {
        height: calc(100vh - 28px) !important;
        max-height: calc(100vh - 28px) !important;
        margin: 14px auto !important;
    }

    body.exam-detail-active .batch-import-workbench-dialog .batch-workbench {
        grid-template-columns: 1fr !important;
        grid-template-rows: minmax(320px, 0.95fr) minmax(360px, 1.05fr) !important;
    }

    body.exam-detail-active .batch-import-workbench-dialog .batch-source-pane {
        border-right: 0 !important;
        border-bottom: 1px solid #dfe8f5 !important;
    }

    body.exam-detail-active .batch-import-workbench-dialog .batch-format-tip {
        max-height: 190px !important;
    }

    body.exam-detail-active .batch-import-workbench-dialog .batch-review-summary {
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    }
}

@media (max-width: 720px) {
    body.exam-detail-active .batch-import-workbench-dialog.el-dialog,
    body.exam-detail-active .batch-import-workbench-dialog .el-dialog {
        width: 100vw !important;
        height: 100vh !important;
        max-height: 100vh !important;
        margin: 0 !important;
        border-radius: 0 !important;
    }

    body.exam-detail-active .batch-import-workbench-dialog .el-dialog__header {
        padding: 18px 16px 12px !important;
    }

    body.exam-detail-active .batch-import-workbench-dialog .batch-workbench {
        grid-template-rows: minmax(280px, 0.9fr) minmax(360px, 1.1fr) !important;
    }

    body.exam-detail-active .batch-import-workbench-dialog .batch-pane-head,
    body.exam-detail-active .batch-import-workbench-dialog .batch-review-head {
        display: grid !important;
        grid-template-columns: 1fr !important;
        padding: 12px !important;
    }

    body.exam-detail-active .batch-import-workbench-dialog .batch-source-input,
    body.exam-detail-active .batch-import-workbench-dialog .batch-review-pane {
        padding: 12px !important;
    }

    body.exam-detail-active .batch-import-workbench-dialog .batch-review-summary {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }

    body.exam-detail-active .batch-import-workbench-dialog .preview-row-main {
        grid-template-columns: 46px auto minmax(0, 1fr) auto !important;
    }

    body.exam-detail-active .batch-import-workbench-dialog .preview-source {
        display: none !important;
    }

    body.exam-detail-active .batch-import-workbench-dialog .batch-dialog-footer {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
    }

    body.exam-detail-active .batch-import-workbench-dialog .batch-dialog-footer-note {
        grid-column: 1 / -1 !important;
        width: 100% !important;
        margin-right: 0 !important;
        justify-content: center !important;
        white-space: normal !important;
    }

    body.exam-detail-active .batch-import-workbench-dialog .batch-dialog-footer .el-button {
        width: 100% !important;
        min-width: 0 !important;
    }
}

/* Final editor polish: a focused paper-workbench for heavy question editing. */
body.exam-detail-active {
    --editor-bg: #f5f7fa;
    --editor-surface: #ffffff;
    --editor-surface-soft: #f8fafc;
    --editor-line: #dfe7ef;
    --editor-line-strong: #c8d5e2;
    --editor-text: #151a21;
    --editor-text-soft: #536172;
    --editor-text-muted: #7b8796;
    --editor-primary: #2563eb;
    --editor-primary-hover: #1d4ed8;
    --editor-primary-soft: #eaf2ff;
    --editor-green: #0f8f72;
    --editor-green-soft: #e7f8f2;
    --editor-amber: #b66a12;
    --editor-amber-soft: #fff4df;
    --editor-danger: #c2412d;
    --editor-danger-soft: #fff0ed;
    --editor-violet: #6d5bd0;
    --editor-violet-soft: #f0edff;
    --editor-radius: 8px;
    --editor-shadow-xs: 0 1px 2px rgba(18, 28, 38, 0.05);
    --editor-shadow-sm: 0 8px 22px rgba(18, 28, 38, 0.07);
    --editor-shadow-md: 0 18px 46px rgba(18, 28, 38, 0.12);
    --editor-ease: cubic-bezier(0.22, 1, 0.36, 1);
    background:
        linear-gradient(rgba(37, 99, 235, 0.035) 1px, transparent 1px),
        linear-gradient(90deg, rgba(15, 143, 114, 0.03) 1px, transparent 1px),
        linear-gradient(180deg, #fbfcfe 0%, var(--editor-bg) 100%) !important;
    background-size: 28px 28px, 28px 28px, auto !important;
    background-position: -1px -1px, -1px -1px, 0 0 !important;
    color: var(--editor-text) !important;
    overflow: hidden !important;
}

@keyframes editor-panel-in {
    from {
        opacity: 0;
        transform: translateY(10px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes editor-save-glow {
    0%, 100% {
        box-shadow: 0 10px 22px rgba(37, 99, 235, 0.18);
    }

    50% {
        box-shadow: 0 14px 32px rgba(37, 99, 235, 0.28);
    }
}

body.exam-detail-active .exam-detail-page,
body.exam-detail-active .exam-shell {
    min-height: 100dvh !important;
    height: 100dvh !important;
    background: transparent !important;
    color: var(--editor-text) !important;
}

body.exam-detail-active .exam-topbar {
    height: 76px !important;
    min-height: 76px !important;
    padding: 0 20px !important;
    border-bottom: 1px solid rgba(210, 221, 232, 0.86) !important;
    background: rgba(255, 255, 255, 0.92) !important;
    box-shadow: 0 8px 28px rgba(18, 28, 38, 0.055) !important;
    backdrop-filter: blur(18px) saturate(1.2) !important;
    -webkit-backdrop-filter: blur(18px) saturate(1.2) !important;
}

body.exam-detail-active .topbar-main {
    width: min(100%, 1720px) !important;
    height: 100% !important;
    margin: 0 auto !important;
    display: grid !important;
    grid-template-columns: minmax(260px, 1fr) auto minmax(320px, auto) !important;
    align-items: center !important;
    gap: 14px !important;
}

body.exam-detail-active .topbar-title-group,
body.exam-detail-active .topbar-actions,
body.exam-detail-active .desktop-toolbar,
body.exam-detail-active .editor-status-strip {
    min-width: 0 !important;
}

body.exam-detail-active .topbar-back {
    width: 40px !important;
    height: 40px !important;
    border-radius: var(--editor-radius) !important;
    border-color: var(--editor-line) !important;
    background: #ffffff !important;
    color: var(--editor-text) !important;
}

body.exam-detail-active .paper-kicker,
body.exam-detail-active .stage-eyebrow,
body.exam-detail-active .prop-kicker {
    color: var(--editor-primary) !important;
    font-size: 11px !important;
    font-weight: 860 !important;
    letter-spacing: 0 !important;
}

body.exam-detail-active .paper-title-block h1,
body.exam-detail-active .stage-header h2 {
    color: var(--editor-text) !important;
    font-weight: 900 !important;
    letter-spacing: 0 !important;
}

body.exam-detail-active .paper-title-block h1 {
    max-width: 460px !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
    font-size: 20px !important;
}

body.exam-detail-active .editor-status-strip {
    justify-self: center !important;
    max-width: 100% !important;
    padding: 6px !important;
    border: 1px solid var(--editor-line) !important;
    border-radius: var(--editor-radius) !important;
    background: rgba(248, 250, 252, 0.82) !important;
    box-shadow: var(--editor-shadow-xs) !important;
}

body.exam-detail-active .editor-status-strip .el-tag,
body.exam-detail-active .editor-question-card .el-tag {
    min-height: 28px !important;
    border-radius: 999px !important;
    font-weight: 780 !important;
}

body.exam-detail-active .status-jump-button,
body.exam-detail-active .overview-next-action,
body.exam-detail-active .stage-jump-button {
    border-radius: var(--editor-radius) !important;
    font-weight: 800 !important;
}

body.exam-detail-active .topbar-actions {
    justify-self: end !important;
    gap: 8px !important;
}

body.exam-detail-active .desktop-toolbar {
    padding: 4px !important;
    gap: 4px !important;
    border: 1px solid var(--editor-line) !important;
    border-radius: var(--editor-radius) !important;
    background: rgba(255, 255, 255, 0.76) !important;
}

body.exam-detail-active .el-button {
    border-radius: var(--editor-radius) !important;
    font-weight: 780 !important;
    transition:
        transform 0.18s ease,
        box-shadow 0.18s ease,
        background-color 0.18s ease,
        border-color 0.18s ease,
        color 0.18s ease !important;
}

body.exam-detail-active .el-button:not(.is-disabled):hover {
    transform: translateY(-1px);
}

body.exam-detail-active .save-exam-btn,
body.exam-detail-active .el-button--primary {
    border-color: var(--editor-primary) !important;
    background: var(--editor-primary) !important;
    box-shadow: 0 10px 22px rgba(37, 99, 235, 0.18) !important;
}

body.exam-detail-active .save-exam-btn:hover,
body.exam-detail-active .el-button--primary:hover {
    border-color: var(--editor-primary-hover) !important;
    background: var(--editor-primary-hover) !important;
}

body.exam-detail-active .save-exam-btn {
    animation: editor-save-glow 4s ease-in-out infinite;
}

body.exam-detail-active .editor-workbench {
    height: calc(100dvh - 76px) !important;
    padding: 14px 20px 18px !important;
    display: grid !important;
    grid-template-columns: 286px minmax(500px, 1fr) minmax(360px, 430px) !important;
    gap: 14px !important;
    align-items: stretch !important;
    overflow: hidden !important;
}

body.exam-detail-active .paper-overview,
body.exam-detail-active .question-stage,
body.exam-detail-active .prop-aside {
    width: auto !important;
    height: 100% !important;
    min-width: 0 !important;
    background: transparent !important;
    animation: editor-panel-in 0.42s var(--editor-ease) both;
}

body.exam-detail-active .question-stage {
    animation-delay: 0.04s;
}

body.exam-detail-active .prop-aside {
    animation-delay: 0.08s;
}

body.exam-detail-active .paper-overview,
body.exam-detail-active .prop-aside {
    overflow: auto !important;
    scrollbar-gutter: stable;
}

body.exam-detail-active .overview-card,
body.exam-detail-active .canvas-container,
body.exam-detail-active .prop-aside > div,
body.exam-detail-active .editor-question-card,
body.exam-detail-active .prop-section,
body.exam-detail-active .option-item,
body.exam-detail-active .batch-import-workbench-dialog .batch-pane,
body.exam-detail-active .batch-import-workbench-dialog .preview-item,
body.exam-detail-active .ai-analysis-card {
    border: 1px solid rgba(210, 221, 232, 0.9) !important;
    border-radius: var(--editor-radius) !important;
    background: rgba(255, 255, 255, 0.94) !important;
    box-shadow: var(--editor-shadow-xs) !important;
    transition:
        transform 0.2s var(--editor-ease),
        border-color 0.2s ease,
        box-shadow 0.2s ease,
        background-color 0.2s ease !important;
}

body.exam-detail-active .overview-card:hover,
body.exam-detail-active .editor-question-card:hover,
body.exam-detail-active .prop-section:hover,
body.exam-detail-active .option-item:hover {
    border-color: #bdd0e5 !important;
    box-shadow: var(--editor-shadow-sm) !important;
}

body.exam-detail-active .overview-card {
    padding: 16px !important;
}

body.exam-detail-active .overview-card + .overview-card {
    margin-top: 12px !important;
}

body.exam-detail-active .overview-card-head span,
body.exam-detail-active .overview-card-title,
body.exam-detail-active .prop-section-title {
    color: var(--editor-text) !important;
    font-weight: 860 !important;
}

body.exam-detail-active .overview-card-head small,
body.exam-detail-active .stage-header p,
body.exam-detail-active .prop-subtitle,
body.exam-detail-active .prop-section-tip {
    color: var(--editor-text-muted) !important;
}

body.exam-detail-active .overview-stats,
body.exam-detail-active .type-count-grid,
body.exam-detail-active .inspector-summary {
    gap: 8px !important;
}

body.exam-detail-active .overview-stats div,
body.exam-detail-active .type-count-grid div,
body.exam-detail-active .inspector-summary div,
body.exam-detail-active .chart-kpis > div {
    border: 1px solid var(--editor-line) !important;
    border-radius: var(--editor-radius) !important;
    background: var(--editor-surface-soft) !important;
}

body.exam-detail-active .overview-stats strong,
body.exam-detail-active .type-count-grid strong,
body.exam-detail-active .inspector-summary strong {
    color: var(--editor-text) !important;
    font-weight: 900 !important;
}

body.exam-detail-active .question-map {
    gap: 7px !important;
}

body.exam-detail-active .question-map-item {
    width: 34px !important;
    height: 34px !important;
    border-radius: var(--editor-radius) !important;
    border-color: var(--editor-line) !important;
    background: #ffffff !important;
    color: var(--editor-text-soft) !important;
    font-weight: 850 !important;
}

body.exam-detail-active .question-map-item:hover {
    border-color: var(--editor-primary) !important;
    color: var(--editor-primary) !important;
    transform: translateY(-1px);
}

body.exam-detail-active .question-map-item.active {
    border-color: var(--editor-primary) !important;
    background: var(--editor-primary) !important;
    color: #ffffff !important;
    box-shadow: 0 8px 18px rgba(37, 99, 235, 0.2) !important;
}

body.exam-detail-active .question-map-item.done:not(.invalid):not(.active) {
    border-color: #b8e2d2 !important;
    background: var(--editor-green-soft) !important;
    color: var(--editor-green) !important;
}

body.exam-detail-active .question-map-item.invalid:not(.active) {
    border-color: #f0c3b8 !important;
    background: var(--editor-danger-soft) !important;
    color: var(--editor-danger) !important;
}

body.exam-detail-active .question-stage {
    display: grid !important;
    grid-template-rows: auto minmax(0, 1fr) !important;
    padding: 0 !important;
    overflow: hidden !important;
}

body.exam-detail-active .stage-header {
    min-height: 88px !important;
    margin-bottom: 12px !important;
    padding: 16px 18px !important;
    border: 1px solid rgba(210, 221, 232, 0.9) !important;
    border-radius: var(--editor-radius) !important;
    background: rgba(255, 255, 255, 0.94) !important;
    box-shadow: var(--editor-shadow-xs) !important;
}

body.exam-detail-active .canvas-container {
    height: auto !important;
    min-height: 0 !important;
    padding: 14px !important;
    overflow: auto !important;
    scroll-behavior: smooth;
}

body.exam-detail-active .editor-question-card {
    padding: 16px !important;
    margin-bottom: 12px !important;
}

body.exam-detail-active .editor-question-card.active {
    border-color: rgba(37, 99, 235, 0.64) !important;
    background: linear-gradient(180deg, #ffffff 0%, #f7faff 100%) !important;
    box-shadow: 0 12px 30px rgba(37, 99, 235, 0.13) !important;
}

body.exam-detail-active .editor-question-card.invalid:not(.active) {
    border-color: #efc3bb !important;
    background: #fff9f8 !important;
}

body.exam-detail-active .q-index,
body.exam-detail-active .prop-index-badge,
body.exam-detail-active .option-letter {
    border-radius: var(--editor-radius) !important;
}

body.exam-detail-active .q-index,
body.exam-detail-active .prop-index-badge {
    background: var(--editor-primary-soft) !important;
    color: var(--editor-primary) !important;
}

body.exam-detail-active .editor-question-card.active .q-index {
    background: var(--editor-primary) !important;
    color: #ffffff !important;
}

body.exam-detail-active .q-content {
    color: var(--editor-text) !important;
    font-size: 15px !important;
    line-height: 1.72 !important;
}

body.exam-detail-active .option-preview,
body.exam-detail-active .fill-answer-preview,
body.exam-detail-active .q-analysis-preview {
    border-color: var(--editor-line) !important;
    border-radius: var(--editor-radius) !important;
    background: var(--editor-surface-soft) !important;
}

body.exam-detail-active .option-preview.answer {
    border-color: #b8e2d2 !important;
    background: var(--editor-green-soft) !important;
}

body.exam-detail-active .prop-aside > div {
    min-height: 100% !important;
    padding: 16px !important;
}

body.exam-detail-active .prop-header {
    padding-bottom: 14px !important;
    border-bottom: 1px solid var(--editor-line) !important;
}

body.exam-detail-active .prop-title {
    color: var(--editor-text) !important;
    font-size: 22px !important;
    font-weight: 900 !important;
}

body.exam-detail-active .prop-section {
    padding: 14px !important;
}

body.exam-detail-active .type-radio-group {
    width: 100% !important;
    display: grid !important;
    grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
    gap: 6px !important;
}

body.exam-detail-active .type-radio-group .el-radio-button__inner {
    width: 100% !important;
    border: 1px solid var(--editor-line) !important;
    border-radius: var(--editor-radius) !important;
    background: #ffffff !important;
    color: var(--editor-text-soft) !important;
    font-weight: 820 !important;
    box-shadow: none !important;
}

body.exam-detail-active .type-radio-group .el-radio-button.is-active .el-radio-button__inner {
    border-color: var(--editor-primary) !important;
    background: var(--editor-primary) !important;
    color: #ffffff !important;
}

body.exam-detail-active .prop-panel .el-input__wrapper,
body.exam-detail-active .prop-panel .el-textarea__inner,
body.exam-detail-active .el-dialog .el-input__wrapper,
body.exam-detail-active .el-dialog .el-textarea__inner {
    border: 1px solid var(--editor-line) !important;
    border-radius: var(--editor-radius) !important;
    background: #ffffff !important;
    box-shadow: none !important;
    transition: border-color 0.18s ease, box-shadow 0.18s ease !important;
}

body.exam-detail-active .prop-panel .el-input__wrapper.is-focus,
body.exam-detail-active .prop-panel .el-textarea__inner:focus,
body.exam-detail-active .el-dialog .el-input__wrapper.is-focus,
body.exam-detail-active .el-dialog .el-textarea__inner:focus {
    border-color: rgba(37, 99, 235, 0.58) !important;
    box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.09) !important;
}

body.exam-detail-active .option-item {
    gap: 10px !important;
    padding: 12px !important;
    background: var(--editor-surface-soft) !important;
}

body.exam-detail-active .option-item.is-checked {
    border-color: #b8e2d2 !important;
    background: var(--editor-green-soft) !important;
}

body.exam-detail-active .add-option-btn,
body.exam-detail-active .mobile-ai-analysis-btn {
    width: 100% !important;
    border-radius: var(--editor-radius) !important;
}

body.exam-detail-active .empty-tip,
body.exam-detail-active .question-list-more {
    border-radius: var(--editor-radius) !important;
    color: var(--editor-text-muted) !important;
}

body.exam-detail-active .el-overlay {
    background-color: rgba(20, 28, 38, 0.38) !important;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
}

body.exam-detail-active .el-dialog,
body.exam-detail-active .el-message-box,
body.exam-detail-active .batch-import-workbench-dialog.el-dialog,
body.exam-detail-active .batch-import-workbench-dialog .el-dialog {
    border: 1px solid rgba(210, 221, 232, 0.92) !important;
    border-radius: var(--editor-radius) !important;
    background: #ffffff !important;
    box-shadow: var(--editor-shadow-md) !important;
    overflow: hidden !important;
}

body.exam-detail-active .el-dialog__header,
body.exam-detail-active .el-message-box__header,
body.exam-detail-active .batch-import-workbench-dialog .el-dialog__header {
    border-bottom: 1px solid var(--editor-line) !important;
    background: #fbfcfe !important;
}

body.exam-detail-active .el-dialog__footer,
body.exam-detail-active .el-message-box__btns,
body.exam-detail-active .batch-import-workbench-dialog .el-dialog__footer {
    border-top: 1px solid var(--editor-line) !important;
    background: #fbfcfe !important;
}

body.exam-detail-active .batch-import-workbench-dialog .batch-workbench {
    gap: 10px !important;
    padding: 10px !important;
    background: var(--editor-surface-soft) !important;
}

body.exam-detail-active .batch-import-workbench-dialog .batch-pane-head,
body.exam-detail-active .batch-import-workbench-dialog .batch-review-head {
    border-radius: var(--editor-radius) var(--editor-radius) 0 0 !important;
}

body.exam-detail-active .batch-import-workbench-dialog .batch-source-input .el-textarea__inner {
    border-radius: var(--editor-radius) !important;
}

body.exam-detail-active .batch-import-workbench-dialog .summary-metric,
body.exam-detail-active .batch-import-workbench-dialog .quality-metric,
body.exam-detail-active .batch-import-workbench-dialog .batch-quality-issues,
body.exam-detail-active .batch-import-workbench-dialog .preview-edit-panel {
    border-radius: var(--editor-radius) !important;
}

@media (max-width: 1380px) {
    body.exam-detail-active .topbar-main {
        grid-template-columns: minmax(220px, 1fr) auto !important;
    }

    body.exam-detail-active .editor-status-strip {
        justify-self: end !important;
    }

    body.exam-detail-active .topbar-actions {
        grid-column: 1 / -1;
        justify-self: stretch !important;
        justify-content: flex-end !important;
        padding-top: 6px !important;
    }

    body.exam-detail-active .exam-topbar {
        height: 112px !important;
        min-height: 112px !important;
    }

    body.exam-detail-active .editor-workbench {
        height: calc(100dvh - 112px) !important;
        grid-template-columns: 250px minmax(430px, 1fr) minmax(320px, 380px) !important;
    }
}

@media (max-width: 1120px) {
    body.exam-detail-active {
        overflow: auto !important;
    }

    body.exam-detail-active .exam-detail-page,
    body.exam-detail-active .exam-shell {
        min-height: 100dvh !important;
        height: auto !important;
    }

    body.exam-detail-active .exam-topbar {
        position: sticky !important;
        top: 0 !important;
        height: auto !important;
        min-height: 76px !important;
        padding: 10px 14px !important;
    }

    body.exam-detail-active .topbar-main {
        grid-template-columns: 1fr !important;
        gap: 10px !important;
    }

    body.exam-detail-active .paper-title-block h1 {
        max-width: none !important;
    }

    body.exam-detail-active .editor-status-strip,
    body.exam-detail-active .topbar-actions {
        justify-self: stretch !important;
        justify-content: flex-start !important;
        overflow-x: auto !important;
    }

    body.exam-detail-active .editor-workbench {
        height: auto !important;
        min-height: 0 !important;
        grid-template-columns: 1fr !important;
        padding: 12px !important;
        overflow: visible !important;
    }

    body.exam-detail-active .paper-overview,
    body.exam-detail-active .prop-aside {
        height: auto !important;
        max-height: none !important;
        overflow: visible !important;
    }

    body.exam-detail-active .question-stage {
        min-height: 70vh !important;
    }

    body.exam-detail-active .canvas-container {
        min-height: 56vh !important;
        max-height: none !important;
    }
}

@media (max-width: 720px) {
    body.exam-detail-active .desktop-toolbar {
        display: grid !important;
        grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
        width: 100% !important;
    }

    body.exam-detail-active .desktop-toolbar .el-button,
    body.exam-detail-active .import-question-btn,
    body.exam-detail-active .ai-batch-entry,
    body.exam-detail-active .save-exam-btn,
    body.exam-detail-active .edit-info-btn {
        width: 100% !important;
        margin: 0 !important;
    }

    body.exam-detail-active .topbar-actions {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 8px !important;
    }

    body.exam-detail-active .desktop-toolbar {
        grid-column: 1 / -1;
    }

    body.exam-detail-active .stage-header,
    body.exam-detail-active .prop-header,
    body.exam-detail-active .inspector-summary {
        grid-template-columns: 1fr !important;
    }

    body.exam-detail-active .type-radio-group {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }

    body.exam-detail-active .overview-card,
    body.exam-detail-active .stage-header,
    body.exam-detail-active .canvas-container,
    body.exam-detail-active .prop-aside > div,
    body.exam-detail-active .editor-question-card,
    body.exam-detail-active .prop-section {
        padding: 12px !important;
    }

    body.exam-detail-active .batch-import-workbench-dialog.el-dialog,
    body.exam-detail-active .batch-import-workbench-dialog .el-dialog {
        width: calc(100vw - 16px) !important;
        max-width: calc(100vw - 16px) !important;
        height: calc(100dvh - 16px) !important;
        max-height: calc(100dvh - 16px) !important;
        margin: 8px auto !important;
    }
}

@media (prefers-reduced-motion: reduce) {
    body.exam-detail-active * {
        animation: none !important;
        transition: none !important;
        scroll-behavior: auto !important;
    }
}
</style>
