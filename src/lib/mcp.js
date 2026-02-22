export async function listHubTools(hubUrl) {
  const url = `${hubUrl.replace(/\/$/, '')}/tools/list`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`mcp hub unreachable: ${url}`);
  const data = await res.json();
  return data.tools || data.result?.tools || [];
}

export async function checkDeps(manifest, hubUrl) {
  const tools = await listHubTools(hubUrl);
  const names = new Set(tools.map((t) => t.name));
  const missingRequired = [];
  const missingOptional = [];
  for (const dep of manifest.mcp_deps || []) {
    if (!names.has(dep.tool)) {
      if (dep.required) missingRequired.push(dep.tool);
      else missingOptional.push(dep.tool);
    }
  }
  return { ok: missingRequired.length === 0, missingRequired, missingOptional };
}
