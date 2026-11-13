import { execFile } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const UPSTREAM = 'aws-samples/sample-client-for-amazon-bedrock';
const MAIN = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);
const OLD_MAIN = 'c'.repeat(40);
const OLD_HEAD = 'd'.repeat(40);
const MERGE = 'e'.repeat(40);
const MAIN_AFTER_MERGE = 'f'.repeat(40);

const pinText = (base: string, pr = '', head = '') =>
  [
    '# BRClient source that scripts/fetch-brclient.sh builds for the images and the lambda-web package.',
    '# Written by scripts/resolve-brclient.mjs. Commit it with the release.',
    'BRCLIENT_REPO=https://github.com/aws-samples/sample-client-for-amazon-bedrock.git',
    `BRCLIENT_BASE=${base}`,
    `BRCLIENT_PR=${pr}`,
    `BRCLIENT_PR_HEAD=${head}`,
    '',
  ].join('\n');

type Pull = Record<string, unknown>;
const pull = (over: Pull = {}): Pull => ({
  merged: false,
  state: 'open',
  base: { ref: 'main' },
  head: { sha: HEAD },
  merge_commit_sha: MERGE,
  ...over,
});

describe('resolve-brclient.mjs', () => {
  let server: Server;
  let dir: string;
  let pins: string;
  let requests: string[];
  let pulls: Record<string, { status: number; body: unknown }>;
  let mainStatus: number;
  let mainSha: string;
  let inMain: Set<string>;
  let afterFirstRequest: (() => void) | null;

  beforeEach(async () => {
    requests = [];
    pulls = {};
    mainStatus = 200;
    mainSha = MAIN;
    inMain = new Set([MERGE]);
    afterFirstRequest = null;
    dir = mkdtempSync(join(tmpdir(), 'resolve-brclient-'));
    mkdirSync(join(dir, 'scripts'));
    copyFileSync('scripts/resolve-brclient.mjs', join(dir, 'scripts/resolve-brclient.mjs'));
    pins = join(dir, 'scripts/brclient.source');
    server = createServer((req, res) => {
      requests.push(`${req.method} ${req.url} ${req.headers['user-agent'] ? 'ua' : 'no-ua'}`);
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(typeof body === 'string' ? body : JSON.stringify(body));
      };
      const answer = (status: number, body: unknown) => {
        send(status, body);
        if (afterFirstRequest) {
          afterFirstRequest();
          afterFirstRequest = null;
        }
      };
      const path = req.url?.split('?')[0];
      if (path === `/repos/${UPSTREAM}/git/ref/heads/main`) {
        return answer(mainStatus, { object: { sha: mainSha } });
      }
      const cmp = path?.match(new RegExp(`^/repos/${UPSTREAM}/compare/([0-9a-f]{40})\\.\\.\\.([0-9a-f]{40})$`));
      if (cmp) {
        const status = cmp[1] === cmp[2] ? 'identical' : cmp[2] === mainSha && inMain.has(cmp[1]) ? 'ahead' : 'diverged';
        return answer(200, { status });
      }
      const m = path?.match(new RegExp(`^/repos/${UPSTREAM}/pulls/(\\d+)$`));
      const hit = m && pulls[m[1]];
      if (hit) return answer(hit.status, hit.body);
      answer(404, { message: 'Not Found' });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  });

  afterEach(async () => {
    await new Promise((r) => server.close(r));
    rmSync(dir, { recursive: true, force: true });
  });

  const run = (...args: string[]) =>
    new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
      const port = (server.address() as AddressInfo).port;
      execFile(
        'node',
        [join(dir, 'scripts/resolve-brclient.mjs'), ...args],
        { env: { PATH: process.env.PATH, BRCLIENT_GITHUB_API: `http://127.0.0.1:${port}` } },
        (err, stdout, stderr) =>
          resolve({ code: err ? ((err as { code?: number }).code ?? 1) : 0, stdout, stderr }),
      );
    });

  const prRequests = () => requests.filter((r) => r.includes('/pulls/'));

  it('pins main plus the head of an open unmerged PR', async () => {
    pulls['82'] = { status: 200, body: pull() };
    const r = await run('--pr', '82');
    expect(r.code).toBe(0);
    expect(readFileSync(pins, 'utf8')).toBe(pinText(MAIN, '82', HEAD));
    expect(r.stdout).toBe(pinText(MAIN, '82', HEAD));
    expect(requests.every((q) => q.endsWith(' ua'))).toBe(true);
  });

  it('pins main only when the PR is already merged', async () => {
    pulls['82'] = { status: 200, body: pull({ merged: true, state: 'closed' }) };
    const r = await run('--pr', '82');
    expect(r.code).toBe(0);
    expect(readFileSync(pins, 'utf8')).toBe(pinText(MAIN));
  });

  it('pins a main that holds the PR when the PR is merged between its requests', async () => {
    pulls['82'] = { status: 200, body: pull() };
    afterFirstRequest = () => {
      mainSha = MAIN_AFTER_MERGE;
      inMain.add(MAIN_AFTER_MERGE);
      pulls['82'] = { status: 200, body: pull({ merged: true, state: 'closed', merge_commit_sha: MAIN_AFTER_MERGE }) };
    };
    const r = await run('--pr', '82');
    expect(r.code).toBe(0);
    const pin = readFileSync(pins, 'utf8');
    expect([pinText(MAIN_AFTER_MERGE), pinText(MAIN_AFTER_MERGE, '82', HEAD)]).toContain(pin);
  });

  it('pins main only for --pr none without asking about any PR', async () => {
    writeFileSync(pins, pinText(OLD_MAIN, '82', OLD_HEAD));
    const r = await run('--pr', 'none');
    expect(r.code).toBe(0);
    expect(readFileSync(pins, 'utf8')).toBe(pinText(MAIN));
    expect(prRequests()).toEqual([]);
  });

  it('reuses the PR from the existing pin file when --pr is absent', async () => {
    writeFileSync(pins, pinText(OLD_MAIN, '82', OLD_HEAD));
    pulls['82'] = { status: 200, body: pull() };
    const r = await run();
    expect(r.code).toBe(0);
    expect(readFileSync(pins, 'utf8')).toBe(pinText(MAIN, '82', HEAD));
  });

  it('drops the PR on a later run once it is merged, and stays on main after that', async () => {
    writeFileSync(pins, pinText(OLD_MAIN, '82', OLD_HEAD));
    pulls['82'] = { status: 200, body: pull({ merged: true, state: 'closed' }) };
    expect((await run()).code).toBe(0);
    requests = [];
    expect((await run()).code).toBe(0);
    expect(readFileSync(pins, 'utf8')).toBe(pinText(MAIN));
    expect(prRequests()).toEqual([]);
  });

  it('pins main only without a pin file and without --pr', async () => {
    const r = await run();
    expect(r.code).toBe(0);
    expect(readFileSync(pins, 'utf8')).toBe(pinText(MAIN));
    expect(prRequests()).toEqual([]);
  });

  describe('failures leave the existing pin file untouched', () => {
    const before = pinText(OLD_MAIN, '82', OLD_HEAD);
    beforeEach(() => writeFileSync(pins, before));

    it('closed without merging', async () => {
      pulls['82'] = { status: 200, body: pull({ state: 'closed' }) };
      const r = await run('--pr', '82');
      expect(r.code).not.toBe(0);
      expect(r.stderr).toContain('--pr none');
      expect(readFileSync(pins, 'utf8')).toBe(before);
    });

    it('merged PR whose merge commit is not in main yet', async () => {
      pulls['82'] = { status: 200, body: pull({ merged: true, state: 'closed' }) };
      inMain.clear();
      const r = await run('--pr', '82');
      expect(r.code).not.toBe(0);
      expect(r.stderr).toContain(MERGE);
      expect(readFileSync(pins, 'utf8')).toBe(before);
    });

    it('PR does not target main', async () => {
      pulls['82'] = { status: 200, body: pull({ base: { ref: 'next' } }) };
      const r = await run('--pr', '82');
      expect(r.code).not.toBe(0);
      expect(readFileSync(pins, 'utf8')).toBe(before);
    });

    it('PR lookup returns 404', async () => {
      const r = await run('--pr', '999');
      expect(r.code).not.toBe(0);
      expect(readFileSync(pins, 'utf8')).toBe(before);
    });

    it('main lookup fails', async () => {
      mainStatus = 500;
      const r = await run('--pr', 'none');
      expect(r.code).not.toBe(0);
      expect(readFileSync(pins, 'utf8')).toBe(before);
    });

    it('PR head sha is not 40 lowercase hex', async () => {
      pulls['82'] = { status: 200, body: pull({ head: { sha: 'ABC' } }) };
      const r = await run('--pr', '82');
      expect(r.code).not.toBe(0);
      expect(readFileSync(pins, 'utf8')).toBe(before);
    });

    it('response is not JSON', async () => {
      pulls['82'] = { status: 200, body: 'not json' };
      const r = await run('--pr', '82');
      expect(r.code).not.toBe(0);
      expect(readFileSync(pins, 'utf8')).toBe(before);
    });

    it('--pr is not a number or none', async () => {
      const r = await run('--pr', 'abc');
      expect(r.code).not.toBe(0);
      expect(readFileSync(pins, 'utf8')).toBe(before);
    });
  });
});
