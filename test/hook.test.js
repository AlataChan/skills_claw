import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCoreSkillsPayload,
  buildSkillContentPayload,
  emitHookConfig,
  estimateTokens,
  wrapHookPayload,
} from '../src/lib/hook.js';

const installedSkills = [
  {
    name: 'workflow',
    tier: 'core',
    body: 'Always plan, execute, and verify.',
    depends: [],
  },
  {
    name: 'invoice-review',
    tier: 'domain',
    body: 'Review invoice packets carefully.',
    depends: ['pdf'],
  },
  {
    name: 'pdf',
    tier: 'domain',
    body: 'Handle PDF operations.',
    depends: [],
  },
];

const index = {
  version: '1.0',
  generated_at: '2026-03-23T00:00:00.000Z',
  skill_count: 3,
  core: [{ name: 'workflow', tier: 'core', summary: 'Task lifecycle', triggers: [], depends: [], priority: 'normal' }],
  domains: {
    finance: [{ name: 'invoice-review', tier: 'domain', domain: 'finance', summary: 'Review invoices', triggers: ['invoice'], depends: ['pdf'], priority: 'normal' }],
    document: [{ name: 'pdf', tier: 'domain', domain: 'document', summary: 'PDF operations', triggers: ['.pdf'], depends: [], priority: 'normal' }],
  },
  ungrouped: [],
};

test('wrapHookPayload emits the standard envelope', () => {
  const payload = wrapHookPayload('routing_table', { core: [], domains: {}, ungrouped: [] }, { skill_count: 0 });
  assert.equal(payload.type, 'routing_table');
  assert.ok(payload.meta.generated_at);
  assert.equal(payload.meta.token_estimate, estimateTokens(JSON.stringify(payload.data)));
});

test('core payload returns concatenated core skill content', () => {
  const payload = buildCoreSkillsPayload(installedSkills);
  assert.equal(payload.type, 'core_skills');
  assert.equal(payload.data.skills.length, 1);
  assert.match(payload.data.combined_body, /Always plan/);
});

test('load payload expands dependencies when requested', () => {
  const payload = buildSkillContentPayload(index, installedSkills, 'invoice-review', { withDeps: true });
  assert.equal(payload.type, 'skill_content');
  assert.deepEqual(payload.data.skills.map((skill) => skill.name), ['invoice-review', 'pdf']);
  assert.match(payload.data.combined_body, /Handle PDF operations/);
});

test('emitHookConfig returns a claude-code hook config', () => {
  const config = emitHookConfig('claude-code');
  assert.ok(config.hooks.SessionStart);
  assert.ok(config.hooks.PreToolUse);
  assert.match(config.hooks.PreToolUse[0].hooks[0].command, /__USER_INPUT__/);
});
