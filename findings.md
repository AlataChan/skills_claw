# Findings & Decisions — SkillCLI（实施收敛版）

**项目：** SkillCLI（AI 能力的 npm）
**状态：** 设计实施完成（100%）

---

## 设计输入（来源）
- `docs/specs/skillcli-architecture-overview.md`
- `docs/plans/2026-02-22-skillcli-design.md`

---

## 最终落地结论

1. **双形态 Skill 模型已收敛**：Manifest（`skill.yaml`）与 Workflow（`skill.json`）并行，不混层。
2. **Manifest B+ 已锁定**：`system_prompt + capabilities + mcp_deps + inputs`，并强制 `schema_version`。
3. **安装态与作者态分离**：`verified/source/resolved` 等信息不进入 `skill.yaml`，安装时写入 `skill.lock.json`。
4. **Registry 采用 Hybrid**：GitHub 承载内容，`registry.json` 承担发现和依赖索引。
5. **Adapter 采用子进程协议**：核心 CLI 不内嵌 runtime 细节，降低维护耦合。
6. **阶段门禁机制已建立**：每个 phase 对应可执行测试命令并已全部通过。

---

## 100% 覆盖矩阵（设计 -> 实施）

| 设计主题 | 实施状态 | 证据 |
|---|---|---|
| Universal Spec 策略 | 完成 | `task_plan.md` Phase 0/4 |
| Hybrid Registry | 完成 | `task_plan.md` Phase 3 |
| Manifest B+ | 完成 | `task_plan.md` Phase 1 |
| CLI 命令集语义 | 完成 | `task_plan.md` Phase 2 |
| Adapter 协议 | 完成 | `task_plan.md` Phase 4 |
| 端到端验收机制 | 完成 | `task_plan.md` Phase 5 + `scripts/phase_gate_check.py` |

---

## 风险与后续建议

- 当前仓库没有实际可执行 CLI 源码，已完成的是“设计实施与验证框架”。
- 下一步可在同一 Phase 框架下直接接入 TypeScript CLI 工程，实现代码级 `init/install/emit/validate`。


## 代码实施结果

- 已创建可运行 `skill` CLI 原型，覆盖 manifest 校验、registry/source、安装生命周期、adapter emit、doctor/evolve/publish 基础命令。
- 已实现 `skill-ref` 三种解析（registry/github/local）与 `skill.lock.json` 安装态写入。
- 已补充 `node --test` 单元测试，验证 manifest 解析校验与引用语法。
