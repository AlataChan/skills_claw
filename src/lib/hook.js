import { resolveSkillDeps } from './router.js';

function toSkillContent(skill) {
  return {
    name: skill.name,
    tier: skill.tier,
    body: skill.body,
    depends: skill.depends || [],
  };
}

export function estimateTokens(serializedText) {
  return Math.ceil(String(serializedText || '').length / 4);
}

export function wrapHookPayload(type, data, meta = {}) {
  return {
    type,
    data,
    meta: {
      generated_at: new Date().toISOString(),
      token_estimate: estimateTokens(JSON.stringify(data)),
      ...meta,
    },
  };
}

export function buildCoreSkillsPayload(skills) {
  const coreSkills = skills
    .filter((skill) => skill.tier === 'core')
    .map(toSkillContent);

  return wrapHookPayload('core_skills', {
    skills: coreSkills,
    combined_body: coreSkills.map((skill) => skill.body).filter(Boolean).join('\n\n'),
  }, { skill_count: coreSkills.length });
}

export function buildRoutingTablePayload(index) {
  return wrapHookPayload('routing_table', index, { skill_count: index.skill_count || 0 });
}

export function buildMatchResultPayload(result, skillCount = 0) {
  return wrapHookPayload('match_result', result, { skill_count: skillCount });
}

export function buildSkillContentPayload(index, skills, skillName, opts = {}) {
  const names = opts.withDeps ? resolveSkillDeps(skillName, index) : [skillName];
  const selected = names
    .map((name) => skills.find((skill) => skill.name === name))
    .filter(Boolean)
    .map(toSkillContent);

  return wrapHookPayload('skill_content', {
    skills: selected,
    combined_body: selected.map((skill) => skill.body).filter(Boolean).join('\n\n'),
  }, { skill_count: selected.length });
}

export function emitHookConfig(target) {
  if (target !== 'claude-code') throw new Error(`unsupported hook target: ${target}`);
  return {
    template_variables: {
      user_input: '__USER_INPUT__',
    },
    notes: [
      'Replace __USER_INPUT__ with the host-provided tool input expression before enabling the PreToolUse hook.',
    ],
    hooks: {
      SessionStart: [
        {
          matcher: 'startup|resume|clear|compact',
          hooks: [
            { type: 'command', command: 'skill index core --json' },
            { type: 'command', command: 'skill index show --json' },
          ],
        },
      ],
      PreToolUse: [
        {
          matcher: 'Read|Edit|Write|Bash',
          hooks: [
            { type: 'command', command: 'skill index match "__USER_INPUT__" --json' },
          ],
        },
      ],
    },
  };
}
