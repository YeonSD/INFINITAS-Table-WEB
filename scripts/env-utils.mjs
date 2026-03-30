import fs from 'node:fs';
import path from 'node:path';

function parseEnvLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const eqIndex = trimmed.indexOf('=');
  if (eqIndex < 0) return null;
  const key = trimmed.slice(0, eqIndex).trim();
  if (!key) return null;
  let value = trimmed.slice(eqIndex + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  value = value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t');
  return [key, value];
}

export function loadLocalEnv(rootDir) {
  const nodeEnv = String(process.env.NODE_ENV || '').trim();
  const lockedKeys = new Set(Object.keys(process.env));
  const files = [
    '.env',
    nodeEnv ? `.env.${nodeEnv}` : '',
    '.env.local',
    nodeEnv ? `.env.${nodeEnv}.local` : ''
  ].filter(Boolean);
  files.forEach((name) => {
    const filePath = path.join(rootDir, name);
    if (!fs.existsSync(filePath)) return;
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    lines.forEach((line) => {
      const pair = parseEnvLine(line);
      if (!pair) return;
      const [key, value] = pair;
      if (lockedKeys.has(key)) return;
      process.env[key] = value;
    });
  });
}

export function readRequiredEnv(name, fallbacks = []) {
  const candidates = [name, ...fallbacks];
  for (const key of candidates) {
    const value = String(process.env[key] || '').trim();
    if (value) return value;
  }
  throw new Error(`Missing required environment variable: ${name}`);
}
