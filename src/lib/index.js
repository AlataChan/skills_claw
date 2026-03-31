import { getIndexPath, readJson, writeJson } from './fsutil.js';
import { listInstalledSkillSpecs } from './store.js';

function toIndexEntry(spec) {
  return {
    name: spec.name,
    version: spec.version,
    tier: spec.tier,
    domain: spec.domain,
    summary: spec.summary,
    triggers: spec.triggers,
    depends: spec.depends,
    priority: spec.priority,
  };
}

function pushDomainEntry(domains, domain, entry) {
  if (!domains[domain]) domains[domain] = [];
  domains[domain].push(entry);
}

function sortEntries(entries) {
  entries.sort((a, b) => a.name.localeCompare(b.name));
}

export async function rebuildIndex() {
  const specs = await listInstalledSkillSpecs();
  const index = {
    version: '1.0',
    generated_at: new Date().toISOString(),
    skill_count: specs.length,
    core: [],
    domains: {},
    ungrouped: [],
  };

  for (const spec of specs) {
    const entry = toIndexEntry(spec);
    if (spec.tier === 'core') {
      index.core.push(entry);
      continue;
    }
    if (spec.domain) {
      pushDomainEntry(index.domains, spec.domain, entry);
      continue;
    }
    index.ungrouped.push(entry);
  }

  sortEntries(index.core);
  sortEntries(index.ungrouped);
  for (const group of Object.values(index.domains)) sortEntries(group);

  await writeJson(getIndexPath(), index);
  return index;
}

export async function loadIndex() {
  return (await readJson(getIndexPath())) || rebuildIndex();
}

export function formatIndex(index) {
  const lines = [
    `SKILL INDEX (${index.skill_count} skills, generated ${index.generated_at})`,
    '========================================',
    '',
  ];

  if (index.core.length > 0) {
    lines.push('[core]');
    for (const entry of index.core) {
      lines.push(`  ${entry.name} | ${entry.summary || ''}`);
    }
    lines.push('');
  }

  for (const domain of Object.keys(index.domains).sort()) {
    lines.push(`[${domain}]`);
    for (const entry of index.domains[domain]) {
      lines.push(`  ${entry.name} | ${entry.summary || ''}`);
    }
    lines.push('');
  }

  if (index.ungrouped.length > 0) {
    lines.push('[ungrouped]');
    for (const entry of index.ungrouped) {
      lines.push(`  ${entry.name} | ${entry.summary || ''}`);
    }
  }

  return lines.join('\n').trimEnd();
}
