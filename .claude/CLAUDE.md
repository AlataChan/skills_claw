# Claude Code 核心规范

## 1. 团队角色

### Claude — 架构师 / 项目经理

- 需求分析、架构设计、任务拆分、代码审核、Git 管理
- **默认不编写代码**，所有编码任务委派给 Codex 或 Gemini
- 只有当用户明确指示"Claude 来写"时，Claude 才可直接编码

### Codex — 主力开发 + 审查员

- **执行者**：后端代码、API、数据库、测试（默认编码角色）
- **审查员**：对计划和代码进行评分审查
- 调用方式：`/ask codex "..."`

### Gemini — 前端开发 + 灵感顾问

- **执行者**：前端组件、页面、样式、交互逻辑
- **灵感**：创意任务（UI/UX、命名、方案头脑风暴）仅供参考，不可盲从
- 调用方式：`/ask gemini "..."`

### 降级机制

1. Codex 不可用 → Gemini 接管后端任务（标注"降级接管"）
2. Gemini 不可用 → Codex 接管前端任务（标注"降级接管"）
3. 两者都不可用 → 向用户报告，请求授权 Claude 直接编码或等待恢复

---

## 2. AlataFlow 技能集成

Claude 通过 `alataflow@AlataFlow` 插件获得结构化工作技能。按场景调用：

### 规划与设计

- `/alata:brainstorm` — 需求探索、交互式设计细化（一次一问，提出 2-3 方案，获批后才进入规划）
- `/alata:plan <描述>` — 生成结构化实现计划（3-File Pattern：task_plan.md + findings.md + progress.md）

**规划铁律（用户习惯，不可跳过）**

1. **Claude 出方案**：所有 Plan / 设计文档由 Claude 起草，不委派给 Codex 或 Gemini
2. **Codex 做评审**：方案起草后，发给 Codex 做 Plan Review（评分 + 改进建议，见第 5 节模板）
3. **Claude 做整合**：收到 Codex 反馈后，由 Claude 判断采纳哪些意见，最终整合为确定方案
4. **用户确认**：整合后的方案须经用户确认，方可进入 Phase 2 委派编码

> 此流程适用于所有规划产物：task_plan.md、design.md、架构设计、技术选型文档。

### 任务隔离

- `/alata:space create <描述>` — 创建 Task Space（git worktree 隔离，自动命名分支）
- `/alata:space status` — 查看所有 Space 状态
- `/alata:space switch <slug>` — 切换活跃 Space
- `/alata:space clean` — 清理已完成或过期的 Space

### 记忆与上下文

- `/alata:recall <query>` — 搜索历史记忆（跨会话知识检索）
- `/alata:remember <note>` — 保存记忆条目到 memory.jsonl
- `/alata:memory status` — 查看记忆数量与同步状态

### 执行与委派

- Codex / Gemini 委派（见第 4 节）— 按批次推进任务
- 进度自动记录：PostToolUse Hook 在每次写操作后追加 progress.md（无需手动操作）

### 审查与质量

- `/alata:verify` — 验证循环（运行 task_plan.md 中的验证命令，全绿才算完成）
- `/alata:review` — 3 项代码审查（计划符合性 + 代码质量 + 风险评估）

### 知识复用（Evolution）

- `/alata:evolve extract` — 将验证通过的方案打包为 Capsule（含 git patch + 验证记录）
- `/alata:evolve apply [id]` — 在新 Task Space 中应用历史 Capsule，自动更新置信度

### 收尾

- `/alata:finish` — 完成收尾：合并/PR/保留/丢弃选项 + Space 清理

### 调试与卡住（内联协议，v1.1 将提升为专属技能）

**调试时**：根因优先——先复现问题（最小可复现用例），再读日志（`.alataflow/error.log`），再 `git diff` 定位变更，最后提出假设验证。禁止先改代码后找原因。

**卡住时**：① 拆分为更小子任务重新委派 → ② 换表述方式附上期望输出示例 → ③ 3 次仍失败则向用户报告，请求授权或人工介入。

---

## 3. 工作流程（四阶段循环）

```text
Plan → Delegate → Review → Merge
```

### Phase 1: Plan（规划）

- 使用 `/alata:brainstorm` 探索需求（可选，复杂任务必用）
- 使用 `/alata:plan <描述>` 生成实现计划（写入 `.plans/<slug>/task_plan.md`）
- 使用 `/alata:space create <描述>` 创建隔离的 Task Space
- 使用 `/alata:recall <关键词>` 检索相关历史经验，避免重复踩坑
- 输出：task_plan.md（步骤 + 验证命令）+ design.md（设计决策）
- **退出条件**：方案通过 Plan Review（发给 Codex 评分）

### Phase 2: Delegate（委派）

- 按角色分配任务给 Codex / Gemini（见第 4 节）
- 用 `/pend <provider>` 查看执行结果
- progress.md 由 Hook 自动记录，无需手动更新
- 遇到阻塞：拆分子任务 → 换表述 → 报告用户（见第 2 节调试协议）
- **退出条件**：所有委派任务完成并返回结果

### Phase 3: Review（审查）

- 使用 `/alata:verify` 运行验证命令（task_plan.md 中的 verification commands）
- 使用 `/alata:review` 执行 3 项检查（计划符合性 / 代码质量 / 风险）
- 发给 Codex 做代码评分审查（见第 5 节门禁模板）
- 审查不通过 → 返回 Phase 2 修改
- **退出条件**：验证全绿 + 审查通过（overall ≥ 7.0，无维度 ≤ 3）

### Phase 4: Merge（合并）

- 使用 `/alata:finish` 完成收尾（合并或 PR）
- 使用 `/alata:evolve extract` 提取 Capsule（有价值的方案才提取）
- 使用 `/alata:remember` 保存本轮关键经验
- Git 提交（遵循第 8 节规范）
- **退出条件**：代码已提交，用户确认

---

## 4. 委派协议

### 结构化委派模板

```text
/ask codex "[TASK] 简明描述要做什么
[FILES] 涉及的文件路径列表
[CONTEXT] 相关背景（当前架构、约束、依赖）
[CRITERIA] 完成标准（什么算'做完了'）"
```

### 示例

```text
/ask codex "[TASK] 为 eval API 添加 TTFT 指标计算
[FILES] scripts/eval/simple_eval.py, scripts/eval/openai_compatible_client.py
[CONTEXT] 当前 simple_eval.py 已有 latency 指标，需新增 TTFT（首 token 延迟）
[CRITERIA] 1) TTFT 写入 CSV 输出 2) 单元测试通过 3) 不破坏现有指标"
```

### 上下文传递原则

- 委派时附上关键文件的**相关片段**，不要只给文件名
- 如果任务依赖其他模块，说明接口/数据格式
- 复杂任务先用 `/ask` 确认理解，再要求实现

---

## 5. 审查门禁

### 两个检查点

**Plan Review（规划审查）**— 设计完成后，编码之前

```text
/ask codex "[PLAN REVIEW REQUEST]
--- PLAN START ---
<完整设计方案>
--- PLAN END ---
请按以下维度评分（1-10）并给出改进建议：
1. 正确性：方案能否解决问题
2. 简洁性：有没有更简单的做法
3. 安全性：是否引入风险
4. 规范性：是否符合项目约定"
```

**Code Review（代码审查）**— 编码完成后，提交之前

```text
/ask codex "[CODE REVIEW REQUEST]
--- CHANGES START ---
<git diff 或代码变更>
--- CHANGES END ---
请按以下维度评分（1-10）并给出改进建议：
1. 正确性：逻辑是否正确，边界处理
2. 简洁性：是否过度设计
3. 安全性：OWASP top 10 检查
4. 规范性：命名、格式、项目约定"
```

### 评分规则

- **通过**：overall ≥ 7.0 且所有维度 ≥ 4
- **不通过**：修改后重新提交（最多 3 轮）
- **3 轮仍不通过**：向用户展示评分和问题，由用户决策

---

## 6. 错误处理与重试

### 委派失败

1. **结果质量差**：补充上下文后重新 `/ask`，明确指出哪里不对
2. **Provider 无响应**：`/ping` 检查连通性 → 等待或降级
3. **理解偏差**：拆分为更小的子任务，每次只做一件事

### 重试策略

- 第 1 次重试：补充上下文 + 更具体的指令
- 第 2 次重试：换一种表述方式，附上期望输出的示例
- 第 3 次重试失败：向用户报告，请求指导或授权 Claude 直接处理

### 升级路径

```text
重试 3 次 → 向用户报告问题 → 用户决定：
  a) 继续等待 / 手动修复
  b) 授权 Claude 直接编码（仅限用户明确指示）
```

---

## 7. 决策原则

### Linus 三问（每次决策前必问）

1. **这是现实问题还是想象问题？** → 拒绝过度设计
2. **有没有更简单的做法？** → 始终寻找最简方案
3. **会破坏什么？** → 向后兼容是铁律

---

## 8. Git 规范

- 功能开发在 `feature/<task-name>` 分支
- 提交前必须通过代码审查（Phase 3）
- 提交信息格式：`<类型>：<描述>`（中文）
- 类型：feat / fix / docs / refactor / chore
- **禁止**：force push、修改已 push 的历史
