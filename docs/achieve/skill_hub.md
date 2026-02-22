skills_claw 实施方案
Alata Studio Lite — Skill-Centric Architecture Transformation 版本: v1.2 | 日期: 2026-02-21

v1.2 修订摘要（采纳评审意见）
- 明确 Phase 0 DB Migration 是 Phase 3 install/bind 端点硬依赖（Gate）
- 明确 evolution 缝合边界：`<!-- SKILL_EVOLUTION_START -->...<!-- SKILL_EVOLUTION_END -->` 区块以 `evolution.json` 为准，`skill.md` 其他正文不被覆盖
- 细化 Phase 4 交付顺序：先 Discover + Install + 基础管理，再 Detail + Create + Autobot（降低前端估工风险）
- Mission Control 的 Tasks Board 明确依赖 `skills_claw_jobs` 状态表；`event_logs` 仅做审计关联

v1.1 修订摘要（已逐条与代码核实）
- 修正 `#attachPlugins()` 位置与接入点：Agent 插件装载在 `server/utils/agents/index.js`；API 端点注册到 `apiRouter`
- 修正 Phase 0 验收：`generate-excel-report` 属于 OUTPUT_TOOLS（永远注入），不能用它验证 Skill→Tool 展开
- 冻结 Skill 工具命名规范：Skill 声明层使用 toolGateway 抽象名；运行时通过 `toolAliasMap` 映射到 AIbitat 实际工具名
- 复用现有 `server/utils/plugins`（MarkdownParser / PluginScanner / skill.md 规范）作为 skills_claw 基础，避免重复建设
- DB 复用并扩展 `skill_catalog`（不新建 `skills_claw_items`），并修复 SQLite `NULL` 唯一约束陷阱
- 定时任务统一接入 `server/utils/scheduler`，并补齐“外部下载”安全门禁（对齐 Community Hub 策略）

一、项目愿景
将 Alata Studio 从"多概念并列"的 AI 工作台，转型为以 Skill 为统一原子单元的 AI 能力平台。

概念统一映射：

现有概念	在 Skill-Centric 架构中的角色
Skills (builtin:*)	skills_claw 的内置内容
Assistant Library	Skill 组合体的展示层（AI 员工 = 一组 Skills 的集合）
Agent Flow	Skill 的 flowTemplates 属性
Community Hub	合并入 skills_claw 的"社区"来源
Tools	降为内部实现层，通过 Skill 的 toolBindings 间接使用
MCP	降为内部实现层，通过 Skill 的 mcpBindings 间接使用
二、总体架构
┌─────────────────────────────────────────────────────────────────┐
│                     SKILLS_CLAW (前端)                          │
│                                                                 │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌─────────────┐  │
│  │ Discover  │  │  My Hub   │  │  Create   │  │  Autobot    │  │
│  │ 发现/搜索  │  │ 已安装管理 │  │ 创建/导入  │  │ AI 自动化   │  │
│  └───────────┘  └───────────┘  └───────────┘  └─────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────────────┐
│     SKILLS_CLAW SERVICES (后端, 基于 plugins/skill.md 体系)       │
│                                                                 │
│  复用基础: server/utils/plugins/                                │
│  ├── MarkdownParser.js      ← YAML frontmatter + Markdown body  │
│  ├── PluginScanner.js       ← 本地 Skill 扫描（builtin + custom） │
│  ├── PluginImporter.js      ← (可选) 导入 DB: assistant_templates │
│  └── constants.js/types.js  ← skill.md 规范与默认值              │
│                                                                 │
│  新增增量: server/utils/plugins/skillsClaw/                      │
│  ├── toolAliasMap.js        ← 抽象工具名 → 运行时工具名           │
│  ├── registry/              ← 本地 + 外部发现                    │
│  │   ├── localRegistry.js   (wrap PluginScanner)                 │
│  │   ├── externalRegistry.js                                    │
│  │   └── unifiedSearch.js                                       │
│  ├── lifecycle/             ← GitHub 创建/检查/升级/安装/校验    │
│  │   ├── creator.js                                             │
│  │   ├── checker.js                                             │
│  │   ├── upgrader.js                                            │
│  │   ├── validator.js                                           │
│  │   └── installer.js                                           │
│  └── autobot/               ← Skill Autobot                      │
│      ├── autobotAgent.js                                        │
│      └── autobotTools.js                                        │
│                                                                 │
│  server/endpoints/skillsClaw.js      ← API 端点（注册到 apiRouter）│
│  server/models/skillCatalog.js       ← 数据模型（扩展）           │
│  server/utils/scheduler/index.js     ← 定时任务注册（扩展）       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────────────┐
│               EXISTING SKILL SYSTEM (现有基础)                   │
│                                                                 │
│  server/utils/skills/                                           │
│  ├── BaseSkill.js        (保留, 增强)                            │
│  ├── SkillRegistry.js    (保留, 扩展接口)                        │
│  ├── constants.js        (保留, 增加新常量)                      │
│  ├── types.js            (保留, 增加新类型)                      │
│  └── builtin/            (9 个内置 Skill, 保留)                 │
└─────────────────────────────────────────────────────────────────┘
三、分 Phase 实施计划
Phase 0: Foundation（基础对齐 + 安全门禁）
目标： 先把“命名空间/接入点/安全策略/数据模型”钉死，让后续 skills_claw 不踩坑、不重复造轮子。

预计工期： 5-7 天

Task 0.0: 冻结 Skill↔Tool 命名规范 + toolAliasMap（必须先做）
现状：存在三套 toolName 命名空间（必须统一，否则 Skill→Tool 展开跑不通）：
1) `BaseSkill.getToolBindings()`：如 `file-read` / `file-write` / `shell-execute`
2) AIbitat 实际工具名：如 `read-document-file` / `web-browsing` / `generate-excel-report`
3) toolGateway 抽象名：如 `read-file` / `write-file` / `execute-code` / `http-request` / ...

目标：
- Skill 声明层统一采用 toolGateway 抽象名（skill.md 的 `tools:` 字段，以及 BaseSkill 的 `toolBindings[].toolName`）
- 运行时加载层保留 AIbitat 实际工具名
- 引入 `toolAliasMap`：抽象名 → 运行时工具名（可一对多），并补齐 toolGateway 对运行时工具名的风险级别映射（否则会全部回退到 external）

建议初始映射（示例，最终以代码实现为准）：
- `read-file` → `read-document-file`
- `http-request` → `web-browsing`（或 `web-scraping`，按能力边界选择）
- `execute-code` / `shell-command` → 默认不映射（需要管理员显式开启）

改动文件（计划）：
- 新增：`server/utils/permissions/toolAliases.js`（推荐作为全局单一来源）或 `server/utils/plugins/skillsClaw/toolAliasMap.js`
- 修改：`server/utils/permissions/toolGateway.js`（支持 alias 或补齐运行时工具名风险映射）
- 修改：`server/utils/skills/builtin/*Skill.js`（将现有 `file-read/file-write/...` 迁移到抽象名）

验收标准：
- 新建一个本地 `skill.md` 声明 `tools: ["http-request"]` 后，绑定到 AI 员工/Workspace：
  - 最终注入的 functions[] 包含映射后的运行时工具名（如 `web-browsing`）
  - 工具调用经 toolGateway 评估不应为 `deny`（默认应为 `require_confirmation`）

Task 0.1: Skill→Tool 展开接入（Agent pipeline）
现状：`server/utils/agents/defaults.js` 的 `expandToolsFromSkills()` 仅验证 Skill ID，并把 `builtin:`/`custom:` 的 skillId 塞进 functions[]，最终在 `#attachPlugins()` 中被跳过；且会污染“可调用工具列表”（LLM 可能尝试调用不存在的 function）。

目标：
- Skills 仅用于 System Prompt 注入（专业指导）
- 工具注入必须来自 Skill 声明的 tools/toolBindings，经 `toolAliasMap` 映射后注入实际工具名

改动文件（计划）：
- 修改：`server/utils/agents/defaults.js`
  - 新增/重写：`expandToolPluginsFromSkills(skillIds) → string[]`（返回可加载的 AgentPlugins 名称）
  - functions[] 中不再包含 `builtin:`/`custom:` skillId（避免 LLM 调用不存在的 function）
- 修改：`server/utils/agents/index.js`
  - 保持 `#attachPlugins()` 对 skillId 的跳过逻辑，但更新注释：Skill→Tool 展开在 defaults.js 完成（attach 只负责装载“真实工具名”）

验收标准：
- 绑定一个包含非 OUTPUT_TOOLS 的 Skill（例如仅声明 `["http-request"]`）后：
  - 对应映射工具出现在 functions[] 中并可被装载
  - 工具调用触发权限网关流程（默认 `require_confirmation`），而非被当作“无效工具”跳过

Task 0.2: 统一 Skill 格式（以 `skill.md` 为权威格式）
目标：skills_claw 的“可发现/可安装/可升级”技能，统一以 `skill.md`（YAML frontmatter + Markdown body）作为 Source of Truth；DB 仅做索引与状态缓存。

复用（已存在）：`server/utils/plugins/MarkdownParser.js` / `PluginScanner.js`（已支持 `tools/permissionMode/allowedTools/autoApprovedTools/resourceScopes/...`）

需要扩展的 frontmatter 字段（skills_claw 增量，按需实现）：
- `sourceType`: builtin | local | github | community
- `sourceUrl` / `sourceHash` / `license` / `verified`
- `latestVersion` / `lastCheckedAt`

改动文件（计划）：
- 修改：`server/utils/plugins/MarkdownParser.js`（扩展 `parseMarkdownPlugin()` 的 metadata 输出；或 skillsClaw 层直接使用 `parseFrontmatter()` 读取完整字段）
- 修改：`server/utils/plugins/constants.js`（必要时补默认值）

验收标准：
- skill.md 中新增字段能被解析并在 API 返回中可见；不破坏现有插件扫描逻辑

Task 0.3: 数据库 Schema（复用并扩展 `skill_catalog`，避免重复造表）
现状：已存在 `skill_catalog(skillId + source unique, metadataJson, enabled)`，且已有 Model 封装 `server/models/skillCatalog.js`。

目标：
- `skill_catalog` 承载 skills_claw 的索引/状态/版本信息（不新建 `skills_claw_items`）
- 安装/绑定关系单独建模，并修复 SQLite `NULL` 唯一约束陷阱

新增 Prisma Migration（示意，字段可按 MVP 缩减）：
- 扩展 `skill_catalog`：增加 `name/description/version/category/tags/icon/sourceUrl/sourceHash/license/status/lastCheckedAt/latestVersion/统计字段`
- 新增 `skill_installations`（推荐独立表）：
  - 增加 scope 字段避免 `assistantId = NULL` 的唯一约束陷阱：
    - `scopeType`: "workspace" | "assistant"
    - `scopeId`: "__workspace__" 或 assistantId
    - `@@unique([skillId, workspaceId, scopeType, scopeId])`

硬依赖（Gate）：
- Phase 3 的 install / 已安装列表 / 绑定关系写入依赖 `skill_installations` 表与对应 Model；进入 Phase 3 前必须完成 migration 并在部署环境执行
- 若迁移未执行：端点应 fail-fast 返回明确错误（避免隐式崩溃/脏写）

验收标准：
- Workspace 级安装对同一 (skillId, workspaceId) 只能存在一条记录（不受 NULL 影响）

Task 0.4: 外部下载安全门禁（对齐 Community Hub）
新增环境变量：
- `SKILLS_CLAW_EXTERNAL_DOWNLOADS_ENABLED`（默认关闭）
- `SKILLS_CLAW_EXTERNAL_DOWNLOADS_ENABLED=allow_all`（管理员显式放开）

策略：
- 默认仅允许 `KNOWN_REGISTRIES`（白名单 registry）+ verified 项
- 自定义 GitHub URL 仅在 allow_all 或管理员显式允许时开放
- 外部安装的 Skill 默认 `permissionMode=default`，`autoApprovedTools` 初始为空（必须人工开启）

验收标准：
- 未开启开关时，外部安装接口返回 422 并给出明确错误信息
- 未 verified 的外部 Skill 在非 allow_all 下禁止安装
Phase 1: Discovery（发现引擎，基于 plugins/skill.md）
目标：复用本地 skill.md 扫描能力，并新增外部 registry 索引，提供统一搜索/推荐能力。

预计工期： 3-4 天

Task 1.1: server/utils/plugins/skillsClaw/registry/localRegistry.js
复用 `server/utils/plugins/PluginScanner.js` / `MarkdownParser.js` 扫描本地 `skill.md`（builtin + custom），并输出 skills_claw 统一数据结构。

关键点：
- Skill 的稳定 ID 不使用 `md-<hash>-<contentHash>`（内容变更会导致 ID 变），而是使用“目录名 + 来源前缀”生成：
  - builtin: `builtin:<dir>`
  - local/custom: `local:<dir>`（若需要与现有 Agent Skill 前缀对齐，可统一为 `custom:<dir>`）
- 原始解析与权限字段复用 `MarkdownParser.parseFrontmatter()` 或 `parseMarkdownPlugin()` 的结果（`tools/permissionMode/allowedTools/autoApprovedTools/resourceScopes/...`）

扫描路径（建议与 `server/utils/plugins/constants.js` 的存储策略对齐）：
- Builtin Skills: `server/resources/plugins/skills/**/skill.md`
- Custom Skills (dev): `server/storage/plugins/custom/skills/**/skill.md`
- Custom Skills (prod): `$STORAGE_DIR/plugins/custom/skills/**/skill.md`

核心 API（示意）：

javascript
class LocalRegistry {
  async scan({ forceRefresh } = {}) → LocalSkill[]
  search(query, { topN } = {}) → LocalSkill[]
  get(skillId) → LocalSkill | null
}

Task 1.2: server/utils/plugins/skillsClaw/registry/externalRegistry.js
外部 registry 索引（GitHub / 社区清单）。必须受 Task 0.4 安全门禁控制。

核心 API（示意）：

javascript
class ExternalRegistry {
  static KNOWN_REGISTRIES = [ ... ];
  async loadIndex({ forceRefresh } = {}) → number
  async search(query, { topN = 10, threshold = 0.1 } = {}) → RemoteSkill[]
  async get(skillIdOrName) → RemoteSkill | null
  async listSkills({ source, category } = {}) → RemoteSkill[]
  async refresh() → number
  addRegistry({ name, owner, repo, branch, priority }) → void
}

技术要点：
- 缓存目录建议统一走 `$STORAGE_DIR/skills-claw/cache/`（dev 可回退到 `server/storage/`）
- bundled index 作为离线兜底（避免 GitHub API rate limit）
- 仅在 `SKILLS_CLAW_EXTERNAL_DOWNLOADS_ENABLED` 打开后允许刷新/安装

Task 1.3: server/utils/plugins/skillsClaw/registry/unifiedSearch.js
统一搜索 + 智能推荐，整合 Local + External（本地优先）。

核心 API（示意）：

javascript
class UnifiedSkillSearch {
  async search(query, { topN, localOnly, externalOnly } = {})
    → { query, local: [], external: [] }
  async recommend(query)
    → { recommended, skill, confidence, installed, alternatives }
  async get(skillIdOrName) → SkillInfo | null
  listSources() → { localPaths, externalRegistries }
  async refreshExternal() → number
}

Task 1.4: server/utils/plugins/skillsClaw/registry/index.js
导出统一入口 + 单例初始化：

javascript
const localRegistry = new LocalRegistry();
const externalRegistry = new ExternalRegistry();
const unifiedSearch = new UnifiedSkillSearch({ localRegistry, externalRegistry });
module.exports = { localRegistry, externalRegistry, unifiedSearch };
Phase 2: Lifecycle（生命周期管理）
目标：在 `skill.md` 为权威来源的前提下，提供创建/检查更新/升级/安装/校验/经验沉淀的闭环能力，并与 DB 索引（`skill_catalog` / `skill_installations`）一致。

预计工期： 4-5 天

Task 2.1: server/utils/plugins/skillsClaw/format/evolutionMerger.js
经验沉淀的 JSON merge 逻辑。

- 约束（MVP）：仅管理 `evolution.json`（version + entries[]），保证幂等去重（同 id 或同 title+content 视为重复）
- 不直接修改 `skill.md`（避免“经验沉淀”隐式覆盖用户手写正文）

javascript
/**
 * 合并新的经验条目到 evolution.json
 * @param {Object} existingEvolution - 现有 evolution.json 内容
 * @param {Object} newEntry - 新经验条目
 * @returns {Object} 合并后的 evolution.json
 */
function mergeEvolution(existingEvolution, newEntry) { ... }

Task 2.2: server/utils/plugins/skillsClaw/format/skillMdStitcher.js
将 evolution.json 中的经验缝合回 `skill.md`（注意：仓库规范使用 `skill.md` 而非 `SKILL.md`）。

- 缝合边界（MVP）：仅覆盖 marker 区块 `<!-- SKILL_EVOLUTION_START -->...<!-- SKILL_EVOLUTION_END -->`
- 冲突策略：若 skill.md 内该区块被手改或与 `evolution.json` 不一致，以 `evolution.json` 渲染结果覆盖该区块（可重复执行且结果稳定）
- `skill.md` 其他正文不被自动改写（避免升级/演化覆盖用户内容）

javascript
/**
 * 将 evolution 数据缝合回 skill.md 内容
 * @param {string} originalSkillMd - 原始 skill.md 内容
 * @param {Object} evolution - evolution.json 数据
 * @returns {string} 更新后的 skill.md
 */
function stitchEvolution(originalSkillMd, evolution) { ... }

Task 2.3: server/utils/plugins/skillsClaw/lifecycle/creator.js
从 GitHub URL 创建 Skill（对应 github-to-skills）。必须受 Task 0.4 外部下载安全门禁控制。

javascript
class SkillCreator {
  /**
   * 从 GitHub URL 拉取信息并生成 skill.md + 目录结构
   * @param {string} githubUrl
   * @param {Object} options
   * @param {string} [options.outputDir] - 输出目录（默认 custom skills 目录）
   * @param {boolean} [options.overwrite] - 是否覆盖
   * @param {number} [options.readmeMaxChars] - README 最大字符数
   * @returns {{ skillId, skillDir, skillMdPath }}
   */
  async createFromGitHub(githubUrl, options = {}) { ... }
}

技术要点：
- 用 GitHub REST API 获取 repo 信息、README、tree（注意 rate limit；优先 index/缓存）
- 解析 README 生成 skill.md 的 description 和使用说明
- 生成标准目录结构：`{skillSlug}/skill.md`、`{skillSlug}/scripts/`、`{skillSlug}/evolution.json`
- 记录版本锚点：优先写入 `skill_catalog.sourceHash`（或写 `github_hash` 文件作为冗余）

Task 2.4: server/utils/plugins/skillsClaw/lifecycle/checker.js
检查已安装 Skill 的版本更新（对应 skill-manager/scan_and_check）。

javascript
class SkillChecker {
  /**
   * 检查单个 Skill 是否有更新（仅 GitHub 来源）
   * @param {string} skillId
   * @returns {{ skillId, status: 'current'|'outdated'|'error', currentHash, remoteHash }}
   */
  async check(skillId) { ... }

  /**
   * 批量检查所有已安装的 GitHub 来源 Skill
   * @returns {CheckResult[]}
   */
  async checkAll() { ... }
}

Task 2.5: server/utils/plugins/skillsClaw/lifecycle/upgrader.js
升级单个 Skill（对应 skill-upgrader）。

javascript
class SkillUpgrader {
  /**
   * 升级 Skill 到最新版本
   * @param {string} skillId
   * @param {Object} options
   * @param {boolean} [options.dryRun] - 是否只预览
   * @returns {{ upgraded, oldHash, newHash, changes }}
   */
  async upgrade(skillId, options = {}) { ... }
}
逻辑：拉取远程最新 `skill.md` → 保留本地 `evolution.json` → 更新 `sourceHash` → 重新 stitch

Task 2.6: server/utils/plugins/skillsClaw/lifecycle/evolver.js
经验沉淀（对应 skill-evolution-manager）。

javascript
class SkillEvolver {
  async addEvolutionEntry(skillId, entry) { ... }
  async alignAll() { ... }
}

Task 2.7: server/utils/plugins/skillsClaw/lifecycle/validator.js
校验 Skill 完整性（对应 skill-validator）。

javascript
class SkillValidator {
  async validate(skillId) { ... }
  async validateAll() { ... }
}

校验项（MVP）：
- frontmatter 是否完整（`name/description` 必填；`tools` 必须为 toolGateway 抽象名集合）
- `toolAliasMap` 是否能为 tools 提供映射（否则提示“无法在运行时装载”）
- permission defaults 格式是否合法（permissionMode / allowedTools / autoApprovedTools / resourceScopes）

Task 2.8: server/utils/plugins/skillsClaw/lifecycle/installer.js
安装 / 卸载 / 绑定 Skill 到运行时（文件落盘 + DB 记录）。

javascript
class SkillInstaller {
  async install(skillIdOrUrl, options = {}) { ... }
  async uninstall(skillId, options = {}) { ... }
  async bindToWorkspace(skillId, workspaceId, assistantId) { ... }
  async unbindFromWorkspace(skillId, workspaceId, assistantId) { ... }
}

要求：
- 外部 install 必须校验 `SKILLS_CLAW_EXTERNAL_DOWNLOADS_ENABLED`
- bind 只写 DB 关系（`skill_installations`），并触发本地 registry refresh（事件驱动）

Task 2.9: server/utils/plugins/skillsClaw/lifecycle/index.js
统一导出 + 飞轮入口（check → upgrade outdated → align → validate）：

javascript
const creator = new SkillCreator();
const checker = new SkillChecker();
const upgrader = new SkillUpgrader();
const evolver = new SkillEvolver();
const validator = new SkillValidator();
const installer = new SkillInstaller();
async function runCycle() { ... }
module.exports = { creator, checker, upgrader, evolver, validator, installer, runCycle };
Phase 3: API Endpoints + 定时任务
目标： 暴露 HTTP API（skills_claw 前端/Autobot 使用），并把“外部 registry 刷新/更新检查”接入统一 scheduler。

前置 Gate：
- Phase 0 的 Prisma Migration 已在部署环境执行（至少包含 `skill_installations`）；否则涉及安装/绑定/已安装列表的端点必须 fail-fast 返回明确错误

预计工期： 2-3 天

Task 3.1: server/endpoints/skillsClaw.js
javascript
function skillsClawEndpoints(app) {
  // 注意：这里的 app 实际上传入的是 `apiRouter`（见 server/index.js 的注册模式）
  // ==================== Discovery ====================

  // 统一搜索 (本地 + 外部)
  GET  /api/skills-claw/search?q=invoice&topN=10&source=all

  // 智能推荐
  GET  /api/skills-claw/recommend?q=帮我处理PDF发票

  // 发现页 (分类浏览)
  GET  /api/skills-claw/discover?category=document&page=1&limit=20

  // Skill 详情
  GET  /api/skills-claw/skill/:skillId

  // 所有分类
  GET  /api/skills-claw/categories

  // ==================== Lifecycle ====================

  // 安装 Skill
  POST /api/skills-claw/install        { skillId, workspaceId?, assistantId? }

  // 卸载 Skill
  POST /api/skills-claw/uninstall      { skillId, workspaceId? }

  // 从 GitHub 创建
  POST /api/skills-claw/create         { githubUrl, options? }

  // 检查更新
  GET  /api/skills-claw/check-updates

  // 升级单个 Skill
  POST /api/skills-claw/upgrade/:skillId  { dryRun? }

  // 校验 Skill
  POST /api/skills-claw/validate/:skillId

  // 经验沉淀
  POST /api/skills-claw/evolve/:skillId   { entry }

  // 完整飞轮
  POST /api/skills-claw/cycle

  // ==================== Management ====================

  // 我已安装的 Skill 列表
  GET  /api/skills-claw/installed?workspaceId=1

  // 更新 Skill 配置
  PUT  /api/skills-claw/skill/:skillId/config  { config }

  // 启用/禁用
  PUT  /api/skills-claw/skill/:skillId/toggle  { enabled }

  // 刷新外部索引
  POST /api/skills-claw/refresh-registry

  // ==================== Autobot ====================

  // Autobot 对话式交互 (Phase 5)
  POST /api/skills-claw/autobot        { message, context? }
}
补充要求（安全与权限）：
- `install/create/upgrade/refresh-registry/cycle` 等涉及外部或写入的接口：需要管理员/经理权限 + `SKILLS_CLAW_EXTERNAL_DOWNLOADS_ENABLED` 校验
- 外部 Skill 默认 `permissionMode=default` 且 `autoApprovedTools=[]`（防止“安装即开权限”）

Task 3.2: 数据模型（复用并扩展 SkillCatalog）
复用现有 `server/models/skillCatalog.js`，并按 Phase 0 的 schema 扩展补齐字段；安装/绑定关系建议新增对应 Model（例如 `server/models/skillInstallations.js`）。

依赖说明：
- `skill_installations` 为 Phase 0 新增表；Phase 3 的 install/bind 与 “My Skills” 查询都依赖其 migration 已落地

Prisma 用法（示意，修正导出方式）：

javascript
const prisma = require("../utils/prisma");

Task 3.3: 定时任务接入统一 scheduler（不新造 server/jobs cron）
在 `server/utils/scheduler/index.js` 中注册 `registerSkillDiscoveryTask()`（仅当 `ENABLE_CRON=true` 时运行）。

建议新增调度配置：
- `SKILLS_CLAW_DISCOVERY_SCHEDULE`（默认 `"0 3 * * *"`，凌晨 3 点）

任务逻辑（示意）：
- 1) 刷新外部 registry（受 `SKILLS_CLAW_EXTERNAL_DOWNLOADS_ENABLED` 控制）
- 2) 同步索引到 `skill_catalog`（增量 upsert）
- 3) 检查已安装 Skill 更新（checker.checkAll）
- 4) 发送通知（复用 notification 系统）

触发模式：
- 定时：scheduler cron
- 事件驱动：安装/卸载 Skill 时刷新本地索引
- 手动：前端“刷新”按钮调用 `POST /api/skills-claw/refresh-registry`

Task 3.4: 注册端点到 server/index.js
在 `server/index.js` 中按现有模式注册到 `apiRouter`：

javascript
const { skillsClawEndpoints } = require("./endpoints/skillsClaw");
// ... 在 app.use("/api", apiRouter) 之后
skillsClawEndpoints(apiRouter);
Phase 4: skills_claw 前端
目标： 构建 skills_claw 的完整前端页面。

预计工期： 5-7 天

交付拆分建议（降低估工风险）：
- Phase 4A（先交付）：Discover + 搜索/筛选 + 安装/卸载 + My Skills 基础管理（安装状态/outdated 徽标）
- Phase 4B（再增强）：详情页（绑定/权限/配置/演化时间线）+ Create + Autobot

Task 4.1: 路由注册
文件：

frontend/src/App.jsx

新增路由：

jsx
const SkillsClaw = lazy(() => import("@/pages/SkillsClaw"));
const SkillDetail = lazy(() => import("@/pages/SkillsClaw/SkillDetail"));
const SkillCreate = lazy(() => import("@/pages/SkillsClaw/SkillCreate"));
const SkillAutobot = lazy(() => import("@/pages/SkillsClaw/SkillAutobot"));
// 在 Routes 中:
<Route path="/skills-claw" element={<PrivateRoute><SkillsClaw /></PrivateRoute>} />
<Route path="/skills-claw/skill/:skillId" element={<PrivateRoute><SkillDetail /></PrivateRoute>} />
<Route path="/skills-claw/create" element={<ManagerRoute><SkillCreate /></ManagerRoute>} />
<Route path="/skills-claw/autobot" element={<ManagerRoute><SkillAutobot /></ManagerRoute>} />
Task 4.2: 侧边栏入口
文件： 侧边栏组件中添加 skills_claw 入口，与现有 "助手库" 按钮平级。

图标建议用 🧩 或 ⚡，文案为 "skills_claw"。

Task 4.3: skills_claw 主页面
文件： frontend/src/pages/SkillsClaw/index.jsx

布局：

┌──────────────────────────────────────────────────────────────┐
│  skills_claw                                  [🔍 搜索框]    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  [Discover]  [My Skills]  [Create]  [Autobot 🤖]            │
│                                                              │
│  ┌─ 分类筛选 ─┐  ┌──────── Skill 卡片网格 ────────┐         │
│  │ 📄 文档处理  │  │ ┌──────┐ ┌──────┐ ┌──────┐    │         │
│  │ 💻 开发     │  │ │ Skill│ │ Skill│ │ Skill│    │         │
│  │ 📊 数据分析  │  │ │ Card │ │ Card │ │ Card │    │         │
│  │ 🎨 创意     │  │ └──────┘ └──────┘ └──────┘    │         │
│  │ 📧 沟通     │  │ ┌──────┐ ┌──────┐ ┌──────┐    │         │
│  │ ⚙️ 工具     │  │ │ Skill│ │ Skill│ │ Skill│    │         │
│  │ 🔒 安全     │  │ │ Card │ │ Card │ │ Card │    │         │
│  │ 🔬 研究     │  │ └──────┘ └──────┘ └──────┘    │         │
│  └────────────┘  └─────────────────────────────────┘         │
└──────────────────────────────────────────────────────────────┘
每张 Skill 卡片包含：

图标 + 名称
简述（1-2 行）
来源标签（builtin / GitHub / Community）
分类标签
安装状态（已安装 ✅ / 可安装 / 有更新 🔄）
安装/详情按钮
Task 4.4: Skill 详情页
文件： frontend/src/pages/SkillsClaw/SkillDetail.jsx

内容：

基本信息（名称、描述、版本、作者、许可证）
包含的能力（Tools 列表：抽象名 + 映射后的运行时工具；MCP Bindings；Flow Templates）
权限与资源范围（permissionMode / allowedTools / autoApprovedTools / resourceScopes）
配置表单（若 Skill 定义了 configSchema，则动态生成；否则隐藏）
使用统计（安装次数、调用次数、评分）
Evolution 历史（经验沉淀记录时间线）
安装/卸载/升级按钮
"绑定到 AI 员工" 选择器
Task 4.5: Skill 创建页
文件： frontend/src/pages/SkillsClaw/SkillCreate.jsx

两种创建方式：

从 GitHub URL 创建 — 输入 URL → 预览拉取的信息 → 确认创建
手动创建 — 表单填写 name/description/tools/permissionMode/allowedTools/autoApprovedTools + 正文(系统提示词) → 生成 skill.md
Task 4.6: API 客户端
文件： frontend/src/models/skillsClaw.js

javascript
const SkillsClaw = {
  search: (query, options) => API.get("/skills-claw/search", { q: query, ...options }),
  recommend: (query) => API.get("/skills-claw/recommend", { q: query }),
  discover: (filters) => API.get("/skills-claw/discover", filters),
  getSkill: (skillId) => API.get(`/skills-claw/skill/${skillId}`),
  getCategories: () => API.get("/skills-claw/categories"),
  install: (data) => API.post("/skills-claw/install", data),
  uninstall: (data) => API.post("/skills-claw/uninstall", data),
  createFromUrl: (data) => API.post("/skills-claw/create", data),
  checkUpdates: () => API.get("/skills-claw/check-updates"),
  upgrade: (skillId) => API.post(`/skills-claw/upgrade/${skillId}`),
  validate: (skillId) => API.post(`/skills-claw/validate/${skillId}`),
  getInstalled: (workspaceId) => API.get("/skills-claw/installed", { workspaceId }),
  updateConfig: (skillId, config) => API.put(`/skills-claw/skill/${skillId}/config`, { config }),
  refreshRegistry: () => API.post("/skills-claw/refresh-registry"),
  autobot: (message, context) => API.post("/skills-claw/autobot", { message, context }),
};
Phase 5: Skill Autobot
目标： 构建 AI 驱动的 Skill 生命周期自动化 Agent。

预计工期： 3-5 天

Task 5.1: server/utils/plugins/skillsClaw/autobot/autobotTools.js
将 skills_claw 的 registry/lifecycle 能力包装为 Agent 可调用的 Tool Functions：

javascript
const autobotTools = [
  {
    name: "search_skills",
    description: "搜索本地和外部 Skill 注册表，找到匹配用户需求的 Skill",
    parameters: { query: { type: "string", required: true }, source: { type: "string", enum: ["all", "local", "external"] } },
    handler: async ({ query, source }) => { ... }
  },
  {
    name: "recommend_skill",
    description: "根据用户描述的任务，智能推荐最合适的 Skill",
    parameters: { taskDescription: { type: "string", required: true } },
    handler: async ({ taskDescription }) => { ... }
  },
  {
    name: "create_skill_from_github",
    description: "从 GitHub 仓库 URL 创建一个新的 Skill",
    parameters: { githubUrl: { type: "string", required: true } },
    handler: async ({ githubUrl }) => { ... }
  },
  {
    name: "validate_skill",
    description: "校验 Skill 的完整性（frontmatter、工具绑定、配置等）",
    parameters: { skillId: { type: "string", required: true } },
    handler: async ({ skillId }) => { ... }
  },
  {
    name: "install_skill",
    description: "将 Skill 安装到指定 Workspace 或绑定到 AI 员工",
    parameters: { skillId: { type: "string", required: true }, workspaceId: { type: "number" }, assistantId: { type: "string" } },
    handler: async ({ skillId, workspaceId, assistantId }) => { ... }
  },
  {
    name: "check_skill_updates",
    description: "检查已安装的 Skill 是否有可用更新",
    parameters: {},
    handler: async () => { ... }
  },
  {
    name: "upgrade_skill",
    description: "升级指定 Skill 到最新版本",
    parameters: { skillId: { type: "string", required: true } },
    handler: async ({ skillId }) => { ... }
  },
  {
    name: "run_skill_flywheel",
    description: "执行完整的 Skill 飞轮：检查更新 → 升级过时 Skill → 重新缝合经验 → 校验",
    parameters: {},
    handler: async () => { ... }
  },
];
Task 5.2: server/utils/plugins/skillsClaw/autobot/autobotAgent.js
Autobot 的 System Prompt + 对话处理逻辑：

javascript
const AUTOBOT_SYSTEM_PROMPT = `
你是 Skill Autobot，一个专门管理 AI Skills 生命周期的智能助手。
你的能力：
1. FIND — 搜索和推荐 Skill（本地 + 外部注册表，包含 awesome-claude-skills 的 45+ 社区 Skill）
2. CREATE — 从 GitHub 仓库一键创建新 Skill
3. TEST — 校验 Skill 的完整性和质量
4. IMPROVE — 记录使用经验，持续改进 Skill
5. LAUNCH — 安装和部署 Skill 到 Workspace 或 AI 员工
工作流程：
- 当用户描述一个需求时，先搜索是否有现成 Skill
- 如果有，推荐并协助安装
- 如果没有，询问是否有相关 GitHub 仓库，帮助创建
- 创建后自动校验，确保质量
- 校验通过后协助安装到指定位置
始终用中文回复。每个操作完成后，清晰报告结果和下一步建议。
`;
class SkillAutobot {
  constructor(llmProvider) { ... }

  /**
   * 处理用户消息
   * @param {string} message - 用户输入
   * @param {Object} context - 上下文 (当前 workspace、已安装 skills 等)
   * @returns {{ reply, actions, toolCalls }}
   */
  async chat(message, context = {}) { ... }
}
Task 5.3: Autobot 前端页面
文件： frontend/src/pages/SkillsClaw/SkillAutobot.jsx

聊天式交互界面，类似现有的 WorkspaceChat，但专门用于 Skill 管理：

┌──────────────────────────────────────────────────────────────┐
│  🤖 Skill Autobot                                            │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Autobot: 你好！我是 Skill Autobot。                          │
│  我可以帮你发现、创建、测试和部署 Skills。                       │
│  告诉我你想做什么？                                            │
│                                                              │
│  User: 我需要一个能处理发票的 Skill                             │
│                                                              │
│  Autobot: 🔍 正在搜索...                                     │
│  ┌───────────────────────────────────────┐                    │
│  │ 找到 2 个匹配结果:                     │                    │
│  │ 1. invoice-organizer (外部, 95%匹配)  │                    │
│  │ 2. pdf-processor (本地, 72%匹配)      │                    │
│  │                                       │                    │
│  │ [安装 #1]  [查看详情]  [从 GitHub 创建] │                    │
│  └───────────────────────────────────────┘                    │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  [输入消息...]                                    [发送]      │
└──────────────────────────────────────────────────────────────┘
Phase 6: 概念迁移与整合（中长期）
目标： 逐步将现有概念收编到 Skill-Centric 架构中。

预计工期： 持续迭代

Task 6.1: Assistant Library → Skill Composition View
改造方式（向后兼容）：

AI 员工模板增加 skills: string[] 字段的管理 UI（已有字段，UI 待完善）
在 AI 员工详情页展示 "该员工拥有的 Skills" 列表
支持从 skills_claw 直接给员工"学技能"（绑定 Skill）
保留 Assistant Library 现有 UI 和入口，不破坏用户习惯
Task 6.2: Community Hub → skills_claw 社区 Tab
改造方式：

skills_claw 的 Discover 页面增加 "Community" 来源筛选

communityHub.js
 现有端点迁移到 skillsClaw.js 中，旧端点保留为 alias
Community Hub 的 itemType 映射为 Skill 格式
Task 6.3: Agent Flow → Skill flowTemplates
改造方式：

Flow 编辑器保留，但增加 "保存为 Skill Flow Template" 选项
用户创建的 Flow 可以导出为 Skill 的 flowTemplates 属性
Skill 安装时，自动实例化其 Flow Templates
Task 6.4: MCP → Skill mcpBindings 自动管理
改造方式：

安装含 mcpBindings 的 Skill 时，自动注册所需的 MCP Server
卸载 Skill 时，检查该 MCP Server 是否被其他 Skill 使用，如果没有则自动清理
用户不再需要手动配置 MCP Server（除非高级场景）

Task 6.5: Mission Control（控制台化 / 可运营化）
改造方式（复用现有前后端与 DB，不引入 Next.js + Convex 第二套栈）：

目标：把 skills_claw 从“功能集合”升级为“可运营系统”，让管理者在同一个地方看到：
- 现在有哪些生命周期任务在跑（安装/校验/升级/发布/刷新/周期）
- scheduler 是否真的按时执行（什么时候跑、是否成功、失败原因）
- 演化资产是否沉淀为可检索的记忆（evolution / Gene / Capsule / 审计日志）
- AI 员工（Team）如何分工、各自具备哪些 Skills、是否有卡点

模块映射（参考 Mission Control 六件套）：
- Tasks Board → skills_claw Ops 看板（基于独立 `skills_claw_jobs` 状态表；`event_logs` 仅做审计关联）
- Calendar → scheduler 审计面板（List/Calendar + Run now）
- Memory → skills_claw Memory（evolution.json + .evo + 审计事件的统一检索与时间线）
- Team → AI 员工 × Skills 组合体视图（绑定 + 权限 + 生效工具映射 + 最近任务）
- Office → 实时态势（可选，先做数据闭环，再做 avatar 氛围层）

四、文件变更清单总览
（v1.2 以“复用 plugins/skill.md + 扩展 skill_catalog”为路线 A）

新增文件
# Tool alias / skills_claw Engine（基于 plugins）
server/utils/permissions/toolAliases.js            (抽象工具名 ↔ 运行时工具名映射，推荐单一来源)
server/utils/plugins/skillsClaw/toolAliasMap.js     (如不放 permissions，则放这里)
server/utils/plugins/skillsClaw/registry/localRegistry.js
server/utils/plugins/skillsClaw/registry/externalRegistry.js
server/utils/plugins/skillsClaw/registry/unifiedSearch.js
server/utils/plugins/skillsClaw/registry/index.js
server/utils/plugins/skillsClaw/format/evolutionMerger.js
server/utils/plugins/skillsClaw/format/skillMdStitcher.js
server/utils/plugins/skillsClaw/lifecycle/creator.js
server/utils/plugins/skillsClaw/lifecycle/checker.js
server/utils/plugins/skillsClaw/lifecycle/upgrader.js
server/utils/plugins/skillsClaw/lifecycle/evolver.js
server/utils/plugins/skillsClaw/lifecycle/validator.js
server/utils/plugins/skillsClaw/lifecycle/installer.js
server/utils/plugins/skillsClaw/lifecycle/index.js
server/utils/plugins/skillsClaw/autobot/autobotAgent.js
server/utils/plugins/skillsClaw/autobot/autobotTools.js

# API
server/endpoints/skillsClaw.js

# Models（如采用独立安装表）
server/models/skillInstallations.js

# 数据库
server/prisma/migrations/NNNN_extend_skill_catalog_and_add_installations/migration.sql

# 前端
frontend/src/pages/SkillsClaw/index.jsx
frontend/src/pages/SkillsClaw/SkillDetail.jsx
frontend/src/pages/SkillsClaw/SkillCreate.jsx
frontend/src/pages/SkillsClaw/SkillAutobot.jsx
frontend/src/pages/SkillsClaw/components/SkillCard.jsx
frontend/src/pages/SkillsClaw/components/SkillGrid.jsx
frontend/src/pages/SkillsClaw/components/CategoryFilter.jsx
frontend/src/pages/SkillsClaw/components/SearchBar.jsx
frontend/src/pages/SkillsClaw/components/InstallDialog.jsx
frontend/src/pages/SkillsClaw/components/EvolutionTimeline.jsx
frontend/src/models/skillsClaw.js

修改文件
# Phase 0 对齐 + 安全门禁
server/utils/agents/defaults.js                    (Skill→Tool 展开 + skills 不进入 functions[])
server/utils/agents/index.js                       (注释/兼容新的 skillId 前缀策略，必要时调整)
server/utils/permissions/toolGateway.js            (alias + 运行时工具名风险映射补齐)
server/utils/plugins/MarkdownParser.js             (解析 skills_claw 扩展字段，如 sourceType/sourceUrl/sourceHash/license/verified)
server/utils/plugins/constants.js                  (必要时默认值/必填字段策略)
server/utils/scheduler/index.js                    (注册 SkillDiscovery cron)
server/models/skillCatalog.js                      (扩展字段 + 查询能力)
server/prisma/schema.prisma                        (扩展 skill_catalog + 新增 skill_installations)

# 内置 Skills（抽象工具名）
server/utils/skills/builtin/*Skill.js              (toolBindings.toolName 切换到 toolGateway 抽象名)

# 路由注册
server/index.js                                    (注册 skillsClaw endpoints 到 apiRouter)
frontend/src/App.jsx                               (添加 skills_claw 路由)
frontend/src/components/Sidebar/...                (添加 skills_claw 入口)
五、工期总结
Phase	内容	预计工期	优先级
Phase 0	Foundation (命名对齐 + 安全门禁 + DB 扩展)	5-7 天	🔴 必须先做
Phase 1	Discovery (plugins/skill.md 扫描 + 外部 registry)	3-4 天	🔴 核心
Phase 2	Lifecycle (GitHub 创建/检查/升级/安装/校验)	4-5 天	🔴 核心
Phase 3	API Endpoints + 定时任务	2-3 天	🔴 核心
Phase 4	前端页面	5-7 天	🟡 高优
Phase 5	Autobot	3-5 天	🟡 高优
Phase 6	概念迁移 (持续)	持续	🟢 中期
总计		约 5-6 周（可通过并行前后端与部分复用缩短）
六、风险与缓解
风险	概率	影响	缓解措施
GitHub API Rate Limit	中	外部 Skill 发现受阻	bundled index 离线兜底 + 24h 缓存
供应链/RCE 风险（外部 Skill）	中	高	外部下载默认关闭 + allowlist/verified + 默认最小权限 + 审计日志
toolAliasMap 覆盖不全	中	中	先支持最小工具集合 + validator 明确报错 + 默认 require_confirmation
SkillId 稳定性/迁移	中	中	ID 基于目录名生成 + originPath 记录 + 升级/重命名时提供迁移脚本
前端工作量超预期	中	延期	Phase 4 拆两步：先 4A（Discover + Install + My Skills 基础），再 4B（Detail + Create + Autobot）
Autobot LLM 调用成本	低	账单	Autobot 仅在用户主动使用时触发，非后台自动
飞轮边界情况遗漏	低	中	用固定用例回归（evolve/stitch/upgrade/install），并在 validator 中兜底提示
七、成功标准
里程碑	验收标准
Phase 0 完成	Skill 声明 tools:["http-request"] 后可被映射并注入运行时工具；toolGateway 评估不为 deny；skills 不再污染 functions[]
Phase 1+2 完成	node -e "require('./server/utils/plugins/skillsClaw/registry').unifiedSearch.search('invoice')" 返回本地 + 外部结果
Phase 3 完成	curl /api/skills-claw/search?q=pdf 返回正确结果；定时任务日志正常
Phase 4 完成	用户可在浏览器中浏览、搜索、安装 Skill，绑定到 AI 员工
Phase 5 完成	用户对 Autobot 说"我需要一个处理发票的能力"，Autobot 自动搜索/推荐/安装
以上就是 v1.2 修订后的完整方案。需要我把它进一步细化成“逐任务/逐文件/逐命令”的 Implementation Plan 吗？
