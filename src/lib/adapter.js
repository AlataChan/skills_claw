import { spawn } from 'node:child_process';

export function builtInAdapters() {
  return ['claude-code', 'openai', 'anthropic-api'];
}

export async function runAdapterProcess(adapterCmd, payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(adapterCmd, [], { shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', () => {
      if (!out.trim()) return reject(new Error(err || 'adapter returned empty output'));
      try {
        const parsed = JSON.parse(out);
        resolve(parsed);
      } catch {
        reject(new Error(`invalid adapter json: ${out}`));
      }
    });
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

export function emitBuiltIn(target, manifest) {
  if (target === 'openai') {
    return {
      files: [
        {
          path: 'tools.json',
          content: JSON.stringify((manifest.mcp_deps || []).map((d) => ({ type: 'function', function: { name: d.tool, description: d.description || '' } })), null, 2),
        },
        { path: 'system.md', content: manifest.system_prompt || '' },
      ],
    };
  }
  if (target === 'claude-code') {
    return {
      files: [{ path: `.claude/skills/${manifest.name}/skill.md`, content: `# ${manifest.name}\n\n${manifest.system_prompt || ''}` }],
    };
  }
  if (target === 'anthropic-api') {
    return {
      files: [{ path: 'tool_use.json', content: JSON.stringify((manifest.mcp_deps || []).map((d) => ({ name: d.tool, description: d.description || '' })), null, 2) }],
    };
  }
  throw new Error(`unsupported target: ${target}`);
}
