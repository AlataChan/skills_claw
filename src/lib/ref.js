import path from 'node:path';

export function parseSkillRef(ref) {
  if (ref.startsWith('github:')) {
    const body = ref.slice('github:'.length);
    const [repo, hash] = body.split('@');
    return { type: 'github', repo, hash: hash || 'HEAD' };
  }
  if (ref.startsWith('./') || ref.startsWith('/') || ref.endsWith('.yaml') || ref.endsWith('.yml') || ref.endsWith('.json')) {
    return { type: 'local', path: path.resolve(ref) };
  }
  const [name, version] = ref.split('@');
  return { type: 'registry', name, version: version || 'latest' };
}
