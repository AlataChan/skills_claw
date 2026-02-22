# SkillCLI — 设计文档

**版本：** v1.0
**日期：** 2026-02-22
**状态：** 二次评审 PASS（7.8/10），待实施

---

## 0、Plan Review（2026-02-22）

**结论：PASS（7.8 / 10）**（评分 ≥ 7.0 进入 PASS）

**评分维度（总分 10）：**
- 清晰度与一致性：1.6 / 2
- 可落地性与范围控制：1.6 / 2
- Manifest 规范完备度（第 3 节）：1.5 / 2
- CLI 命令集与 UX（第 4 节）：1.5 / 2
- 风险识别与可演进性：1.6 / 2

**本轮主要修改已直接写入文档：**
- Manifest：补齐 `schema_version`、最小 `inputs.type`、inputs 模板渲染规则；并建议引入安装态 `skill.lock.json` 以承载 resolved_source / resolved_inputs，避免把 registry 元数据写进 `skill.yaml`（见 3.0–3.5）
- CLI：补齐 `skill-ref` 语法（name@version / github@hash / local path）、安装时 `--input` 覆盖、`emit` 需要显式 skill-name 与输出目录、`validate --target` 的校验语义，并补充 `doctor` 降低排障成本（见 4.1–4.2）

**仍建议后续补强（不阻塞 v1.0 落地）：**
- 明确 `capabilities` 与 `mcp_deps` 的边界与适配策略（尤其是纯 API runtime 的 host tool/HTTP wrapper 方案）
- 为 `skill install/update` 增加 `--json` 输出与 `--dry-run`，便于 CI/自动化与可预期变更

---

## 一、项目定位

### 1.1 一句话定义

> **SkillCLI 是 AI 能力的 npm。**
> 一个通用的命令行工具，让开发者可以像管理代码依赖一样管理 AI 技能（Skill）——发现、安装、更新、演化、分发。

### 1.2 目标用户（优先级排列）

| 优先级 | 用户群体 | 描述 |
|--------|---------|------|
| **最终目标 A** | AI 应用开发者 | 任何开发 AI Agent 应用的人都能用 `skill install invoice-processor` |
| **初期目标 C** | 企业内部（SGA-Molt / Alata Studio） | skills_claw 从 Alata Studio 解耦，成为可独立部署的能力管理层 |

> 关键洞察：**实现 A，C 自动成立。** 以 A 为设计靶点，C 是自然副产物。

---

## 二、核心设计决策（来自头脑风暴）

> 以下决策均经过逐项讨论确认，不可轻易更改。

### 决策 1：运行时策略 — Universal Spec（B 方案）

**结论：** Skill 采用运行时无关的通用格式（spec-first），适配层（adapter）由运行时贡献，不是 core 的职责。

**背景分析：**

| 方案 | 描述 | 淘汰原因 |
|------|------|---------|
| A（Adapter 层） | CLI 为每个 runtime 维护转换逻辑 | 维护地狱：OpenAI/Anthropic/Google 各自更新格式，CLI 永远在追 |
| **B（Universal Spec）** | **Skill 定义 What，adapter 处理 How** | **✅ 选择此方案** |
| C（Claude Code 优先） | 先做 Claude Code 再扩展 | 路径依赖，Claude-centric 设计烤进 core，难以泛化 |

**支持的运行时（示例，非完整列表）：**
- Claude Code（Anthropic）
- OpenAI（GPT-4o / o3）
- Codex
- Gemini（Google）
- Kimi（Moonshot）
- MiniMax
- GLM（智谱）
- 任何兼容 OpenAI API 格式的模型

**Adapter 模式：**
```
skill.yaml[capabilities] → Claude Code adapter → .claude/skills/
skill.yaml[capabilities] → OpenAI adapter     → tools[] JSON
skill.yaml[capabilities] → Gemini adapter     → function_declarations[]
```

---

### 决策 2：Registry 模型 — Hybrid（C 方案）

**结论：** GitHub 作为内容存储 + curated `registry.json` 作为发现层。

**背景分析：**

| 方案 | 描述 | 淘汰原因 |
|------|------|---------|
| A（中心化 Registry） | 运营一台服务器，如 npmjs.com | 运维成本高，单点依赖，用户个人项目不应承担基础设施 |
| B（纯 GitHub-native） | 每个 Skill 是 GitHub repo，直接拉取 | 无中央索引，无法做 MCP 依赖图谱，`skill search` 没法用 |
| **C（Hybrid）** | **GitHub 存内容 + registry.json 做发现** | **✅ 选择此方案** |

**为什么 C 适合本项目（关键原因）：**

本项目的 MCP Hub 有 128 个 Tool，Skill 安装时必须检查 MCP 依赖是否满足。这需要一个中央索引来存储依赖关系图谱——纯 B 做不到，中心化服务器（A）杀鸡用牛刀，C 的 registry.json 存 `mcp_deps` 刚好够用。

**运作方式：**
```
# 每个 Skill 内容存在 GitHub repo
github.com/sga-internal/erp-skills/invoice-processor/skill.yaml

# 公共 registry index（一个 JSON 文件）
github.com/awesome-skills/index/registry.json

# 企业私有 registry（私有 GitHub repo）
github.com/sga-corp/skill-registry/registry.json  # --token $GIT_TOKEN
```

**CLI 多源支持：**
```bash
skill source add https://github.com/awesome-skills/index/registry.json
skill source add https://github.com/sga-corp/skill-registry/registry.json --token $GIT_TOKEN
```

---

### 决策 3：Skill Manifest 格式 — B+（B 加薄层 `inputs`）

**结论：** 核心格式为 B（系统提示词 + 能力声明 + MCP 依赖），加一层轻量参数化（`inputs`）。

**背景分析：**

| 方案 | 内容 | 淘汰原因 |
|------|------|---------|
| A（轻量 Prompt Card） | 只有 name + description + 系统提示词 | 无 MCP 依赖声明，`skill install` 后不知道能不能跑 |
| **B+（B + 薄层 inputs）** | **Prompt + capabilities + mcp_deps + inputs** | **✅ 选择此方案** |
| C（完整编排单元） | B + config_schema + permission_policy + flow_templates | 太重，adapter 适配 permission_policy 是噩梦，flow_templates 是 runtime 自己的事 |

**为什么需要 `inputs`（而不是完整 config_schema）：**

MCP Hub 的很多 Tool 需要运行时才能确定的参数（如：搜索哪个知识库 collection、输出给哪个用户）。没有 `inputs`，Skill 要么硬编码这些值，要么完全依赖 runtime 注入——两者都破坏可移植性。`inputs` 是简单 key-value 声明，不是完整 JSON Schema 验证，足够轻量。

**被显式排除的 C 字段：**

| 字段 | 排除原因 |
|------|---------|
| `permission_policy` | 各 runtime 权限模型完全不同，无法统一；adapter 负责处理 |
| `flow_templates` | 工作流编排是 runtime 的职责，不是 Skill spec 的职责 |
| 完整 `config_schema` | 引入 JSON Schema 验证即进入 C 的重量级区间 |

---

## 三、Skill Manifest 格式规范（B+）

### 3.0 规范补充（建议在 v1.1 明确写入）

为避免 manifest 被 “registry 元数据 / 安装态信息” 污染，同时让 CLI 能稳定演进，建议补充三条规则：

1) **必须有 `schema_version`**：这是 manifest 规范版本（不是 Skill 的业务版本 `version`），用于兼容升级与校验。  
2) **`skill.yaml` 只放 “作者可控、跨 runtime 通用” 的字段**：诸如 `verified`、具体来源 URL、commit hash 等，应该由 registry 或安装态产生，避免作者自报 “已审核”。  
3) **引入安装态锁文件（类比 npm 的 lockfile）**：CLI 安装时生成 `skill.lock.json`，记录本次安装的 source pin（commit/tag）与最终 inputs（默认值合并后的结果），便于复现与更新对比。

### 3.1 完整格式

```yaml
# skill.yaml（作者维护 / repo 内分发）
# ── 规范层（兼容性）────────────────────────────────────────
schema_version: "1.0"

# ── 身份层（所有 runtime 通用）──────────────────────────────
name: invoice-processor
version: 1.2.0
description: "处理发票：OCR识别、结构化提取、入账到知识库"
tags: [finance, document, ocr]
author: sga
license: MIT
homepage: https://github.com/sga/invoice-processor

# ── 灵魂层（所有 runtime 通用）──────────────────────────────
system_prompt: |
  你是一个专业的发票处理助手。
  当用户提供发票图片或PDF时，你的工作流程是：
  1. 使用 OCR 识别发票内容
  2. 结构化提取：金额、日期、供应商、税号
  3. 将数据存入指定知识库 collection（{{inputs.target_collection}}）
  4. 返回处理摘要和确认信息

  始终在操作前确认关键信息，涉及金额时要求用户二次确认（阈值：{{inputs.confirm_threshold}} 元）。

# ── 能力声明（抽象，adapter 负责映射到 runtime 格式）────────
capabilities:
  - read-file
  - http-request

# ── MCP 依赖（执行层的桥梁，CLI 做本地依赖检查）────────────
mcp_deps:
  - tool: ocr.recognize
    required: true
    description: "发票图片/PDF文字识别"
  - tool: sga_rag.upload
    required: true
    description: "将结构化数据存入知识库"
  - tool: sga_rag.search
    required: false
    description: "查重（避免重复录入）"
  - tool: doc.excel_create
    required: false
    description: "批量处理时导出 Excel 汇总"

# ── 参数化（安装/部署时注入，不是 runtime 配置）─────────────
inputs:
  - name: target_collection
    type: string
    description: "发票存入哪个知识库 collection"
    required: false
    default: invoices
  - name: confirm_threshold
    type: number
    description: "超过多少金额（元）需要二次确认"
    required: false
    default: 10000
  - name: output_language
    type: enum
    enum: [zh-CN, en-US]
    description: "输出语言"
    required: false
    default: zh-CN
```

安装后，CLI 生成安装态锁文件（本地 skill store 中，**不回写** repo）：

```json
{
  "schema_version": "1.0",
  "skill": "invoice-processor",
  "resolved_source": {
    "type": "github",
    "url": "https://github.com/sga/invoice-processor",
    "hash": "abc123def456"
  },
  "resolved_inputs": {
    "target_collection": "invoices",
    "confirm_threshold": 10000,
    "output_language": "zh-CN"
  }
}
```

### 3.2 字段分类表

| 字段 | 层次 | 跨 Runtime 通用 | 说明 |
|------|------|:-:|------|
| `schema_version` | 规范层 | ✅ | manifest 规范版本（用于兼容与校验） |
| `name/version/description/tags/author/license` | 身份层 | ✅ | 纯 metadata，全 runtime 通用 |
| `system_prompt` | 灵魂层 | ✅ | 纯文本，所有模型直接接受 |
| `capabilities` | 能力声明 | ✅（adapter 映射） | 抽象能力名，adapter 转换 |
| `mcp_deps` | 依赖层 | ✅ | MCP 协议跨 runtime，Hub 已解决 |
| `inputs` | 参数化 | ✅ | 简单 key-value，安装时注入 |
| `verified / source_* / resolved_*` | ❌（建议移出） | ❌ | 应放在 `registry.json` 或安装态 `skill.lock.json`，避免自报审核与重复信息 |
| `permission_policy` | ❌ 不包含 | ❌ | 各 runtime 模型不同，不统一 |
| `flow_templates` | ❌ 不包含 | ❌ | 属于 runtime orchestration 层 |

### 3.3 能力声明（capabilities）抽象名映射

CLI adapter 负责将抽象能力名映射到 runtime 格式：

| 抽象名 | Claude Code | OpenAI | Gemini |
|--------|-------------|--------|--------|
| `read-file` | 内置 file tool | function: `read_file` | `read_file` function_declaration |
| `http-request` | 内置 web tool | function: `http_request` | `http_request` function_declaration |
| `execute-code` | 内置 bash tool | function: `code_interpreter` | `code_execution` |
| `write-file` | 内置 file tool | function: `write_file` | `write_file` function_declaration |

> 建议补充一条约束：**capabilities 表示“宿主环境提供的原语能力”**。对于没有内置 file/web/bash 的 runtime（如纯 OpenAI API），adapter 要么：  
> 1) 生成 MCP Hub 的 wrapper tools（通过 HTTP 调用 MCP Hub），要么  
> 2) 明确报 “该 target 不支持此 capability”，由 `skill validate --target <runtime>` 提前拦截。

### 3.4 `inputs` 渲染与注入规则（建议补充到 spec）

- **模板语法（推荐）**：在 `system_prompt` 中使用 `{{inputs.<name>}}` 引用输入变量（如 `{{inputs.target_collection}}`）。  
- **注入时机**：`inputs` 在安装/部署或 emit 阶段解析（不是推给模型运行时再猜）。解析结果写入 `skill.lock.json`。  
- **优先级（从高到低）**：命令行 `--input key=value` > 本地配置（按 skill 维度）> `skill.yaml` 的 `default`。  
- **最小类型系统（避免引入完整 JSON Schema）**：`string | number | boolean | enum | json`；`enum` 需提供 `enum: [...]`。  
- **缺失行为**：`required: true` 且无法解析到值时，`skill install` 必须失败（除非交互式补全）。

### 3.5 `skill validate` 建议检查项（与 v1.0 保持轻量）

- YAML 可解析；`schema_version` 支持；`name` 符合 `lower-kebab-case`；`version` 符合 SemVer  
- `inputs[].name` 不重复；`inputs[].type` 在允许集合内；`enum` 类型必须提供非空 `enum`  
- `mcp_deps[].tool` 格式为 `<server>.<tool>`（或至少包含一个 `.`）；`required` 为布尔值  
- 选择 `--target <runtime>` 时：检查 adapter 是否存在、是否声明支持所需 capabilities

---

## 四、CLI 命令集设计

### 4.1 核心命令

```bash
# 发现
skill search <query>                             # 在 registry 中搜索
skill info <skill-ref>                           # 查看 Skill 详情（含 mcp_deps / inputs）

# 生命周期
# skill-ref 例子：
#   invoice-processor
#   invoice-processor@1.2.0
#   github:sga/invoice-processor@abc123def456
#   ./local/path/to/skill
skill install <skill-ref>                       # 安装（解析 inputs + 依赖检查 + 生成 lockfile + emit）
skill install <skill-ref> --target claude-code   # 指定安装后 emit 的 target（可多次 emit）
skill install <skill-ref> --input k=v --input a=b # 覆盖 inputs（可多次）
skill uninstall <skill-name>                     # 卸载
skill update <skill-name>                        # 更新（对比 lockfile 的 resolved_source）
skill update --all                               # 更新所有

# 本地管理
skill list                                      # 列出已安装的 Skill
skill validate <skill-ref>                       # 校验 manifest（可接受 name 或 path）
skill validate <skill-ref> --target openai        # 额外校验 adapter 支持与 emit 可行性
skill check-deps [<skill-name>]                  # 检查 mcp_deps（不传则检查全部）

# Registry 管理
skill source add <url> [--token TOKEN]          # 添加 registry 源
skill source list                               # 列出所有 registry 源
skill source remove <url>                       # 移除 registry 源
skill source refresh [<url>]                    # 刷新 registry 索引（可指定单个源）

# Adapter 管理
skill adapter list                              # 列出可用 adapter
skill adapter install claude-code               # 安装 Claude Code adapter
skill emit <skill-name> --target openai --out ./dist # 导出 Skill 为指定 runtime 格式

# 创作与发布
skill init                                      # 交互式创建新 Skill
skill publish                                   # 发布 skill.yaml（manifest 形态）到 registry（提交 PR）
skill publish --workflow                        # 发布 skill.json（workflow 形态）到 SGA Market
skill publish --both                            # 同时发布两种形态
skill evolve add <skill-name>                   # 添加演化经验条目（写入 evolution.json）
skill evolve list <skill-name>                  # 列出经验条目

# Hub 工具（复用 mcp-claw 已有命令，skill CLI 不重复实现）
# mcp-claw hub connect <hub-url>               # → 见 mcp-claw CLI
# mcp-claw hub status                          # → 见 mcp-claw CLI
# mcp-claw hub catalog                         # → 见 mcp-claw CLI

# Workflow 生成（skill CLI 新增，配合 mcp-claw hub 使用）
skill generate <description>                    # 用 LLM 基于 Hub catalog 生成 skill.json
skill generate --from skill.yaml               # 从已有 manifest 生成 workflow 版本
skill generate --dry-run                       # 预览生成结果，不保存

# 诊断（建议提供，降低排障成本）
skill doctor                                    # 检查 config / MCP Hub 连通性 / adapter 安装情况
```

### 4.2 MCP 依赖检查流程

```
skill install invoice-processor
  │
  ├─ 1. 解析 skill-ref → 解析来源（registry / github / local），并 pin 到 commit/tag（写入 lockfile）
  ├─ 2. 拉取 skill.yaml
  ├─ 3. 解析 inputs（合并 default + 本地配置 + CLI --input），写入 lockfile 的 resolved_inputs
  ├─ 4. 解析 mcp_deps
  ├─ 5. 调用本地 MCP Hub tools/list → 获取可用 Tool 列表
  ├─ 6. 对比 mcp_deps：
  │      ├─ required: true  + 本地不存在 → ❌ 安装中断，报错
  │      └─ required: false + 本地不存在 → ⚠️  警告，继续安装
  └─ 7. 写入本地 skill store + 触发 adapter emit（按 --target 或默认 target）
```

---

## 五、Registry 协议规范

### 5.1 registry.json 格式

```json
{
  "version": "1.0",
  "name": "awesome-skills",
  "description": "Curated AI skill registry",
  "updated_at": "2026-02-22T00:00:00Z",
  "skills": [
    {
      "name": "invoice-processor",
      "version": "1.2.0",
      "description": "处理发票：OCR识别、结构化提取、入账到知识库",
      "tags": ["finance", "document", "ocr"],
      "author": "sga",
      "source_url": "https://github.com/sga/invoice-processor",
      "skill_yaml_path": "skill.yaml",
      "verified": true,
      "mcp_deps": [
        { "tool": "ocr.recognize", "required": true },
        { "tool": "sga_rag.upload", "required": true },
        { "tool": "sga_rag.search", "required": false },
        { "tool": "doc.excel_create", "required": false }
      ],
      "capabilities": ["read-file", "http-request"],
      "downloads": 142,
      "updated_at": "2026-02-20T00:00:00Z"
    }
  ]
}
```

### 5.2 多源 Registry 合并规则

- 多个 registry 源按添加顺序优先级排列
- 同名 Skill 以第一个找到的为准（优先级高的源优先）
- 私有源（企业）建议放在第一位，确保内部 Skill 不被公共 Skill 覆盖

---

## 六、与 SGA-Molt / MCP Hub 的集成

### 6.1 架构层次关系

```
┌─────────────────────────────────────────────────────┐
│               AI Agent Runtime                       │
│   (Claude Code / OpenAI / Gemini / GLM / Kimi...)   │
└─────────────────────┬───────────────────────────────┘
                      │ system_prompt + tools
┌─────────────────────▼───────────────────────────────┐
│                  Skill Layer                          │
│   skill.yaml → adapter → runtime-specific format    │
│   CLI: install / update / validate / evolve          │
└─────────────────────┬───────────────────────────────┘
                      │ mcp_deps 声明 + tools/call
┌─────────────────────▼───────────────────────────────┐
│                  MCP Hub                              │
│   128 Tools / 8 Categories / Standard JSON-RPC       │
│   (OCR / RAG / ERP / WeCom / Doc / Video / ...)     │
└─────────────────────────────────────────────────────┘
```

### 6.2 MCP Hub 接口对接

SkillCLI 通过 MCP Hub 的标准接口做依赖检查：

```
GET  http://localhost:18800/tools/list   → 获取所有可用 Tool 列表
POST http://localhost:18800/tools/call   → （Adapter 层使用）执行 Tool
```

SkillCLI 配置（`~/.skillcli/config.yaml`）：
```yaml
mcp_hub:
  endpoint: http://localhost:18800
  timeout: 5000
```

---

## 七、Adapter 插件系统

### 7.1 Adapter 接口

每个 runtime adapter 实现以下接口：

```typescript
interface SkillAdapter {
  name: string                           // e.g., "claude-code"
  version: string

  // 将 capabilities 映射为 runtime 工具格式
  emitTools(capabilities: string[]): RuntimeTools

  // 将 system_prompt 注入 runtime
  emitSystemPrompt(prompt: string): RuntimeConfig

  // 生成 runtime-specific 配置文件
  emit(skill: SkillManifest, outputDir: string): void
}
```

### 7.2 内置 Adapter（第一版）

| Adapter | 输出格式 | 输出位置 |
|---------|---------|---------|
| `claude-code` | `.claude/skills/<name>/skill.md` | `~/.claude/` |
| `openai` | `tools.json` + `system.md` | `./skills/<name>/` |
| `anthropic-api` | `tool_use[]` JSON | `./skills/<name>/` |

### 7.3 社区 Adapter（后续扩展）

- `gemini` - Google Gemini function_declarations
- `kimi` - Moonshot AI（兼容 OpenAI 格式）
- `glm` - 智谱 GLM function_call
- `minimax` - MiniMax 格式
- `langchain` - LangChain Tool format
- `dify` - Dify workflow node

---

## 八、生命周期与演化设计

### 8.1 Skill 生命周期状态机

```
not-installed → installed → outdated → upgraded
                    │                      │
                    └──── uninstalled ←────┘
```

### 8.2 Evolution（经验沉淀）

Skill 支持累积使用经验，不修改原始 `skill.yaml`，独立维护 `evolution.json`：

```json
{
  "version": "1.0",
  "skill": "invoice-processor",
  "entries": [
    {
      "id": "evo-001",
      "date": "2026-02-22",
      "title": "增加税号验证逻辑",
      "content": "遇到税号格式不规范的发票时，需要先调用 validate_tax_id 做格式校正",
      "trigger": "production-observation",
      "author": "sga-team"
    }
  ]
}
```

---

## 九、项目边界（不做什么）

| 不做 | 原因 |
|------|------|
| 中心化注册服务器 | 运维成本高，registry.json in GitHub 已足够 |
| 内置 flow_templates | 工作流编排属于 runtime 层，不是 Skill spec 层 |
| 强制 permission_policy | 各 runtime 权限模型不同，无法统一，由 adapter 处理 |
| Agent 调度机制 | 已由 SGA-Molt Claw 层负责 |
| 完整 config_schema 验证 | `inputs` 的简单 key-value 已足够，完整 JSON Schema 过重 |

---

## 十、成功标准

| 里程碑 | 验收标准 |
|--------|---------|
| M1 — Core CLI | `skill install github:sga/invoice-processor` 成功拉取并通过 MCP 依赖检查 |
| M2 — Adapter | `skill emit --target openai` 生成合法的 OpenAI tools[] JSON |
| M3 — Registry | `skill search "发票"` 从 registry.json 返回相关结果 |
| M4 — MCP Integration | 安装含 `required: true` 且本地不存在的 MCP dep，CLI 正确中断并报错 |
| M5 — Multi-source | 公共 + 私有 registry 源并存，企业 Skill 不泄露到公共索引 |
