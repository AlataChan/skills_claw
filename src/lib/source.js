function filenameFromUrl(url) {
  return new URL(url).pathname.split('/').pop() || 'skill.md';
}

export async function fetchUrlSkill(fetchImpl, url) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`cannot fetch ${url}`);
  return {
    url,
    text: await res.text(),
    filename: filenameFromUrl(url),
  };
}

export async function fetchRemoteSkill(fetchImpl, repo, hash) {
  const candidates = ['skill.md', 'SKILL.md', 'skill.yaml'];
  for (const file of candidates) {
    const url = `https://raw.githubusercontent.com/${repo}/${hash}/${file}`;
    const res = await fetchImpl(url);
    if (!res.ok) continue;
    return {
      url,
      text: await res.text(),
      filename: file,
    };
  }
  throw new Error(`no supported skill file found for ${repo}@${hash}`);
}
