# 单人研讨间周期自动预约实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为校园服务增加可编辑的周期自动预约任务，按候选空间/时段顺序自动提交单人研讨间预约。

**Architecture:** 使用 `auto_reservation_tasks` 持久化每个用户的任务配置和最近一次执行结果。后台复用现有 `libroomClient`、学校会话和服务内定时器，在任务匹配当天/时间后以用户上下文执行，每次候选成功即停止，冲突继续尝试。前端在现有预约区增加任务列表与编辑表单。

**Tech Stack:** Node.js ESM, MongoDB/MemoryCampusRepository, vanilla browser JavaScript, Node test runner。

---

### Task 1: 自动预约领域模型与仓储

**Files:**
- Create: `services/campus-service/src/lib/libroom-auto-reservation.js`
- Modify: `services/campus-service/src/storage/campus-repository.js`
- Test: `services/campus-service/test/libroom-auto-reservation.test.js`

- [ ] 写失败测试：校验每天/星期规则、日期范围、执行时间、候选列表；按顺序尝试并仅在冲突时继续。
- [ ] 运行定向测试确认因导出缺失而失败。
- [ ] 实现纯函数校验、当天匹配、候选执行器和公开数据映射。
- [ ] 为 Mongo/Memory 仓储增加任务集合、索引、按用户查询、创建、更新、删除和执行结果更新。
- [ ] 运行定向测试确认通过。

### Task 2: 服务端 API 与后台调度

**Files:**
- Modify: `services/campus-service/server.js`
- Test: `services/campus-service/test/libroom-auto-reservation.test.js`

- [ ] 写 API 归一化和调度候选调用的失败测试。
- [ ] 增加 GET/POST/PUT/DELETE 任务接口，所有任务限制在当前用户。
- [ ] 增加后台扫描器，按 Asia/Shanghai 当前日期、星期和执行时间选择到期任务，使用 `userContextStorage` 和现有 `libroomClient` 执行。
- [ ] 成功、冲突、公共错误分别写入执行结果；同一任务同一天只执行一次。
- [ ] 将调度器加入启动和关闭流程，并运行服务端语法及定向测试。

### Task 3: 预约页面任务管理

**Files:**
- Modify: `services/campus-service/public/libroom-page.js`
- Modify: `services/campus-service/public/libroom-page.css`

- [ ] 写前端静态检查断言，确认任务 API、候选编辑控件和启停/删除操作存在。
- [ ] 增加任务列表、创建/编辑表单、候选顺序增删上移下移、启用停用和删除交互。
- [ ] 保留现有单次预约流程，并在成功保存后刷新任务列表。
- [ ] 运行前端 `node --check` 和校园服务定向测试。

### Task 4: 最终验证

**Files:**
- Modify: `services/campus-service/package.json` only if a focused test script is needed

- [ ] 运行 `node --check` 覆盖新增/修改 JavaScript。
- [ ] 运行 `npm --prefix services/campus-service test -- --test-name-pattern='libroom|auto reservation'`。
- [ ] 检查 `git diff` 仅包含本功能文件，报告未做真实学校预约提交验证的剩余风险。
