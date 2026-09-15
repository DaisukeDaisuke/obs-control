import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_URL = 'ws://127.0.0.1:4455';
const DEFAULT_CONNECT_TIMEOUT_MS = 5000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;
const DEFAULT_CONFIG_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'config.toml');

function stripComment(line) {
  let quote = null;
  let escaped = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quote === '"') {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quote = null;
      continue;
    }
    if (quote === "'") {
      if (char === "'") quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '#') return line.slice(0, i);
  }
  return line;
}

function parseValue(raw, lineNumber) {
  const value = raw.trim();
  if (value.startsWith('"')) {
    if (!value.endsWith('"')) throw new Error(`Unterminated TOML string at line ${lineNumber}`);
    try {
      return JSON.parse(value);
    } catch (error) {
      throw new Error(`Invalid TOML string at line ${lineNumber}: ${error.message}`);
    }
  }
  if (value.startsWith("'")) {
    if (!value.endsWith("'")) throw new Error(`Unterminated TOML literal string at line ${lineNumber}`);
    return value.slice(1, -1);
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^[+-]?\d+$/.test(value)) {
    const number = Number(value);
    if (!Number.isSafeInteger(number)) throw new Error(`TOML integer is out of range at line ${lineNumber}`);
    return number;
  }
  throw new Error(`Unsupported TOML value at line ${lineNumber}`);
}

export function parseConfigToml(text) {
  if (typeof text !== 'string') throw new Error('TOML config must be text');
  const result = {};
  let section = null;
  for (const [index, originalLine] of text.split(/\r?\n/).entries()) {
    const lineNumber = index + 1;
    const line = stripComment(originalLine).trim();
    if (!line) continue;
    if (line.startsWith('[')) {
      const match = /^\[([A-Za-z0-9_-]+)\]$/.exec(line);
      if (!match) throw new Error(`Unsupported TOML section syntax at line ${lineNumber}`);
      section = match[1];
      result[section] ??= {};
      continue;
    }
    if (!section) throw new Error(`TOML key must be inside a section at line ${lineNumber}`);
    const match = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);
    if (!match) throw new Error(`Invalid TOML assignment at line ${lineNumber}`);
    const [, key, rawValue] = match;
    if (Object.hasOwn(result[section], key)) throw new Error(`Duplicate TOML key ${section}.${key} at line ${lineNumber}`);
    result[section][key] = parseValue(rawValue, lineNumber);
  }
  return result;
}

function positiveInteger(value, label, fallback) {
  if (value === undefined || value === '') return fallback;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${label} must be a positive integer`);
  return number;
}

function normalizeObsSection(section = {}) {
  const allowed = new Set(['url', 'password', 'connect_timeout_ms', 'request_timeout_ms']);
  for (const key of Object.keys(section)) {
    if (!allowed.has(key)) throw new Error(`Unknown [obs] config key: ${key}`);
  }
  if (section.url !== undefined && (typeof section.url !== 'string' || section.url.length === 0)) {
    throw new Error('[obs].url must be a non-empty string');
  }
  if (section.password !== undefined && typeof section.password !== 'string') {
    throw new Error('[obs].password must be a string');
  }
  return section;
}

export async function loadServerConfig({ env = process.env, configPath = undefined } = {}) {
  const requestedPath = configPath ?? env.OBS_MCP_CONFIG ?? DEFAULT_CONFIG_PATH;
  const resolvedPath = isAbsolute(requestedPath) ? requestedPath : resolve(process.cwd(), requestedPath);
  let parsed = {};
  let configLoaded = false;
  try {
    parsed = parseConfigToml(await readFile(resolvedPath, 'utf8'));
    configLoaded = true;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const obs = normalizeObsSection(parsed.obs);
  const url = env.OBS_WEBSOCKET_URL !== undefined ? env.OBS_WEBSOCKET_URL : (obs.url ?? DEFAULT_URL);
  const password = env.OBS_WEBSOCKET_PASSWORD !== undefined ? env.OBS_WEBSOCKET_PASSWORD : (obs.password ?? '');
  if (typeof url !== 'string' || url.length === 0) throw new Error('OBS WebSocket URL must be a non-empty string');
  if (typeof password !== 'string') throw new Error('OBS WebSocket password must be a string');
  return {
    configPath: resolvedPath,
    configLoaded,
    obs: {
      url,
      password,
      connectTimeoutMs: positiveInteger(
        env.OBS_WEBSOCKET_CONNECT_TIMEOUT_MS ?? obs.connect_timeout_ms,
        'OBS WebSocket connect timeout',
        DEFAULT_CONNECT_TIMEOUT_MS,
      ),
      requestTimeoutMs: positiveInteger(
        env.OBS_WEBSOCKET_REQUEST_TIMEOUT_MS ?? obs.request_timeout_ms,
        'OBS WebSocket request timeout',
        DEFAULT_REQUEST_TIMEOUT_MS,
      ),
    },
  };
}

