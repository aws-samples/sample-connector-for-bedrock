import hashlib
import io
import re
import shutil
import subprocess
import tarfile
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
REPOSITORY = 'example/brconnector'

STUBS = {
    'npm': r'''if [ "$1" = install ]; then
  mkdir -p node_modules/@img/sharp-linux-arm64/lib
  : > node_modules/@img/sharp-linux-arm64/lib/sharp-linux-arm64-0.35.5.node
fi''',
    'zip': ': > "$2"',
    'curl': r'''out= header= url=
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out=$2; shift ;;
    -H) header=$2; shift ;;
    --max-time|--retry) shift ;;
    -*) ;;
    *) url=$1 ;;
  esac
  shift
done
case "$url" in
  "https://public.ecr.aws/token/?scope=repository:$REPOSITORY:pull") echo '{"token":"t0k"}' ;;
  "https://public.ecr.aws/v2/$REPOSITORY/blobs/$PINNED")
    [ "$header" = "Authorization: Bearer t0k" ] || exit 22
    cp "$STUB_DIR/served-layer" "$out" ;;
  *) exit 22 ;;
esac''',
}


def layer(files):
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode='w:gz') as tar:
        for name, body in files.items():
            info = tarfile.TarInfo(name)
            info.size = len(body)
            tar.addfile(info, io.BytesIO(body))
    return buf.getvalue()


def digest(blob):
    return 'sha256:' + hashlib.sha256(blob).hexdigest()


BRCLIENT = {'index.html': b'<html>brclient</html>', '_next/static/app.js': b'app()'}
GOOD = layer({
    'app/.wh..wh..opq': b'',
    'app/server/index.js': b'server from the image',
    **{f'app/brclient/{name}': body for name, body in BRCLIENT.items()},
})
OTHER = layer({'app/brclient/index.html': b'<html>other bytes</html>'})
NO_INDEX = layer({'app/brclient/404.html': b'404'})


def build(tmp_path, pinned, served):
    repo, stubs = tmp_path / 'repo', tmp_path / 'stubs'
    (repo / 'scripts').mkdir(parents=True)
    shutil.copy(REPO / 'scripts/build-web-function-zip.sh', repo / 'scripts')
    (repo / 'scripts/brclient.pin').write_text(f'BRCLIENT_IMAGE_REPOSITORY={REPOSITORY}\nBRCLIENT_LAYER_DIGEST={pinned}\n')
    for path in ('server/index.js', 'frontend/index.html', 'cc/index.html', 'package.json'):
        (repo / 'dist' / path).parent.mkdir(parents=True, exist_ok=True)
        (repo / 'dist' / path).write_text('from dist')
    stubs.mkdir()
    for name, body in STUBS.items():
        (stubs / name).write_text('#!/bin/bash\n' + body + '\n')
        (stubs / name).chmod(0o755)
    (stubs / 'served-layer').write_bytes(served)
    env = {'PATH': f'{stubs}:/usr/bin:/bin', 'STUB_DIR': str(stubs), 'REPOSITORY': REPOSITORY, 'PINNED': pinned}
    proc = subprocess.run(['bash', 'scripts/build-web-function-zip.sh'], cwd=repo, env=env,
                          capture_output=True, text=True, timeout=60)
    return proc, repo / 'build/webfn'


def tree(root):
    return {p.relative_to(root).as_posix(): p.read_bytes() for p in root.rglob('*') if p.is_file()}


def test_package_serves_brclient_from_the_pinned_layer(tmp_path):
    proc, out = build(tmp_path, digest(GOOD), GOOD)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert tree(out / 'stage/brclient') == BRCLIENT
    assert (out / 'stage/server/index.js').read_text() == 'from dist'
    assert (out / 'function.zip').exists()


@pytest.mark.parametrize(
    'pinned, served',
    [
        (digest(GOOD), OTHER),
        ('latest', GOOD),
        (digest(NO_INDEX), NO_INDEX),
    ],
    ids=['registry-serves-other-bytes', 'pinned-by-tag', 'layer-without-brclient'],
)
def test_build_fails_without_the_pinned_brclient(tmp_path, pinned, served):
    proc, out = build(tmp_path, pinned, served)
    assert proc.returncode != 0
    assert not (out / 'function.zip').exists()


def test_repository_pins_brclient_by_layer_digest():
    pin = dict(re.findall(r'^(\w+)=(.*)$', (REPO / 'scripts/brclient.pin').read_text(), re.M))
    assert pin.keys() == {'BRCLIENT_IMAGE_REPOSITORY', 'BRCLIENT_LAYER_DIGEST'}
    assert re.fullmatch(r'sha256:[0-9a-f]{64}', pin['BRCLIENT_LAYER_DIGEST'])
    assert re.fullmatch(r'[a-z0-9]+/[a-z0-9._-]+', pin['BRCLIENT_IMAGE_REPOSITORY'])
