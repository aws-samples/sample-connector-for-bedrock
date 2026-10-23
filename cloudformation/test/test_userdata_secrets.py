import copy
import importlib.util
import os
import re
import shutil
import stat
import subprocess
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
TEMPLATE_PATH = HERE.parent / 'quick-build-brconnector.yaml'

_spec = importlib.util.spec_from_file_location('gating', HERE / 'check_claude_code_web_gating.py')
gating = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gating)

TEMPLATE = gating.load(TEMPLATE_PATH.read_text())

IMAGE = 'public.ecr.aws/x6u9o2u4/sample-connector-for-bedrock'
CC_CONFIG = 'CC_CONFIG_PARAM=arn:aws:ssm:us-west-2:111122223333:parameter/brconnector/brc/claude-code-web'
VALUES = {
    'AWS::Region': 'us-west-2',
    'AWS::AccountId': '111122223333',
    'AWS::StackName': 'brc',
    'AWS::StackId': 'arn:aws:cloudformation:us-west-2:111122223333:stack/brc/0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b',
    'AWS::Partition': 'aws',
    'BRConnectorVersion': '0.0.19',
    'PerformanceMode': 'true',
    'PGDatabase': 'brconnector_db',
    'PGUser': 'postgres',
    'PGPassword': 'PG-MARKER',
    'ComputeType': 'ec2',
    'KeepEc2': 'true',
    'EcrRepo': 'brconnector',
    'RandomString': 'abc123',
    'DeleteEC2Lambda': 'brc-delete-ec2',
    'PrivateWaitHandle': 'https://cfn.example/wait',
}

# The ec2 docker run line of 0.0.43 and earlier. Those stacks have no run script: their nightly
# update replays this line from the cloud-init log, where `bash -x` traced it at first boot.
LOGGED_LINE = (
    'docker run --restart=unless-stopped --name brconnector -p 8866:8866 -e AWS_DEFAULT_REGION=${AWS::Region}'
    ' -e PERFORMANCE_MODE=${PerformanceMode} -e PGSQL_HOST=$PGHOST -e PGSQL_DATABASE=${PGDatabase}'
    ' -e PGSQL_USER=${PGUser} -e PGSQL_PASSWORD=${PGPassword} -e ADMIN_API_KEY=$KEY${CcEnvArg}'
    ' -d public.ecr.aws/$IMG_EC2:${BRConnectorVersion}'
)
LOGGED_LINE_REPLAY = (
    "cat /var/log/cloud-init-output.log |egrep -o 'docker run .* --name brconnector .*'"
    " |sed 's/:[^:]\\+$/:latest/' |sh"
)

EXPECTED_17 = {
    'us-east-1': 'pl-3b927c52',
    'us-east-2': 'pl-b6a144df',
    'us-west-1': 'pl-4ea04527',
    'us-west-2': 'pl-82a045eb',
    'ca-central-1': 'pl-38a64351',
    'sa-east-1': 'pl-5da64334',
    'eu-west-1': 'pl-4fa04526',
    'eu-west-2': 'pl-93a247fa',
    'eu-west-3': 'pl-75b1541c',
    'eu-central-1': 'pl-a3a144ca',
    'eu-north-1': 'pl-fab65393',
    'ap-northeast-1': 'pl-58a04531',
    'ap-northeast-2': 'pl-22a6434b',
    'ap-northeast-3': 'pl-31a14458',
    'ap-southeast-1': 'pl-31a34658',
    'ap-southeast-2': 'pl-b8a742d1',
    'ap-south-1': 'pl-9aa247f3',
}


def res(name):
    return TEMPLATE['Resources'][name]


def params():
    return TEMPLATE['Parameters']


def userdata_sub():
    return res('MyEC2Instance')['Properties']['UserData']['Fn::Base64']['Fn::Sub']


def userdata_text():
    sub = userdata_sub()
    return sub if isinstance(sub, str) else sub[0]


def cc_env_arg(on):
    """The CcEnvArg value with Claude Code Web on or off."""
    gate = userdata_sub()[1]['CcEnvArg']['Fn::If']
    return render_sub(gate[1]['Fn::Sub']) if on else gate[2]


def render_sub(text, values=None, cc=False):
    """Fn::Sub with test values: ${Name} takes its value and ${!X} becomes ${X}."""
    values = dict(VALUES if values is None else values)

    def one(m):
        if m.group(1):
            return '${' + m.group(2) + '}'
        if m.group(2) == 'CcEnvArg':
            return cc_env_arg(cc)
        return values[m.group(2)]

    return re.sub(r'\$\{(!?)([^}]*)\}', one, text)


def run_script_block(root, cc=False, values=None):
    """The rendered BEGIN/END block, with /root/ mapped to root."""
    text = render_sub(userdata_text(), values, cc=cc)
    start = text.index('# BEGIN brconnector-run\n')
    end = text.index('# END brconnector-run', start)
    return text[start:end].replace('/root/', f'{root}/')


def ssm_commands():
    return res('EC2AutoUpdateSSMDocument')['Properties']['Content']['mainSteps'][0]['inputs']['runCommand']


def ssm_script(tmp_path):
    """The SSM document's script, with /root/ mapped to tmp_path/root/ and the cloud-init log to tmp_path."""
    return (
        '\n'.join(ssm_commands())
        .replace('/root/', f'{tmp_path}/root/')
        .replace('/var/log/cloud-init-output.log', str(tmp_path / 'cloud-init-output.log'))
    )


def old_stack_files(tmp_path):
    """The key files a stack created before 0.0.44 left world-readable, next to its boot log."""
    root = tmp_path / 'root'
    root.mkdir(exist_ok=True)
    files = [tmp_path / 'cloud-init-output.log'] + [root / n for n in ('admin-api-key.txt', 'first-user-key.txt', 'pg-default-password.txt')]
    for f in files:
        if not f.exists():
            f.write_text('KEY-MARKER\n')
        f.chmod(0o644)
    return files


# docker records every call as \037-separated arguments, one \036-terminated record per call.
STUBS = {
    'docker': r'''printf '%s\037' "$@" >> "$STUB_DIR/docker-calls"; printf '\036' >> "$STUB_DIR/docker-calls"
case "$1" in
  images) echo "REPOSITORY TAG DIGEST IMAGE ID CREATED SIZE"; echo "public.ecr.aws/x6u9o2u4/sample-connector-for-bedrock 0.0.19 $LOCAL_DIGEST 0123456789ab 2 weeks ago 300MB" ;;
  login) cat > /dev/null; echo "Login Succeeded" ;;
  run) echo 4f0c0ffee ;;
esac''',
    'regctl': 'echo "$REG_DIGEST"',
    'aws': 'echo ecr-public-password',
}


def stubs(tmp_path, sed=None):
    stub_dir = tmp_path / 'stubs'
    stub_dir.mkdir()
    for name, body in STUBS.items():
        (stub_dir / name).write_text('#!/bin/bash\n' + body + '\n')
        (stub_dir / name).chmod(0o755)
    if sed:
        (stub_dir / 'sed').symlink_to(sed)
    return stub_dir


def env(stub_dir, **extra):
    return {'PATH': f'{stub_dir}:/usr/bin:/bin', 'STUB_DIR': str(stub_dir), **extra}


def bash(args, stub_dir, cwd=None, **extra):
    return subprocess.run(
        [shutil.which('bash'), *map(str, args)],
        env=env(stub_dir, **extra),
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=60,
    )


def old_boot(work, stub_dir, values=None, cc=True, trace=False, cwd=None):
    """First boot of a 0.0.43 stack: its docker run line, run by bash where UserData ran it."""
    boot = work / 'boot-0.0.43.sh'
    boot.write_text('IMG_EC2=x6u9o2u4/sample-connector-for-bedrock\n' + render_sub(LOGGED_LINE, values, cc=cc) + '\n')
    return bash(['-x', boot] if trace else [boot], stub_dir, cwd=cwd, KEY='KEY-MARKER', PGHOST='172.17.0.1')


def docker_calls(stub_dir):
    path = stub_dir / 'docker-calls'
    if not path.exists():
        return []
    return [record.split('\037')[:-1] for record in path.read_text().split('\036')[:-1]]


def gnu_sed():
    """The logged-line replay uses GNU sed syntax (\\+); macOS has BSD sed unless gsed is installed."""
    for name in ('sed', 'gsed'):
        path = shutil.which(name)
        if path and subprocess.run([path, '--version'], capture_output=True).returncode == 0:
            return path
    return None


# --- the boot script ---------------------------------------------------------------------------


def test_userdata_traces_nothing():
    text = userdata_text()
    assert text.splitlines()[0] == '#!/bin/bash -e'
    assert not re.search(r'set -[a-z]*x|set -o xtrace', text)
    assert text.index('umask 077') < text.index('/root/')


def test_userdata_parses():
    for cc in (False, True):
        proc = subprocess.run([shutil.which('bash'), '-n'], input=render_sub(userdata_text(), cc=cc), capture_output=True, text=True)
        assert proc.returncode == 0, proc.stderr


@pytest.mark.parametrize('cc', [False, True])
def test_run_script_starts_the_pinned_image_then_latest(tmp_path, cc):
    stub_dir = stubs(tmp_path)
    block = tmp_path / 'block.sh'
    block.write_text(run_script_block(tmp_path, cc=cc))
    proc = bash(['-e', block], stub_dir, KEY='KEY-MARKER', PGHOST='172.17.0.1')
    assert proc.returncode == 0, proc.stdout + proc.stderr
    script = tmp_path / 'brconnector-run.sh'
    assert stat.S_IMODE(os.stat(script).st_mode) == 0o700
    assert script.read_text().splitlines()[0] == '#!/bin/bash -e'
    calls = docker_calls(stub_dir)
    assert len(calls) == 1
    assert calls[0][-1] == f'{IMAGE}:0.0.19'
    assert calls[0][:4] == ['run', '--restart=unless-stopped', '--name', 'brconnector']
    joined = ' '.join(calls[0])
    for flag in (
        'AWS_DEFAULT_REGION=us-west-2',
        'PERFORMANCE_MODE=true',
        'PGSQL_HOST=172.17.0.1',
        'PGSQL_DATABASE=brconnector_db',
        'PGSQL_USER=postgres',
        'PGSQL_PASSWORD=PG-MARKER',
        'ADMIN_API_KEY=KEY-MARKER',
    ):
        assert f'-e {flag}' in joined
    assert (CC_CONFIG in joined) is cc
    # The nightly update: no environment, only the tag.
    proc = bash([script, 'latest'], stub_dir)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    calls = docker_calls(stub_dir)
    assert calls[1][-1] == f'{IMAGE}:latest'
    assert calls[1][:-1] == calls[0][:-1]


# Values as typed into the stack parameters. CloudFormation inserts them into UserData unchanged.
PARAMETER_VALUES = ['mysecretpassword', 'pa$word', 'a b', 'x*y', 'p%q^r~t', 'a\\$b', 'a\\\\b', "it's"]


@pytest.mark.parametrize('cc', [False, True])
@pytest.mark.parametrize('field', ['PGPassword', 'PGUser', 'PGDatabase'])
@pytest.mark.parametrize('value', PARAMETER_VALUES)
def test_run_script_passes_the_arguments_of_the_0_0_43_line(tmp_path, value, field, cc):
    values = dict(VALUES, **{field: value})
    # Both run where UserData runs, next to files a glob in the value would match.
    cwd = tmp_path / 'cwd'
    cwd.mkdir()
    for name in ('PGSQL_PASSWORD', 'PGSQL_USER', 'PGSQL_DATABASE'):
        (cwd / f'{name}=x1y').write_text('')
    old, new = tmp_path / 'old', tmp_path / 'new'
    old.mkdir()
    new.mkdir()
    old_stubs, new_stubs = stubs(old), stubs(new)
    old_boot(old, old_stubs, values, cc=cc, cwd=cwd)
    block = new / 'block.sh'
    block.write_text(run_script_block(new, cc=cc, values=values))
    bash(['-e', block], new_stubs, cwd=cwd, KEY='KEY-MARKER', PGHOST='172.17.0.1')
    expected = docker_calls(old_stubs)
    # A value with an unmatched quote never started a container, and still does not.
    assert len(expected) == (0 if value == "it's" else 1)
    assert docker_calls(new_stubs) == expected
    if expected:
        # The nightly update, from another directory: the same arguments with only the tag changed.
        proc = bash([new / 'brconnector-run.sh', 'latest'], new_stubs, cwd=tmp_path)
        assert proc.returncode == 0, proc.stderr
        assert docker_calls(new_stubs)[1] == expected[0][:-1] + [f'{IMAGE}:latest']


def test_no_secret_goes_to_stdout():
    lines = userdata_text().splitlines()
    api = [line for line in lines if 'curl' in line and '/admin/api-key/' in line]
    assert len(api) == 3
    for line in api:
        assert re.search(r'\s-o\s|>', line), line
    outside = [re.sub(r'\$\([^()]*\)', '', line) for line in lines if not line.lstrip().startswith('#')]
    assert not [line for line in outside if re.search(r'\|\s*tee\b', line)]
    # curl -v prints the request headers, the metadata token among them.
    assert not [line for line in lines if re.search(r'\bcurl\b.*\s(-v|--verbose)\b', line)]
    assert '> /root/first-user-key.txt' in userdata_text()


def test_docker_run_check_reads_the_run_script():
    assert gating.check_ec2_docker_run_on(TEMPLATE) == []
    moved = copy.deepcopy(TEMPLATE)
    sub = moved['Resources']['MyEC2Instance']['Properties']['UserData']['Fn::Base64']['Fn::Sub']
    lines = sub[0].split('\n')
    (i,) = [n for n, line in enumerate(lines) if '--name brconnector' in line]
    line = lines.pop(i)
    lines.insert(lines.index('# END brconnector-run') + 1, line)
    sub[0] = '\n'.join(lines)
    assert gating.check_ec2_docker_run_on(moved) != []


# --- the nightly update ------------------------------------------------------------------------


def test_ssm_update_traces_nothing():
    commands = ssm_commands()
    assert commands[0] == '#!/bin/bash'
    assert not re.search(r'-x\b|set -[a-z]*x|xtrace', '\n'.join(commands))


def test_ssm_update_uses_the_run_script(tmp_path):
    stub_dir = stubs(tmp_path)
    (tmp_path / 'root').mkdir()
    run_script = tmp_path / 'root/brconnector-run.sh'
    run_script.write_text(f'#!/bin/bash\necho "$@" > {tmp_path}/run-args\n')
    run_script.chmod(0o700)
    (tmp_path / 'cloud-init-output.log').write_text(f'+ docker run --restart=unless-stopped --name brconnector -d {IMAGE}:0.0.19\n')
    (tmp_path / 'ssm.sh').write_text(ssm_script(tmp_path))
    proc = bash([tmp_path / 'ssm.sh'], stub_dir, LOCAL_DIGEST='sha256:old', REG_DIGEST='sha256:new')
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert (tmp_path / 'run-args').read_text() == 'latest\n'
    calls = docker_calls(stub_dir)
    assert [c[0] for c in calls] == ['images', 'login', 'pull', 'rm']
    assert calls[2] == ['pull', IMAGE]
    assert calls[3] == ['rm', '-f', 'brconnector']


def test_ssm_update_falls_back_to_the_logged_line(tmp_path):
    sed = gnu_sed()
    if not sed:
        pytest.skip('the logged-line replay needs GNU sed; CI runs this')
    assert LOGGED_LINE_REPLAY in '\n'.join(ssm_commands())
    stub_dir = stubs(tmp_path, sed)
    # First boot of a 0.0.43 stack, Claude Code Web on: bash -x traces the docker run line.
    proc = old_boot(tmp_path, stub_dir, cc=True, trace=True)
    assert proc.returncode == 0, proc.stderr
    (tmp_path / 'cloud-init-output.log').write_text(
        "Cloud-init v. 22.2.2 running 'modules:final'\n"
        '+ docker run --restart=unless-stopped --name postgres -e POSTGRES_PASSWORD=PG-MARKER -p 5432:5432 -d postgres:16\n'
        + proc.stderr
        + '4f0c0ffee\n+ sleep 60\n'
    )
    files = old_stack_files(tmp_path)
    (first,) = docker_calls(stub_dir)
    assert first[-1] == f'{IMAGE}:0.0.19' and CC_CONFIG in first
    (tmp_path / 'ssm.sh').write_text(ssm_script(tmp_path))
    proc = bash([tmp_path / 'ssm.sh'], stub_dir, LOCAL_DIGEST='sha256:old', REG_DIGEST='sha256:new')
    assert proc.returncode == 0, proc.stdout + proc.stderr
    calls = docker_calls(stub_dir)[1:]
    assert [c[0] for c in calls] == ['images', 'login', 'pull', 'rm', 'run']
    # The same container, environment included, from latest, read from a log that is now root-only.
    assert calls[-1] == first[:-1] + [f'{IMAGE}:latest']
    assert {f.name: stat.S_IMODE(f.stat().st_mode) for f in files} == {f.name: 0o600 for f in files}


def test_ssm_update_does_nothing_when_digests_match(tmp_path):
    stub_dir = stubs(tmp_path)
    (tmp_path / 'root').mkdir()
    run_script = tmp_path / 'root/brconnector-run.sh'
    run_script.write_text(f'#!/bin/bash\necho "$@" > {tmp_path}/run-args\n')
    (tmp_path / 'cloud-init-output.log').write_text(f'+ docker run --restart=unless-stopped --name brconnector -d {IMAGE}:0.0.19\n')
    (tmp_path / 'ssm.sh').write_text(ssm_script(tmp_path))
    proc = bash([tmp_path / 'ssm.sh'], stub_dir, LOCAL_DIGEST='sha256:same', REG_DIGEST='sha256:same')
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert [c[0] for c in docker_calls(stub_dir)] == ['images']
    assert not (tmp_path / 'run-args').exists()
    assert 'Bootstrap Complete' in proc.stdout


RESTRICT_STEP = 'chmod 600 /var/log/cloud-init-output.log /root/*.txt 2>/dev/null || true'


def test_ssm_update_restricts_the_boot_log_and_key_files(tmp_path):
    commands = ssm_commands()
    assert RESTRICT_STEP in commands
    assert commands.index(RESTRICT_STEP) < [n for n, c in enumerate(commands) if 'BRC_REG_DIGEST' in c][0]
    stub_dir = stubs(tmp_path)
    files = old_stack_files(tmp_path)
    (tmp_path / 'ssm.sh').write_text(ssm_script(tmp_path))
    # It runs on every night, also when there is nothing to update.
    proc = bash([tmp_path / 'ssm.sh'], stub_dir, LOCAL_DIGEST='sha256:same', REG_DIGEST='sha256:same')
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert {f.name: stat.S_IMODE(f.stat().st_mode) for f in files} == {f.name: 0o600 for f in files}
    assert [f.read_text() for f in files] == ['KEY-MARKER\n'] * len(files)
    # A stack without the key files (NoDB, or created by 0.0.44) is fine too.
    for f in files[1:]:
        f.unlink()
    proc = bash([tmp_path / 'ssm.sh'], stub_dir, LOCAL_DIGEST='sha256:same', REG_DIGEST='sha256:same')
    assert proc.returncode == 0 and proc.stderr == '', proc.stderr


# --- parameters, resources and Regions ---------------------------------------------------------


def test_pg_password_no_echo():
    assert params()['PGPassword']['NoEcho'] is True


def test_ecs_lb_sg_only_for_ecs():
    assert res('ECSLBSecurityGroup')['Condition'] == 'IsEcs'


def test_prefix_list_table():
    mapping = {region: v['PrefixList'] for region, v in TEMPLATE['Mappings']['AWSRegionsPrefixListID'].items()}
    assert mapping == EXPECTED_17


def test_compute_type_names_the_lambda_web_regions():
    description = params()['ComputeType']['Description']
    named = set(re.findall(r'\b[a-z]{2}-[a-z]+-\d\b', description))
    assert named == set(EXPECTED_17)
    assert set(TEMPLATE['Rules']) == {'ClaudeCodeWebRequirements', 'LambdaWebRegion'}
