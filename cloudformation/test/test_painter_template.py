import fnmatch
import importlib.util
import json
import re
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location('iam_scope', HERE / 'test_iam_scope.py')
iam = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(iam)

TEMPLATE = iam.TEMPLATE
RESOURCES = iam.RESOURCES
BUCKET = 'ClaudeCodeWebWorkspaceBucket'
COMPUTE_TYPES = ['ec2', 'lambda', 'ecs', 'lambda-web']
VALUES = {
    'AWS::Partition': 'aws',
    'AWS::Region': 'us-west-2',
    'AWS::AccountId': '111122223333',
    'AWS::StackName': 'brc',
    'MyEC2Instance': 'i-0123456789abcdef0',
    BUCKET: 'brc-cc-workspace-111122223333-us-west-2-abc123',
}
SETTINGS = {
    'PAINTER_S3_BUCKET': VALUES[BUCKET],
    'PAINTER_S3_REGION': 'us-west-2',
    'PAINTER_S3_PREFIX': 'painter',
}
PAINTER_ARNS = [
    f'arn:aws:s3:::{VALUES[BUCKET]}/painter/2026-11-14/1763100000000-a.png',
    f'arn:aws:s3:::{VALUES[BUCKET]}/painter/uploads/2026-11-14/1763100000000-b.jpg',
]
USER_DATA_ARN = f'arn:aws:s3:::{VALUES[BUCKET]}/user_data/u1/project/notes.md'
MARKETPLACE = ['aws-marketplace:Subscribe', 'aws-marketplace:ViewSubscriptions']
RUNNERS = {
    'lambda': ('BRConnectorLambda', 'Role'),
    'ecs': ('ECSTaskDefinition', 'TaskRoleArn'),
    'lambda-web': ('BRConnectorWebFn', 'ExecutionRoleArn'),
}


def truth(compute, cc='false'):
    params = {name: p.get('Default', '') for name, p in TEMPLATE['Parameters'].items()}
    params.update({'AWS::Region': 'us-west-2', 'ComputeType': compute, 'EnableClaudeCodeWeb': cc})
    return iam.truth_table(params)


def render(node):
    if isinstance(node, dict) and set(node) == {'Ref'}:
        return VALUES.get(node['Ref'], f"<{node['Ref']}>")
    if isinstance(node, dict) and set(node) == {'Fn::Sub'} and isinstance(node['Fn::Sub'], str):
        return re.sub(r'\$\{([^}]*)\}', lambda m: VALUES.get(m.group(1), f'<{m.group(1)}>'), node['Fn::Sub'])
    return node if isinstance(node, str) else ''


def runner_role(compute):
    if compute == 'ec2':
        return iam.instance_role()
    resource, key = RUNNERS[compute]
    role, attribute = RESOURCES[resource]['Properties'][key]['Fn::GetAtt']
    assert attribute == 'Arn'
    return role


def roles(t):
    return [name for name, body in RESOURCES.items() if body['Type'] == 'AWS::IAM::Role' and iam.present(name, t)]


def allows(role, t, action, arn):
    return any(
        st['Effect'] == 'Allow'
        and action in iam.as_list(st['Action'])
        and 'Condition' not in st
        and any(fnmatch.fnmatchcase(arn, render(r)) for r in iam.as_list(st['Resource']) if render(r))
        for st in iam.statements(role, t, managed=False)
    )


def env(compute, t):
    if compute == 'lambda':
        return iam.resolve(RESOURCES['BRConnectorLambda']['Properties']['Environment']['Variables'], t)
    if compute == 'lambda-web':
        return iam.resolve(RESOURCES['BRConnectorWebFn']['Properties']['EnvironmentVariables'], t)
    (container,) = iam.resolve(RESOURCES['ECSTaskDefinition']['Properties']['ContainerDefinitions'], t)
    return {item['Name']: item['Value'] for item in container['Environment']}


def painter_settings(compute, t):
    if compute == 'ec2':
        return json.loads(render(RESOURCES['PainterEc2Settings']['Properties']['Value']))
    return {name: render(value) for name, value in env(compute, t).items() if name.startswith('PAINTER_')}


@pytest.mark.parametrize('cc', ['false', 'true'])
@pytest.mark.parametrize('compute', COMPUTE_TYPES)
def test_every_stack_has_the_bucket(compute, cc):
    assert iam.present(BUCKET, truth(compute, cc))


def test_the_bucket_keeps_the_claude_code_web_logical_id_and_name():
    bucket = RESOURCES[BUCKET]
    assert bucket['Type'] == 'AWS::S3::Bucket'
    assert 'Condition' not in bucket
    assert bucket['Properties']['BucketName'] == {'Fn::Sub': 'brc-cc-workspace-${AWS::AccountId}-${AWS::Region}-${RandomString}'}
    assert (bucket['DeletionPolicy'], bucket['UpdateReplacePolicy']) == ('Retain', 'Retain')


def test_a_browser_on_any_site_may_read_a_presigned_picture_and_nothing_more():
    props = RESOURCES[BUCKET]['Properties']
    assert props['CorsConfiguration'] == {'CorsRules': [
        {'AllowedMethods': ['GET', 'HEAD'], 'AllowedOrigins': ['*'], 'AllowedHeaders': ['*']},
    ]}
    assert set(props['PublicAccessBlockConfiguration'].values()) == {True}


@pytest.mark.parametrize('cc', ['false', 'true'])
@pytest.mark.parametrize('compute', COMPUTE_TYPES)
def test_only_the_role_that_runs_brconnector_may_paint(compute, cc):
    t = truth(compute, cc=cc)
    runner = runner_role(compute)
    for arn in PAINTER_ARNS:
        assert allows(runner, t, 's3:PutObject', arn) and allows(runner, t, 's3:GetObject', arn), (runner, arn)
    assert not allows(runner, t, 's3:PutObject', USER_DATA_ARN)
    assert all(allows(runner, t, action, '*') for action in MARKETPLACE), runner
    for role in roles(t):
        if role != runner:
            assert not any(allows(role, t, a, arn) for a in ('s3:PutObject', 's3:GetObject') for arn in PAINTER_ARNS), role
            assert not any(allows(role, t, a, '*') for a in MARKETPLACE), role


@pytest.mark.parametrize('cc', ['false', 'true'])
@pytest.mark.parametrize('compute', COMPUTE_TYPES)
def test_brconnector_gets_the_bucket_settings(compute, cc):
    assert painter_settings(compute, truth(compute, cc)) == SETTINGS


def test_ec2_reads_the_settings_of_its_own_instance_only():
    t = truth('ec2')
    name = render(RESOURCES['PainterEc2Settings']['Properties']['Name'])
    assert name == f"/brconnector/instance/{VALUES['MyEC2Instance']}/painter"
    assert RESOURCES['PainterEc2Settings']['Properties']['Type'] == 'String'
    assert iam.present('PainterEc2Settings', t)
    parameter_arn = 'arn:aws:ssm:us-west-2:111122223333:parameter'
    assert allows('EC2Role', t, 'ssm:GetParameter', parameter_arn + name)
    other_instance = parameter_arn + '/brconnector/instance/i-0fedcba9876543210/painter'
    assert not allows('EC2Role', t, 'ssm:GetParameter', other_instance)
    for compute in ('lambda', 'ecs', 'lambda-web'):
        t = truth(compute)
        assert not iam.present('PainterEc2Settings', t)
        policy = iam.resolve(RESOURCES['PainterComputePolicy']['Properties']['PolicyDocument'], t)
        assert not [a for st in policy['Statement'] for a in iam.as_list(st['Action']) if a.startswith('ssm:')], compute


def test_the_ec2_instance_holds_no_reference_to_painter():
    names = {BUCKET} | {name for name in RESOURCES if name.startswith('Painter')}
    assert {'PainterComputePolicy', 'PainterEc2Settings'} <= names
    instance = RESOURCES['MyEC2Instance']
    assert list(iam.gating.mentions(instance, names)) == []
    assert 'painter' not in json.dumps(instance).lower()


def test_claude_code_web_sessions_reach_only_user_data():
    t = truth('ec2', cc='true')
    role = 'ClaudeCodeWebWorkspaceAccessRole'
    prefix = json.loads(render(RESOURCES['ClaudeCodeWebConfigParameter']['Properties']['Value']))['prefix']
    session_arn = f'arn:aws:s3:::{VALUES[BUCKET]}/{prefix}/u1/project/notes.md'
    for action in ('s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:AbortMultipartUpload'):
        assert allows(role, t, action, session_arn), action
        assert not any(allows(role, t, action, arn) for arn in PAINTER_ARNS), action
    lists = [st for st in iam.statements(role, t, managed=False) if 's3:ListBucket' in iam.as_list(st['Action'])]
    assert [render(st['Resource']) for st in lists] == [f'arn:aws:s3:::{VALUES[BUCKET]}']
    (condition,) = [st['Condition'] for st in lists]
    assert set(condition) == {'StringLike'} and set(condition['StringLike']) == {'s3:prefix'}
    patterns = condition['StringLike']['s3:prefix']
    for listed in (f'{prefix}/u1', f'{prefix}/u1/', f'{prefix}/u1/project/'):
        assert any(fnmatch.fnmatchcase(listed, p) for p in patterns), listed
    for listed in ('painter', 'painter/', 'painter/2026-11-14/', ''):
        assert not any(fnmatch.fnmatchcase(listed, p) for p in patterns), listed


@pytest.mark.parametrize('compute, resource', [('lambda', 'BRConnectorLambda'), ('lambda-web', 'BRConnectorWebFnRevision')])
def test_sam_hands_the_settings_to_the_function(compute, resource, monkeypatch, tmp_path):
    pytest.importorskip('samtranslator')
    from samtranslator.translator.transform import transform

    monkeypatch.delenv('AWS_PROFILE', raising=False)
    monkeypatch.setenv('AWS_CONFIG_FILE', str(tmp_path / 'no-config'))
    monkeypatch.setenv('AWS_SHARED_CREDENTIALS_FILE', str(tmp_path / 'no-credentials'))
    monkeypatch.setenv('AWS_DEFAULT_REGION', 'us-west-2')

    class NoManagedPolicies:
        def load(self):
            return {}

    template = iam.gating.load(iam.TEMPLATE_PATH.read_text())
    out = transform(template, {'ComputeType': compute, 'DatabaseMode': 'Standalone'}, NoManagedPolicies())
    props = out['Resources'][resource]['Properties']
    variables = props['Environment']['Variables'] if compute == 'lambda' else props['ServiceConfig']['EnvironmentVariables']
    found = iam.resolve(variables, truth(compute))
    assert {name: render(value) for name, value in found.items() if name.startswith('PAINTER_')} == SETTINGS
