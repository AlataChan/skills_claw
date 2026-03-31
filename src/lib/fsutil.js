import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export const HOME = os.homedir();

export function getBaseDir() {
  return process.env.SKILLCLI_HOME || path.join(HOME, '.skillcli');
}

export function getSkillsDir() {
  return path.join(getBaseDir(), 'skills');
}

export function getConfigPath() {
  return path.join(getBaseDir(), 'config.json');
}

export function getCacheDir() {
  return path.join(getBaseDir(), 'cache');
}

export function getIndexPath() {
  return path.join(getBaseDir(), 'index.json');
}

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export async function readJson(file, fallback = null) {
  try {
    const text = await fs.readFile(file, 'utf-8');
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export async function writeJson(file, data) {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

export async function pathExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
