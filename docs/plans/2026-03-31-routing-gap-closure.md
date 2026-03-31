# Routing Gap Closure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the remaining routing and dependency gaps between the current CLI-first runtime and the intended design without reopening the finished markdown-first refactor.

**Architecture:** Keep the existing `skill.md`-based runtime, index, and hook payload contracts intact. Limit changes to `router.js`, `cli.js`, and focused tests so matching gains the missing scoring/dedup behaviors, index validation checks dependency chains more thoroughly, and CLI dependency inspection supports the missing aggregate view.

**Tech Stack:** Node.js 18+, ESM CLI, built-in `node:test`, file-based `~/.skillcli` store.

---

### Task 1: Improve Match Scoring And Loaded-Skill Handling

**Files:**
- Modify: `src/lib/router.js`
- Modify: `src/cli.js`
- Test: `test/router.test.js`
- Test: `test/cli-index.test.js`

**Step 1: Write the failing tests**

```js
test('matchSkills gives substring trigger hits a middle score', () => {
  const result = matchSkills('handle bill review', sampleIndex, { threshold: 0.5 });
  assert.equal(result.matches[0].name, 'invoice-review');
  assert.equal(result.matches[0].match_type, 'substring');
});

test('matchSkills excludes loaded skills and boosts same-domain candidates', () => {
  const result = matchSkills('invoice receipt', sampleIndex, {
    threshold: 0.2,
    loadedSkills: ['invoice-review'],
    loadedDomains: ['finance'],
  });
  assert.equal(result.matches[0].name, 'expense-report');
  assert.ok(result.matches.every((item) => item.name !== 'invoice-review'));
});
```

**Step 2: Run test to verify it fails**

Run: `node --test test/router.test.js test/cli-index.test.js`
Expected: FAIL because substring scoring, loaded-skill exclusion, and domain coherence are not implemented.

**Step 3: Write minimal implementation**

```js
if (normalizedTrigger.includes(normalizedQuery) || normalizedQuery.includes(normalizedTrigger)) {
  score = Math.max(score, 0.6);
  matchType = 'substring';
}
```

- Add a substring scoring tier between exact and token-overlap matching.
- Treat `loadedSkills` as already-loaded domain skills that should not be returned or re-added to the load list.
- Add `loadedDomains` support so same-domain candidates get a small coherence boost.
- Add CLI flags for the hook-facing path:
  - `skill index match "<query>" --exclude a,b`
  - `skill index match "<query>" --loaded-domains finance,document`

**Step 4: Run test to verify it passes**

Run: `node --test test/router.test.js test/cli-index.test.js`
Expected: PASS.

### Task 2: Strengthen Dependency Validation And Inspection

**Files:**
- Modify: `src/lib/router.js`
- Modify: `src/cli.js`
- Test: `test/router.test.js`

**Step 1: Write the failing tests**

```js
test('validateIndex reports missing transitive dependencies', () => {
  const validation = validateIndex(indexWithBrokenChain);
  assert.match(validation.warnings.join('\n'), /transitive dependency/i);
});

test('resolveAllSkillDeps returns the full dependency map', () => {
  const graph = resolveAllSkillDeps(sampleIndex);
  assert.deepEqual(graph['invoice-review'], ['invoice-review', 'pdf']);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test test/router.test.js`
Expected: FAIL because transitive dependency validation and all-skill dependency inspection do not exist.

**Step 3: Write minimal implementation**

```js
export function resolveAllSkillDeps(index) {
  const out = {};
  for (const skill of allSkills(index)) out[skill.name] = resolveSkillDeps(skill.name, index);
  return out;
}
```

- Extend validation so dependency warnings include broken chains discovered below direct children.
- Add `resolveAllSkillDeps(index)` for CLI consumption.
- Make `skill index deps --all` print the full dependency map.

**Step 4: Run test to verify it passes**

Run: `node --test test/router.test.js`
Expected: PASS.

### Task 3: Verify Docs-Surface Consistency

**Files:**
- Modify: `README.md`

**Step 1: Update the public command surface**

- Document `skill index match --exclude ... --loaded-domains ...`.
- Document `skill index deps --all`.

**Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS.
