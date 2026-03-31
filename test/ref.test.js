import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSkillRef } from '../src/lib/ref.js';
import { fetchRemoteSkill } from '../src/lib/source.js';

test('parseSkillRef treats bare skill.md as a local ref', () => {
  assert.equal(parseSkillRef('skill.md').type, 'local');
});

test('fetchRemoteSkill prefers skill.md then SKILL.md then skill.yaml', async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url);
    if (url.endsWith('/skill.md')) {
      return {
        ok: false,
        text: async () => '',
      };
    }
    if (url.endsWith('/SKILL.md')) {
      return {
        ok: true,
        text: async () => 'markdown skill',
      };
    }
    return {
      ok: true,
      text: async () => 'legacy yaml',
    };
  };

  const found = await fetchRemoteSkill(fakeFetch, 'acme/repo', 'main');
  assert.equal(found.filename, 'SKILL.md');
  assert.equal(found.text, 'markdown skill');
  assert.deepEqual(calls, [
    'https://raw.githubusercontent.com/acme/repo/main/skill.md',
    'https://raw.githubusercontent.com/acme/repo/main/SKILL.md',
  ]);
});
