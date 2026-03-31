import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

test('skill init creates skill.md', async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'skillcli-init-'));
  try {
    await execFileAsync(process.execPath, [path.resolve('src/cli.js'), 'init', 'demo-skill'], {
      cwd,
      env: { ...process.env },
    });

    const skillMd = path.join(cwd, 'skill.md');
    const skillYaml = path.join(cwd, 'skill.yaml');

    await assert.doesNotReject(fs.access(skillMd));
    await assert.rejects(fs.access(skillYaml));
  } finally {
    await fs.rm(cwd, { recursive: true, force: true });
  }
});
