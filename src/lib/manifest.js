import fs from 'node:fs/promises';

function parseScalar(v) {
  const t = v.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  if (t.startsWith('[') && t.endsWith(']')) return t.slice(1, -1).split(',').map((x) => x.trim()).filter(Boolean);
  return t;
}

// lightweight parser for the manifest structure used in project docs.
export function parseSimpleYaml(text) {
  const lines = text.split(/\r?\n/);
  const root = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) { i += 1; continue; }
    const m = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (!m) { i += 1; continue; }
    const key = m[1];
    const val = m[2];
    if (val === '|') {
      i += 1;
      const block = [];
      while (i < lines.length && (lines[i].startsWith('  ') || !lines[i].trim())) {
        block.push(lines[i].replace(/^  /, ''));
        i += 1;
      }
      root[key] = block.join('\n').trimEnd();
      continue;
    }
    if (val === '') {
      i += 1;
      const arr = [];
      while (i < lines.length && lines[i].startsWith('  - ')) {
        const first = lines[i].replace(/^  -\s*/, '');
        if (first.includes(':')) {
          const obj = {};
          const [k, v] = first.split(/:(.*)/).slice(0, 2);
          obj[k.trim()] = parseScalar((v || '').trim());
          i += 1;
          while (i < lines.length && lines[i].startsWith('    ') && lines[i].trim().includes(':')) {
            const [kk, vv] = lines[i].trim().split(/:(.*)/).slice(0, 2);
            obj[kk.trim()] = parseScalar((vv || '').trim());
            i += 1;
          }
          arr.push(obj);
        } else {
          arr.push(parseScalar(first));
          i += 1;
        }
      }
      root[key] = arr;
      continue;
    }
    root[key] = parseScalar(val);
    i += 1;
  }
  return root;
}

export async function loadManifest(file) {
  const content = await fs.readFile(file, 'utf-8');
  if (file.endsWith('.json')) return JSON.parse(content);
  return parseSimpleYaml(content);
}

export function validateManifest(manifest) {
  const errors = [];
  const required = ['schema_version', 'name', 'version', 'description', 'system_prompt', 'capabilities', 'mcp_deps', 'inputs'];
  for (const key of required) {
    if (manifest[key] === undefined) errors.push(`missing required field: ${key}`);
  }
  if (manifest.permission_policy) errors.push('permission_policy is not allowed in manifest');
  if (manifest.flow_templates) errors.push('flow_templates is not allowed in manifest');
  if (manifest.inputs && Array.isArray(manifest.inputs)) {
    for (const input of manifest.inputs) {
      if (!['string', 'number', 'boolean', 'enum'].includes(input.type)) errors.push(`invalid input type for ${input.name}`);
      if (input.type === 'enum' && !Array.isArray(input.enum)) errors.push(`enum input ${input.name} requires enum[]`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function resolveInputs(manifest, overrides = {}) {
  const out = {};
  for (const input of manifest.inputs || []) {
    if (Object.hasOwn(overrides, input.name)) out[input.name] = overrides[input.name];
    else if (Object.hasOwn(input, 'default')) out[input.name] = input.default;
    else if (input.required) throw new Error(`required input missing: ${input.name}`);
  }
  return out;
}
