import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { withTempSkillcliHome } from './helpers/skillcli-home.js';

const execFileAsync = promisify(execFile);

function createServer() {
  let server;
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/registry.json') {
        const base = `http://127.0.0.1:${server.address().port}`;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          skills: [
            { name: 'invoice-review', skill_url: `${base}/skills/invoice-review/skill.md`, hash: 'main' },
            { name: 'pdf', skill_url: `${base}/skills/pdf/skill.md`, hash: 'main' },
          ],
        }));
        return;
      }

      if (url.pathname === '/skills/invoice-review/skill.md') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end(`---
name: invoice-review
version: 1.0.0
description: "Invoice review"
tier: domain
domain: finance
triggers: [invoice]
summary: "Review invoices"
depends: [pdf]
priority: normal
capabilities: ["read-file"]
mcp_deps: []
inputs: []
---
Review invoice packets.
`);
        return;
      }

      if (url.pathname === '/skills/pdf/skill.md') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end(`---
name: pdf
version: 1.0.0
description: "PDF operations"
tier: domain
domain: document
triggers: [.pdf]
summary: "PDF operations"
depends: []
priority: normal
capabilities: ["read-file"]
mcp_deps: []
inputs: []
---
Handle PDFs.
`);
        return;
      }

      res.writeHead(404);
      res.end('not found');
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('install --with-deps installs missing skill dependencies from registry when available', async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'skillcli-install-'));
  const server = await createServer();
  try {
    await withTempSkillcliHome(async (home) => {
      const base = `http://127.0.0.1:${server.address().port}`;
      await execFileAsync(process.execPath, [path.resolve('src/cli.js'), 'source', 'add', `${base}/registry.json`], {
        cwd,
        env: { ...process.env, SKILLCLI_HOME: home },
      });

      await execFileAsync(process.execPath, [path.resolve('src/cli.js'), 'install', 'invoice-review', '--with-deps'], {
        cwd,
        env: { ...process.env, SKILLCLI_HOME: home },
      });

      await assert.doesNotReject(fs.access(path.join(home, 'skills', 'invoice-review', 'skill.md')));
      await assert.doesNotReject(fs.access(path.join(home, 'skills', 'pdf', 'skill.md')));
    });
  } finally {
    server.close();
    await fs.rm(cwd, { recursive: true, force: true });
  }
});

test('install refreshes an existing stale index.json', async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'skillcli-install-'));
  try {
    await withTempSkillcliHome(async (home) => {
      const skillPath = path.join(cwd, 'invoice-review.skill.md');
      await fs.writeFile(skillPath, `---
name: invoice-review
version: 1.0.0
description: "Invoice review"
tier: domain
domain: finance
triggers: [invoice]
summary: "Review invoices"
depends: []
priority: normal
capabilities: ["read-file"]
mcp_deps: []
inputs: []
---
Review invoice packets.
`, 'utf-8');

      await fs.writeFile(path.join(home, 'index.json'), JSON.stringify({
        version: '1.0',
        generated_at: '2026-03-23T00:00:00.000Z',
        skill_count: 0,
        core: [],
        domains: {},
        ungrouped: [],
      }, null, 2));

      await execFileAsync(process.execPath, [path.resolve('src/cli.js'), 'install', skillPath], {
        cwd,
        env: { ...process.env, SKILLCLI_HOME: home },
      });

      const index = JSON.parse(await fs.readFile(path.join(home, 'index.json'), 'utf-8'));
      assert.equal(index.skill_count, 1);
      assert.equal(index.domains.finance[0].name, 'invoice-review');
    });
  } finally {
    await fs.rm(cwd, { recursive: true, force: true });
  }
});

test('uninstall refreshes index.json after removing a skill', async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'skillcli-uninstall-'));
  try {
    await withTempSkillcliHome(async (home) => {
      const skillDir = path.join(home, 'skills', 'invoice-review');
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(path.join(skillDir, 'skill.md'), `---
name: invoice-review
version: 1.0.0
description: "Invoice review"
tier: domain
domain: finance
triggers: [invoice]
summary: "Review invoices"
depends: []
priority: normal
capabilities: ["read-file"]
mcp_deps: []
inputs: []
---
Review invoice packets.
`, 'utf-8');
      await fs.writeFile(path.join(skillDir, 'skill.lock.json'), JSON.stringify({
        schema_version: '1.0',
        skill: 'invoice-review',
        version: '1.0.0',
        resolved_source: { type: 'local', url: 'invoice-review', hash: 'local' },
        resolved_inputs: {},
      }, null, 2));

      await fs.writeFile(path.join(home, 'index.json'), JSON.stringify({
        version: '1.0',
        generated_at: '2026-03-23T00:00:00.000Z',
        skill_count: 1,
        core: [],
        domains: {
          finance: [{ name: 'invoice-review', tier: 'domain', domain: 'finance', summary: 'Review invoices', triggers: ['invoice'], depends: [], priority: 'normal' }],
        },
        ungrouped: [],
      }, null, 2));

      await execFileAsync(process.execPath, [path.resolve('src/cli.js'), 'uninstall', 'invoice-review'], {
        cwd,
        env: { ...process.env, SKILLCLI_HOME: home },
      });

      const index = JSON.parse(await fs.readFile(path.join(home, 'index.json'), 'utf-8'));
      assert.equal(index.skill_count, 0);
      assert.deepEqual(index.domains, {});
    });
  } finally {
    await fs.rm(cwd, { recursive: true, force: true });
  }
});

test('update refreshes a stale index.json for installed skills', async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'skillcli-update-'));
  try {
    await withTempSkillcliHome(async (home) => {
      const skillDir = path.join(home, 'skills', 'invoice-review');
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(path.join(skillDir, 'skill.md'), `---
name: invoice-review
version: 1.0.0
description: "Invoice review"
tier: domain
domain: finance
triggers: [invoice]
summary: "Review invoices"
depends: []
priority: normal
capabilities: ["read-file"]
mcp_deps: []
inputs: []
---
Review invoice packets.
`, 'utf-8');
      await fs.writeFile(path.join(skillDir, 'skill.lock.json'), JSON.stringify({
        schema_version: '1.0',
        skill: 'invoice-review',
        version: '1.0.0',
        resolved_source: { type: 'local', url: 'invoice-review', hash: 'local' },
        resolved_inputs: {},
      }, null, 2));

      await fs.writeFile(path.join(home, 'index.json'), JSON.stringify({
        version: '1.0',
        generated_at: '2026-03-23T00:00:00.000Z',
        skill_count: 0,
        core: [],
        domains: {},
        ungrouped: [],
      }, null, 2));

      await execFileAsync(process.execPath, [path.resolve('src/cli.js'), 'update', 'invoice-review'], {
        cwd,
        env: { ...process.env, SKILLCLI_HOME: home },
      });

      const index = JSON.parse(await fs.readFile(path.join(home, 'index.json'), 'utf-8'));
      assert.equal(index.skill_count, 1);
      assert.equal(index.domains.finance[0].name, 'invoice-review');
    });
  } finally {
    await fs.rm(cwd, { recursive: true, force: true });
  }
});
