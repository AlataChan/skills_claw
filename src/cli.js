#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseSkillRef } from './lib/ref.js';
import { resolveInputs, validateManifest } from './lib/manifest.js';
import { loadSkillSpec, serializeSkillSpec } from './lib/frontmatter.js';
import { formatIndex, loadIndex, rebuildIndex } from './lib/index.js';
import {
  buildCoreSkillsPayload,
  buildMatchResultPayload,
  buildRoutingTablePayload,
  buildSkillContentPayload,
  emitHookConfig,
} from './lib/hook.js';
import { matchSkills, resolveAllSkillDeps, resolveSkillDeps, validateIndex } from './lib/router.js';
import { addSource, findSkill, getConfig, listSources, removeSource, searchSkills } from './lib/registry.js';
import { checkDeps } from './lib/mcp.js';
import { emitBuiltIn, builtInAdapters } from './lib/adapter.js';
import { hasInstalled, installedManifestPath, listInstalled, listInstalledSkillSpecs, saveInstalled, uninstall } from './lib/store.js';
import { fetchRemoteSkill, fetchUrlSkill } from './lib/source.js';

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

function argsToPositionals(args) {
  const positionals = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith('--')) {
      if (args[i + 1] && !args[i + 1].startsWith('--')) i += 1;
      continue;
    }
    positionals.push(args[i]);
  }
  return positionals;
}

function parseCsvFlag(value) {
  if (value === undefined) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function loadFromRef(refText) {
  const ref = parseSkillRef(refText);
  if (ref.type === 'local') {
    const sourceText = await fs.readFile(ref.path, 'utf-8');
    const manifest = await loadSkillSpec(ref.path, sourceText);
    const manifestText = ref.path.endsWith('.md') ? sourceText : serializeSkillSpec(manifest);
    return { manifest, manifestText, resolvedSource: { type: 'local', url: ref.path, hash: 'local' } };
  }
  if (ref.type === 'registry') {
    const found = await findSkill(ref.name);
    if (!found) throw new Error(`skill not found in sources: ${ref.name}`);
    const target = found.skill_url || found.manifest_url;
    const remote = await fetchUrlSkill(fetch, target);
    const manifest = await loadSkillSpec(remote.filename, remote.text);
    const manifestText = remote.filename.endsWith('.md') ? remote.text : serializeSkillSpec(manifest);
    return { manifest, manifestText, resolvedSource: { type: 'registry', url: remote.url, hash: found.hash || 'latest' } };
  }
  if (ref.type === 'github') {
    const remote = await fetchRemoteSkill(fetch, ref.repo, ref.hash);
    const manifest = await loadSkillSpec(remote.filename, remote.text);
    const manifestText = remote.filename.endsWith('.md') ? remote.text : serializeSkillSpec(manifest);
    return { manifest, manifestText, resolvedSource: { type: 'github', url: remote.url, hash: ref.hash } };
  }
  throw new Error('unsupported ref');
}

async function installSkillRef(refText, options = {}) {
  const { overrides = {}, withDeps = false, seen = new Set() } = options;
  if (seen.has(refText)) return null;
  seen.add(refText);

  const src = await loadFromRef(refText);
  const validation = validateManifest(src.manifest);
  if (!validation.ok) throw new Error(validation.errors.join('; '));

  const resolvedInputs = resolveInputs(src.manifest, overrides);
  const cfg = await getConfig();
  const dep = await checkDeps(src.manifest, cfg.mcpHubUrl).catch(() => ({ ok: true, missingRequired: [], missingOptional: [] }));
  if (!dep.ok) throw new Error(`missing required mcp deps: ${dep.missingRequired.join(',')}`);

  await saveInstalled(src.manifest, { manifestText: src.manifestText, resolvedSource: src.resolvedSource }, resolvedInputs);

  if (withDeps) {
    for (const depName of src.manifest.depends || []) {
      if (await hasInstalled(depName)) continue;
      try {
        await installSkillRef(depName, { withDeps: true, seen });
      } catch (error) {
        console.error(`warning: failed to install dependency ${depName}: ${error.message}`);
      }
    }
  }

  return src.manifest;
}

async function main() {
  const [cmd, sub, ...rest] = process.argv.slice(2);
  const flags = argsToMap(rest);
  const positionals = argsToPositionals(rest);

  if (cmd === 'init') {
    const name = sub || 'new-skill';
    const manifest = `---\nname: ${name}\nversion: 0.1.0\ndescription: "TODO"\ntier: domain\ntriggers: []\nsummary: ""\ndepends: []\npriority: normal\ncapabilities: ["read-file"]\nmcp_deps:\n  - tool: sga_rag.search\n    required: false\n    description: "检索"\ninputs:\n  - name: target_collection\n    type: string\n    required: false\n    default: default\n---\n你是一个专业助手。\n`;
    await fs.writeFile('skill.md', manifest, 'utf-8');
    console.log('initialized skill.md');
    return;
  }

  if (cmd === 'list') {
    console.log(JSON.stringify(await listInstalled(), null, 2));
    return;
  }

  if (cmd === 'validate') {
    const file = sub || 'skill.md';
    const manifest = await loadSkillSpec(file);
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
    if (sub === 'add') await addSource(positionals[0]);
    else if (sub === 'list') console.log(JSON.stringify(await listSources(), null, 2));
    else if (sub === 'remove') await removeSource(positionals[0]);
    else console.log('source commands: add/list/remove');
    return;
  }

  if (cmd === 'search') {
    console.log(JSON.stringify(await searchSkills(sub || ''), null, 2));
    return;
  }

  if (cmd === 'index') {
    if (sub === 'rebuild') {
      const index = await rebuildIndex();
      if (flags.json === 'true') console.log(JSON.stringify(buildRoutingTablePayload(index), null, 2));
      else console.log(formatIndex(index));
      return;
    }

    if (sub === 'show') {
      const index = await loadIndex();
      if (flags.json === 'true') console.log(JSON.stringify(buildRoutingTablePayload(index), null, 2));
      else console.log(formatIndex(index));
      return;
    }

    if (sub === 'match') {
      const index = await loadIndex();
      const query = positionals.join(' ') || '';
      const result = matchSkills(query, index, {
        threshold: flags.threshold,
        max: flags.max,
        loadedSkills: parseCsvFlag(flags.exclude),
        loadedDomains: parseCsvFlag(flags['loaded-domains']),
      });
      if (flags.json === 'true') console.log(JSON.stringify(buildMatchResultPayload(result, index.skill_count || 0), null, 2));
      else console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (sub === 'deps') {
      const index = await loadIndex();
      const result = flags.all === 'true' ? resolveAllSkillDeps(index) : resolveSkillDeps(positionals[0], index);
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (sub === 'validate') {
      const index = await loadIndex();
      const result = validateIndex(index);
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.ok ? 0 : 1;
      return;
    }

    if (sub === 'core') {
      const skills = await listInstalledSkillSpecs();
      const payload = buildCoreSkillsPayload(skills);
      if (flags.json === 'true') console.log(JSON.stringify(payload, null, 2));
      else console.log(payload.data.combined_body);
      return;
    }

    if (sub === 'load') {
      const index = await loadIndex();
      const skills = await listInstalledSkillSpecs();
      const payload = buildSkillContentPayload(index, skills, positionals[0], { withDeps: flags['with-deps'] === 'true' });
      if (flags.json === 'true') console.log(JSON.stringify(payload, null, 2));
      else console.log(payload.data.combined_body);
      return;
    }

    if (sub === 'emit-hook') {
      const target = flags.target;
      const outdir = flags.out || '.';
      const config = emitHookConfig(target);
      await fs.mkdir(outdir, { recursive: true });
      await fs.writeFile(path.join(outdir, 'hooks.json'), JSON.stringify(config, null, 2) + '\n', 'utf-8');
      console.log(`emitted hook config to ${path.join(outdir, 'hooks.json')}`);
      return;
    }

    console.log('index commands: rebuild/show/match/deps/validate/core/load/emit-hook');
    return;
  }

  if (cmd === 'info') {
    console.log(JSON.stringify(await findSkill(sub), null, 2));
    return;
  }

  if (cmd === 'install') {
    const ref = sub;
    const overrides = {};
    if (flags.input) {
      const [k, v] = String(flags.input).split('=');
      overrides[k] = v;
    }
    const installed = await installSkillRef(ref, { overrides, withDeps: flags['with-deps'] === 'true' });
    await rebuildIndex();
    console.log(`installed ${installed.name}`);
    return;
  }

  if (cmd === 'uninstall') {
    await uninstall(sub);
    await rebuildIndex();
    console.log(`uninstalled ${sub}`);
    return;
  }

  if (cmd === 'update') {
    if (sub === '--all') {
      const list = await listInstalled();
      for (const item of list) console.log(`checked ${item.name}`);
      await rebuildIndex();
      return;
    }
    if (!(await hasInstalled(sub))) throw new Error('not installed');
    await rebuildIndex();
    console.log(`no-op update for ${sub}`);
    return;
  }

  if (cmd === 'check-deps') {
    const name = sub;
    const manifest = await loadSkillSpec(installedManifestPath(name));
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
    const manifest = await loadSkillSpec(installedManifestPath(name));
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
    else if (sub === 'install') console.log(`adapter registered: ${positionals[0]}`);
    return;
  }

  if (cmd === 'doctor') {
    const cfg = await getConfig();
    const report = { sources: (await listSources()).length, mcpHubUrl: cfg.mcpHubUrl, adapters: builtInAdapters() };
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (cmd === 'evolve' && sub === 'add') {
    const entry = positionals.join(' ') || 'evolution entry';
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

  console.log('commands: init/list/validate/source/search/index/info/install/uninstall/update/check-deps/emit/adapter/doctor/evolve/publish');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
