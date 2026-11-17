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
ADDED_BY_TRUE = {'ec2': EC2_ONLY, 'lambda': CODEBUILD, 'ecs': set(), 'lambda-web': set()}

DEFAULT = None


def parameters(template, **overrides):
    params = {name: p.get('Default', '') for name, p in template['Parameters'].items()}
    params['AWS::Region'] = 'us-west-2'
    params.update(overrides)
    return params


def overrides(auto_update, **rest):
    return rest if auto_update is DEFAULT else {**rest, 'AutoUpdateBRConnector': auto_update}


def truth_for(template, auto_update, **rest):
    return iam.truth_table(parameters(template, **overrides(auto_update, **rest)), template)


def is_present(body, truth):
    condition = body.get('Condition')
    return condition is None or truth[condition]


def present(template, truth):
    return {name for name, body in template['Resources'].items() if is_present(body, truth)}


def resolved(template, truth):
    """Every present resource and output, keyed by section and name, with its Condition dropped."""
    out = {}
    for section in ('Resources', 'Outputs'):
        for name, body in template[section].items():
            if is_present(body, truth):
                out[section, name] = iam.resolve({k: v for k, v in body.items() if k != 'Condition'}, truth)
    return out


def default_of(template):
    return str(template['Parameters']['AutoUpdateBRConnector']['Default']).lower()


def test_auto_update_is_off_by_default():
    assert default_of(TEMPLATE) == 'false'


@pytest.mark.parametrize('compute', COMPUTE_TYPES)
def test_default_parameters_create_no_auto_update_resources(compute):
    found = present(TEMPLATE, truth_for(TEMPLATE, DEFAULT, ComputeType=compute))
    assert not found & (EC2_ONLY | CODEBUILD)


@pytest.mark.parametrize('compute', COMPUTE_TYPES)
def test_turning_auto_update_on_only_adds_its_own_resources(compute):
    off = present(TEMPLATE, truth_for(TEMPLATE, DEFAULT, ComputeType=compute))
    on = present(TEMPLATE, truth_for(TEMPLATE, 'true', ComputeType=compute))
    assert off <= on
    assert on - off == ADDED_BY_TRUE[compute]


@pytest.mark.parametrize('compute', COMPUTE_TYPES)
def test_switching_auto_update_leaves_every_other_resource_and_output_unchanged(compute):
    off = resolved(TEMPLATE, truth_for(TEMPLATE, DEFAULT, ComputeType=compute))
    on = resolved(TEMPLATE, truth_for(TEMPLATE, 'true', ComputeType=compute))
    assert {k: on[k] for k in off} == off
