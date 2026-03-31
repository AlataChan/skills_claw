import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, getSkillsDir, pathExists, readJson, writeJson } from './fsutil.js';
import { loadSkillSpec, serializeSkillSpec } from './frontmatter.js';

function assertValidSkillName(name) {
  if (typeof name !== 'string' || !name || /[/\\]/.test(name) || name.includes('..')) {
    throw new Error(`invalid skill name: ${name}`);
  }
}

export async function listInstalled() {
  const skillsDir = getSkillsDir();
  await ensureDir(skillsDir);
  const dirs = await fs.readdir(skillsDir, { withFileTypes: true });
  const out = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const lock = await readJson(path.join(skillsDir, d.name, 'skill.lock.json'), {});
    out.push({ name: d.name, version: lock.version || 'unknown', source: lock.resolved_source?.url || 'local' });
  }
  return out;
}

export async function saveInstalled(manifest, source, resolvedInputs) {
  assertValidSkillName(manifest.name);
  const skillsDir = getSkillsDir();
  const dir = path.join(skillsDir, manifest.name);
  await ensureDir(dir);
  await fs.writeFile(path.join(dir, 'skill.md'), serializeSkillSpec(manifest), 'utf-8');
  await writeJson(path.join(dir, 'skill.lock.json'), {
    schema_version: manifest.schema_version,
    skill: manifest.name,
    version: manifest.version,
    resolved_source: source.resolvedSource,
    resolved_inputs: resolvedInputs,
  });
}

export async function listInstalledSkillSpecs() {
  const skillsDir = getSkillsDir();
  await ensureDir(skillsDir);
  const dirs = await fs.readdir(skillsDir, { withFileTypes: true });
  const specs = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const skillPath = path.join(skillsDir, d.name, 'skill.md');
    if (!(await pathExists(skillPath))) continue;
    specs.push(await loadSkillSpec(skillPath));
  }
  return specs;
}

export async function uninstall(name) {
  assertValidSkillName(name);
  await fs.rm(path.join(getSkillsDir(), name), { recursive: true, force: true });
}

export async function hasInstalled(name) {
  assertValidSkillName(name);
  return pathExists(path.join(getSkillsDir(), name));
}

export function installedManifestPath(name) {
  assertValidSkillName(name);
  return path.join(getSkillsDir(), name, 'skill.md');
}
