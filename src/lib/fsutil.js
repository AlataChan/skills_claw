import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export const HOME = os.homedir();
export const BASE_DIR = process.env.SKILLCLI_HOME || path.join(HOME, '.skillcli');
export const SKILLS_DIR = path.join(BASE_DIR, 'skills');
export const CONFIG_PATH = path.join(BASE_DIR, 'config.json');

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
