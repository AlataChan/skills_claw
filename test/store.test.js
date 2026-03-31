import test from 'node:test';
import assert from 'node:assert/strict';
import { saveInstalled, uninstall } from '../src/lib/store.js';
import { withTempSkillcliHome } from './helpers/skillcli-home.js';

const validManifest = {
  schema_version: '1.0',
  name: 'invoice-review',
  version: '1.0.0',
  description: 'Invoice review',
  tier: 'domain',
  domain: 'finance',
  triggers: ['invoice'],
  summary: 'Review invoices',
  depends: [],
  priority: 'normal',
  capabilities: ['read-file'],
  mcp_deps: [],
  inputs: [],
  body: 'Review invoice packets.',
};

test('saveInstalled rejects path traversal in skill names', async () => {
  await withTempSkillcliHome(async () => {
    await assert.rejects(
      saveInstalled(
        { ...validManifest, name: '../../etc/passwd' },
        { resolvedSource: { type: 'local', url: 'bad', hash: 'local' } },
        {},
      ),
      /invalid skill name/i,
    );
  });
});

test('uninstall rejects path traversal in skill names', async () => {
  await withTempSkillcliHome(async () => {
    await assert.rejects(uninstall('../outside'), /invalid skill name/i);
  });
});
