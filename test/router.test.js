import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSkills, resolveAllSkillDeps, resolveSkillDeps, validateIndex } from '../src/lib/router.js';

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

test('matchSkills gives substring trigger hits a middle score', () => {
  const result = matchSkills('bill', sampleIndex);
  assert.equal(result.matches[0].name, 'invoice-review');
  assert.equal(result.matches[0].match_type, 'substring');
  assert.equal(result.matches[0].score, 0.6);
});

test('matchSkills enforces threshold and max domain load cap', () => {
  const result = matchSkills('expense receipt invoice', sampleIndex, { threshold: 0.5, max: 1 });
  assert.equal(result.matches.length, 1);
  assert.ok(result.matches.every((item) => item.score >= 0.5));
});

test('matchSkills excludes already loaded skills from matches and load list', () => {
  const result = matchSkills('expense receipt invoice', sampleIndex, { loadedSkills: ['invoice-review'] });
  assert.ok(result.matches.every((item) => item.name !== 'invoice-review'));
  assert.deepEqual(result.resolved_load_list, ['expense-report']);
});

test('matchSkills boosts same-domain candidates when loadedDomains are provided', () => {
  const index = {
    version: '1.0',
    generated_at: '2026-03-23T00:00:00.000Z',
    skill_count: 2,
    core: [],
    domains: {
      finance: [
        { name: 'finance-review', tier: 'domain', domain: 'finance', triggers: ['review work'], summary: 'Finance review', depends: [], priority: 'normal' },
      ],
      document: [
        { name: 'document-review', tier: 'domain', domain: 'document', triggers: ['review docs'], summary: 'Document review', depends: [], priority: 'normal' },
      ],
    },
    ungrouped: [],
  };

  const base = matchSkills('review', index, { threshold: 0.1 });
  const boosted = matchSkills('review', index, { threshold: 0.1, loadedDomains: ['finance'] });
  const baseFinance = base.matches.find((item) => item.name === 'finance-review');
  const boostedFinance = boosted.matches.find((item) => item.name === 'finance-review');

  assert.ok(boostedFinance.score > baseFinance.score);
  assert.equal(boosted.matches[0].name, 'finance-review');
});

test('resolveSkillDeps deduplicates already loaded skills', () => {
  const resolved = resolveSkillDeps('invoice-review', sampleIndex, ['pdf']);
  assert.deepEqual(resolved, ['invoice-review']);
});

test('resolveAllSkillDeps returns the full dependency map', () => {
  const graph = resolveAllSkillDeps(sampleIndex);
  assert.deepEqual(graph['invoice-review'], ['invoice-review', 'pdf']);
  assert.deepEqual(graph.pdf, ['pdf']);
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

test('validateIndex reports broken transitive dependency chains', () => {
  const validation = validateIndex({
    version: '1.0',
    generated_at: '2026-03-23T00:00:00.000Z',
    skill_count: 2,
    core: [],
    domains: {
      finance: [
        { name: 'invoice-review', tier: 'domain', domain: 'finance', triggers: ['invoice'], summary: 'Review invoices', depends: ['formatter'], priority: 'normal' },
        { name: 'formatter', tier: 'domain', domain: 'finance', triggers: ['format'], summary: 'Format invoice data', depends: ['pdf'], priority: 'normal' },
      ],
    },
    ungrouped: [],
  });

  assert.match(validation.warnings.join('\n'), /transitive dependency "pdf" required by invoice-review via formatter/i);
});
