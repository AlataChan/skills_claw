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
  assert.equal(spec.body, '# Invoice Review\n\nReview invoices carefully.');
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
    name: 'legacy:skill',
    version: '2026:03:23',
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
  assert.match(text, /name: "legacy:skill"/);
  assert.match(text, /version: "2026:03:23"/);
  assert.match(text, /\n---\nhello\n?$/);
});
