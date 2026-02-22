# skills_claw Wave 2（Post‑MVP）实施计划

版本：v0.3  
日期：2026-02-21  
基线文档：`docs/plans/skills_claw.md`（v1.2）  

v0.3 修订摘要（采纳评审意见）
- 明确 `MarkdownSkill` 是 metadata adapter（只读：仅用于 prompt/tools/MCP/Flow/config 注入，不承诺“可执行 handler”）
- 明确 Mission Control 的 Tasks Board 数据层：新增 `skills_claw_jobs` 状态表；`event_logs` 仅做追加型审计
- 为企业 Git Registry 增加 Gate：P0（运行时闭环）+ P1（安全治理）验收通过后才启动
- Gene/Capsule 前置：冻结并版本化 `evolution.json` schema，避免与现有 evolver/stitcher 冲突

> 目的：在已完成 skills_claw MVP（Phase 0–5 的“能跑通”）基础上，按优先级把它推进到“可用、可控、可运营、可迁移”的生产级能力。

---

## 0. Wave 2 的定义（我们要把什么做“完整”）

Wave 2 的成功不是“多加接口/页面”，而是补齐 **运行时闭环** 与 **治理/运营**：

- 装上 Skill（安装/绑定）→ 运行时立刻生效（prompt/tools/MCP/权限）→ 产生可观测的效果与日志
- 外部来源可控（默认关闭、verified 策略、审计、可回滚）
- 生命周期可运营（更新检查、升级预览、定时刷新与通知）
- 前端可管理（详情/权限/绑定/升级/演化）
- 旧概念有迁移路径（Assistant Library / Community Hub / Flow / MCP 不“平行宇宙”）
- **进化可传承、可分发**：Skill 的使用/验证/演化要能沉淀为可复现资产，并能发布到企业自有 Git 仓库（GitHub/Gitee 私有源）让其他用户获取（不依赖公共平台）

---

## 1. 当前 MVP 状态（作为 Wave 2 起点）

已具备（代码已落地）：

- 工具抽象名 ↔ 运行时工具名 alias（`server/utils/permissions/toolAliases.js` + `toolGateway` alias-aware）
- skills_claw registry（本地 + 外部索引 + unified search）：`server/utils/plugins/skillsClaw/registry/*`
- 生命周期模块（creator/checker/upgrader/evolver/validator/installer）：`server/utils/plugins/skillsClaw/lifecycle/*`
- HTTP API：`server/endpoints/skillsClaw.js`（已注册到 `apiRouter`）
- scheduler：`server/utils/scheduler/index.js` 已注册 skills_claw discovery 任务
- DB：`skill_installations` 模型/迁移已添加（但 **运行时尚未消费**）
- 前端：已能浏览/搜索/安装/详情/创建（最小可用）
- Autobot：最小实现（search→recommend→可选 auto-install）

Wave 2 的重点：把“数据链路”与“权限链路”补齐，形成真正闭环。

---

## 2. 优先级总览（从最值钱/最依赖的开始）

按优先级（必须全部做完，但先后顺序如下）：

1. **P0 运行时闭环（最高优先级）**：`skill_installations` → Agent runtime 生效
2. **P1 安全治理与供应链策略**：外部来源分级、verified、审计、回滚
3. **P2 生命周期产品化（更新/升级/通知 + 企业分发）**：diff/回滚/版本锚点/定时任务/通知 + 私有 Git Registry 发布/拉取
4. **P3 前端管理体验补齐**：权限配置、绑定、升级、演化时间线、状态徽标
5. **P4 概念迁移与整合（中长期）**：Assistant Library / Community Hub / Flow / MCP 统一到 Skill

---

## 2.1 借鉴 EvoMap 的“进化资产化”，但保持企业私有闭环

我们不接入公共能力平台（选择太多、治理成本高），而是借鉴其“进化”思想，把 skills_claw 从“可安装的技能集合”推进到“可验证、可复现、可传承、可分发的能力资产库”：

- skills_claw = 企业内 **演化引擎 + 管理台**：搜索/安装/验证/演化/升级/回滚/审计/通知
- 企业自有 Git 仓库（GitHub/Gitee 私有仓库）= **云端分发载体**：集中存储与分发“已验证”的 Skill 资产（类似私有 registry）

为“传承”引入两个最小抽象（不改变 `skill.md` 的运行时地位，属于增量元数据）：

- **Gene（基因/策略模板）**：可复用的演化方法论（repair/optimize/innovate），包含触发信号、前置条件、约束、验证命令、回滚策略
- **Capsule（演化胶囊/结果包）**：一次演化的可复现结果与证据，包含变更摘要/补丁指纹、验证报告、环境指纹、置信度、影响面（blast radius）

> 关键原则：Skill 负责 How+What（运行时可用）；Gene/Capsule 提供 Why 的证据层（为什么可信、如何复现），并支持跨团队继承。我们不做 credits/GDI/共识等公共平台机制，只做企业内可控闭环。

---

## 2.2 借鉴 “Mission Control”（控制台化），让 skills_claw 变成可运营系统（补充：2026-02-21）

> 说明：OpenClaw 方案里建议用 Next.js + Convex 做一套独立 Mission Control。  
> 对我们而言，更合适的是 **把 Mission Control 的“产品形态”迁移进现有 skills_claw**（复用现有前后端与 DB），避免引入第二套技术栈与数据源分裂。

### 6 个模块在 skills_claw 的对应关系

| Mission Control 模块 | 对 skills_claw 的映射 | 我们当前已具备 | 建议补齐（可新增到后续 Wave） |
|---|---|---|---|
| Tasks Board（任务看板） | Skill 生命周期/运营任务看板（install/validate/upgrade/export/refresh/cycle） | 已有 lifecycle、scheduler、EventLogs、notifications（但“任务”不可视） | 引入 Job/Task 视图与状态流转；把关键操作落成“任务卡片”并可追踪 |
| Content Pipeline（内容流水线） | **Skill 资产流水线**：Idea → Draft → Validate → Evolve → Publish → Adopt | 已有 creator/evolver/validator/exporter/upgrader | 把流水线做成 UI + 自动化模板（每日/每周）与“推进规则” |
| Calendar（日历） | scheduler 审计面板：有哪些定时任务、何时跑、结果如何 | 已有 scheduler/通知（但无 UI） | 增加日历/列表视图 + “Run now” + 失败重试/冷却展示 |
| Memory（记忆库） | **skills_claw Memory**：evolution.json、Gene/Capsule、审计事件的统一检索与时间线 | 已有 evolution.json、`.evo`、EventLogs（但无统一浏览/搜索） | 做一个“可搜索资产库”（按 skill/workspace/assistant 过滤）+ 演化时间线 |
| Team（团队结构） | AI 员工（Assistant）× Skills 组合体管理与可视化 | 已有 Assistant Library/assistants + assistant-scope 绑定 | 增加“Team”页面：角色/职责/拥有技能/权限配置/最近任务 |
| Office（数字办公室） | 实时运营态势（谁在跑什么任务/哪些 pipeline 在执行） | 部分可用：日志/事件/执行器（但缺实时总览） | 可选：SSE/轮询的实时状态面板（先做简版，再做 avatar 氛围） |

### 建议：把它落成 “Wave 2.5 / Wave 3：skills_claw Mission Control”

优先顺序建议与博主一致：**Tasks Board + Calendar + Memory** 先做完，立刻把 skills_claw 从“功能集合”变成“可运营系统”。

**Task（建议）P5.1：Ops 任务模型（最小闭环）**
- 新增 `skills_claw_jobs`（独立于 `event_logs`；`event_logs` 仅做审计/追溯，不承担任务状态机）  
- 字段（最小建议）：`id`、`type`、`status(pending/running/done/failed/blocked)`、`skillId`、`workspaceId`、`scopeType/scopeId`、`startedAt`、`finishedAt`、`resultJson`、`error`
- 每次 install/upgrade/validate/export/refresh/cycle 都产出一个 Job，并将 `jobId` 写入对应的审计事件（event_logs）作为关联键
- UI：最小看板（todo/doing/blocked/done）+ 可按 workspace/assistant/skill 过滤
- 顺序：P5.1 可在 P3（前端管理）完成后立即启动，不依赖 P4（概念迁移）；P5.2–P5.5 依赖 P5.1 的数据闭环

**Task（建议）P5.2：Scheduler 日历/列表**
- 后端暴露“已注册任务 + 最近执行记录 + 下次执行时间（若可计算）”
- UI：Calendar/List + 失败红点 + 一键“立即执行”

**Task（建议）P5.3：skills_claw Memory（资产化检索）**
- 把以下内容统一成一个可搜索视图：`evolution.json`、`.evo/genes`、`.evo/capsules`、EventLogs
- UI：按 skill/workspace/assistant 分组 + 时间线（对齐 Wave2 P3 的“演化时间线”诉求）

**Task（建议）P5.4：Team（组织视图）**
- 展示 workspace 下所有 AI 员工及其 skills 绑定、权限配置、生效工具映射、最近 7 天任务/失败

**Task（建议）P5.5：Office（可选/氛围层）**
- 在 P5.1–P5.4 都稳定后，再做“avatar + 工位”呈现，避免过早做 UI 氛围而缺底层数据闭环

---

## 3. P0：运行时闭环（最优先）

### 目标
用户在 UI 里“安装/绑定”Skill 后，不需要再手动改模板或工具列表，**Agent 运行时立刻感知并生效**：

- 注入的 `functions[]` 与 system prompt 符合绑定的 Skill 集合
- 权限网关（toolGateway）按策略触发（默认 require_confirmation，且不会被 Skill 静默提升权限）

### 关键问题（现状缺口）
当前 Agent 注入路径主要依赖 `server/utils/skills/SkillRegistry`（代码内置 Skill 类），而 skills_claw 扫描的 `skill.md`（`LocalRegistry`）尚未进入该 registry/运行时解析链路；`skill_installations` 也尚未被 Agent 加载。

### 工作拆解（建议顺序）

**Task P0.1：统一 Skill Runtime 数据源（打通 skill.md → skillRegistry / runtime）**
- 建议方案（推荐）：新增 `MarkdownSkill` 适配器（extends `BaseSkill`），把 `LocalRegistry` 扫描到的 Skill（skill.md）实例化为可被 `skillRegistry.getSkill()` 消费的对象
- 接口边界：`MarkdownSkill` 是 **只读的 metadata adapter**，仅实现 `getToolBindings()/getSystemPrompt()/getMCPBindings()/getFlowTemplates()/getConfigSchema()` 供运行时注入使用；工具的实际执行仍由 toolGateway + 既有工具实现负责
- 同时扩展 `SkillRegistry` 支持“upsert/refresh”（避免重复注册/更新报错）
- 触发时机：启动时加载 + 安装/卸载后强制 refresh（或定时 refresh）

**Task P0.2：skill_installations → assistantConfig 合并**
- 在 Agent 启动/Invocation 构建时，从 DB 读取：
  - workspace scope：`(workspaceId, scopeType=workspace)`
  - assistant scope：`(workspaceId, scopeType=assistant, scopeId=assistantId)`
- 合并到 `assistantConfig.skills`（与模板 defaultTools 中的 builtin/custom skills 合并，去重）
- 期望行为：即使模板不包含该 Skill，只要安装/绑定到 workspace/assistant，就能生效

**Task P0.3：权限配置合并策略（最小权限，不允许 Skill 静默提权）**
- 明确“谁有权决定 autoApprovedTools / bypass”：只能由管理员/经理（或显式配置），Skill 本身只提供建议值
- 推荐规则：
  - Skill frontmatter 的 `permissionMode/autoApprovedTools` **不直接生效**（尤其外部 Skill），仅作为 UI 建议与校验依据
  - 运行时 permissionConfig 以 Workspace/Assistant 配置为准（现有逻辑保持），Skill 不扩大 allowlist
  - 如未来要做“按 Skill 限制 allowedTools”，必须同时覆盖 MCP/Flow/ImportedPlugins 的工具名单，否则会误拦截（需要设计后再做）

**Task P0.4：端到端回归用例**
- 覆盖：安装→绑定→对话调用工具→toolGateway 决策→卸载→不再注入
- 至少提供：单元测试 + 轻量集成测试（不要求 UI e2e，但要能用 API + node 脚本验证）

### 验收标准
- 新建一个 `custom:*` skill.md（tools 含 `http-request`），绑定到 workspace 后：
  - 运行时 functions[] 出现映射后的真实工具名（例如 `web-browsing` / `http-request` 的 runtime）
  - toolGateway 默认不为 `deny`，且按模式触发 `require_confirmation`

---

## 4. P1：安全治理与供应链策略

### 目标
外部 Skill 的引入、升级、执行具备“可控/可审计/可回滚”的最低安全基线。

### 工作拆解

**Task P1.1：来源分级与安装策略**
- `SKILLS_CLAW_EXTERNAL_DOWNLOADS_ENABLED`：
  - 未设置：所有外部 refresh/install/create/upgrade/cycle 直接 422
  - 设置但非 `allow_all`：仅允许 **verified** 的外部条目安装/升级
  - `allow_all`：允许任意 GitHub URL（高风险）

**Task P1.2：审计日志与可追溯性**
- 对 install/uninstall/upgrade/refresh-registry/cycle/evolve 写入事件日志（谁、何时、来源、hash）
- 对“拒绝”也要记录原因（例如未 verified、未开启开关）

**Task P1.3：回滚与失败保护**
- upgrade 失败：不破坏本地 skill.md/evolution.json
- install 失败：不产生半成品目录

### 验收标准
- 非 allow_all 下，未 verified 的外部 Skill 明确禁止安装（422 + 可读错误）
- 关键操作产生可检索的审计事件

---

## 5. P2：生命周期产品化（更新/升级/通知 + 企业分发）

### 目标
用户能可靠感知“有哪些更新”、能“预览变化并升级”、系统能“定期检查并提示”。

### 工作拆解

**Task P2.1：版本锚点与状态字段完整维护**
- `skill_catalog` 补齐/稳定写入：`sourceHash/latestVersion/lastCheckedAt/status`
- checker/upgrader 的结果写回 catalog（而不仅仅是返回给 API）

**Task P2.2：升级预览与变更摘要**
- upgrade 支持 `dryRun` 返回结构化 changes（frontmatter diff、正文 hash、风险提示）
- UI 展示 changes，允许确认后再 upgrade

**Task P2.3：scheduler + notifications**
- 定时：
  - refresh external registry（受门禁控制）
  - upsert skill_catalog
  - checker.checkAll 标出 outdated 并通知（复用 notifications 系统）

**Task P2.4：企业私有分发（Git Registry：发布/拉取/升级源）**
- Gate：仅在 **P0（运行时闭环）+ P1（安全治理）验收通过** 后启动（否则会在闭环未完成时引入额外外部源复杂度）
- 目标：把“已验证可复现”的 Skill 发布到企业自有 Git 仓库（GitHub/Gitee 私有源），供其他用户搜索、安装与升级
- 能力点（建议先做最小闭环，再迭代增强）：
  - **Registry Index**：仓库内维护 `registry.json`（或 `index.json`）清单（skillId、name、version、sourceHash、verified、updatedAt、path）
  - **Publish**：本地 skill 一键/CLI 导出为 PR（推荐）或直接推送（仅管理员）；默认只允许“通过 validator 且不涉及权限提权”的版本
  - **Fetch/Install/Upgrade**：skills_claw 可配置“企业 Registry 源”（白名单 + 凭据），加载 index 并加入 unified search；安装/升级时做内容校验（hash/签名可后置）并写入审计日志
- 与安全门禁关系：企业 Registry 源属于“受控外部来源”，默认只允许白名单源；仍遵守 verified / allow_all 策略，不开放任意 URL

**Task P2.5：进化资产化（Gene/Capsule 的最小落地）**
- 目标：把“演化过程与证据”沉淀为可继承资产，而不是散落在聊天记录/提交信息里
- 前置：冻结并版本化 `evolution.json` schema（必填/可选字段），确保 evolver/stitcher/validator/Capsule 生成器不会产生格式冲突
- 建议最小实现（先满足可追溯/可复现，避免过度设计）：
  - Gene/Capsule 作为 `evolution.json` 的增量结构（或 `.evo/genes/*.json`、`.evo/capsules/*.json`）与 skill 同目录保存
  - Capsule 至少包含：`asset_id`（sha256 content-addressed）、`gene_id`、`validation`（命令/测试摘要 + 可选完整报告路径）、`env_fingerprint`（node_version/platform/arch）、`blast_radius`、`createdAt/author`
  - validator 通过后生成 Capsule；upgrader/publisher 可选择“晋升 Capsule → 新版本 Skill”

### 验收标准
- `GET /api/skills-claw/check-updates` 能稳定标出 outdated
- UI 能看到“有更新”徽标，并能升级成功且不丢 evolution
- 完成一次“本地验证通过 → 发布到企业 Git Registry → 另一台/另一个 workspace 搜索并安装”的闭环

---

## 6. P3：前端管理体验补齐（从能用到好用）

### 目标
让“技能安装/权限/绑定/升级/演化”对非开发用户可理解、可操作、可恢复。

### 工作拆解

**Task P3.1：Skill 详情页补齐**
- 显示抽象工具名 → 运行时工具名映射
- 显示 permissionMode / allowedTools / autoApprovedTools（明确“建议值 vs 生效值”）
- 绑定到 AI 员工（assistant scope）选择器

**Task P3.2：My Skills 视图增强**
- workspace/assistant scope 分组
- 状态：installed/outdated/invalid/disabled
- 一键 validate / upgrade / uninstall

**Task P3.3：配置管理（configSchema）**
- 若 skill.md 提供 configSchema，则动态表单生成并写入 `skill_catalog.metadata.config`（或单独表）

### 验收标准
- 用户能完成：搜索→详情→安装到 workspace→绑定到 assistant→升级→卸载 的全流程

---

## 7. P4：概念迁移与整合（中长期，但要尽早铺路）

### 目标
逐步消除“多概念并列”，让 Skill 成为统一原子：

- Assistant Library：变成 Skill 组合体（AI 员工 = 一组 Skills）
- Community Hub：并入 skills_claw 的外部来源体系
- Flow：成为 Skill 的 flowTemplates（安装后可实例化）
- MCP：成为 Skill 的 mcpBindings（安装自动注册/卸载自动清理）

### 工作拆解（建议分迭代做）
- 先做“导入/映射层”（兼容旧入口），再做“主入口迁移”
- 提供迁移脚本与回滚策略（ID 映射、originPath 记录、重命名迁移）

### 验收标准
- 旧入口继续可用，新入口具备完整替代路径（并能渐进迁移）

---

## 8. 风险与缓解（Wave 2 特有）

- **数据源分裂（skills registry vs skill.md registry）**：P0.1 必须优先解决
- **权限误合并导致工具被误拦截/误放行**：P0.3 先定规则，Skill 不允许静默提权
- **升级破坏本地自定义演化**：升级流程必须保留 evolution 并可回滚
- **外部下载引入供应链风险**：默认关闭 + verified-only + 审计日志 + allow_all 明示
- **资产模型过度膨胀**：Gene/Capsule 先做“最小可追溯/可复现”，避免一次性上复杂评分/共识机制

---

## 9. 里程碑验收（建议的 Gate）

- Gate A（P0 完成）：安装/绑定 → 运行时生效（prompt/tools/权限链路闭环）
- Gate B（P1 完成）：外部引入可控（verified/allow_all/审计/回滚）
- Gate C（P2 完成）：更新/升级/通知可运营 + 企业私有分发闭环跑通
- Gate D（P3 完成）：前端管理体验完整
- Gate E（P4 启动）：迁移路径明确且可渐进推进
