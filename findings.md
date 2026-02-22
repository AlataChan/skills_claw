# Findings & Decisions — SkillCLI

**项目：** SkillCLI（AI 能力的 npm）
**来源：** 2026-02-22 头脑风暴对话（5 轮问答）

---

## Requirements

- 通用 CLI 工具，管理 AI Skill 的完整生命周期（发现/安装/更新/演化/发布）
- 支持所有主流 AI runtime：Claude Code、OpenAI、Gemini、Codex、Kimi、MiniMax、GLM 等
- 与 SGA-Molt MCP Hub（128 Tools / 8 类 / 标准 MCP JSON-RPC）深度集成
- Skill 可声明 MCP 依赖，CLI 安装时自动做依赖检查
- 支持企业私有 registry 源（企业内部 Skill 不进公共索引）
- 初期目标：SGA-Molt / Alata Studio 企业场景；终极目标：面向所有 AI 开发者

---

## Technical Decisions

| 决策 | 选择 | 排除选项 | 理由 |
|------|------|---------|------|
| **运行时策略** | Universal Spec (B) | A(Adapter-first), C(Claude-first) | A 是维护地狱（各家格式各自更新）；C 有路径依赖问题 |
| **Registry 模型** | Hybrid (C) | A(中心化服务器), B(纯 GitHub) | 纯 B 无法做 MCP 依赖图谱；A 需要运维服务器；C 用 registry.json 恰好覆盖 |
| **Manifest 格式** | B+（B + thin inputs） | A(太轻), C(太重) | A 缺 MCP 依赖声明；C 的 permission_policy 和 flow_templates 适配困难 |
| **inputs vs config_schema** | `inputs`（简单 key-value） | 完整 JSON Schema 验证 | 只需部署时参数注入，不需要完整验证——轻量优先 |
| **显式排除字段** | `permission_policy`, `flow_templates` 不进 Manifest | — | 权限模型各 runtime 不同；工作流编排是 runtime 职责 |
| **技术栈** | Node.js/TypeScript + npm | Rust | TS 开发快，生态成熟（YAML/semver/GitHub SDK）；"AI 能力的 npm"定位与 npm 分发天然贴合 |
| **Adapter 协议** | Subprocess + stdin/stdout JSON | 内置 adapter | 语言无关；TS→Rust 迁移时 core 不动；社区可用任意语言写 adapter |
| **两种 Skill 形态** | Manifest（skill.yaml）+ Workflow（skill.json）并存 | 合并为一种 | 面向不同场景：LLM 自主编排 vs 确定性步骤流程 |
| **Hub URL 存放位置** | `~/.skillcli/config.yaml`（不写进 Skill 文件） | 写进 skill.json | Skill 文件应无状态，换部署环境不失效 |
| **`steps[]` 归属** | skill.json（Workflow 形态），非 skill.yaml 字段 | 作为 flow_templates 加回 manifest | 两种形态并行，`skill generate` 命令生成 workflow |

---

## Key Architectural Insights

### 1. MCP Hub 是天然的执行层桥梁

SGA-Molt 的 MCP Hub 已经：
- 标准化 128 个 Tool（8 大类）
- 使用标准 MCP 协议（JSON-RPC）
- 暴露 `tools/list` + `tools/call` 接口（端口 18800）

因此 Skill Manifest 的 `mcp_deps` 字段可以直接引用 MCP Hub 的 Tool 名，CLI 安装时调 `tools/list` 做依赖检查——无需重新设计工具层。

### 2. 为什么选 Hybrid Registry（C）而不是纯 GitHub（B）

- Skill 不是孤立文件，有 MCP 依赖关系
- `skill search "发票"` 需要一个索引来做关键词匹配
- registry.json 只是一个 GitHub 托管的 JSON 文件，不需要运营服务器
- 企业私有 Skill（ERP / 薪资 / 银行对接）可以放私有 GitHub repo，不进公共索引

### 3. Adapter 是减少维护成本的关键

每个 AI runtime 的工具调用格式都不同，但都有有限的差异：
- 所有格式都接受 JSON Schema 描述
- Adapter 只需维护一个枚举映射（capabilities 抽象名 → runtime 具体格式）
- MCP Hub 的 Tool 已经有标准 JSON Schema，Adapter 做格式转换即可

### 4. Skill 的两层关系（来自 SGA-Molt 架构文档）

```
Skill = 编排层（Prompt + 意图 + 工作流）
MCP Tool = 执行层（真正去 ERP 查表、往 CRM 写数据）
Skill 调用 MCP Tool，Skill 本身不直接执行外部操作
```

这个分层是 SkillCLI 设计的根本出发点。

---

## Research Findings

### SGA-Molt MCP Hub（128 Tools / 8 类）

| 类别 | Tool 数 | 优先级 | 典型 Tool |
|------|--------|--------|---------|
| 本地算力模型 | 7 | P0 | `ocr.recognize`, `tts.synthesize`, `vision.analyze` |
| 本地服务支持 | 15 | P0 | `sga_rag.search`, `sga_matrix.query` |
| 系统耦合连接 | 28 | P1 | `yonyou.*`, `bank_enterprise.*`, `cmb_payroll.*` |
| 新媒体预处理 | 8 | P1 | `image.generate`, `image.edit` |
| 视频生成 | 7 | P2 | `video.generate`（外部 API） |
| 信息收集 | 15 | P0 | `sga_web.search`, `catfish.monitor_add` |
| 办公文档 | 8 | P0 | `doc.create`, `doc.excel_create` |
| 企业微信 | 40 | P0 | `sga_phone.send_text`, `sga_mail.*`, `sga_calendar.*` |

**关键接口：**
- `GET http://localhost:18800/tools/list` — 获取所有可用 Tool
- `POST http://localhost:18800/tools/call` — 执行 Tool
- 协议：MCP 标准（JSON-RPC）

### skills_claw 现有设计（Alata Studio Lite，v1.2）

- 已实现：Phase 0-5 的核心逻辑（registry/lifecycle/installer/validator/autobot）
- 已实现：skill.md（YAML frontmatter + Markdown body）格式
- 已实现：PluginScanner / MarkdownParser / toolAliasMap
- **尚未解耦**：深度依赖 Alata Studio 运行时（Prisma DB / AIbitat / Express API）
- **SkillCLI 目标**：把 Skill 逻辑层从 Alata Studio 解耦，成为独立 CLI

---

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| 尚未发现 | — |

---

## Resources

- 设计文档：`docs/plans/2026-02-22-skillcli-design.md`
- 实施计划：`task_plan.md`
- Alata Studio skills_claw 实施方案：`docs/achieve/skills_claw.md`（v1.2）
- Alata Studio skills_claw Wave2：`docs/achieve/skills_claw_wave2.md`（v0.3）
- SGA-Molt 平台需求：`docs/SGA-Molt-Requirements.md`
- SGA-Molt MCP Hub 需求：`docs/SGA-Molt-MCP-Hub-Requirements.md`
- MCP Hub 默认端口：18800（`tools/list` + `tools/call`）
