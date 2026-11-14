"""EnablePainter: the bucket painter shares with Claude Code Web.

Each test decides the template's conditions for one set of parameters with the helpers in
test_iam_scope.py, then reads what a stack created with them would hold.
"""
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
    BUCKET: 'brc-cc-workspace-111122223333-us-west-2-abc123',
}
# What painter writes and reads back: a picture it drew, and one a user uploaded.
PAINTER_ARNS = [
    f'arn:aws:s3:::{VALUES[BUCKET]}/painter/2026-11-14/1763100000000-a.png',
    f'arn:aws:s3:::{VALUES[BUCKET]}/painter/uploads/2026-11-14/1763100000000-b.jpg',
]


def truth(compute, painter='true', cc='false'):
    params = {name: p.get('Default', '') for name, p in TEMPLATE['Parameters'].items()}
    params.update({'AWS::Region': 'us-west-2', 'ComputeType': compute, 'EnablePainter': painter, 'EnableClaudeCodeWeb': cc})
    return iam.truth_table(params)


def render(node):
    """node as text with VALUES filled in, <name> for any other name, '' for other functions."""
    if isinstance(node, dict) and set(node) == {'Ref'}:
        return VALUES.get(node['Ref'], f"<{node['Ref']}>")
    if isinstance(node, dict) and set(node) == {'Fn::Sub'} and isinstance(node['Fn::Sub'], str):
        return re.sub(r'\$\{([^}]*)\}', lambda m: VALUES.get(m.group(1), f'<{m.group(1)}>'), node['Fn::Sub'])
    return node if isinstance(node, str) else ''


def allows(role, t, action, arn):
    """Whether an inline or attached policy of role allows action on arn without a Condition."""
    return any(
        st['Effect'] == 'Allow'
        and action in iam.as_list(st['Action'])
        and 'Condition' not in st
        and any(fnmatch.fnmatchcase(arn, render(r)) for r in iam.as_list(st['Resource']) if render(r))
        for st in iam.statements(role, t, managed=False)
    )


@pytest.mark.parametrize('compute', COMPUTE_TYPES)
@pytest.mark.parametrize('painter, cc, exists', [
    ('true', 'false', True),
    ('false', 'true', True),
    ('true', 'true', True),
    ('false', 'false', False),
])
def test_the_bucket_exists_while_painter_or_claude_code_web_is_on(compute, painter, cc, exists):
    assert iam.present(BUCKET, truth(compute, painter, cc)) is exists


def test_the_bucket_keeps_the_claude_code_web_logical_id_and_name():
    # A new logical id or name would replace the bucket of every Claude Code Web stack.
    bucket = RESOURCES[BUCKET]
    assert bucket['Type'] == 'AWS::S3::Bucket'
    assert bucket['Properties']['BucketName'] == {'Fn::Sub': 'brc-cc-workspace-${AWS::AccountId}-${AWS::Region}-${RandomString}'}
    assert (bucket['DeletionPolicy'], bucket['UpdateReplacePolicy']) == ('Retain', 'Retain')


def test_claude_code_web_sessions_reach_only_user_data():
    t = truth('ec2', painter='true', cc='true')
    role = 'ClaudeCodeWebWorkspaceAccessRole'
    # The session policy narrows the role to <prefix>/<user id>/, with prefix from this value.
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
