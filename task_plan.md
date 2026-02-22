# Task Plan: SkillCLI — AI 能力的 npm

**目标：** 构建一个通用命令行工具，让开发者像用 npm 管理代码依赖一样管理 AI 技能（Skill）——覆盖 Claude Code、OpenAI、Gemini、Kimi、GLM 等所有主流 AI runtime。

**设计文档：** `docs/plans/2026-02-22-skillcli-design.md`
**当前阶段：** Phase 0（Spec 冻结前准备）

---

## 关键设计决策（勿改动）

| 决策 | 结论 | 理由摘要 |
|------|------|---------|
| 运行时策略 | **Universal Spec（B 方案）** | Skill 定义 What，adapter 处理各 runtime 的 How；避免维护地狱 |
| Registry 模型 | **Hybrid（C 方案）** | GitHub 存内容 + registry.json 索引；支持 MCP 依赖图谱 + 私有源 |
| Manifest 格式 | **B+（B + 薄层 inputs）** | `system_prompt + capabilities + mcp_deps + inputs`；permission_policy 和 flow_templates 被显式排除 |

---

## Phases

### Phase 0: Spec 冻结
- [ ] 确认 Skill Manifest（B+）字段列表最终版
- [ ] 确认 capabilities 抽象名枚举（read-file / http-request / execute-code / write-file / ...）
- [ ] 确认 registry.json 协议格式
- [ ] 确认 CLI 命令集（skill install / search / validate / source / adapter / emit）
- [ ] Codex Plan Review（评分 ≥ 7.0）
- [ ] 用户确认方案
- **Status:** in_progress

### Phase 1: Core CLI 骨架
- [ ] 项目初始化（Node.js / TypeScript，可选 Rust for performance）
- [ ] `skill.yaml` 解析器（manifest loader + validator）
- [ ] 本地 skill store（`~/.skillcli/skills/`）
- [ ] 基础命令：`skill init` / `skill list` / `skill validate`
- [ ] MCP Hub 连接模块（`tools/list` 接口调用）
- [ ] MCP 依赖检查逻辑（required vs optional）
- **Status:** pending

### Phase 2: Registry 层
- [ ] registry.json 协议解析器
- [ ] 多源 registry 管理（source add/list/remove/refresh）
- [ ] GitHub-native 内容拉取（raw content API）
- [ ] `skill search` / `skill info` 命令
- [ ] 离线缓存（registry.json 本地缓存，避免 GitHub API rate limit）
- **Status:** pending

### Phase 3: 安装生命周期
- [ ] `skill install <name>` — 从 registry 安装
- [ ] `skill install github:<user>/<repo>` — 从 GitHub 直接安装
- [ ] `skill uninstall` / `skill update` / `skill update --all`
- [ ] 版本锚点（source_hash 记录 + 比对）
- [ ] `skill check-deps` — 全量 MCP 依赖检查
- **Status:** pending

### Phase 4: Adapter 系统
- [ ] Adapter 插件接口定义（TypeScript interface）
- [ ] Claude Code adapter（输出 `.claude/skills/<name>/skill.md`）
- [ ] OpenAI adapter（输出 `tools.json` + `system.md`）
- [ ] Anthropic API adapter（输出 `tool_use[]` JSON）
- [ ] `skill emit --target <runtime>` 命令
- [ ] `skill adapter install/list` 命令
- **Status:** pending

### Phase 5: Evolution & 发布
- [ ] `evolution.json` 格式定义与管理
- [ ] `skill evolve add <entry>` 命令
- [ ] `skill publish` 命令（生成 PR 到 registry GitHub repo）
- [ ] Skill 创作向导（`skill init` 交互式表单）
- **Status:** pending

### Phase 6: SGA-Molt 集成验证
- [ ] 与本地 MCP Hub（port 18800）联调
- [ ] 端到端测试：install → MCP 依赖检查 → emit → runtime 生效
- [ ] 私有 registry 源（企业内部 skill-registry）验证
- [ ] 成功标准（见设计文档第十节）全部通过
- **Status:** pending

---

## 技术选型（已确定）

| 问题 | 决策 | 理由 |
|------|------|------|
| 主语言 | **Node.js / TypeScript** | 开发速度快；YAML/semver/GitHub SDK 生态成熟；与"AI 能力的 npm"定位贴合 |
| 包分发方式 | **npm global** (`npm i -g @skillcli/cli`) | 天然贴合定位；Homebrew 作为备选 |
| Adapter 协议 | **Subprocess + stdin/stdout JSON** | 语言无关；社区可用任意语言写 adapter；TS→Rust 迁移成本最低 |
| Adapter 分发 | **npm 插件** (`@skillcli/adapter-openai`) | 社区可扩展；版本独立管理 |
| 本地 skill store | **`~/.skillcli/skills/` 目录结构** | 透明可检查；每个 skill 一个子目录含 skill.yaml + skill.lock.json |
| Rust 迁移时机 | 当"无 Node 依赖单一静态二进制"成为第一优先级时 | 当前不考虑，adapter 子进程协议保证迁移平滑 |

## Adapter 子进程协议（已确定）

```json
// stdin → adapter
{ "action": "emit", "skill": { "...skill.yaml parsed..." }, "target": "openai" }

// adapter → stdout（成功）
{ "ok": true, "files": [{ "path": "tools.json", "content": "..." }] }

// adapter → stdout（失败）
{ "ok": false, "error": "capability 'execute-code' not supported by target openai" }
```

---

## 成功标准（验收检查表）

- [ ] `skill install github:sga/invoice-processor` 成功，MCP 依赖检查通过
- [ ] `skill emit --target openai` 输出合法 OpenAI tools[] JSON
- [ ] `skill search "发票"` 从 registry.json 返回相关结果
- [ ] required MCP dep 缺失时，CLI 中断并给出可读错误
- [ ] 公共 + 私有双 registry 源并存，互不干扰

---

## Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| — | — | — |

---

## Notes

- 设计文档位于 `docs/plans/2026-02-22-skillcli-design.md`，所有字段决策均已注明原因
- `permission_policy` 和 `flow_templates` 被显式排除——如有人提议加回来，先回这个文件看理由
- MCP Hub 端口默认 18800，可通过 `~/.skillcli/config.yaml` 配置
- Adapter 是社区贡献的扩展点，core CLI 只内置 3 个（claude-code / openai / anthropic-api）
