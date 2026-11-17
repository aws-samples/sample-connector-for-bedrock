import importlib.util
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location('iam_scope', HERE / 'test_iam_scope.py')
iam = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(iam)
gating = iam.gating

TEMPLATE = iam.TEMPLATE
COMPUTE_TYPES = ['ec2', 'lambda', 'ecs', 'lambda-web']
EC2_ONLY = {'S3Bucket', 'EC2AutoUpdateSSMDocument', 'EC2AutoUpdateAssociation'}
CODEBUILD = {'CodeBuildSecurityGroup', 'CodeBuildRole', 'CodeBuildProject', 'CodeBuildEventRule',
             'CodeBuildEventRole'}
ECS_TEMPLATE = gating.load(
    (HERE.parent / 'another-version-brconnector-on-ecs' / 'brconnector-ecs-fargate.yaml').read_text())
ECS_AUTO_UPDATE = {'ECREventRule', 'UpdateImageLambda', 'UpdateImageLambdaRole', 'EventsRulePermission'}
ADDED_BY_TRUE = {'ec2': EC2_ONLY, 'lambda': CODEBUILD, 'ecs': set(), 'lambda-web': set()}


def parameters(template, **overrides):
    params = {name: p.get('Default', '') for name, p in template['Parameters'].items()}
    params['AWS::Region'] = 'us-west-2'
    params.update(overrides)
    return params


def truth_for(template, **overrides):
    return iam.truth_table(parameters(template, **overrides), template)


def is_present(body, truth):
    condition = body.get('Condition')
    return condition is None or truth[condition]


def present(template, truth):
    return {name for name, body in template['Resources'].items() if is_present(body, truth)}


def resolved(template, truth):
    out = {}
    for section in ('Resources', 'Outputs'):
        for name, body in template[section].items():
            if is_present(body, truth):
                out[section, name] = iam.resolve(body, truth)
    return out


def default_of(template):
    return str(template['Parameters']['AutoUpdateBRConnector']['Default']).lower()


def test_auto_update_is_off_by_default():
    assert default_of(TEMPLATE) == 'false'


@pytest.mark.parametrize('compute', COMPUTE_TYPES)
def test_default_parameters_create_no_auto_update_resources(compute):
    found = present(TEMPLATE, truth_for(TEMPLATE, ComputeType=compute))
    assert not found & (EC2_ONLY | CODEBUILD)


@pytest.mark.parametrize('compute', COMPUTE_TYPES)
def test_turning_auto_update_on_only_adds_its_own_resources(compute):
    off = present(TEMPLATE, truth_for(TEMPLATE, ComputeType=compute))
    on = present(TEMPLATE, truth_for(TEMPLATE, ComputeType=compute, AutoUpdateBRConnector='true'))
    assert off <= on
    assert on - off == ADDED_BY_TRUE[compute]


@pytest.mark.parametrize('compute', COMPUTE_TYPES)
def test_switching_auto_update_leaves_every_other_resource_and_output_unchanged(compute):
    off = resolved(TEMPLATE, truth_for(TEMPLATE, ComputeType=compute))
    on = resolved(TEMPLATE, truth_for(TEMPLATE, ComputeType=compute, AutoUpdateBRConnector='true'))
    assert {k: on[k] for k in off} == off


def test_ecs_auto_update_is_off_by_default():
    assert default_of(ECS_TEMPLATE) == 'false'


def test_ecs_default_parameters_create_no_auto_update_resources():
    assert not present(ECS_TEMPLATE, truth_for(ECS_TEMPLATE)) & ECS_AUTO_UPDATE


def test_ecs_turning_auto_update_on_only_adds_its_own_resources():
    off = present(ECS_TEMPLATE, truth_for(ECS_TEMPLATE))
    on = present(ECS_TEMPLATE, truth_for(ECS_TEMPLATE, AutoUpdateBRConnector='true'))
    assert off <= on
    assert on - off == ECS_AUTO_UPDATE


def test_ecs_switching_auto_update_leaves_every_other_resource_and_output_unchanged():
    off = resolved(ECS_TEMPLATE, truth_for(ECS_TEMPLATE))
    on = resolved(ECS_TEMPLATE, truth_for(ECS_TEMPLATE, AutoUpdateBRConnector='true'))
    assert {k: on[k] for k in off} == off
