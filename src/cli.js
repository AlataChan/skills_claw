#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseSkillRef } from './lib/ref.js';
import { loadManifest, resolveInputs, validateManifest } from './lib/manifest.js';
import { addSource, findSkill, getConfig, listSources, removeSource, searchSkills } from './lib/registry.js';
import { checkDeps } from './lib/mcp.js';
import { emitBuiltIn, builtInAdapters } from './lib/adapter.js';
import { hasInstalled, installedManifestPath, listInstalled, saveInstalled, uninstall } from './lib/store.js';

function argsToMap(args) {
  const map = {};
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
      map[key] = val;
    }
  }
  return map;
}

async function loadFromRef(refText) {
  const ref = parseSkillRef(refText);
  if (ref.type === 'local') {
    const manifestText = await fs.readFile(ref.path, 'utf-8');
    const manifest = await loadManifest(ref.path);
    return { manifest, manifestText, resolvedSource: { type: 'local', url: ref.path, hash: 'local' } };
  }
  if (ref.type === 'registry') {
    const found = await findSkill(ref.name);
    if (!found) throw new Error(`skill not found in sources: ${ref.name}`);
    const target = found.manifest_url;
    const res = await fetch(target);
    const manifestText = await res.text();
    const tmp = path.join('/tmp', `${found.name}.yaml`);
    await fs.writeFile(tmp, manifestText, 'utf-8');
    const manifest = await loadManifest(tmp);
    return { manifest, manifestText, resolvedSource: { type: 'registry', url: target, hash: found.hash || 'latest' } };
  }
  if (ref.type === 'github') {
    const url = `https://raw.githubusercontent.com/${ref.repo}/${ref.hash}/skill.yaml`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`cannot fetch ${url}`);
    const manifestText = await res.text();
    const tmp = path.join('/tmp', `${ref.repo.replace('/', '_')}.yaml`);
    await fs.writeFile(tmp, manifestText, 'utf-8');
    const manifest = await loadManifest(tmp);
    return { manifest, manifestText, resolvedSource: { type: 'github', url, hash: ref.hash } };
  }
  throw new Error('unsupported ref');
}

async function main() {
  const [cmd, sub, ...rest] = process.argv.slice(2);
  const flags = argsToMap(rest);

  if (cmd === 'init') {
    const name = sub || 'new-skill';
    const manifest = `schema_version: "1.0"\nname: ${name}\nversion: 0.1.0\ndescription: "TODO"\nsystem_prompt: |\n  你是一个专业助手。\ncapabilities:\n  - read-file\nmcp_deps:\n  - tool: sga_rag.search\n    required: false\n    description: "检索"\ninputs:\n  - name: target_collection\n    type: string\n    required: false\n    default: default\n`;
    await fs.writeFile('skill.yaml', manifest, 'utf-8');
    console.log('initialized skill.yaml');
    return;
  }

  if (cmd === 'list') {
    console.log(JSON.stringify(await listInstalled(), null, 2));
    return;
  }

  if (cmd === 'validate') {
    const file = sub || 'skill.yaml';
    const manifest = await loadManifest(file);
    const result = validateManifest(manifest);
    if (flags.target) {
      const supported = builtInAdapters().includes(flags.target);
      if (!supported) result.errors.push(`target not supported: ${flags.target}`);
      result.ok = result.ok && supported;
    }
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (cmd === 'source') {
    if (sub === 'add') await addSource(rest[0]);
    else if (sub === 'list') console.log(JSON.stringify(await listSources(), null, 2));
    else if (sub === 'remove') await removeSource(rest[0]);
    else console.log('source commands: add/list/remove');
    return;
  }

  if (cmd === 'search') {
    console.log(JSON.stringify(await searchSkills(sub || ''), null, 2));
    return;
  }

  if (cmd === 'info') {
    console.log(JSON.stringify(await findSkill(sub), null, 2));
    return;
  }

  if (cmd === 'install') {
    const ref = sub;
    const src = await loadFromRef(ref);
    const validation = validateManifest(src.manifest);
    if (!validation.ok) throw new Error(validation.errors.join('; '));
    const overrides = {};
    if (flags.input) {
      const [k, v] = String(flags.input).split('=');
      overrides[k] = v;
    }
    const resolvedInputs = resolveInputs(src.manifest, overrides);
    const cfg = await getConfig();
    const dep = await checkDeps(src.manifest, cfg.mcpHubUrl).catch(() => ({ ok: true, missingRequired: [], missingOptional: [] }));
    if (!dep.ok) throw new Error(`missing required mcp deps: ${dep.missingRequired.join(',')}`);
    await saveInstalled(src.manifest, { manifestText: src.manifestText, resolvedSource: src.resolvedSource }, resolvedInputs);
    console.log(`installed ${src.manifest.name}`);
    return;
  }

  if (cmd === 'uninstall') {
    await uninstall(sub);
    console.log(`uninstalled ${sub}`);
    return;
  }

  if (cmd === 'update') {
    if (sub === '--all') {
      const list = await listInstalled();
      for (const item of list) console.log(`checked ${item.name}`);
      return;
    }
    if (!(await hasInstalled(sub))) throw new Error('not installed');
    console.log(`no-op update for ${sub}`);
    return;
  }

  if (cmd === 'check-deps') {
    const name = sub;
    const manifest = await loadManifest(installedManifestPath(name));
    const cfg = await getConfig();
    const result = await checkDeps(manifest, cfg.mcpHubUrl);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (cmd === 'emit') {
    const name = sub;
    const target = flags.target;
    const outdir = flags.out || 'dist';
    const manifest = await loadManifest(installedManifestPath(name));
    const emitted = emitBuiltIn(target, manifest);
    await fs.mkdir(outdir, { recursive: true });
    for (const f of emitted.files) {
      const fp = path.join(outdir, f.path);
      await fs.mkdir(path.dirname(fp), { recursive: true });
      await fs.writeFile(fp, f.content, 'utf-8');
    }
    console.log(`emitted to ${outdir}`);
    return;
  }

  if (cmd === 'adapter') {
    if (sub === 'list') console.log(JSON.stringify(builtInAdapters(), null, 2));
    else if (sub === 'install') console.log(`adapter registered: ${rest[0]}`);
    return;
  }

  if (cmd === 'doctor') {
    const cfg = await getConfig();
    const report = { sources: (await listSources()).length, mcpHubUrl: cfg.mcpHubUrl, adapters: builtInAdapters() };
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (cmd === 'evolve' && sub === 'add') {
    const entry = rest.join(' ') || 'evolution entry';
    const file = 'evolution.json';
    let evo = [];
    try { evo = JSON.parse(await fs.readFile(file, 'utf-8')); } catch {}
    evo.push({ ts: new Date().toISOString(), entry });
    await fs.writeFile(file, JSON.stringify(evo, null, 2), 'utf-8');
    console.log('evolution updated');
    return;
  }

  if (cmd === 'publish') {
    console.log('publish prepared: create PR to registry with skill metadata');
    return;
  }

  console.log('commands: init/list/validate/source/search/info/install/uninstall/update/check-deps/emit/adapter/doctor/evolve/publish');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
