#!/usr/bin/env node
// Decides which upstream BRClient source a release builds and writes it to scripts/brclient.source.
// Usage: node scripts/resolve-brclient.mjs [--pr <number> | --pr none]
// Without --pr, the PR recorded in the existing brclient.source is looked up again.
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const UPSTREAM = 'aws-samples/sample-client-for-amazon-bedrock';
const API = process.env.BRCLIENT_GITHUB_API || 'https://api.github.com';
const SOURCE_FILE = join(dirname(fileURLToPath(import.meta.url)), 'brclient.source');
const SHA = /^[0-9a-f]{40}$/;

export function decidePin(mainSha, pr, pull) {
  const base = { base: mainSha, pr: '', prHead: '' };
  if (pr === null) return base;
  if (pull.base?.ref !== 'main') {
    throw new Error(`PR #${pr} targets "${pull.base?.ref}", not main. Rerun with --pr none or another PR.`);
  }
  if (pull.merged === true) return base;
  if (pull.state === 'open') return { base: mainSha, pr: String(pr), prHead: pull.head?.sha };
  throw new Error(`PR #${pr} was closed without merging. Rerun with --pr none or another PR.`);
}

function render({ base, pr, prHead }) {
  for (const sha of [base, ...(prHead ? [prHead] : [])]) {
    if (!SHA.test(sha ?? '')) throw new Error(`"${sha}" is not a 40 character lowercase hex sha`);
  }
  return [
    '# BRClient source that scripts/fetch-brclient.sh builds for the images and the lambda-web package.',
    '# Written by scripts/resolve-brclient.mjs. Commit it with the release.',
    `BRCLIENT_REPO=https://github.com/${UPSTREAM}.git`,
    `BRCLIENT_BASE=${base}`,
    `BRCLIENT_PR=${pr}`,
    `BRCLIENT_PR_HEAD=${prHead}`,
    '',
  ].join('\n');
}

async function get(path) {
  const res = await fetch(`${API}/repos/${UPSTREAM}/${path}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'brconnector-resolve-brclient' },
  });
  if (!res.ok) throw new Error(`GET ${path} returned HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new Error(`GET ${path} returned a body that is not JSON`);
  }
}

function requestedPr(argv) {
  const i = argv.indexOf('--pr');
  const value = i >= 0 ? argv[i + 1] : undefined;
  if (value === undefined) {
    if (i >= 0) throw new Error('--pr needs a number or "none"');
    try {
      return readFileSync(SOURCE_FILE, 'utf8').match(/^BRCLIENT_PR=(\d+)$/m)?.[1] ?? null;
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  }
  if (value === 'none') return null;
  if (!/^\d+$/.test(value)) throw new Error(`--pr must be a number or "none", got "${value}"`);
  return value;
}

async function main() {
  const pr = requestedPr(process.argv.slice(2));
  const mainSha = (await get('git/ref/heads/main')).object?.sha;
  const pull = pr === null ? null : await get(`pulls/${pr}`);
  const text = render(decidePin(mainSha, pr, pull));
  const tmp = `${SOURCE_FILE}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, SOURCE_FILE);
  process.stdout.write(text);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`resolve-brclient: ${e.message}`);
    process.exit(1);
  });
}
