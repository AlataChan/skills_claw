import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSkills, resolveSkillDeps, validateIndex } from '../src/lib/router.js';

const sampleIndex = {
  version: '1.0',
  generated_at: '2026-03-23T00:00:00.000Z',
  skill_count: 4,
  core: [{ name: 'workflow', tier: 'core', summary: 'Task lifecycle', triggers: [], depends: [], priority: 'normal' }],
  domains: {
    finance: [
      { name: 'invoice-review', tier: 'domain', domain: 'finance', triggers: ['invoice', 'billing'], summary: 'Review invoices', depends: ['pdf'], priority: 'normal' },
      { name: 'expense-report', tier: 'domain', domain: 'finance', triggers: ['expense', 'receipt'], summary: 'Process expenses', depends: [], priority: 'normal' },
    ],
    document: [
      { name: 'pdf', tier: 'domain', domain: 'document', triggers: ['.pdf', 'merge'], summary: 'PDF operations', depends: [], priority: 'normal' },
    ],
  },
  ungrouped: [],
};

const cyclicIndex = {
  version: '1.0',
  generated_at: '2026-03-23T00:00:00.000Z',
  skill_count: 2,
  core: [],
  domains: {
    misc: [
      { name: 'a', tier: 'domain', domain: 'misc', triggers: [], summary: 'Skill A', depends: ['b'], priority: 'normal' },
      { name: 'b', tier: 'domain', domain: 'misc', triggers: ['b'], summary: 'Skill B', depends: ['a'], priority: 'normal' },
    ],
  },
  ungrouped: [],
};

test('matchSkills prefers exact trigger hits and expands dependencies', () => {
  const result = matchSkills('review the invoice package', sampleIndex);
  assert.equal(result.matches[0].name, 'invoice-review');
  assert.deepEqual(result.resolved_load_list, ['invoice-review', 'pdf']);
  assert.equal(result.matches[0].load, true);
  assert.ok(result.context_cost_estimate.total_tokens > 0);
});

test('matchSkills enforces threshold and max domain load cap', () => {
  const result = matchSkills('expense receipt invoice', sampleIndex, { threshold: 0.5, max: 1 });
  assert.equal(result.matches.length, 1);
  assert.ok(result.matches.every((item) => item.score >= 0.5));
});

test('resolveSkillDeps deduplicates already loaded skills', () => {
  const resolved = resolveSkillDeps('invoice-review', sampleIndex, ['pdf']);
  assert.deepEqual(resolved, ['invoice-review']);
});

test('validateIndex reports missing triggers and dependency cycles', () => {
  const validation = validateIndex(cyclicIndex);
  assert.match(validation.warnings.join('\n'), /circular/i);
  assert.match(validation.warnings.join('\n'), /no triggers defined/i);
});

test('validateIndex reports unknown dependencies', () => {
  const validation = validateIndex({
    ...sampleIndex,
    domains: {
      ...sampleIndex.domains,
      finance: [
        { ...sampleIndex.domains.finance[0], depends: ['missing-skill'] },
        sampleIndex.domains.finance[1],
      ],
    },
  });

  assert.match(validation.warnings.join('\n'), /unknown dependency "missing-skill" in invoice-review/i);
});
