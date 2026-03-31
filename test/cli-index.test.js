import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { withTempSkillcliHome } from './helpers/skillcli-home.js';

const execFileAsync = promisify(execFile);

test('index match does not include --json in the query payload', async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'skillcli-index-'));
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

      await execFileAsync(process.execPath, [path.resolve('src/cli.js'), 'install', skillPath], {
        cwd,
        env: { ...process.env, SKILLCLI_HOME: home },
      });

      const { stdout } = await execFileAsync(process.execPath, [path.resolve('src/cli.js'), 'index', 'match', 'invoice review', '--json'], {
        cwd,
        env: { ...process.env, SKILLCLI_HOME: home },
      });

      const payload = JSON.parse(stdout);
      assert.equal(payload.data.query, 'invoice review');
    });
  } finally {
    await fs.rm(cwd, { recursive: true, force: true });
  }
});

test('index deps --all returns the dependency map for installed skills', async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'skillcli-index-'));
  try {
    await withTempSkillcliHome(async (home) => {
      const invoiceSkillPath = path.join(cwd, 'invoice-review.skill.md');
      await fs.writeFile(invoiceSkillPath, `---
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
`, 'utf-8');
      const pdfSkillPath = path.join(cwd, 'pdf.skill.md');
      await fs.writeFile(pdfSkillPath, `---
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
`, 'utf-8');

      await execFileAsync(process.execPath, [path.resolve('src/cli.js'), 'install', invoiceSkillPath], {
        cwd,
        env: { ...process.env, SKILLCLI_HOME: home },
      });
      await execFileAsync(process.execPath, [path.resolve('src/cli.js'), 'install', pdfSkillPath], {
        cwd,
        env: { ...process.env, SKILLCLI_HOME: home },
      });

      const { stdout } = await execFileAsync(process.execPath, [path.resolve('src/cli.js'), 'index', 'deps', '--all'], {
        cwd,
        env: { ...process.env, SKILLCLI_HOME: home },
      });

      const payload = JSON.parse(stdout);
      assert.deepEqual(payload['invoice-review'], ['invoice-review', 'pdf']);
      assert.deepEqual(payload.pdf, ['pdf']);
    });
  } finally {
    await fs.rm(cwd, { recursive: true, force: true });
  }
});
