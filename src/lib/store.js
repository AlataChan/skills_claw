import fs from 'node:fs/promises';
import path from 'node:path';
import { SKILLS_DIR, ensureDir, readJson, writeJson, pathExists } from './fsutil.js';

export async function listInstalled() {
  await ensureDir(SKILLS_DIR);
  const dirs = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
  const out = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const lock = await readJson(path.join(SKILLS_DIR, d.name, 'skill.lock.json'), {});
    out.push({ name: d.name, version: lock.version || 'unknown', source: lock.resolved_source?.url || 'local' });
  }
  return out;
}

export async function saveInstalled(manifest, source, resolvedInputs) {
  const dir = path.join(SKILLS_DIR, manifest.name);
  await ensureDir(dir);
  await fs.writeFile(path.join(dir, 'skill.yaml'), source.manifestText, 'utf-8');
  await writeJson(path.join(dir, 'skill.lock.json'), {
    schema_version: manifest.schema_version,
    skill: manifest.name,
    version: manifest.version,
    resolved_source: source.resolvedSource,
    resolved_inputs: resolvedInputs,
  });
}

export async function uninstall(name) {
  await fs.rm(path.join(SKILLS_DIR, name), { recursive: true, force: true });
}

export async function hasInstalled(name) {
  return pathExists(path.join(SKILLS_DIR, name));
}

export function installedManifestPath(name) {
  return path.join(SKILLS_DIR, name, 'skill.yaml');
}
