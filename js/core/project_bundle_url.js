export function projectBundleUrl(value, base) {
  const url = new URL(String(value || '').trim(), base);
  const origin = new URL(base).origin;
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password) {
    throw new Error('Choose a project link on this server.');
  }
  if (!/\.(mforge|json)$/i.test(url.pathname)) throw new Error('Choose a .mforge or .json project link.');
  return url;
}

export async function readProjectBundleUrl(value, base, fetchImpl = globalThis.fetch) {
  const url = projectBundleUrl(value, base);
  const response = await fetchImpl(url.href, { redirect: 'error', credentials: 'same-origin' });
  if (!response.ok) throw new Error('Project could not be opened (HTTP ' + response.status + ').');
  return response.text();
}
