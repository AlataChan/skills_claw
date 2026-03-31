# CLI-First Architecture Alignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor `skills_claw` from a manifest-distribution prototype into a CLI-first skill runtime that matches [`docs/cli-first-agent-architecture.md`](/Users/apple/Documents/2.1%20AI%20Journey/Cursor_projects/skills_claw/docs/cli-first-agent-architecture.md): frontmatter-routed skills, core/domain lazy loading, dependency-aware index commands, and hook-facing JSON interfaces.

**Architecture:** Make `skill.md` the canonical installed artifact and routing source of truth. Accept legacy `skill.yaml` and `SKILL.md` as compatibility inputs, but normalize every installed skill into markdown frontmatter + body, then derive `~/.skillcli/index.json` from installed `skill.md` files only. The CLI remains the stable command surface; hooks consume `skill index ... --json` outputs, and runtime concerns stay in `src/lib/*`.

**Tech Stack:** Node.js 18+, ESM CLI, file-based store under `~/.skillcli`, Markdown frontmatter parser, built-in `node:test`.

---

## Non-Negotiable Decisions

- Canonical filename on disk is `skill.md`. `SKILL.md` and `skill.yaml` are accepted only as import aliases.
- Frontmatter is the routing truth. `index.json` is always derived and never hand-edited.
- `summary` is the routing-table field. `description` remains human-facing metadata and does not participate in the compact routing table.
- Legacy `skill.yaml` stays installable, but legacy skills are non-routable until they gain explicit v2 routing fields.
- The normalized runtime shape is the only shape the CLI should use after Task 1. Avoid long-term coexistence of “raw manifest API” and “normalized skill API”.
- Hook JSON uses a stable envelope: `{ type, data, meta }`.
- `meta.token_estimate` uses one rough formula everywhere: `Math.ceil(serialized_text.length / 4)`.
- This plan intentionally changes the earlier draft module layout: `frontmatter.js` is introduced, and the responsibilities previously imagined as `matcher.js` + `depgraph.js` are merged into `router.js`.
- This plan supersedes [`docs/plans/2026-03-23-skill-index-design.md`](/Users/apple/Documents/2.1%20AI%20Journey/Cursor_projects/skills_claw/docs/plans/2026-03-23-skill-index-design.md) wherever that draft still treats `skill.yaml` as the long-term source of truth.

## Test Harness Rules

- Every filesystem test must run under a temporary `SKILLCLI_HOME`, never the developer’s real `~/.skillcli`.
- Add a shared test helper, for example `test/helpers/skillcli-home.js`, to create and clean temporary homes.
- Tests that depend on `BASE_DIR`/`SKILLS_DIR` constants must import the module after `SKILLCLI_HOME` is set, or load the module in a fresh subprocess.
- Prefer fixture-style tests over reading the real local skill store.

Example harness:

```js
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function withTempSkillcliHome(run) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'skillcli-test-'));
  const prev = process.env.SKILLCLI_HOME;
  process.env.SKILLCLI_HOME = home;
  try {
    await run(home);
  } finally {
    if (prev === undefined) delete process.env.SKILLCLI_HOME;
    else process.env.SKILLCLI_HOME = prev;
    await fs.rm(home, { recursive: true, force: true });
  }
}
```

## Legacy Conversion Rules

- `skill.md` / `SKILL.md`
  - Frontmatter stays frontmatter.
  - Markdown body stays body.
  - When the source filename is `SKILL.md`, the installed artifact is still written as lowercase `skill.md`.
- `skill.yaml`
  - `system_prompt` becomes markdown body.
  - `name`, `version`, `description`, `capabilities`, `mcp_deps`, `inputs` are preserved in frontmatter.
  - `tier` defaults to `domain`.
  - `domain` defaults to `null`.
  - `triggers` defaults to `[]`.
  - `depends` defaults to `[]`.
  - `priority` defaults to `normal`.
  - `summary` defaults to `''`.
  - `schema_version` is preserved in frontmatter for compatibility, but routing logic ignores it.
- Legacy skills with empty `summary` and empty `triggers` are visible in `skill index show`, but not routable via `skill index match`.

Recommended frontmatter parser shape:

```js
function parseMarkdownFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error('no frontmatter found');
  return {
    meta: parseSimpleYaml(match[1]),
    body: match[2].trim(),
  };
}
```

---

### Task 1: Canonical Skill Document Model

**Files:**
- Create: `src/lib/frontmatter.js`
- Create: `test/helpers/skillcli-home.js`
- Create: `test/frontmatter.test.js`
- Create: `test/cli-init.test.js`
- Modify: `src/lib/manifest.js`
- Modify: `src/lib/ref.js`
- Modify: `src/lib/store.js`
- Modify: `src/cli.js`
- Modify: `README.md`
- Modify: `test/manifest.test.js`

**Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSkillSpec, serializeSkillSpec } from '../src/lib/frontmatter.js';

test('loadSkillSpec parses markdown frontmatter and body', async () => {
  const spec = await loadSkillSpec('skill.md', `---
name: invoice-review
version: 1.2.0
tier: domain
domain: finance
triggers: [invoice, billing]
summary: Review invoice packets
depends: [pdf]
priority: normal
description: Invoice review skill
capabilities: [read-file]
mcp_deps: []
inputs: []
---
# Invoice Review

Review invoices carefully.
`);
  assert.equal(spec.name, 'invoice-review');
  assert.equal(spec.summary, 'Review invoice packets');
  assert.deepEqual(spec.triggers, ['invoice', 'billing']);
  assert.match(spec.body, /Review invoices carefully/);
});

test('loadSkillSpec normalizes legacy skill.yaml into non-routable runtime data', async () => {
  const spec = await loadSkillSpec('skill.yaml', `schema_version: "1.0"\nname: legacy\nversion: 0.1.0\ndescription: "Legacy"\nsystem_prompt: |\n  hello\ncapabilities:\n  - read-file\nmcp_deps: []\ninputs: []\n`);
  assert.equal(spec.name, 'legacy');
  assert.equal(spec.body, 'hello');
  assert.equal(spec.tier, 'domain');
  assert.equal(spec.summary, '');
  assert.deepEqual(spec.triggers, []);
});

test('serializeSkillSpec converts legacy runtime data to canonical skill.md text', () => {
  const text = serializeSkillSpec({
    schema_version: '1.0',
    name: 'legacy',
    version: '0.1.0',
    description: 'Legacy',
    tier: 'domain',
    domain: null,
    triggers: [],
    summary: '',
    depends: [],
    priority: 'normal',
    capabilities: ['read-file'],
    mcp_deps: [],
    inputs: [],
    body: 'hello',
  });
  assert.match(text, /^---\n/);
  assert.match(text, /name: legacy/);
  assert.match(text, /\n---\nhello\n?$/);
});
```

Also add a CLI behavior test:

```js
test('skill init creates skill.md', async () => {
  // run CLI in temp cwd/home
  // assert skill.md exists and skill.yaml does not
});
```

**Step 2: Run test to verify it fails**

Run: `node --test test/frontmatter.test.js test/cli-init.test.js test/manifest.test.js`
Expected: FAIL with missing `src/lib/frontmatter.js`, no markdown serialization, and `skill init` still creating `skill.yaml`.

**Step 3: Write minimal implementation**

```js
// src/lib/frontmatter.js
import fs from 'node:fs/promises';
import { parseSimpleYaml } from './manifest.js';

export async function loadSkillSpec(file, inlineText) {
  const text = inlineText ?? await fs.readFile(file, 'utf-8');
  if (file.endsWith('.md')) return normalizeMarkdownSkill(parseMarkdownFrontmatter(text));
  if (file.endsWith('.yaml') || file.endsWith('.yml')) return normalizeLegacySkill(parseSimpleYaml(text));
  if (file.endsWith('.json')) return JSON.parse(text);
  throw new Error(`unsupported skill file: ${file}`);
}
```

- Implement a tiny markdown frontmatter splitter in `src/lib/frontmatter.js`.
- Add `serializeSkillSpec(spec)` to generate canonical `skill.md` text.
- Move all installed-file write-path changes into this task:
  - `skill init` scaffolds `skill.md`
  - installed skills are stored as `~/.skillcli/skills/<name>/skill.md`
  - legacy YAML imports are converted to markdown-frontmatter text before saving
- Normalize every loaded skill into one runtime shape: routing metadata (`tier`, `domain`, `triggers`, `summary`, `depends`, `priority`), descriptive metadata (`name`, `version`, `description`), execution metadata (`capabilities`, `mcp_deps`, `inputs`), compatibility metadata (`schema_version`), and `body`.
- Migrate all CLI load paths to the normalized API in this task:
  - `validate`
  - `install` via `loadFromRef()`
  - `check-deps`
- `emit`
- any helper that currently calls `loadManifest()`
- Keep `parseSimpleYaml()` in [`src/lib/manifest.js`](/Users/apple/Documents/2.1%20AI%20Journey/Cursor_projects/skills_claw/src/lib/manifest.js), but stop using `loadManifest()` as the long-term CLI entrypoint.
- Update `validateManifest()` or introduce `validateSkillSpec()` so validation runs against the normalized shape: `body` instead of `system_prompt`, relaxed `schema_version` for native `skill.md`, and type checks for `tier` / `triggers` / `summary` / `priority`.
- Option A: remove `loadManifest()` entirely after migrating all call sites.
- Option B: keep `loadManifest()` as a thin wrapper around `loadSkillSpec()` for backward compatibility, but do not let the CLI mix raw-manifest and normalized-skill APIs.
- Update `parseSkillRef()` to treat bare `.md` paths such as `skill.md` as local refs in addition to `./skill.md`.

**Step 4: Run test to verify it passes**

Run: `node --test test/frontmatter.test.js test/cli-init.test.js test/manifest.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add test/helpers/skillcli-home.js test/frontmatter.test.js test/cli-init.test.js test/manifest.test.js src/lib/frontmatter.js src/lib/manifest.js src/lib/ref.js src/lib/store.js src/cli.js README.md
git commit -m "feat: make markdown skill files the canonical runtime format"
```

### Task 2: Build the Derived Skill Index

**Files:**
- Create: `src/lib/index.js`
- Create: `test/index.test.js`
- Modify: `src/lib/fsutil.js`
- Modify: `src/lib/store.js`
- Modify: `src/cli.js`

**Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { withTempSkillcliHome } from './helpers/skillcli-home.js';

test('rebuildIndex is deterministic under temp SKILLCLI_HOME', async () => {
  await withTempSkillcliHome(async () => {
    const { rebuildIndex } = await import('../src/lib/index.js');
    const index = await rebuildIndex();
    assert.equal(index.skill_count, 0);
    assert.deepEqual(index.core, []);
    assert.deepEqual(index.domains, {});
  });
});

test('rebuildIndex groups core and domain skills from installed skill.md files', async () => {
  await withTempSkillcliHome(async (home) => {
    // write two installed skill.md files by fixture
    const { rebuildIndex } = await import('../src/lib/index.js');
    const index = await rebuildIndex();
    assert.equal(index.skill_count, 2);
    assert.equal(index.core[0].name, 'workflow');
    assert.equal(index.domains.finance[0].summary, 'Review invoices');
  });
});

test('index entries use summary, not description, as routing text', async () => {
  // assert compact index row contains summary and not long description
});
```

**Step 2: Run test to verify it fails**

Run: `node --test test/index.test.js`
Expected: FAIL with missing `src/lib/index.js`.

**Step 3: Write minimal implementation**

```js
// src/lib/index.js
import { INDEX_PATH, writeJson } from './fsutil.js';
import { listInstalledSkillSpecs } from './store.js';

export async function rebuildIndex() {
  const specs = await listInstalledSkillSpecs();
  const index = {
    version: '1.0',
    generated_at: new Date().toISOString(),
    skill_count: specs.length,
    core: [],
    domains: {},
    ungrouped: [],
  };
  await writeJson(INDEX_PATH, index);
  return index;
}
```

- Add `INDEX_PATH = path.join(BASE_DIR, 'index.json')` in [`src/lib/fsutil.js`](/Users/apple/Documents/2.1%20AI%20Journey/Cursor_projects/skills_claw/src/lib/fsutil.js).
- Add `listInstalledSkillSpecs()` in [`src/lib/store.js`](/Users/apple/Documents/2.1%20AI%20Journey/Cursor_projects/skills_claw/src/lib/store.js) to read installed `skill.md` files and normalize them through `loadSkillSpec()`.
- Populate `core`, `domains`, and `ungrouped` from installed skill frontmatter.
- Persist only compact routing fields in `index.json`: `name`, `version`, `tier`, `domain`, `summary`, `triggers`, `depends`, `priority`.
- Do not persist full `description` or markdown `body` into the compact routing table.
- Add `skill index rebuild` and `skill index show [--json]`.
- Automatically call `rebuildIndex()` after `install`, `uninstall`, and successful `update`.

**Step 4: Run test to verify it passes**

Run: `node --test test/index.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add test/index.test.js src/lib/index.js src/lib/fsutil.js src/lib/store.js src/cli.js
git commit -m "feat: add derived skill index and rebuild lifecycle"
```

### Task 3: Add Matching, Dependency Resolution, and Index Validation

**Files:**
- Create: `src/lib/router.js`
- Create: `test/router.test.js`
- Modify: `src/lib/index.js`
- Modify: `src/cli.js`

**Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSkills, resolveSkillDeps, validateIndex } from '../src/lib/router.js';

test('matchSkills prefers exact trigger hits and expands dependencies', () => {
  const index = {
    core: [{ name: 'workflow', tier: 'core' }],
    domains: {
      finance: [{ name: 'invoice-review', triggers: ['invoice'], depends: ['pdf'], priority: 'normal', domain: 'finance', summary: 'Review invoices' }],
      document: [{ name: 'pdf', triggers: ['pdf'], depends: [], priority: 'normal', domain: 'document', summary: 'PDF operations' }],
    },
    ungrouped: [],
  };
  const result = matchSkills('review the invoice package', index);
  assert.equal(result.matches[0].name, 'invoice-review');
  assert.deepEqual(result.resolved_load_list, ['invoice-review', 'pdf']);
});

test('matchSkills enforces threshold and max domain load cap', () => {
  // sampleIndex defined as a test fixture above
  const result = matchSkills('report', sampleIndex, { threshold: 0.5, max: 1 });
  assert.equal(result.matches.length, 1);
  assert.ok(result.matches.every((item) => item.score >= 0.5));
});

test('validateIndex reports missing triggers and dependency cycles', () => {
  // cyclicIndex defined as a test fixture above
  const validation = validateIndex(cyclicIndex);
  assert.match(validation.warnings.join('\n'), /circular/i);
  assert.match(validation.warnings.join('\n'), /no triggers defined/i);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test test/router.test.js`
Expected: FAIL with missing router module and commands.

**Step 3: Write minimal implementation**

```js
// src/lib/router.js
export function matchSkills(query, index, opts = {}) {
  const candidates = flattenDomainSkills(index).map((skill) => scoreSkill(query, skill));
  return finalizeMatches(candidates, index, opts);
}
```

- Implement trigger scoring with exact phrase, substring, and token-overlap rules from the target architecture.
- Add `resolveSkillDeps()` with cycle protection and warning collection.
- Add `validateIndex()` to report:
  - invalid `tier`
  - missing `summary`
  - missing `triggers` for `tier: domain`
  - unknown `depends`
  - circular dependency warnings
- Implement the anti-noise rules explicitly, not just as CLI flags:
  - load cap: default max 5 domain skills
  - threshold: default 0.5
  - core skills do not participate in matching
  - deduplicate already loaded skills
- Add CLI commands:
  - `skill index match "<query>" [--json] [--threshold 0.5] [--max 5]`
  - `skill index deps <name> [--all]`
  - `skill index validate`

**Step 4: Run test to verify it passes**

Run: `node --test test/router.test.js test/index.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add test/router.test.js src/lib/router.js src/lib/index.js src/cli.js
git commit -m "feat: add skill routing, deps resolution, and index validation"
```

### Task 4: Expose Hook-Facing JSON Contracts

**Files:**
- Create: `src/lib/hook.js`
- Create: `test/hook.test.js`
- Modify: `src/lib/index.js`
- Modify: `src/lib/adapter.js`
- Modify: `src/cli.js`

**Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokens, wrapHookPayload } from '../src/lib/hook.js';

test('wrapHookPayload emits the standard envelope', () => {
  const payload = wrapHookPayload('routing_table', { core: [], domains: {}, ungrouped: [] }, { skill_count: 0 });
  assert.equal(payload.type, 'routing_table');
  assert.ok(payload.meta.generated_at);
  assert.equal(payload.meta.token_estimate, estimateTokens(JSON.stringify(payload.data)));
});

test('core payload returns concatenated core skill content', async () => {
  assert.fail('write failing assertions for core payload');
});

test('load payload expands dependencies when requested', async () => {
  assert.fail('write failing assertions for load payload');
});
```

**Step 2: Run test to verify it fails**

Run: `node --test test/hook.test.js`
Expected: FAIL with missing hook helpers.

**Step 3: Write minimal implementation**

```js
// src/lib/hook.js
export function estimateTokens(serializedText) {
  return Math.ceil(serializedText.length / 4);
}

export function wrapHookPayload(type, data, meta = {}) {
  return {
    type,
    data,
    meta: {
      generated_at: new Date().toISOString(),
      token_estimate: estimateTokens(JSON.stringify(data)),
      ...meta,
    },
  };
}
```

- Add `skill index core --json` to emit aggregated core skill bodies.
- Add `skill index load <name> --json [--with-deps]` to emit one skill plus resolved dependencies.
- Add `skill index show --json` and `skill index match --json` to return the same envelope format.
- Add `skill index emit-hook --target claude-code --out <dir>` to write an example hook config that calls the JSON endpoints above.
- Keep [`src/lib/adapter.js`](/Users/apple/Documents/2.1%20AI%20Journey/Cursor_projects/skills_claw/src/lib/adapter.js) focused on platform formatting, but stop treating adapter emission as the only runtime integration path.

**Step 4: Run test to verify it passes**

Run: `node --test test/hook.test.js test/router.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add test/hook.test.js src/lib/hook.js src/lib/index.js src/lib/adapter.js src/cli.js
git commit -m "feat: add hook-facing json contracts for core, load, and match"
```

### Task 5: Upgrade Install and Source Resolution for the New Model

**Files:**
- Create: `test/ref.test.js`
- Create: `test/install.test.js`
- Modify: `src/cli.js`
- Modify: `src/lib/ref.js`
- Modify: `src/lib/registry.js`

**Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSkillRef } from '../src/lib/ref.js';

test('parseSkillRef treats bare skill.md as a local ref', () => {
  assert.equal(parseSkillRef('skill.md').type, 'local');
});

test('remote fetch prefers skill.md then SKILL.md then skill.yaml', async () => {
  // mock fetch sequence
  // assert first successful candidate wins in that order
});

test('install --with-deps installs missing skill dependencies from registry when available', async () => {
  // fixture registry + install target with depends: [pdf]
  // assert both target and dependency are installed
});
```

**Step 2: Run test to verify it fails**

Run: `node --test test/ref.test.js test/install.test.js`
Expected: FAIL because bare markdown local refs, markdown-first remote resolution, and dependency auto-install are not supported.

**Step 3: Write minimal implementation**

```js
// src/cli.js
async function fetchRemoteSkill(repo, hash) {
  const candidates = ['skill.md', 'SKILL.md', 'skill.yaml'];
  for (const file of candidates) {
    const url = `https://raw.githubusercontent.com/${repo}/${hash}/${file}`;
    const res = await fetch(url);
    if (res.ok) return { url, text: await res.text(), filename: file };
  }
  throw new Error(`no supported skill file found for ${repo}@${hash}`);
}
```

- Resolve GitHub and registry assets in this order: `skill.md`, `SKILL.md`, then legacy `skill.yaml`.
- Allow registry entries to expose `skill_url` in addition to current `manifest_url`.
- Add `skill install --with-deps` so missing skill dependencies can be auto-installed from configured sources when possible.
- Do not re-open the store write-path here. Task 1 already made `skill.md` the installed artifact; Task 5 is read-path and dependency-resolution work only.

**Step 4: Run test to verify it passes**

Run: `node --test test/ref.test.js test/install.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add test/ref.test.js test/install.test.js src/lib/ref.js src/lib/registry.js src/cli.js
git commit -m "feat: support markdown-first install sources and dependency install"
```

---

## Post-Implementation Notes (2026-03-31)

> 以下记录计划与实际实现之间的差异，供未来维护参考。

### 模块差异

| 计划描述 | 实际实现 | 说明 |
|---------|---------|------|
| 未提及 `src/lib/source.js` | 新建 `source.js`（29 行） | 提取 remote fetching 为独立模块：`fetchUrlSkill()` + `fetchRemoteSkill()`，支持 fetch 依赖注入便于测试 |
| `listInstalledSkillSpecs()` 简单读取 | 使用 dynamic import + `?t=${Date.now()}` cache-busting | Node.js ESM 模块缓存要求每次 import 用唯一 query param，否则 `loadSkillSpec` 在同一进程中返回缓存结果 |
| Test helper 仅有 `withTempSkillcliHome()` | 额外增加 `writeFixtureSkill(home, spec)` | 测试中频繁需要写入 fixture skill.md，提取为共享 helper 减少重复 |

### 匹配算法差异（相对于 skill-index-design.md 的设计）

| 设计稿描述 | 实际实现 | 影响 |
|-----------|---------|------|
| 三级匹配：exact (1.0) + partial (0.6) + token overlap (0.3) | 两级：exact (1.0) + token overlap (0.3) | 中间的 substring tier 缺失，`"bill"` 无法匹配到 `"billing"` |
| domain coherence boost (score × 1.1) | 未实现 | `matchSkills()` 无 `loaded` 参数，无法感知已加载 skill 的 domain |
| 中文 2-gram/3-gram 滑动窗口 | 简单字符级分割 | 对短 trigger（"发票"、"账单"）足够，长短语匹配精度略低 |
| session 级 dedup（已加载 skill 不重复加载） | 未实现（CLI 无状态） | dedup 责任留给 hook 消费方 |

### 验证差异

| 计划描述 | 实际实现 | 说明 |
|---------|---------|------|
| `validateIndex()` 检查直接依赖完整性 | 仅检查直接 deps | 传递依赖（A→B→C，C 缺失）不会被检测到 |

### 架构纸中声明但未实现的能力

| 架构文档章节 | 状态 | 说明 |
|-------------|------|------|
| §4.5 Step 9 — post-action hook 日志反馈 | 未实现 | 无 telemetry/feedback 机制 |
| §4.8 — drift detection（body 变了但 triggers 没更新） | 未实现 | `validateIndex()` 不检测内容漂移 |
| Appendix A — `platform: string[]` 字段 | 未实现 | frontmatter schema 中未包含 |
| Appendix A — `updated: date` 字段 | 未实现 | frontmatter schema 中未包含 |
| §8.1 — agent-agnostic skill format | 部分实现 | adapter.js 支持多平台 emit，但 frontmatter 无 platform 字段 |

### 待改进项（已识别，未排期）

1. **补回 substring (0.6) 匹配层** — router.js 中 trigger 子串包含应获得中间分数
2. **domain coherence boost** — `matchSkills()` 增加 `loaded` 参数支持 domain 加分
3. **transitive dependency validation** — `validateIndex()` 递归检查完整依赖链
4. **`--exclude` flag** — `skill index match` 支持排除已加载 skill
5. **CJK token 估算优化** — `estimateTokens()` 区分 CJK 字符（~1.5 tokens）和 ASCII（~0.25 tokens）
6. **Registry cache TTL** — 当前缓存无失效机制

---

### Task 6: Update Docs and Acceptance Coverage

**Files:**
- Modify: `README.md`
- Modify: `docs/specs/skillcli-architecture-overview.md`
- Modify: `docs/plans/2026-03-23-skill-index-design.md`
- Modify: `test/*.test.js`

**Step 1: Write the acceptance checklist**

```md
- `skill init` writes `skill.md`
- `skill install ./skill.md` stores canonical markdown skill + lock + rebuilt index
- `skill install ./legacy-skill.yaml` stores canonical markdown skill + lock + rebuilt index
- `skill index show --json` returns the routing table envelope
- `skill index match "invoice review"` returns load list with dependencies
- `skill index core --json` and `skill index load <name> --json` are hook-consumable
- filesystem tests do not touch the real `~/.skillcli`
```

**Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS, with frontmatter/index/router/hook/install/init tests included.

**Step 3: Update the docs**

- Rewrite [`README.md`](/Users/apple/Documents/2.1%20AI%20Journey/Cursor_projects/skills_claw/README.md) so the public command list includes the `skill index` family and markdown-first examples.
- Update [`docs/specs/skillcli-architecture-overview.md`](/Users/apple/Documents/2.1%20AI%20Journey/Cursor_projects/skills_claw/docs/specs/skillcli-architecture-overview.md) to reflect the new canonical artifact and deprecate `skill.yaml` as the primary model.
- Update [`docs/plans/2026-03-23-skill-index-design.md`](/Users/apple/Documents/2.1%20AI%20Journey/Cursor_projects/skills_claw/docs/plans/2026-03-23-skill-index-design.md) so it no longer contradicts the CLI-first architecture document on:
  - canonical `skill.md` storage
  - `summary` as routing-table text
  - `frontmatter.js` parser module
  - `router.js` owning both matching and dependency graph logic

**Step 4: Verify the manual CLI flows**

Run: `node src/cli.js init demo-skill`
Expected: creates `skill.md`

Run: `node src/cli.js validate ./skill.md`
Expected: JSON result with `ok: true`

Run: `node src/cli.js install ./skill.md`
Expected: installs skill and rebuilds `~/.skillcli/index.json`

Run: `node src/cli.js install ./legacy-skill.yaml`
Expected: installs canonical `skill.md` and rebuilds `~/.skillcli/index.json`

Run: `node src/cli.js index show --json`
Expected: routing table envelope

Run: `node src/cli.js index match "invoice review" --json`
Expected: `matches` sorted by score and `resolved_load_list`

**Step 5: Commit**

```bash
git add README.md docs/specs/skillcli-architecture-overview.md docs/plans/2026-03-23-skill-index-design.md test
git commit -m "docs: align public docs with cli-first runtime architecture"
```
