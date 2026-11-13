import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
UPSTREAM_URL = 'https://github.com/aws-samples/sample-client-for-amazon-bedrock.git'
GIT_ENV = {
    'GIT_AUTHOR_NAME': 't', 'GIT_AUTHOR_EMAIL': 't@example.com',
    'GIT_COMMITTER_NAME': 't', 'GIT_COMMITTER_EMAIL': 't@example.com',
    'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_CONFIG_SYSTEM': '/dev/null',
}

# `export` writes the sources it sees into out/, so a test can tell which source was built.
STUBS = {
    'node': 'echo "${NODE_VERSION:-v22.1.0}"',
    'npx': r'''[ "$1" = -y ] || exit 64
case "$3" in
  install) ;;
  export)
    mkdir -p out
    cat a.txt b.txt 2>/dev/null > out/index.html || true
    echo "$2" > out/yarn
    echo "secret=${NEXT_PUBLIC_SECRET-unset} telemetry=${NEXT_TELEMETRY_DISABLED-unset}" > out/env
    ;;
  *) exit 64 ;;
esac''',
    'npm': r'''if [ "$1" = install ]; then
  mkdir -p node_modules/@img/sharp-linux-arm64/lib
  : > node_modules/@img/sharp-linux-arm64/lib/sharp-linux-arm64-0.35.5.node
fi''',
    'zip': ': > "$2"',
}


def git(cwd, *args):
    return subprocess.run(['git', *args], cwd=cwd, env={**os.environ, **GIT_ENV}, check=True,
                          capture_output=True, text=True).stdout.strip()


def commit(cwd, files, message):
    for name, body in files.items():
        (cwd / name).write_text(body)
    git(cwd, 'add', '-A')
    git(cwd, 'commit', '-q', '-m', message)
    return git(cwd, 'rev-parse', 'HEAD')


class Upstream:
    """A local stand-in for the upstream repository: main, plus a PR head that is not a branch."""

    def __init__(self, path, conflict=False):
        self.path = path
        path.mkdir()
        git(path, 'init', '-q', '-b', 'main')
        git(path, 'config', 'uploadpack.allowAnySHA1InWant', 'true')
        git(path, 'config', 'uploadpack.allowFilter', 'true')
        pkg = '{"name": "client", "packageManager": "yarn@1.22.22+sha512.abc"}\n'
        root = commit(path, {'package.json': pkg, 'a.txt': 'base\n'}, 'root')
        if conflict:
            git(path, 'checkout', '-q', '-b', 'pr', root)
            self.pr_head = commit(path, {'a.txt': 'from the PR\n'}, 'pr change')
            git(path, 'checkout', '-q', 'main')
            self.base = commit(path, {'a.txt': 'from main\n'}, 'main change')
        else:
            self.base = root
            git(path, 'checkout', '-q', '-b', 'pr')
            self.pr_head = commit(path, {'b.txt': 'from the PR\n'}, 'pr change')
            git(path, 'checkout', '-q', 'main')
        git(path, 'update-ref', 'refs/pull/82/head', self.pr_head)
        git(path, 'branch', '-q', '-D', 'pr')

    @property
    def tree_of_merge(self):
        scratch = self.path.parent / 'scratch'
        shutil.rmtree(scratch, ignore_errors=True)
        git(self.path.parent, 'clone', '-q', self.path.as_uri(), 'scratch')
        git(scratch, 'fetch', '-q', 'origin', self.pr_head)
        git(scratch, 'checkout', '-q', '--detach', self.base)
        git(scratch, 'merge', '--no-commit', '--no-ff', '-q', self.pr_head)
        return git(scratch, 'write-tree')

    def pin(self, base=None, pr='82', pr_head=None):
        pr_head = self.pr_head if pr_head is None else pr_head
        return (
            '# comment\n'
            f'BRCLIENT_REPO={self.path.as_uri()}\n'
            f'BRCLIENT_BASE={base or self.base}\n'
            f'BRCLIENT_PR={pr}\n'
            f'BRCLIENT_PR_HEAD={pr_head if pr else ""}\n'
        )


def make_repo(tmp_path, pin, *scripts):
    repo, stubs = tmp_path / 'repo', tmp_path / 'stubs'
    (repo / 'scripts').mkdir(parents=True)
    for script in scripts:
        shutil.copy(REPO / 'scripts' / script, repo / 'scripts')
    (repo / 'scripts/brclient.source').write_text(pin)
    stubs.mkdir()
    for name, body in STUBS.items():
        (stubs / name).write_text('#!/bin/bash\n' + body + '\n')
        (stubs / name).chmod(0o755)
    return repo, stubs


def run(cmd, repo, stubs, tmp_path, **extra):
    home = tmp_path / 'home'
    home.mkdir(exist_ok=True)
    # Build hosts and containers have no git identity, and git cannot guess one from their host names.
    env = {'PATH': f'{stubs}:/usr/bin:/bin', 'STUB_DIR': str(stubs), 'HOME': str(home),
           'TMPDIR': str(tmp_path), 'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_CONFIG_SYSTEM': '/dev/null',
           'GIT_CONFIG_COUNT': '1', 'GIT_CONFIG_KEY_0': 'user.useConfigOnly', 'GIT_CONFIG_VALUE_0': 'true',
           **extra}
    return subprocess.run(['bash', *cmd], cwd=repo, env=env, capture_output=True, text=True, timeout=120)


def fetch(tmp_path, pin, dest='out/brclient', **extra):
    repo, stubs = make_repo(tmp_path, pin, 'fetch-brclient.sh')
    proc = run(['scripts/fetch-brclient.sh', dest], repo, stubs, tmp_path, **extra)
    return proc, repo / dest


def source_file(dest):
    return dict(re.findall(r'^(\w+)=(.*)$', (dest / '.source').read_text(), re.M))


@pytest.fixture
def upstream(tmp_path):
    return Upstream(tmp_path / 'upstream')


def test_overlay_builds_the_pinned_base_merged_with_the_pinned_pr_head(tmp_path, upstream):
    proc, dest = fetch(tmp_path, upstream.pin())
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert (dest / 'index.html').read_text() == 'base\nfrom the PR\n'
    assert source_file(dest) == {
        'BRCLIENT_REPO': upstream.path.as_uri(),
        'BRCLIENT_BASE': upstream.base,
        'BRCLIENT_PR': '82',
        'BRCLIENT_PR_HEAD': upstream.pr_head,
        'BRCLIENT_TREE': upstream.tree_of_merge,
    }
    assert proc.stdout.strip().endswith((dest / '.source').read_text().strip())


def test_base_only_builds_main_and_records_empty_pr_keys(tmp_path, upstream):
    proc, dest = fetch(tmp_path, upstream.pin(pr=''))
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert (dest / 'index.html').read_text() == 'base\n'
    recorded = source_file(dest)
    assert recorded['BRCLIENT_PR'] == '' and recorded['BRCLIENT_PR_HEAD'] == ''
    assert recorded['BRCLIENT_TREE'] == git(upstream.path, 'rev-parse', f'{upstream.base}^{{tree}}')


def test_build_uses_the_yarn_version_of_the_source_and_not_the_callers_environment(tmp_path, upstream):
    proc, dest = fetch(tmp_path, upstream.pin(pr=''), NEXT_PUBLIC_SECRET='leak')
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert (dest / 'yarn').read_text().strip() == 'yarn@1.22.22'
    assert (dest / 'env').read_text().strip() == 'secret=unset telemetry=1'


def test_a_pinned_pr_head_the_remote_no_longer_has_fails_and_creates_nothing(tmp_path, upstream):
    proc, dest = fetch(tmp_path, upstream.pin(pr_head='f' * 40))
    assert proc.returncode != 0
    assert not dest.exists()


def test_a_merge_conflict_fails_and_creates_nothing(tmp_path):
    conflicting = Upstream(tmp_path / 'upstream', conflict=True)
    proc, dest = fetch(tmp_path, conflicting.pin())
    assert proc.returncode != 0
    assert 'resolve-brclient' in proc.stderr
    assert not dest.exists()


def test_a_failed_build_keeps_the_previous_output(tmp_path, upstream):
    proc, dest = fetch(tmp_path, upstream.pin(pr=''))
    assert proc.returncode == 0
    (dest / 'marker').write_text('previous')
    (tmp_path / 'repo/scripts/brclient.source').write_text(upstream.pin(pr_head='f' * 40))
    stubs = tmp_path / 'stubs'
    proc = run(['scripts/fetch-brclient.sh', 'out/brclient'], tmp_path / 'repo', stubs, tmp_path)
    assert proc.returncode != 0
    assert (dest / 'marker').read_text() == 'previous'


@pytest.mark.parametrize(
    'edit',
    [
        lambda p: p.replace('BRCLIENT_BASE=', 'BRCLIENT_BASE=short'),
        lambda p: re.sub(r'BRCLIENT_PR_HEAD=.*', 'BRCLIENT_PR_HEAD=', p),
        lambda p: re.sub(r'BRCLIENT_PR=82', 'BRCLIENT_PR=', p),
        lambda p: re.sub(r'BRCLIENT_PR=82', 'BRCLIENT_PR=8x', p),
        lambda p: re.sub(r'BRCLIENT_PR_HEAD=.*', 'BRCLIENT_PR_HEAD=ABC', p),
        lambda p: re.sub(r'BRCLIENT_REPO=.*', 'BRCLIENT_REPO=', p),
    ],
    ids=['short-base', 'pr-without-head', 'head-without-pr', 'pr-not-digits', 'bad-head', 'no-repo'],
)
def test_a_malformed_pin_fails_and_creates_nothing(tmp_path, upstream, edit):
    proc, dest = fetch(tmp_path, edit(upstream.pin()))
    assert proc.returncode != 0
    assert not dest.exists()


def test_node_24_without_nvm_fails_naming_the_node_it_found(tmp_path, upstream):
    proc, dest = fetch(tmp_path, upstream.pin(pr=''), NODE_VERSION='v24.1.0')
    assert proc.returncode != 0
    assert 'v24.1.0' in proc.stderr
    assert not dest.exists()


def test_node_24_with_nvm_builds_with_node_22(tmp_path, upstream):
    nvm = tmp_path / 'nvm'
    (nvm / 'v22/bin').mkdir(parents=True)
    node22 = nvm / 'v22/bin/node'
    node22.write_text('#!/bin/bash\necho v22.9.0\n')
    node22.chmod(0o755)
    (nvm / 'nvm.sh').write_text(
        f'nvm() {{ case "$1" in install) ;; which) echo "{node22}" ;; esac; }}\n'
    )
    proc, dest = fetch(tmp_path, upstream.pin(pr=''), NODE_VERSION='v24.1.0', NVM_DIR=str(nvm))
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert (dest / 'index.html').read_text() == 'base\n'


def zip_build(tmp_path, pin):
    repo, stubs = make_repo(tmp_path, pin, 'fetch-brclient.sh', 'build-web-function-zip.sh')
    for path in ('server/index.js', 'frontend/index.html', 'cc/index.html', 'package.json'):
        (repo / 'dist' / path).parent.mkdir(parents=True, exist_ok=True)
        (repo / 'dist' / path).write_text('from dist')
    proc = run(['scripts/build-web-function-zip.sh'], repo, stubs, tmp_path)
    return proc, repo / 'build/webfn'


def test_package_serves_the_fetched_brclient_build(tmp_path, upstream):
    proc, out = zip_build(tmp_path, upstream.pin())
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert (out / 'stage/brclient/index.html').read_text() == 'base\nfrom the PR\n'
    assert source_file(out / 'stage/brclient')['BRCLIENT_PR_HEAD'] == upstream.pr_head
    assert (out / 'stage/server/index.js').read_text() == 'from dist'
    assert (out / 'function.zip').exists()


def test_package_build_fails_when_the_brclient_fetch_fails(tmp_path, upstream):
    proc, out = zip_build(tmp_path, upstream.pin(pr_head='f' * 40))
    assert proc.returncode != 0
    assert not (out / 'function.zip').exists()


def test_committed_pin_names_upstream_and_full_shas():
    text = (REPO / 'scripts/brclient.source').read_text()
    pin = dict(re.findall(r'^(\w+)=(.*)$', text, re.M))
    assert pin.keys() == {'BRCLIENT_REPO', 'BRCLIENT_BASE', 'BRCLIENT_PR', 'BRCLIENT_PR_HEAD'}
    assert pin['BRCLIENT_REPO'] == UPSTREAM_URL
    assert re.fullmatch(r'[0-9a-f]{40}', pin['BRCLIENT_BASE'])
    if pin['BRCLIENT_PR'] or pin['BRCLIENT_PR_HEAD']:
        assert re.fullmatch(r'\d+', pin['BRCLIENT_PR'])
        assert re.fullmatch(r'[0-9a-f]{40}', pin['BRCLIENT_PR_HEAD'])


@pytest.mark.parametrize('name', ['Dockerfile', 'lambda.Dockerfile'])
def test_image_builds_brclient_once_on_the_build_platform_and_ships_it(name):
    text = (REPO / name).read_text()
    stage = re.search(r'^FROM --platform=\$BUILDPLATFORM \S+ AS brclient\n((?:(?!FROM ).*\n)+)', text, re.M)
    assert stage, 'no brclient stage on the build platform'
    assert 'scripts/fetch-brclient.sh' in stage.group(1)
    assert re.search(r'^COPY --from=brclient /brclient /app/brclient$', text, re.M)


def test_dockerignore_keeps_a_stale_brclient_out_of_the_image_context():
    assert 'dist/brclient' in (REPO / '.dockerignore').read_text().split()
