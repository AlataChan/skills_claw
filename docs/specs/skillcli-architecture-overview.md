# SkillCLI 架构总览 — 两种 Skill 形态的整合设计

**版本：** v1.0
**日期：** 2026-02-22
**状态：** 设计评审通过

> 本文是 SkillCLI 系统所有 spec 文档的导航入口。
> 阅读顺序：本文 → skill-manifest-spec.md → hub-api-spec.md → adapter-protocol-spec.md

---

## 一、两种 Skill 形态（核心概念）

SkillCLI 系统存在两种 Skill 形态，它们是**不同抽象层**，不是冲突：

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: skill.yaml — Manifest（意图层）                     │
│                                                               │
│  作者编写，描述 Skill "是什么"                                  │
│  LLM 自主编排执行（不规定执行步骤）                              │
│  跨 runtime 通用（Claude / OpenAI / Gemini / GLM / Kimi...） │
│                                                               │
│  核心字段：system_prompt + capabilities + mcp_deps + inputs  │
└─────────────────────────┬───────────────────────────────────┘
                          │
               两条路径，分别走向不同目标
                          │
           ┌──────────────┴──────────────┐
           │                             │
           ▼                             ▼
┌──────────────────────┐   ┌──────────────────────────────────┐
│  Path A: emit        │   │  Path B: generate                 │
│  adapter 转换         │   │  LLM 编排 + Hub catalog           │
│                       │   │                                  │
│  runtime-specific     │   │  Layer 2: skill.json             │
│  配置文件              │   │  Workflow（编排层）                │
│                       │   │                                  │
│  .claude/skills/      │   │  描述 Skill "怎么一步步执行"        │
│  tools.json           │   │  确定性工作流，非 LLM 自主决策      │
│  function_decl.json   │   │  Hub-specific，依赖 MCP Hub 运行  │
└──────────────────────┘   └──────────────────────────────────┘
```

### 1.1 为什么需要两种形态？

| 形态 | 适合场景 | 执行方式 |
|------|---------|---------|
| **skill.yaml（Manifest）** | 通用 AI 助手技能，跨 runtime 分发 | LLM 根据 system_prompt 自主决策调用哪些工具 |
| **skill.json（Workflow）** | 确定性业务流程，如"库存不足时自动补货" | 按预定义 steps 顺序执行，有条件分支，无 LLM 参与 |

---

## 二、系统架构总图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        作者 / 开发者                                   │
│                                                                       │
│   skill init → 编写 skill.yaml                                       │
│   skill generate → LLM 生成 skill.json（基于 Hub catalog）             │
└──────────┬──────────────────────────────────┬───────────────────────┘
           │                                  │
           ▼                                  ▼
┌──────────────────────┐          ┌───────────────────────────────────┐
│   Registry 层         │          │   SGA MCP Hub                     │
│                       │          │                                   │
│   registry.json       │          │   GET /api/repo/tools/catalog     │
│   （GitHub-native）   │          │   GET /api/mcp/connect            │
│   公共 + 私有双源      │          │   128 Tools / 8 类                │
└──────────┬───────────┘          └──────────────┬────────────────────┘
           │                                     │
           ▼                                     │
┌──────────────────────────────────┐             │
│         SkillCLI core            │             │
│                                  │             │
│  skill search / info             │             │
│  skill install（MCP dep check ←──┼─────────────┘
│  skill validate                  │   tools/list
│  skill list / update             │
│  skill emit → adapter subprocess │
│  skill publish → Market          │
│  skill doctor                    │
└──────────┬───────────────────────┘
           │
    ┌──────┴──────────────────────────────┐
    │        Adapter 层（subprocess）       │
    │                                      │
    │  @skillcli/adapter-claude-code       │
    │  @skillcli/adapter-openai            │
    │  @skillcli/adapter-anthropic-api     │
    │  @skillcli/adapter-sga-hub    ←──── │ skill.json workflow 适配
    │  （社区扩展：gemini / kimi / glm...）  │
    └──────┬───────────────────────────────┘
           │
    ┌──────┴──────────────────────────────────────────────┐
    │                 AI Runtime 层                         │
    │                                                       │
    │  Claude Code  │  OpenAI API  │  Gemini  │  SGA Hub   │
    │  Kimi         │  MiniMax     │  GLM     │  Cursor     │
    └───────────────────────────────────────────────────────┘
```

---

## 三、CLI 命令集全图（整合两份文档）

### 3.1 核心命令（来自 skill-manifest-spec）

```bash
# ── 发现 ──────────────────────────────────────────────
skill search <query>
skill info <skill-ref>

# ── 生命周期 ──────────────────────────────────────────
# skill-ref 格式：
#   invoice-processor
#   invoice-processor@1.2.0
#   github:sga/invoice-processor@abc123def456
#   ./local/path/to/skill
skill install <skill-ref> [--target claude-code] [--input k=v]
skill uninstall <skill-name>
skill update <skill-name> | --all

# ── 本地管理 ──────────────────────────────────────────
skill list
skill validate <skill-ref> [--target openai]
skill check-deps [<skill-name>]

# ── Registry 管理 ────────────────────────────────────
skill source add <url> [--token TOKEN]
skill source list | remove | refresh

# ── Adapter 管理 ─────────────────────────────────────
skill adapter list | install <adapter-name>
skill emit <skill-name> --target openai --out ./dist

# ── 创作 ─────────────────────────────────────────────
skill init                           # 交互式创建 skill.yaml
skill evolve add <skill-name>        # 记录经验到 evolution.json

# ── 诊断 ─────────────────────────────────────────────
skill doctor
```

### 3.2 Hub 命令（来自 hub-api-spec，新增子命令组）

> **约定**：Hub 连接管理复用 `mcp-claw` 已有命令（mcp_cli 已开发完成）；
> Workflow 生成 / 发布为 `skill` CLI 新增命令，命名风格与 `mcp-claw` 保持一致。

```bash
# ── Hub 连接管理（mcp-claw 已有命令，skill 直接复用）──
mcp-claw hub connect <hub-url>       # 保存 Hub 地址到 ~/.skillcli/config.yaml
mcp-claw hub status                  # 检查 Hub 连通性 + tool count
mcp-claw hub catalog                 # 列出 Hub 所有可用 Tool（+ schema）

# ── Workflow 生成（skill.json 形态，skill CLI 新增）──
skill generate <description>         # 用 LLM 基于 Hub catalog 生成 skill.json
skill generate --from skill.yaml     # 从已有 manifest 生成 workflow 版本
skill generate --dry-run             # 预览生成结果，不保存

# ── Market 发布 ───────────────────────────────────────
skill publish                        # 发布 skill.yaml（manifest 形态）到 registry
skill publish --workflow             # 发布 skill.json（workflow 形态）到 SGA Market
skill publish --both                 # 同时发布两种形态
```

---

## 四、数据流：两种 Skill 形态的完整生命周期

### 4.1 Manifest Skill（skill.yaml）生命周期

```
作者 → skill init → 编写 skill.yaml
     → skill validate → 校验格式
     → skill publish → 推 PR 到 registry GitHub repo
                        registry.json 索引更新

用户 → skill search "发票" → 从 registry.json 发现
     → skill install invoice-processor
         1. 拉取 skill.yaml
         2. 解析 inputs（合并 default + CLI --input）
         3. 调 Hub tools/list → 检查 mcp_deps
         4. 写入 ~/.skillcli/skills/ + skill.lock.json
         5. emit → adapter subprocess → runtime-specific 文件

Runtime → system_prompt 注入 + capabilities 工具加载 → LLM 自主执行
```

### 4.2 Workflow Skill（skill.json）生命周期

```
作者 → mcp-claw hub connect <hub-url>   # 连接 SGA MCP Hub（mcp-claw 已有命令）
     → mcp-claw hub catalog              # 查看可用 Tools
     → skill generate "库存不足时自动补货" --target sga-hub
         1. GET /api/repo/tools/catalog → 获取 Tool 清单
         2. 用 LLM 编排 steps（选择 Tools + 决定条件分支）
         3. 生成 skill.json（含 steps + inputSchema）
         4. 生成 README.md
     → skill validate skill.json --target sga-hub
     → skill publish --workflow
         POST /api/packages/sync/push → SGA Market

用户 → SGA Hub 市场安装 Workflow Skill
     → Skill runtime 按 steps 调用 Hub Tools
     → Hub MCP Gateway 代理实际 API 调用（ERP / CRM / 微信等）
```

---

## 五、关键设计决策汇总

| 决策 | 结论 | 理由 |
|------|------|------|
| 两种 Skill 形态 | Manifest（yaml）+ Workflow（json）并存 | 面向不同场景：LLM 自主 vs 确定性流程 |
| Runtime 策略 | Universal Spec（B 方案） | Adapter 维护 How，Manifest 只定义 What |
| Registry 模型 | Hybrid（GitHub 内容 + registry.json 索引） | 支持 MCP 依赖图谱 + 私有源 |
| Manifest 格式 | B+（system_prompt + capabilities + mcp_deps + inputs） | 去掉 permission_policy / flow_templates |
| Hub URL | 不写进 skill.yaml，存 config.yaml | 避免 Skill 绑死具体部署环境 |
| Adapter 协议 | Subprocess + stdin/stdout JSON | 语言无关，TS→Rust 迁移成本最低 |
| 技术栈 | Node.js/TypeScript + npm | 开发速度快，生态成熟，与"AI 能力的 npm"定位贴合 |
| Hub API 版本 | v1 无认证，v2 加 Hub API Key | 渐进式安全设计 |

---

## 六、冲突解决记录

### 已解决：`hubSseUrl` 不写进 Skill 文件

**原始设计（hub-api-spec v1.0）：** `"hubSseUrl": "{{HUB_SSE_URL}}"` 写进 skill.json

**最终解决方案（v1.1）：** `hubSseUrl` 归入 `inputSchema`，作为名为 `hub_sse_url` 的 required string 字段。用户在 OpenClaw 四步接入流程第 4 步（Skill inputs + URL 选择）时提供该值。Skill 文件本身保持无状态，换部署环境只需更新 input，不需改 Skill 定义。

> 早期方案（从 config.yaml 注入）已废弃——config 路径存 Hub 地址仍保留，供 `mcp-claw hub connect` 记录，但不作为 Skill 运行时的 Hub 地址来源。

```yaml
# ~/.skillcli/config.yaml
hub:
  url: http://hub.example.com/api/mcp
market:
  url: https://market.sga.com
  token: <token>
llm:
  provider: openrouter
  api_key: <key>
  model: anthropic/claude-sonnet-4-6
```

### 已解决：`steps[]` 格式归属

**原始分歧：** hub-api-spec 定义的 `steps[]` 和设计文档中"不包含 flow_templates"冲突。

**解决方案：** `steps[]` 属于 skill.json（Workflow 形态），这是一种独立的 Skill 类型，由 `skill generate` 命令生成，不是 skill.yaml manifest 的字段。两者并行存在，面向不同场景。

### 已解决：CLI 命名统一

**原始分歧：** `skill-claw-cli` vs `skill` 命令名重叠。

**最终解决方案（v1.1）：** Hub 连接管理复用 `mcp-claw` 已有命令（`mcp-claw hub connect/status/catalog`），因为 mcp_cli 已开发完成，skill 对齐 mcp 而非反向。Workflow 生成用 `skill generate`，Market 发布用 `skill publish --workflow`，风格与 mcp-claw 保持一致。

---

## 七、Spec 文档索引

| 文档 | 内容 | 状态 |
|------|------|------|
| [skillcli-architecture-overview.md](./skillcli-architecture-overview.md) | 本文：系统总览 + 导航 | ✅ 完成 |
| [skill-manifest-spec.md](./skill-manifest-spec.md) | skill.yaml B+ 格式权威规范 | 待写 |
| [skill-workflow-spec.md](./skill-workflow-spec.md) | skill.json step workflow 规范 | 待写（基于 hub-api-spec） |
| [hub-api-spec.md](./hub-api-spec.md) | Hub REST API 规范（整合自 skill-claw-cli-hub-api.md） | 待整合 |
| [registry-protocol-spec.md](./registry-protocol-spec.md) | registry.json 协议规范 | 待写 |
| [adapter-protocol-spec.md](./adapter-protocol-spec.md) | Subprocess adapter JSON 协议 | 待写 |
