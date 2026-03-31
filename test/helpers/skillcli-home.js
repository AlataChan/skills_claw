import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function withTempSkillcliHome(run) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'skillcli-test-'));
  const prev = process.env.SKILLCLI_HOME;
  process.env.SKILLCLI_HOME = home;
  try {
    await run(home);
  } finally {
    if (prev === undefined) delete process.env.SKILLCLI_HOME;
    else process.env.SKILLCLI_HOME = prev;
    await fs.rm(home, { recursive: true, force: true });
  }
}

export async function writeInstalledSkill(home, name, contents, lock = {}) {
  const dir = path.join(home, 'skills', name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'skill.md'), contents, 'utf-8');
  await fs.writeFile(path.join(dir, 'skill.lock.json'), JSON.stringify({
    schema_version: lock.schema_version || '1.0',
    skill: name,
    version: lock.version || '0.1.0',
    resolved_source: lock.resolved_source || { type: 'local', url: `${name}/skill.md`, hash: 'local' },
    resolved_inputs: lock.resolved_inputs || {},
  }, null, 2), 'utf-8');
}
