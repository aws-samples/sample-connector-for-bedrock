import importlib.util
import json
import shutil
import subprocess
import sys
import types
from pathlib import Path

import pytest
import yaml

HERE = Path(__file__).resolve().parent
TEMPLATE_PATH = HERE.parent / 'quick-build-brconnector.yaml'

_spec = importlib.util.spec_from_file_location('gating', HERE / 'check_claude_code_web_gating.py')
gating = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gating)

TEMPLATE = gating.load(TEMPLATE_PATH.read_text())
PACKAGE_RESOURCES = (
    'WebFnPackageBuildRole',
    'WebFnPackageBuild',
    'WebFnPackageBuildTriggerRole',
    'WebFnPackageBuildTrigger',
    'WebFnPackage',
)


def res(name):
    return TEMPLATE['Resources'][name]


def userdata_text():
    sub = res('MyEC2Instance')['Properties']['UserData']['Fn::Base64']['Fn::Sub']
    return sub if isinstance(sub, str) else sub[0]


def test_webfn_package_feeds_the_revision():
    fn = res('BRConnectorWebFn')['Properties']
    assert fn['CodeUri']['Key'] == 'brconnector/function.zip'
    assert fn['CodeUri']['Version'] == {'Fn::GetAtt': ['WebFnPackage', 'ObjectVersion']}
    assert 'SKIP_DB_INSTALL' not in fn['EnvironmentVariables']
    pkg = res('WebFnPackage')
    assert (pkg['Type'], pkg['Condition']) == ('Custom::WebFnPackage', 'IsLambdaWeb')
    assert pkg['Properties']['BuildId'] == {'Ref': 'WebFnBuildId'}
    assert {'SourceRepoUrl', 'SourceRef'} <= pkg['Properties'].keys()
    assert pkg['Properties']['SourceRepoUrl'] == {'Ref': 'SourceRepoUrl'}
    assert pkg['Properties']['SourceRef'] == {'Ref': 'SourceRef'}
    assert pkg['Properties']['ServiceTimeout'] == 3600
    assert pkg['Properties']['ServiceToken'] == {'Fn::GetAtt': ['WebFnPackageBuildTrigger', 'Arn']}


def test_package_resources_exist_only_for_lambda_web():
    for name in PACKAGE_RESOURCES:
        assert res(name)['Condition'] == 'IsLambdaWeb', name
    assert 'WebFnBuildUploadPolicy' not in TEMPLATE['Resources']


def test_userdata_builds_nothing():
    for marker in ('build_webfn_zip', 'build-web-function-zip.sh', '${SourceRef}', '${SourceRepoUrl}'):
        assert marker not in userdata_text()


def test_wait_condition_unchanged():
    assert res('PrivateWaitCondition')['Properties']['Timeout'] == {'Fn::If': ['IsLambdaWeb', '2400', '600']}


def test_build_id_only_reaches_the_package():
    param = TEMPLATE['Parameters']['WebFnBuildId']
    assert (param['Type'], param['Default']) == ('String', '1')
    groups = TEMPLATE['Metadata']['AWS::CloudFormation::Interface']['ParameterGroups']
    (compute,) = [g for g in groups if g['Label']['default'] == 'Compute settings for BRConnector']
    assert 'WebFnBuildId' in compute['Parameters']
    found = list(gating.references({k: v for k, v in TEMPLATE.items() if k != 'Parameters'}, 'WebFnBuildId'))
    assert found == ['Resources.WebFnPackage.Properties.BuildId']


def test_build_project():
    props = res('WebFnPackageBuild')['Properties']
    assert props['Name'] == {'Fn::Sub': '${AWS::StackName}-webfn-package'}
    assert props['ServiceRole'] == {'Fn::GetAtt': ['WebFnPackageBuildRole', 'Arn']}
    assert (props['TimeoutInMinutes'], props['QueuedTimeoutInMinutes']) == (50, 15)
    env = props['Environment']
    assert (env['Type'], env['ComputeType'], env['Image']) == (
        'ARM_CONTAINER',
        'BUILD_GENERAL1_SMALL',
        'aws/codebuild/amazonlinux-aarch64-standard:3.0',
    )
    assert env['EnvironmentVariables'] == [{'Name': 'BUCKET', 'Value': {'Ref': 'WebFnCodeBucket'}}]
    assert props['Source']['Type'] == 'NO_SOURCE'


def test_build_role_may_only_write_the_package_and_its_logs():
    role = res('WebFnPackageBuildRole')['Properties']
    assert 'ManagedPolicyArns' not in role
    (statement,) = role['AssumeRolePolicyDocument']['Statement']
    assert statement['Principal'] == {'Service': 'codebuild.amazonaws.com'}
    group = 'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/codebuild/${AWS::StackName}-webfn-package'
    found = sorted(
        (tuple(sorted([acts] if isinstance(acts, str) else acts)), json.dumps(resource, sort_keys=True))
        for _, acts, resource in gating.role_actions(TEMPLATE, 'WebFnPackageBuildRole')
    )
    assert found == sorted([
        (
            ('logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'),
            json.dumps([{'Fn::Sub': group}, {'Fn::Sub': group + ':*'}], sort_keys=True),
        ),
        (
            ('s3:PutObject',),
            json.dumps({'Fn::Sub': 'arn:${AWS::Partition}:s3:::${WebFnCodeBucket}/brconnector/function.zip'}, sort_keys=True),
        ),
    ])


def test_trigger_role_may_only_start_the_package_build():
    acts = gating.role_actions(TEMPLATE, 'WebFnPackageBuildTriggerRole')
    assert [(a, r) for _, a, r in acts] == [(['codebuild:StartBuild'], {'Fn::GetAtt': ['WebFnPackageBuild', 'Arn']})]


# --- the trigger function ------------------------------------------------------------------------


def _trigger(monkeypatch):
    props = res('WebFnPackageBuildTrigger')['Properties']
    assert props['Environment']['Variables'] == {
        'PROJECT_NAME': {'Ref': 'WebFnPackageBuild'},
        'PHYSICAL_RESOURCE_ID': {'Fn::Sub': '${AWS::StackName}-webfn-package'},
    }
    started, answered = [], []

    class CodeBuild:
        def start_build(self, **kwargs):
            started.append(kwargs)
            return {'build': {'id': 'stack-webfn-package:1'}}

    monkeypatch.setitem(sys.modules, 'boto3', types.SimpleNamespace(client=lambda name: CodeBuild()))
    module = types.ModuleType('webfn_trigger')
    exec(compile(props['Code']['ZipFile'], 'webfn_trigger', 'exec'), module.__dict__)

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    def urlopen(req, timeout):
        answered.append((req.full_url, req.get_method(), json.loads(req.data)))
        return Response()

    monkeypatch.setattr(module.urllib.request, 'urlopen', urlopen)
    monkeypatch.setenv('PROJECT_NAME', 'stack-webfn-package')
    monkeypatch.setenv('PHYSICAL_RESOURCE_ID', 'stack-webfn-package')
    return module, started, answered


def _event(request_type, **extra):
    return {
        'RequestType': request_type,
        'ResponseURL': 'https://cfn.example/answer',
        'StackId': 'arn:aws:cloudformation:us-west-2:111122223333:stack/stack/1',
        'RequestId': 'req-1',
        'LogicalResourceId': 'WebFnPackage',
        'ResourceProperties': {'SourceRepoUrl': 'https://example.com/repo.git', 'SourceRef': 'abc123', 'BuildId': '2'},
        **extra,
    }


def test_trigger_starts_the_build_with_the_source(monkeypatch):
    module, started, answered = _trigger(monkeypatch)
    module.handler(_event('Update', PhysicalResourceId='stack-webfn-package'), None)
    assert answered == []
    (build,) = started
    assert build['projectName'] == 'stack-webfn-package'
    env = {v['name']: v['value'] for v in build['environmentVariablesOverride']}
    assert env == {
        'CFN_RESPONSE_URL': 'https://cfn.example/answer',
        'CFN_STACK_ID': 'arn:aws:cloudformation:us-west-2:111122223333:stack/stack/1',
        'CFN_REQUEST_ID': 'req-1',
        'CFN_LOGICAL_RESOURCE_ID': 'WebFnPackage',
        'CFN_PHYSICAL_RESOURCE_ID': 'stack-webfn-package',
        'SOURCE_REPO_URL': 'https://example.com/repo.git',
        'SOURCE_REF': 'abc123',
    }


def test_trigger_answers_delete_itself(monkeypatch):
    module, started, answered = _trigger(monkeypatch)
    module.handler(_event('Delete', PhysicalResourceId='assigned-by-cloudformation'), None)
    assert started == []
    ((url, method, body),) = answered
    assert (url, method, body['Status'], body['PhysicalResourceId']) == (
        'https://cfn.example/answer', 'PUT', 'SUCCESS', 'assigned-by-cloudformation')


# --- the buildspec, run under bash with stubs on PATH --------------------------------------------

NVM_INSTALL_URL = 'https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh'

STUBS = {
    # Records the duration and the command, then runs it without a limit.
    'timeout': 'echo "timeout $1 $2" >> "$STUB_DIR/calls"; shift; exec "$@"',
    'git': r'''echo "git $*" >> "$STUB_DIR/calls"
if [ "$1" = clone ]; then
  for dest; do :; done
  mkdir -p "$dest/scripts"
  cat > "$dest/scripts/build-web-function-zip.sh" <<'EOF'
[ "$STUB_FAIL" = build ] && exit 3
mkdir -p build/webfn && printf zip > build/webfn/function.zip
EOF
fi''',
    'curl': r'''echo "curl $*" >> "$STUB_DIR/calls"
for a; do
  case "$a" in
    "$NVM_INSTALL_URL") cat "$STUB_DIR/nvm-install.sh"; exit 0 ;;
    @*) cat "${a#@}" >> "$STUB_DIR/answers"; echo >> "$STUB_DIR/answers"; exit 0 ;;
  esac
done''',
    'npx': 'echo "npx $*" >> "$STUB_DIR/calls"',
    'aws': r'''echo "aws $*" >> "$STUB_DIR/calls"
[ "$STUB_FAIL" = aws ] && exit 255
if [ "$STUB_FAIL" = none ]; then echo None; else echo v-123; fi''',
}

# What curl serves as the nvm install script: an nvm whose node prints v24.0.0, unless
# STUB_FAIL makes nvm install fail or the installed node an older one.
NVM_INSTALL = r'''mkdir -p "$NVM_DIR"
cat > "$NVM_DIR/nvm.sh" <<'EOF'
nvm() {
  case "$1" in
    install)
      [ "$STUB_FAIL" = nvm ] && return 1
      mkdir -p "$NVM_DIR/v24/bin"
      if [ "$STUB_FAIL" = old-node ]; then v=v18.20.8; else v=v24.0.0; fi
      printf '#!/bin/sh\necho %s\n' "$v" > "$NVM_DIR/v24/bin/node"
      chmod +x "$NVM_DIR/v24/bin/node" ;;
    which) echo "$NVM_DIR/v24/bin/node" ;;
  esac
}
EOF
'''


def buildspec_command():
    spec = yaml.safe_load(res('WebFnPackageBuild')['Properties']['Source']['BuildSpec'])
    assert spec['env']['shell'] == 'bash'
    (command,) = spec['phases']['build']['commands']
    return command


def run_buildspec(tmp_path, failing=''):
    stubs, work, home = tmp_path / 'stubs', tmp_path / 'work', tmp_path / 'home'
    for d in (stubs, work, home):
        d.mkdir()
    for name, body in STUBS.items():
        (stubs / name).write_text('#!/bin/bash\n' + body + '\n')
        (stubs / name).chmod(0o755)
    (stubs / 'nvm-install.sh').write_text(NVM_INSTALL)
    env = {
        'PATH': f'{stubs}:/usr/bin:/bin',
        'HOME': str(home),
        'STUB_DIR': str(stubs),
        'STUB_FAIL': failing,
        'NVM_INSTALL_URL': NVM_INSTALL_URL,
        'CODEBUILD_BUILD_ID': 'stack-webfn-package:build-1',
        'BUCKET': 'brconnector-webfn-bucket',
        'CFN_RESPONSE_URL': 'https://cfn.example/answer',
        'CFN_STACK_ID': 'arn:aws:cloudformation:us-west-2:111122223333:stack/stack/1',
        'CFN_REQUEST_ID': 'req-1',
        'CFN_LOGICAL_RESOURCE_ID': 'WebFnPackage',
        'CFN_PHYSICAL_RESOURCE_ID': 'stack-webfn-package',
        'SOURCE_REPO_URL': 'https://example.com/repo.git',
        'SOURCE_REF': 'abc123',
    }
    proc = subprocess.run([shutil.which('bash'), '-c', buildspec_command()], cwd=work, env=env, capture_output=True, text=True, timeout=60)
    answers = [json.loads(line) for line in (stubs / 'answers').read_text().splitlines() if line] if (stubs / 'answers').exists() else []
    calls = (stubs / 'calls').read_text().splitlines()
    return proc, answers, calls


def test_buildspec_answers_success_with_the_object_version(tmp_path):
    proc, answers, calls = run_buildspec(tmp_path)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    (body,) = answers
    assert body['Status'] == 'SUCCESS' and body['Data'] == {'ObjectVersion': 'v-123'}
    assert (body['PhysicalResourceId'], body['RequestId'], body['LogicalResourceId']) == ('stack-webfn-package', 'req-1', 'WebFnPackage')
    assert body['StackId'] == 'arn:aws:cloudformation:us-west-2:111122223333:stack/stack/1'
    assert 'v24.0.0' in proc.stdout
    assert 'git clone --quiet --filter=blob:none https://example.com/repo.git src' in calls
    assert 'git -C src checkout --quiet abc123' in calls
    assert 'npx -y pnpm@10.34.6 install --frozen-lockfile' in calls
    assert (
        'aws s3api put-object --bucket brconnector-webfn-bucket --key brconnector/function.zip'
        ' --body build/webfn/function.zip --query VersionId --output text'
    ) in calls
    assert [c for c in calls if c.startswith('timeout ')] == [
        'timeout 3m git',
        'timeout 2m git',
        'timeout 5m bash',
        'timeout 10m npx',
        'timeout 20m bash',
        'timeout 3m aws',
    ]
    assert (tmp_path / 'work/src/build/webfn/function.zip').read_text() == 'zip'
    assert any(c.startswith('curl ') and 'https://cfn.example/answer' in c and '-X PUT' in c for c in calls)


@pytest.mark.parametrize(
    'failing, step',
    [('build', 'build'), ('aws', 'upload'), ('none', 'upload'), ('nvm', 'node'), ('old-node', 'node')],
)
def test_buildspec_answers_failed_naming_the_step(tmp_path, failing, step):
    proc, answers, calls = run_buildspec(tmp_path, failing)
    assert proc.returncode != 0
    (body,) = answers
    assert body['Status'] == 'FAILED' and f'at step {step}' in body['Reason']
    assert 'see CodeBuild build stack-webfn-package:build-1' in body['Reason']
    assert body['Data'] == {}
    # Nothing after the failing step runs.
    later = {'node': ('npx ', 'aws '), 'build': ('aws ',), 'upload': ()}[step]
    assert not [c for c in calls if c.startswith(later)]


def test_sam_translates_the_version(monkeypatch, tmp_path):
    pytest.importorskip('samtranslator')
    from samtranslator.translator.transform import transform

    # SAM reads the Region from a boto3 session. Keep it off the developer's AWS config, so the
    # transform has no credentials and cannot reach AWS.
    monkeypatch.delenv('AWS_PROFILE', raising=False)
    monkeypatch.setenv('AWS_CONFIG_FILE', str(tmp_path / 'no-config'))
    monkeypatch.setenv('AWS_SHARED_CREDENTIALS_FILE', str(tmp_path / 'no-credentials'))
    monkeypatch.setenv('AWS_DEFAULT_REGION', 'us-west-2')

    class NoManagedPolicies:
        def load(self):
            return {}

    template = gating.load(TEMPLATE_PATH.read_text())
    out = transform(template, {'ComputeType': 'lambda-web', 'DatabaseMode': 'Standalone'}, NoManagedPolicies())
    revision = out['Resources']['BRConnectorWebFnRevision']
    assert revision['Type'] == 'AWS::Lambda::WebFunctionRevision'
    assert revision['Properties']['BuildConfig']['CodeConfig']['S3Object']['VersionId'] == {'Fn::GetAtt': ['WebFnPackage', 'ObjectVersion']}
    assert 'SKIP_DB_INSTALL' not in revision['Properties']['ServiceConfig']['EnvironmentVariables']
