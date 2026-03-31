import fs from 'node:fs/promises';
import { parseSimpleYaml } from './manifest.js';

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function normalizeNullableString(value) {
  return typeof value === 'string' ? value : null;
}

function normalizePriority(value) {
  return ['high', 'normal', 'low'].includes(value) ? value : 'normal';
}

function normalizeTier(value) {
  return ['core', 'domain'].includes(value) ? value : 'domain';
}

export function parseMarkdownFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error('no frontmatter found');
  return {
    meta: parseSimpleYaml(match[1]),
    body: match[2].trim(),
  };
}

export function normalizeMarkdownSkill({ meta, body }) {
  return {
    schema_version: meta.schema_version,
    name: normalizeString(meta.name),
    version: normalizeString(meta.version),
    description: normalizeString(meta.description),
    tier: normalizeTier(meta.tier),
    domain: normalizeNullableString(meta.domain),
    triggers: normalizeArray(meta.triggers),
    summary: normalizeString(meta.summary),
    depends: normalizeArray(meta.depends),
    priority: normalizePriority(meta.priority),
    capabilities: normalizeArray(meta.capabilities),
    mcp_deps: normalizeArray(meta.mcp_deps),
    inputs: normalizeArray(meta.inputs),
    body: normalizeString(body),
  };
}

export function normalizeLegacySkill(manifest) {
  return {
    schema_version: manifest.schema_version,
    name: normalizeString(manifest.name),
    version: normalizeString(manifest.version),
    description: normalizeString(manifest.description),
    tier: normalizeTier(manifest.tier),
    domain: normalizeNullableString(manifest.domain),
    triggers: normalizeArray(manifest.triggers),
    summary: normalizeString(manifest.summary),
    depends: normalizeArray(manifest.depends),
    priority: normalizePriority(manifest.priority),
    capabilities: normalizeArray(manifest.capabilities),
    mcp_deps: normalizeArray(manifest.mcp_deps),
    inputs: normalizeArray(manifest.inputs),
    body: normalizeString(manifest.system_prompt),
  };
}

function serializeScalar(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

function serializeArray(name, items) {
  if (!Array.isArray(items) || items.length === 0) return `${name}: []`;
  if (items.every((item) => typeof item !== 'object' || item === null)) {
    return `${name}: [${items.map((item) => serializeScalar(item)).join(', ')}]`;
  }
  const lines = [`${name}:`];
  for (const item of items) {
    const entries = Object.entries(item || {});
    if (entries.length === 0) {
      lines.push('  - {}');
      continue;
    }
    const [firstKey, firstValue] = entries[0];
    lines.push(`  - ${firstKey}: ${serializeScalar(firstValue)}`);
    for (const [key, value] of entries.slice(1)) {
      lines.push(`    ${key}: ${serializeScalar(value)}`);
    }
  }
  return lines.join('\n');
}

export function serializeSkillSpec(spec) {
  const lines = ['---'];
  if (spec.schema_version !== undefined) lines.push(`schema_version: ${serializeScalar(spec.schema_version)}`);
  lines.push(`name: ${serializeScalar(spec.name)}`);
  lines.push(`version: ${serializeScalar(spec.version)}`);
  lines.push(`description: ${serializeScalar(spec.description || '')}`);
  lines.push(`tier: ${spec.tier || 'domain'}`);
  if (spec.domain) lines.push(`domain: ${serializeScalar(spec.domain)}`);
  lines.push(serializeArray('triggers', spec.triggers || []));
  lines.push(`summary: ${serializeScalar(spec.summary || '')}`);
  lines.push(serializeArray('depends', spec.depends || []));
  lines.push(`priority: ${spec.priority || 'normal'}`);
  lines.push(serializeArray('capabilities', spec.capabilities || []));
  lines.push(serializeArray('mcp_deps', spec.mcp_deps || []));
  lines.push(serializeArray('inputs', spec.inputs || []));
  lines.push('---');
  lines.push(spec.body || '');
  return `${lines.join('\n')}\n`;
}

export async function loadSkillSpec(file, inlineText) {
  const text = inlineText ?? await fs.readFile(file, 'utf-8');
  if (file.endsWith('.md')) return normalizeMarkdownSkill(parseMarkdownFrontmatter(text));
  if (file.endsWith('.yaml') || file.endsWith('.yml')) return normalizeLegacySkill(parseSimpleYaml(text));
  if (file.endsWith('.json')) return JSON.parse(text);
  throw new Error(`unsupported skill file: ${file}`);
}
