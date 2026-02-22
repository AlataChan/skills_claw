import fs from 'node:fs/promises';
import path from 'node:path';
import { BASE_DIR, CONFIG_PATH, ensureDir, readJson, writeJson } from './fsutil.js';

const CACHE_DIR = path.join(BASE_DIR, 'cache');

export async function getConfig() {
  return (await readJson(CONFIG_PATH, { sources: [], mcpHubUrl: 'http://localhost:18800', adapters: [] })) || { sources: [] };
}

export async function saveConfig(config) {
  await writeJson(CONFIG_PATH, config);
}

export async function addSource(url) {
  const cfg = await getConfig();
  if (!cfg.sources.includes(url)) cfg.sources.push(url);
  await saveConfig(cfg);
}

export async function removeSource(url) {
  const cfg = await getConfig();
  cfg.sources = cfg.sources.filter((s) => s !== url);
  await saveConfig(cfg);
}

export async function listSources() {
  const cfg = await getConfig();
  return cfg.sources;
}

async function loadRegistryFromSource(source) {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`failed source: ${source}`);
    return res.json();
  }
  const text = await fs.readFile(source, 'utf-8');
  return JSON.parse(text);
}

export async function refreshSources() {
  await ensureDir(CACHE_DIR);
  const cfg = await getConfig();
  const all = [];
  for (const source of cfg.sources) {
    try {
      const reg = await loadRegistryFromSource(source);
      const items = reg.skills || [];
      all.push(...items);
      const key = Buffer.from(source).toString('base64url');
      await writeJson(path.join(CACHE_DIR, `${key}.json`), reg);
    } catch {
      // ignore one source failure
    }
  }
  return all;
}

export async function searchSkills(keyword) {
  const all = await refreshSources();
  const k = keyword.toLowerCase();
  return all.filter((s) => (s.name || '').toLowerCase().includes(k) || (s.description || '').toLowerCase().includes(k) || (s.tags || []).join(' ').toLowerCase().includes(k));
}

export async function findSkill(name) {
  const all = await refreshSources();
  return all.find((s) => s.name === name);
}
