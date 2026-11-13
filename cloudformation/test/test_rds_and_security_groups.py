"""The RDS instance and security group settings of the templates.

A stack update must not replace the database of an existing stack: MasterUsername and
StorageEncrypted require replacement, so their values for existing stacks stay as they were.
"""
import importlib.util
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
QUICK_BUILD = HERE.parent / 'quick-build-brconnector.yaml'
ECS = HERE.parent / 'another-version-brconnector-on-ecs' / 'brconnector-ecs-fargate.yaml'
VPC = HERE.parent / 'brconnector-vpc-cfn.yaml'

_spec = importlib.util.spec_from_file_location('gating', HERE / 'check_claude_code_web_gating.py')
gating = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gating)

TEMPLATES = {path.name: gating.load(path.read_text()) for path in (QUICK_BUILD, ECS, VPC)}
DB_TEMPLATES = [QUICK_BUILD.name, ECS.name]
ALLOW_ALL_EGRESS = {'IpProtocol': '-1', 'CidrIp': '0.0.0.0/0'}


def resolve(value, template, params):
    """Evaluate Ref to a parameter, Fn::If and Fn::Equals for the given parameter values."""
    if isinstance(value, dict) and set(value) == {'Fn::If'}:
        name, when_true, when_false = value['Fn::If']
        return resolve(when_true if condition(name, template, params) else when_false, template, params)
    if isinstance(value, dict) and set(value) == {'Ref'} and value['Ref'] in params:
        return params[value['Ref']]
    return value


def condition(name, template, params):
    body = template['Conditions'][name]
    left, right = body['Fn::Equals']
    return resolve(left, template, params) == resolve(right, template, params)


def db_properties(template, **params):
    props = template['Resources']['MyPG']['Properties']
    resolved = {key: resolve(value, template, params) for key, value in props.items()}
    return {key: value for key, value in resolved.items() if value != {'Ref': 'AWS::NoValue'}}


def suppressed(resource):
    rules = resource.get('Metadata', {}).get('cfn_nag', {}).get('rules_to_suppress', [])
    return {rule['id']: rule['reason'] for rule in rules}


@pytest.mark.parametrize('name', DB_TEMPLATES)
def test_existing_stacks_keep_unencrypted_storage(name):
    # Stacks created from earlier templates have no StorageEncrypted property. Writing
    # StorageEncrypted: false is a property change, and that change replaces the instance.
    assert 'StorageEncrypted' not in db_properties(TEMPLATES[name], PGStorageEncrypted='false')


@pytest.mark.parametrize('name', DB_TEMPLATES)
def test_new_stacks_can_encrypt_storage(name):
    assert db_properties(TEMPLATES[name], PGStorageEncrypted='true')['StorageEncrypted'] is True


@pytest.mark.parametrize('name', DB_TEMPLATES)
def test_storage_encryption_is_an_explicit_choice(name):
    param = TEMPLATES[name]['Parameters']['PGStorageEncrypted']
    assert param['AllowedValues'] == ['true', 'false']
    # A default would apply to existing stacks on their next update and replace the database.
    assert 'Default' not in param


@pytest.mark.parametrize('name', DB_TEMPLATES)
def test_db_password_has_no_default(name):
    template = TEMPLATES[name]
    param = template['Parameters']['PGPassword']
    assert param['NoEcho'] is True
    assert 'Default' not in param
    assert template['Resources']['MyPG']['Properties']['MasterUserPassword'] == {'Ref': 'PGPassword'}


@pytest.mark.parametrize('name', DB_TEMPLATES)
def test_db_instance_is_protected(name):
    db = TEMPLATES[name]['Resources']['MyPG']
    props = db_properties(TEMPLATES[name], PGStorageEncrypted='false')
    assert props['PubliclyAccessible'] is False
    assert props['DeletionProtection'] is True
    assert db['DeletionPolicy'] == 'Snapshot'
    # The CloudFormation default on replacement is Delete, with no snapshot.
    assert db['UpdateReplacePolicy'] == 'Snapshot'


@pytest.mark.parametrize('name', DB_TEMPLATES)
def test_storage_encryption_parameter_is_in_the_database_group(name):
    groups = TEMPLATES[name]['Metadata']['AWS::CloudFormation::Interface']['ParameterGroups']
    db_group = next(g for g in groups if 'PGPassword' in g.get('Parameters', []))
    assert 'PGStorageEncrypted' in db_group['Parameters']


def test_quick_build_master_username_stays_postgres():
    # Every existing stack has this username; changing it replaces the database.
    db = TEMPLATES[QUICK_BUILD.name]['Resources']['MyPG']
    assert db['Properties']['MasterUsername'] == 'postgres'
    assert suppressed(db)['F24']


def test_ecs_master_username_is_a_parameter_without_default():
    template = TEMPLATES[ECS.name]
    param = template['Parameters']['PGUser']
    assert param['NoEcho'] is True
    assert 'Default' not in param
    assert template['Resources']['MyPG']['Properties']['MasterUsername'] == {'Ref': 'PGUser'}


@pytest.mark.parametrize('name', sorted(TEMPLATES))
def test_security_groups_declare_their_egress(name):
    groups = {
        logical_id: resource
        for logical_id, resource in TEMPLATES[name]['Resources'].items()
        if resource['Type'] == 'AWS::EC2::SecurityGroup'
    }
    assert groups
    for logical_id, group in groups.items():
        egress = group['Properties'].get('SecurityGroupEgress')
        assert egress is not None, logical_id
        # The same rule EC2 adds when a group declares none, so outbound traffic is unchanged.
        assert [{k: rule[k] for k in ALLOW_ALL_EGRESS} for rule in egress] == [ALLOW_ALL_EGRESS], logical_id


def test_public_function_url_permissions_explain_the_open_principal():
    resources = TEMPLATES[QUICK_BUILD.name]['Resources']
    open_permissions = {
        logical_id: resource
        for logical_id, resource in resources.items()
        if resource['Type'] == 'AWS::Lambda::Permission' and resource['Properties'].get('Principal') == '*'
    }
    assert set(open_permissions) == {'BRConnectorLambdaPermission1', 'BRConnectorLambdaInvokePermission1'}
    for permission in open_permissions.values():
        assert permission['Condition'] == 'IsPublicLambdaPermission'
        assert suppressed(permission)['F13']
    assert open_permissions['BRConnectorLambdaPermission1']['Properties']['FunctionUrlAuthType'] == 'NONE'
    assert open_permissions['BRConnectorLambdaInvokePermission1']['Properties']['InvokedViaFunctionUrl'] is True
