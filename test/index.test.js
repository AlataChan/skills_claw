import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { withTempSkillcliHome, writeInstalledSkill } from './helpers/skillcli-home.js';

test('rebuildIndex is deterministic under temp SKILLCLI_HOME', async () => {
  await withTempSkillcliHome(async (home) => {
    const { rebuildIndex } = await import(`../src/lib/index.js?empty=${Date.now()}`);
    const index = await rebuildIndex();

    assert.equal(index.skill_count, 0);
    assert.deepEqual(index.core, []);
    assert.deepEqual(index.domains, {});
    assert.deepEqual(index.ungrouped, []);

    const saved = JSON.parse(await fs.readFile(path.join(home, 'index.json'), 'utf-8'));
    assert.equal(saved.skill_count, 0);
  });
});

test('rebuildIndex groups core and domain skills from installed skill.md files', async () => {
  await withTempSkillcliHome(async (home) => {
    await writeInstalledSkill(home, 'workflow', `---
name: workflow
version: 1.0.0
description: "Workflow skill"
tier: core
triggers: []
summary: "Task lifecycle"
depends: []
priority: normal
capabilities: []
mcp_deps: []
inputs: []
---
Always plan, execute, verify.
`);
    await writeInstalledSkill(home, 'invoice-review', `---
name: invoice-review
version: 1.2.0
description: "Long description that should not be used in the compact routing table"
tier: domain
domain: finance
triggers: [invoice, billing]
summary: "Review invoices"
depends: [pdf]
priority: normal
capabilities: ["read-file"]
mcp_deps: []
inputs: []
---
Review invoice packets carefully.
`);

    const { rebuildIndex } = await import(`../src/lib/index.js?grouped=${Date.now()}`);
    const index = await rebuildIndex();

    assert.equal(index.skill_count, 2);
    assert.equal(index.core[0].name, 'workflow');
    assert.equal(index.core[0].summary, 'Task lifecycle');
    assert.equal(index.domains.finance[0].name, 'invoice-review');
    assert.equal(index.domains.finance[0].summary, 'Review invoices');
    assert.deepEqual(index.domains.finance[0].triggers, ['invoice', 'billing']);
    assert.deepEqual(index.domains.finance[0].depends, ['pdf']);
  });
});

test('index entries use summary and exclude description/body from compact rows', async () => {
  await withTempSkillcliHome(async (home) => {
    await writeInstalledSkill(home, 'pdf', `---
name: pdf
version: 1.0.0
description: "A very long human-facing description"
tier: domain
domain: document
triggers: [.pdf, merge]
summary: "PDF operations"
depends: []
priority: normal
capabilities: []
mcp_deps: []
inputs: []
---
Full skill body that should not land in index.json.
`);

    const { rebuildIndex } = await import(`../src/lib/index.js?compact=${Date.now()}`);
    const index = await rebuildIndex();
    const row = index.domains.document[0];

    assert.equal(row.summary, 'PDF operations');
    assert.equal('description' in row, false);
    assert.equal('body' in row, false);
  });
});
