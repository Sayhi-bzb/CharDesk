import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { updateCheckPath } from './paths.mjs';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

export const MCP_NAME = 'chardesk-mcp';
export const MCP_VERSION = packageJson.version;
export const MCP_PACKAGE = packageJson.name;
const REGISTRY_URL = `https://registry.npmjs.org/${encodeURIComponent(MCP_PACKAGE)}/latest`;
const DEFAULT_TTL = 24 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT = 1500;

const parseVersion = (value) => {
  const match = typeof value === 'string' && value.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  return match ? match.slice(1, 4).map(Number) : undefined;
};

export const compareVersions = (left, right) => {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return undefined;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
};

const readCache = async (file) => {
  try {
    const value = JSON.parse(await readFile(file, 'utf8'));
    if (typeof value.latestVersion !== 'string' || !Number.isFinite(value.checkedAt)) return undefined;
    return value;
  } catch (error) {
    if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    return undefined;
  }
};

const writeCache = async (file, value) => {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value), { mode: 0o600 });
};

const fetchLatest = async (fetchImpl, timeout) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  timer.unref?.();
  try {
    const response = await fetchImpl(REGISTRY_URL, { headers: { accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`npm registry returned ${response.status}`);
    const value = await response.json();
    if (typeof value?.version !== 'string' || !parseVersion(value.version)) throw new Error('npm registry returned an invalid version');
    return value.version;
  } finally {
    clearTimeout(timer);
  }
};

export async function checkForUpdate({ cacheFile = updateCheckPath(), fetchImpl = globalThis.fetch, now = Date.now(), ttl = DEFAULT_TTL, timeout = DEFAULT_TIMEOUT } = {}) {
  const cached = await readCache(cacheFile);
  if (cached && now - cached.checkedAt < ttl) {
    return { currentVersion: MCP_VERSION, latestVersion: cached.latestVersion, updateAvailable: compareVersions(cached.latestVersion, MCP_VERSION) === 1, checkedAt: cached.checkedAt, cached: true };
  }
  if (typeof fetchImpl !== 'function') return { currentVersion: MCP_VERSION, latestVersion: undefined, updateAvailable: false, cached: false };
  try {
    const latestVersion = await fetchLatest(fetchImpl, timeout);
    await writeCache(cacheFile, { latestVersion, checkedAt: now });
    return { currentVersion: MCP_VERSION, latestVersion, updateAvailable: compareVersions(latestVersion, MCP_VERSION) === 1, checkedAt: now, cached: false };
  } catch {
    return { currentVersion: MCP_VERSION, latestVersion: cached?.latestVersion, updateAvailable: compareVersions(cached?.latestVersion, MCP_VERSION) === 1, checkedAt: cached?.checkedAt, cached: Boolean(cached) };
  }
}

export async function announceUpdateIfAvailable(options = {}) {
  if (process.env.CHARDESK_MCP_UPDATE_CHECK === '0') return undefined;
  try {
    const result = await checkForUpdate(options);
    if (result.updateAvailable) console.error(`@chardesk/mcp update available: ${result.currentVersion} → ${result.latestVersion}. Run: npx -y @chardesk/mcp@latest`);
    return result;
  } catch {
    return undefined;
  }
}
