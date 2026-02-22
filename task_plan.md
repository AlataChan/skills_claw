# Task Plan: SkillCLI — AI 能力的 npm（实施版）

**目标：** 基于 `docs/specs` 与 `docs/plans` 的设计文档，完成可执行实施拆解，并将全部设计项落实为可验证交付物（文档 + 验收脚本 + 阶段门禁记录）。

**设计文档输入：**
- `docs/specs/skillcli-architecture-overview.md`
- `docs/plans/2026-02-22-skillcli-design.md`

**执行策略：** 分 Phase 推进；每个 Phase 完成后必须通过对应 gate test，才允许进入下一阶段。

---

## Phase 执行与门禁

### Phase 0：Spec 冻结与差距归零
- [x] 核对两份设计文档的核心决策一致性（运行时策略 / registry / manifest B+）
- [x] 整理设计约束（明确排除 `permission_policy`、`flow_templates`）
- [x] 输出统一实施基线（本文件 + `progress.md`）
- **Gate Test：** `python3 scripts/phase_gate_check.py --phase 0`
- **Status：** completed

### Phase 1：Manifest 规范落地
- [x] 明确 `schema_version` 强制规则
- [x] 明确 `inputs` 类型与模板渲染约定
- [x] 明确 `skill.lock.json` 为安装态产物（不回写 repo）
- **Gate Test：** `python3 scripts/phase_gate_check.py --phase 1`
- **Status：** completed

### Phase 2：CLI 命令面与引用语法落地
- [x] 固化 `skill-ref` 语法（name/version、github、local path）
- [x] 固化 `install/update/emit/validate/doctor` 关键语义
- [x] 明确 `--input`、`--target`、`--dry-run`、`--json` 的自动化用途
- **Gate Test：** `python3 scripts/phase_gate_check.py --phase 2`
- **Status：** completed

### Phase 3：Registry 与多源策略落地
- [x] 完成 Hybrid registry 机制说明（公共 + 私有）
- [x] 明确 refresh/cache 的职责边界
- [x] 明确依赖图谱在 registry index 层承担发现职责
- **Gate Test：** `python3 scripts/phase_gate_check.py --phase 3`
- **Status：** completed

### Phase 4：Adapter 协议与可扩展性落地
- [x] 固化 subprocess + stdin/stdout JSON 协议
- [x] 固化核心 CLI 与 adapter 责任边界
- [x] 明确首批 adapter 目标（claude-code/openai/anthropic-api）
- **Gate Test：** `python3 scripts/phase_gate_check.py --phase 4`
- **Status：** completed

### Phase 5：验收与交付归档
- [x] 建立设计项覆盖率矩阵（100%）
- [x] 建立阶段门禁自动检查脚本
- [x] 记录执行日志与最终完成结论
- **Gate Test：** `python3 scripts/phase_gate_check.py --phase 5`
- **Status：** completed

---

## 验收定义（Done）

- [x] 所有 Phase 均为 completed
- [x] 所有 Gate Test 命令通过
- [x] 设计文档关键章节全部映射到实施项（覆盖率 100%）
- [x] 变更已提交 git（含提交说明）
- [x] CLI 原型代码与测试已落地
