# SkillCLI v2 — Skill Index & Runtime Loading 设计文档

**版本：** v0.1 (Draft)
**日期：** 2026-03-23
**状态：** 已被实现方案取代
**前置文档：** [cli-first-agent-architecture.md](../cli-first-agent-architecture.md) | [skillcli-design.md](./2026-02-22-skillcli-design.md)

> 实现对齐说明：
> 当前代码以 [`docs/plans/2026-03-23-cli-first-alignment.md`](/Users/apple/Documents/2.1%20AI%20Journey/Cursor_projects/skills_claw/docs/plans/2026-03-23-cli-first-alignment.md) 为准。
> 与本稿不同的关键点：
> 1. canonical storage 已切到 `skill.md`，`skill.yaml` 仅作 legacy import。
> 2. compact routing table 使用 `summary`，不再把 `description` 作为主路由文本。
> 3. parser/runtime 模块采用 `frontmatter.js` + `router.js`，其中 `router.js` 同时负责 matching 和 deps。

---

## 〇、动机

SkillCLI v1 解决了 Skill 的**分发问题**（发现、安装、验证、跨平台 emit），但未解决架构文档定义的**运行时问题**：

| 架构核心能力 | v1 状态 | 影响 |
|-------------|---------|------|
| Hook 集成接口 | 缺失 | 无法自动化触发 Skill 加载 |
| 两级 Skill 加载（core 常驻 / domain 懒加载） | 缺失 | 50+ Skill 时上下文噪声不可控 |
| Skill Index 路由表 | 缺失 | Agent 无法快速定位相关 Skill |
| Trigger 匹配 | 缺失 | 每次任务需人工指定 Skill |
| Skill 间依赖图 | 缺失 | 相关 Skill 无法自动共加载 |

**本次设计目标：** 让 SkillCLI 从"Skill 的 npm"进化为"Skill 的 npm + webpack"——不仅管理安装，还管理运行时加载策略。

---

## 一、设计范围

### 1.1 本次做

1. **Schema 扩展** — `skill.yaml` 新增 `tier`, `triggers`, `depends`, `priority`, `domain` 字段
2. **Skill Index 引擎** — 扫描已安装 Skill 的 frontmatter，生成紧凑路由表
3. **Index CLI 命令** — `skill index rebuild|show|match|validate|deps`
4. **Hook 集成接口** — 输出标准 JSON，供 Agent 平台（Claude Code hooks, Cursor rules 等）消费
5. **Skill 间依赖图** — `depends` 字段实现共加载，带环检测
6. **Trigger 匹配引擎** — 关键词 + 模糊匹配 + 优先级排序

### 1.2 本次不做

| 不做 | 原因 |
|------|------|
| Hook 实现本身（SessionStart 等） | 属于各 Agent 平台的职责，SkillCLI 只提供数据接口 |
| Skill 内容动态生成（§8.3 of arch doc） | 后续方向，当前先把静态路由做稳 |
| 路由表共享服务（§8.2 of arch doc） | 多 Agent 共享场景暂不考虑 |
| Workflow 形态（skill.json）的 index 集成 | 本次只处理 Manifest 形态（skill.yaml） |

---

## 二、Schema 扩展

### 2.1 新增字段

在 `skill.yaml` 中新增以下字段，全部 **optional**，向后兼容 v1 manifest：

```yaml
# ── 路由层（v2 新增，用于 Skill Index 路由）─────────────────
tier: domain                    # core | domain（默认 domain）
domain: finance                 # 逻辑分组，用于路由表分类展示
triggers:                       # 激活关键词 / 短语（路由匹配输入）
  - 发票
  - invoice
  - billing
  - 账单处理
  - accounts payable
depends:                        # Skill 间依赖（名称列表，安装时共加载）
  - knowledge-base
  - pdf
priority: normal                # high | normal | low（多匹配时的决胜规则）
```

### 2.2 字段规范

| 字段 | 类型 | 默认值 | 约束 |
|------|------|--------|------|
| `tier` | enum | `domain` | 仅 `core` 或 `domain` |
| `domain` | string | `null` | 自由文本，建议 kebab-case（`finance`, `devops`, `document`） |
| `triggers` | string[] | `[]` | 至少 1 项（`tier: domain` 时必填）；每项 ≤ 30 字符 |
| `depends` | string[] | `[]` | 引用其他已安装 Skill 的 `name` |
| `priority` | enum | `normal` | `high` > `normal` > `low` |

### 2.3 与 v1 字段的关系

```
v1 字段（保留）           v2 新增字段（本次）
─────────────────       ─────────────────
schema_version          tier
name                    domain
version                 triggers
description             depends
system_prompt           priority
capabilities
mcp_deps
inputs
tags                    ← tags 与 triggers 的区别见 2.4
```

### 2.4 `tags` vs `triggers` 区分

| 维度 | `tags` | `triggers` |
|------|--------|-----------|
| 用途 | Registry 搜索（`skill search`） | 运行时路由匹配（`skill index match`） |
| 粒度 | 粗分类（`finance`, `ocr`） | 精确激活词（`发票`, `accounts payable`） |
| 消费方 | Registry 索引 | Skill Index 路由引擎 |
| 语言 | 通常英文 | 支持多语言（中英文混合） |

**设计决策：** 两者独立维护，不合并。`tags` 面向人类浏览，`triggers` 面向机器匹配。一个 Skill 可以有 tag `finance` 但 trigger 是 `发票处理`。

### 2.5 完整 v2 Manifest 示例

```yaml
schema_version: "1.0"
name: invoice-processor
version: 1.2.0
description: "处理发票：OCR识别、结构化提取、入账到知识库"
tags: [finance, document, ocr]
author: sga
license: MIT

# ── v2 路由层 ──────────────────────────────────
tier: domain
domain: finance
triggers:
  - 发票
  - invoice
  - billing
  - 账单处理
  - vendor reconciliation
depends:
  - knowledge-base
  - pdf
priority: normal

# ── v1 灵魂层 ──────────────────────────────────
system_prompt: |
  你是一个专业的发票处理助手。
  ...

capabilities:
  - read-file
  - http-request

mcp_deps:
  - tool: ocr.recognize
    required: true
    description: "发票图片/PDF文字识别"

inputs:
  - name: target_collection
    type: string
    required: false
    default: invoices
```

---

## 三、Skill Index 引擎

### 3.1 Index 生命周期

```
skill install  ──┐
skill update   ──┤──→ index 自动重建（post-install hook）
skill uninstall ─┘
                       │
                       ▼
skill index rebuild ──→ 扫描 ~/.skillcli/skills/*/skill.yaml
                       │  提取 frontmatter（name, tier, domain,
                       │  triggers, depends, priority, description）
                       ▼
                  ~/.skillcli/index.json（路由表）
                       │
                       ├──→ skill index show（人类可读）
                       ├──→ skill index match "查询词"（路由测试）
                       └──→ Hook 集成接口（JSON stdout）
```

### 3.2 Index 文件格式

`~/.skillcli/index.json`：

```json
{
  "version": "1.0",
  "generated_at": "2026-03-23T10:00:00Z",
  "skill_count": 12,
  "core": [
    {
      "name": "workflow",
      "description": "任务生命周期管理",
      "version": "1.0.0"
    },
    {
      "name": "coding-conventions",
      "description": "项目编码规范",
      "version": "1.0.0"
    }
  ],
  "domains": {
    "finance": [
      {
        "name": "invoice-processor",
        "description": "处理发票：OCR识别、结构化提取",
        "triggers": ["发票", "invoice", "billing", "账单处理"],
        "depends": ["knowledge-base", "pdf"],
        "priority": "normal",
        "version": "1.2.0"
      }
    ],
    "document": [
      {
        "name": "pdf",
        "description": "PDF 操作",
        "triggers": [".pdf", "merge", "split", "fill form"],
        "depends": [],
        "priority": "normal",
        "version": "1.0.0"
      }
    ]
  },
  "ungrouped": []
}
```

### 3.3 Index 人类可读格式（`skill index show`）

```
SKILL INDEX (12 skills, generated 2026-03-23T10:00:00Z)
══════════════════════════════════════════════════════════

[core] (always loaded — 2 skills, ~1200 tokens)
  workflow           │ 任务生命周期管理              │ v1.0.0
  coding-conventions │ 项目编码规范                  │ v1.0.0

[finance]
  invoice-processor  │ 处理发票：OCR识别、结构化提取  │ 发票, invoice, billing
                     │ → depends: knowledge-base, pdf

[document]
  pdf                │ PDF 操作                     │ .pdf, merge, split
  docx               │ Word 文档创建/编辑            │ .docx, report, memo

[devops]
  deploy             │ 部署自动化                    │ deploy, release, staging
  ci-cd              │ 流水线配置                    │ pipeline, github actions
```

**上下文成本估算：** 路由表 ~80 字/skill × 50 skills ≈ 4000 字 ≈ **~1200 tokens**。对比加载全部 SKILL.md：~600 字/skill × 50 = 30,000 字 ≈ ~15,000 tokens。**节省 ~90%**。

### 3.4 Index 自动重建时机

| 事件 | 触发方式 |
|------|---------|
| `skill install` 完成后 | CLI 内部自动调用 `rebuildIndex()` |
| `skill uninstall` 完成后 | CLI 内部自动调用 `rebuildIndex()` |
| `skill update` 完成后 | CLI 内部自动调用 `rebuildIndex()` |
| 手动 `skill index rebuild` | 用户显式触发 |
| Agent 平台 SessionStart hook | 调用 `skill index show --json` |

---

## 四、Trigger 匹配引擎

### 4.1 匹配算法

```
输入: query = "帮我处理这批发票"
      index = 已加载的 index.json

步骤:
1. 分词: ["帮我", "处理", "这批", "发票"]（中文）或 split by space（英文）
2. 对每个 domain skill:
   a. exact match:  query 包含 trigger 完整字符串 → score += 1.0
   b. partial match: trigger 是 query 子串 → score += 0.6
   c. token overlap: 分词后交集 → score += 0.3 × overlap_ratio
3. 加权调整:
   - priority: high → score × 1.2, normal → × 1.0, low → × 0.8
   - domain coherence: 如果已有同 domain skill 被加载 → score × 1.1
4. 排序: score desc
5. 阈值: score ≥ 0.5 → 候选, score ≥ 0.8 → 自动加载
6. 依赖展开: 候选 skill 的 depends 自动加入加载列表
```

### 4.2 匹配结果格式

`skill index match "review the quarterly invoices"` 输出：

```json
{
  "query": "review the quarterly invoices",
  "matches": [
    {
      "name": "invoice-processor",
      "score": 0.92,
      "matched_triggers": ["invoice"],
      "match_type": "exact",
      "domain": "finance",
      "priority": "normal",
      "depends": ["knowledge-base", "pdf"],
      "load": true
    },
    {
      "name": "expense-report",
      "score": 0.45,
      "matched_triggers": [],
      "match_type": "token_overlap",
      "domain": "finance",
      "priority": "normal",
      "depends": [],
      "load": false
    }
  ],
  "resolved_load_list": [
    "invoice-processor",
    "knowledge-base",
    "pdf"
  ],
  "context_cost_estimate": {
    "core_tokens": 1200,
    "loaded_domain_tokens": 2400,
    "total_tokens": 3600
  }
}
```

### 4.3 多匹配决议规则（优先级从高到低）

1. **Trigger 精确度** — 完整短语匹配 > 关键词匹配 > token 重叠
2. **Domain 一致性** — 与已加载 Skill 同 domain → 加分
3. **Priority 字段** — `high` > `normal` > `low`
4. **依赖拉入** — 匹配到 A，A depends B → B 自动加载

### 4.4 防噪声机制

| 机制 | 说明 |
|------|------|
| **加载上限** | 单次匹配最多加载 5 个 domain skill（可配置） |
| **置信阈值** | score < 0.5 的 skill 不进入候选 |
| **去重** | 同一 session 内已加载的 skill 不重复加载 |
| **core 不参与匹配** | core skill 始终加载，不消耗匹配额度 |

---

## 五、Skill 间依赖图

### 5.1 依赖解析

```
skill install invoice-processor
  → 读取 depends: [knowledge-base, pdf]
  → 检查 knowledge-base 是否已安装
  → 检查 pdf 是否已安装
  → 未安装的依赖:
      → 自动安装（如果在 registry 中找到）
      → 或 warn（如果找不到，但不阻止安装）
```

**与 `mcp_deps` 的区别：**

| 维度 | `mcp_deps` | `depends` |
|------|-----------|-----------|
| 依赖对象 | MCP Hub 上的 Tool | 其他 Skill |
| 检查时机 | `skill install` 时检查 Hub | `skill install` 时检查本地 skill store |
| 失败行为 | `required: true` → 阻止安装 | warn 但不阻止（skill 本身可独立工作） |
| 运行时行为 | Tool 调用 | 共加载到 Agent 上下文 |

### 5.2 环检测

```
A depends [B]
B depends [C]
C depends [A]  ← 环！

检测方式: 拓扑排序，发现环时:
  1. 所有环内 skill 仍然加载（不 crash）
  2. `skill index validate` 报 warning
  3. 打断最后一条边（C→A），避免无限递归
```

### 5.3 依赖图可视化

`skill index deps invoice-processor` 输出：

```
invoice-processor
  ├── knowledge-base
  └── pdf
```

`skill index deps --all` 输出完整依赖图。

---

## 六、Hook 集成接口

### 6.1 设计原则

SkillCLI **不实现** Hook 本身。Hook 是各 Agent 平台的职责：

- Claude Code → `hooks.json` 中定义 SessionStart / PreToolUse
- Cursor → `.cursorrules` 中定义触发规则
- Codex → `AGENTS.md` 中定义行为

SkillCLI 的职责是提供**标准化的 JSON 输出**，供这些 Hook 消费。

### 6.2 集成命令

```bash
# ── Hook 消费接口（JSON stdout）─────────────────────

# 获取 core skill 内容（SessionStart 时加载）
skill index core --json
# → 输出所有 tier:core 的 skill 的 system_prompt 拼接

# 获取路由表（SessionStart 时注入上下文）
skill index show --json
# → 输出 index.json 内容

# 匹配查询（PreToolUse / 用户输入时调用）
skill index match "发票处理" --json
# → 输出匹配结果 + 需要加载的 skill 列表

# 获取指定 skill 的完整内容（匹配命中后加载）
skill index load <skill-name> --json
# → 输出该 skill 的 system_prompt + capabilities + 依赖 skill 内容
```

### 6.3 Claude Code Hook 集成示例

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "skill index core --json && skill index show --json"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Read|Edit|Write|Bash",
        "hooks": [
          {
            "type": "command",
            "command": "skill index match \"$USER_INPUT\" --json"
          }
        ]
      }
    ]
  }
}
```

### 6.4 输出协议

所有 `--json` 输出遵循统一信封格式：

```json
{
  "type": "core_skills | routing_table | match_result | skill_content",
  "data": { ... },
  "meta": {
    "generated_at": "2026-03-23T10:00:00Z",
    "skill_count": 12,
    "token_estimate": 1200
  }
}
```

---

## 七、CLI 命令集（新增）

### 7.1 `skill index` 子命令组

```bash
# 重建路由表（扫描所有已安装 skill 的 frontmatter）
skill index rebuild

# 显示路由表（人类可读 / JSON）
skill index show [--json]

# 测试匹配（给定查询，返回会加载哪些 skill）
skill index match "<query>" [--json] [--threshold 0.5] [--max 5]

# 校验所有 frontmatter（检查 triggers 覆盖度、依赖完整性、环检测）
skill index validate

# 显示依赖图
skill index deps [<skill-name>] [--all]

# 加载指定 skill 完整内容（含依赖展开）
skill index load <skill-name> [--json] [--with-deps]

# 导出路由表为特定 Agent 平台的配置
skill index emit-hook --target claude-code --out ./hooks/
```

### 7.2 现有命令增强

```bash
# skill install 新增行为:
#   1. 安装后自动 rebuild index
#   2. 解析 depends 字段，warn 未安装的依赖 skill
#   3. 可选 --with-deps 自动安装依赖 skill

skill install invoice-processor --with-deps
# → 安装 invoice-processor
# → 检测 depends: [knowledge-base, pdf]
# → 自动安装 knowledge-base 和 pdf（如果在 registry 中）
# → rebuild index

# skill validate 新增检查项:
#   - tier 值合法性
#   - tier:domain 时 triggers 非空
#   - depends 引用的 skill 是否存在
#   - priority 值合法性

skill validate skill.yaml  # 现在也检查 v2 字段
```

---

## 八、实现计划

### 8.1 分阶段交付

```
Phase 1: Schema + Index 基础          ← 本阶段核心
├── 1.1 扩展 manifest.js parser，支持 v2 字段
├── 1.2 扩展 validateManifest()，校验 v2 字段
├── 1.3 实现 buildIndex() — 扫描 skills 目录，提取 frontmatter
├── 1.4 实现 skill index rebuild / show / show --json
├── 1.5 install/uninstall/update 后自动 rebuild
└── 验证: skill init 生成含 v2 字段的模板
          skill index rebuild && skill index show 输出正确

Phase 2: 匹配引擎 + 依赖图
├── 2.1 实现 matchSkills(query, index) — trigger 匹配算法
├── 2.2 实现 resolveDeps(skillName, index) — 依赖展开 + 环检测
├── 2.3 实现 skill index match / deps 命令
├── 2.4 实现 skill index validate（triggers 覆盖度 + 依赖完整性）
└── 验证: skill index match "发票" 返回正确匹配
          skill index deps invoice-processor 显示依赖树

Phase 3: Hook 集成接口
├── 3.1 实现 skill index core --json（core skill 内容输出）
├── 3.2 实现 skill index load <name> --json（含依赖展开）
├── 3.3 实现 skill index emit-hook --target claude-code
├── 3.4 编写 Claude Code hook 集成示例
└── 验证: 生成的 hook 配置可在 Claude Code 中运行
          SessionStart 正确加载 core skills + 路由表

Phase 4: Install 增强
├── 4.1 skill install --with-deps 自动安装依赖 skill
├── 4.2 depends 缺失时的 warn 提示
├── 4.3 skill validate 增加 v2 字段检查
└── 验证: skill install A --with-deps 自动安装 A 的 depends
```

### 8.2 文件变更清单

```
src/
├── cli.js                    # 新增 index 子命令路由
├── lib/
│   ├── manifest.js           # 扩展 parser + validator（v2 字段）
│   ├── index.js              # [新建] Index 引擎核心
│   │   ├── buildIndex()      #   扫描 frontmatter，生成 index.json
│   │   ├── loadIndex()       #   读取 index.json
│   │   ├── showIndex()       #   人类可读格式化
│   │   └── saveIndex()       #   写入 index.json
│   ├── matcher.js            # [新建] Trigger 匹配引擎
│   │   ├── matchSkills()     #   query → scored matches
│   │   ├── tokenize()        #   中英文分词
│   │   └── resolveLoadList() #   依赖展开 + 去重
│   ├── depgraph.js           # [新建] 依赖图
│   │   ├── resolveDeps()     #   递归展开 depends
│   │   ├── detectCycles()    #   环检测
│   │   └── renderTree()      #   树形可视化
│   ├── hook.js               # [新建] Hook 集成输出
│   │   ├── emitCore()        #   core skill 内容拼接
│   │   ├── emitRouting()     #   路由表 JSON
│   │   └── emitHookConfig()  #   Agent 平台 hook 配置生成
│   ├── store.js              # 修改：install/uninstall 后触发 index rebuild
│   └── fsutil.js             # 可能新增 INDEX_PATH 常量
test/
├── manifest.test.js          # 扩展：v2 字段校验测试
├── index.test.js             # [新建] Index 引擎测试
├── matcher.test.js           # [新建] 匹配引擎测试
└── depgraph.test.js          # [新建] 依赖图测试
```

### 8.3 向后兼容性

| 场景 | 行为 |
|------|------|
| v1 skill.yaml（无 v2 字段） | 正常安装，index 中 tier=domain, triggers=[], priority=normal |
| v1 skill.yaml + `skill index match` | 不会匹配到（无 triggers），但 `skill index show` 中可见 |
| v1 skill.yaml + `skill index validate` | warn: "no triggers defined, skill won't be routable" |
| 混合 v1/v2 skill 共存 | 正常工作，v2 skill 可被路由，v1 skill 需手动指定 |

---

## 九、关键设计决策

### 决策 1：Index 存储位置

| 方案 | 优劣 |
|------|------|
| A: 内存生成，不落盘 | 每次 SessionStart 都要扫描，50+ skill 可能慢 |
| **B: 落盘 index.json，事件驱动更新** | **✅ 选择。install/uninstall 自动 rebuild，SessionStart 直接读** |
| C: SQLite | 过重，与"轻量 CLI"定位不符 |

### 决策 2：匹配引擎复杂度

| 方案 | 优劣 |
|------|------|
| A: 简单子串匹配 | 快但不准，"发票处理"匹配不到 trigger "invoice" |
| **B: 子串 + token 重叠 + 优先级加权** | **✅ 选择。平衡准确性和复杂度** |
| C: Embedding 向量匹配 | 需要向量模型，太重 |

### 决策 3：`depends` 安装行为

| 方案 | 优劣 |
|------|------|
| A: 强制自动安装所有 depends | 可能安装用户不需要的 skill |
| **B: 默认 warn，`--with-deps` 自动安装** | **✅ 选择。给用户控制权** |
| C: 忽略 depends，仅运行时共加载 | 容易导致运行时 skill 缺失 |

### 决策 4：中文分词策略

| 方案 | 优劣 |
|------|------|
| A: 引入 jieba/nodejieba 做精确分词 | 准确但增加 native 依赖，安装复杂 |
| **B: 字符级 n-gram + 简单规则** | **✅ 选择。无外部依赖，对 trigger 短语够用** |
| C: 不分词，仅做子串匹配 | 中文 trigger 几乎无法匹配到 |

**B 方案细节：** 对于中文 trigger 匹配，使用 2-gram 和 3-gram 滑动窗口。因为 triggers 本身就是短语（"发票", "账单处理"），大多数情况子串包含即可命中，不需要精确语义分词。

---

## 十、风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| trigger 关键词覆盖不全 | 用户查询匹配不到正确 skill | `skill index validate` 检测无 trigger 的 skill；支持 `skill index match --debug` 查看匹配过程 |
| 依赖环导致加载死循环 | Agent 上下文爆炸 | `detectCycles()` 在 rebuild 时检测，warn 并打断环 |
| index.json 与实际 skill 不同步 | 路由到已卸载的 skill | install/uninstall/update 后强制 rebuild |
| 50+ skill 的 index 体积 | SessionStart 注入上下文过大 | 路由表只含 name + description + triggers（~25 字/skill），50 skill ≈ 1250 字 ≈ ~400 tokens |

---

## 十一、与架构文档的映射

| 架构文档章节 | 本设计对应 |
|-------------|-----------|
| §2.1 Hook 层 | §六 Hook 集成接口（SkillCLI 提供数据，Agent 平台实现 Hook） |
| §2.2 Skill 层 | §二 Schema 扩展 + §三 Index 引擎 |
| §2.3 Command 层 | §七 CLI 命令集（`skill index *` 命令） |
| §2.4 Runtime 层 | `src/lib/index.js`, `matcher.js`, `depgraph.js` |
| §4.2 两级加载 | `tier: core \| domain` + `skill index core --json` |
| §4.3 Frontmatter 路由 | `buildIndex()` 扫描 frontmatter → index.json |
| §4.4 路由表 | `skill index show` 输出格式 |
| §4.5 路由流程 | `skill index match` → 匹配 → 依赖展开 → 加载列表 |
| §4.6 多匹配决议 | §四 Trigger 匹配引擎（精确度 > domain 一致性 > priority） |
| §4.7 依赖图 | §五 Skill 间依赖图 |
| §6.1 Skills are lazy | domain skill 仅在 match 命中时加载 |
| §6.2 Command is stable | `skill index *` 命令接口稳定，内部实现可重构 |
| §6.4 Frontmatter is truth | index.json 始终从 skill.yaml frontmatter 派生，不手工编辑 |

---

## 附录 A：验证命令

```bash
# Phase 1 验证
skill init test-skill         # 生成含 v2 字段的模板
skill validate skill.yaml     # 校验通过（含 v2 字段）
skill install ./skill.yaml    # 安装后 index 自动重建
skill index show              # 显示路由表，test-skill 可见

# Phase 2 验证
skill index match "发票"       # 返回匹配到的 skill + score
skill index match "deploy to staging"  # 匹配 devops 域 skill
skill index deps invoice-processor     # 显示依赖树
skill index validate                   # 报告 trigger 覆盖度

# Phase 3 验证
skill index core --json        # 输出 core skill 内容
skill index load invoice-processor --json --with-deps  # 完整内容
skill index emit-hook --target claude-code --out ./hooks/
# → 生成的 hooks.json 可被 Claude Code 使用
```
