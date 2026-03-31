function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9.\u4e00-\u9fff]+/u)
    .filter(Boolean);
}

function estimateTokens(value) {
  return Math.ceil(JSON.stringify(value).length / 4);
}

function flattenDomainSkills(index) {
  const domainSkills = Object.values(index.domains || {}).flat();
  const ungrouped = (index.ungrouped || []).filter((skill) => skill.tier !== 'core');
  return [...domainSkills, ...ungrouped];
}

function listAllSkills(index) {
  return [...flattenDomainSkills(index), ...(index.core || [])];
}

function buildSkillMap(index) {
  const map = new Map();
  for (const skill of flattenDomainSkills(index)) map.set(skill.name, skill);
  for (const skill of index.core || []) map.set(skill.name, skill);
  return map;
}

function scorePriority(priority) {
  if (priority === 'high') return 1.2;
  if (priority === 'low') return 0.8;
  return 1;
}

function scoreDomainCoherence(skill, loadedDomains = []) {
  if (!skill.domain) return 1;
  return loadedDomains.includes(skill.domain) ? 1.1 : 1;
}

function scoreSkill(query, skill, opts = {}) {
  const normalizedQuery = String(query || '').toLowerCase();
  const queryTokens = tokenize(query);
  let score = 0;
  let matchType = 'none';
  const matchedTriggers = new Set();

  for (const trigger of skill.triggers || []) {
    const normalizedTrigger = String(trigger).toLowerCase();
    if (!normalizedTrigger) continue;
    if (normalizedQuery.includes(normalizedTrigger)) {
      matchedTriggers.add(trigger);
      score = Math.max(score, 1);
      matchType = 'exact';
      continue;
    }

    if (normalizedTrigger.includes(normalizedQuery)) {
      matchedTriggers.add(trigger);
      if (0.6 > score) {
        score = 0.6;
        matchType = 'substring';
      }
      continue;
    }

    const triggerTokens = tokenize(trigger);
    const overlap = triggerTokens.filter((token) => queryTokens.includes(token));
    if (overlap.length > 0) {
      matchedTriggers.add(trigger);
      const overlapRatio = overlap.length / triggerTokens.length;
      const overlapScore = 0.3 * overlapRatio;
      if (overlapScore > score) {
        score = overlapScore;
        matchType = 'token_overlap';
      }
    }
  }

  return {
    ...skill,
    score: Number((score * scorePriority(skill.priority) * scoreDomainCoherence(skill, opts.loadedDomains || [])).toFixed(3)),
    matched_triggers: [...matchedTriggers],
    match_type: matchType,
  };
}

function detectCycles(index) {
  const skillMap = buildSkillMap(index);
  const warnings = [];
  const visiting = new Set();
  const visited = new Set();

  function walk(name, trail = []) {
    if (visiting.has(name)) {
      warnings.push(`circular dependency detected: ${[...trail, name].join(' -> ')}`);
      return;
    }
    if (visited.has(name)) return;
    visiting.add(name);
    const skill = skillMap.get(name);
    for (const dep of skill?.depends || []) {
      walk(dep, [...trail, name]);
    }
    visiting.delete(name);
    visited.add(name);
  }

  for (const name of skillMap.keys()) walk(name);
  return warnings;
}

export function resolveSkillDeps(skillName, index, loadedSkills = []) {
  const skillMap = buildSkillMap(index);
  const loaded = new Set(loadedSkills);
  const resolved = [];
  const visiting = new Set();

  function visit(name) {
    if (loaded.has(name) || visiting.has(name)) return;
    const skill = skillMap.get(name);
    if (!skill) return;
    visiting.add(name);
    resolved.push(name);
    for (const dep of skill.depends || []) visit(dep);
    visiting.delete(name);
  }

  visit(skillName);
  return resolved;
}

export function resolveAllSkillDeps(index, loadedSkills = []) {
  const graph = {};
  for (const skill of listAllSkills(index)) {
    graph[skill.name] = resolveSkillDeps(skill.name, index, loadedSkills);
  }
  return graph;
}

export function matchSkills(query, index, opts = {}) {
  const threshold = Number(opts.threshold ?? 0.5);
  const max = Number(opts.max ?? 5);
  const loadedSkills = opts.loadedSkills || [];
  const loadedSet = new Set(loadedSkills);

  const matches = flattenDomainSkills(index)
    .filter((skill) => !loadedSet.has(skill.name))
    .map((skill) => scoreSkill(query, skill, opts))
    .filter((skill) => skill.score >= threshold)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, max)
    .map((skill) => ({
      name: skill.name,
      score: skill.score,
      matched_triggers: skill.matched_triggers,
      match_type: skill.match_type,
      domain: skill.domain || null,
      priority: skill.priority || 'normal',
      depends: skill.depends || [],
      load: true,
    }));

  const resolvedLoadList = [];
  for (const match of matches) {
    for (const name of resolveSkillDeps(match.name, index, [...loadedSkills, ...resolvedLoadList])) {
      if (!resolvedLoadList.includes(name)) resolvedLoadList.push(name);
    }
  }

  const skillMap = buildSkillMap(index);
  const coreTokens = (index.core || []).reduce((sum, skill) => sum + estimateTokens(skill), 0);
  const loadedDomainTokens = resolvedLoadList.reduce((sum, name) => {
    const skill = skillMap.get(name);
    return sum + (skill ? estimateTokens(skill) : 0);
  }, 0);

  return {
    query,
    matches,
    resolved_load_list: resolvedLoadList,
    context_cost_estimate: {
      core_tokens: coreTokens,
      loaded_domain_tokens: loadedDomainTokens,
      total_tokens: coreTokens + loadedDomainTokens,
    },
  };
}

export function validateIndex(index) {
  const warnings = [];
  const errors = [];
  const skillMap = buildSkillMap(index);
  const warningSet = new Set();

  function addWarning(message) {
    if (!warningSet.has(message)) {
      warningSet.add(message);
      warnings.push(message);
    }
  }

  for (const skill of flattenDomainSkills(index)) {
    if (skill.tier !== 'domain') errors.push(`invalid tier for ${skill.name}`);
    if (!skill.summary) addWarning(`missing summary for ${skill.name}`);
    if (!Array.isArray(skill.triggers) || skill.triggers.length === 0) {
      addWarning(`no triggers defined for ${skill.name}`);
    }
  }

  for (const skill of skillMap.values()) {
    for (const dep of skill.depends || []) {
      if (!skillMap.has(dep)) addWarning(`unknown dependency "${dep}" in ${skill.name}`);
    }
  }

  for (const warning of detectCycles(index)) addWarning(warning);

  for (const skill of skillMap.values()) {
    const visited = new Set();

    function visit(depName, trail = []) {
      if (visited.has(depName)) return;
      visited.add(depName);

      const depSkill = skillMap.get(depName);
      if (!depSkill) {
        if (trail.length > 0) {
          addWarning(`transitive dependency "${depName}" required by ${skill.name} via ${trail.join(' -> ')}`);
        }
        return;
      }

      for (const childDep of depSkill.depends || []) {
        visit(childDep, [...trail, depSkill.name]);
      }
    }

    for (const dep of skill.depends || []) visit(dep);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}
