"""The RDS instance, its password and the security group settings of the templates.

A stack update must not replace the database of an existing stack: MasterUsername and
StorageEncrypted require replacement, so their values for existing stacks stay as they were.
A stack created with a PGPassword keeps using it; a new stack can leave it empty and get a
generated password that the compute reads from Secrets Manager.
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
# The rules EC2 adds to a security group that declares no egress: all IPv4 and all IPv6 traffic.
DEFAULT_EGRESS = [{'IpProtocol': '-1', 'CidrIp': '0.0.0.0/0'}, {'IpProtocol': '-1', 'CidrIpv6': '::/0'}]


NO_VALUE = {'Ref': 'AWS::NoValue'}
STANDALONE = {'DatabaseMode': 'Standalone'}


def with_defaults(template, params):
    values = {name: p.get('Default') for name, p in template['Parameters'].items()}
    values.update(params)
    return values


def resolve(value, template, params):
    """Evaluate Fn::If, and Ref to a parameter given in params."""
    if isinstance(value, dict) and set(value) == {'Fn::If'}:
        name, when_true, when_false = value['Fn::If']
        return resolve(when_true if condition(name, template, params) else when_false, template, params)
    if isinstance(value, dict) and set(value) == {'Ref'} and value['Ref'] in params:
        return params[value['Ref']]
    return value


def condition(name, template, params):
    return truth(template['Conditions'][name], template, with_defaults(template, params))


def truth(node, template, params):
    (op, arg), = node.items()
    if op == 'Condition':
        return truth(template['Conditions'][arg], template, params)
    if op == 'Fn::Equals':
        left, right = (resolve(side, template, params) for side in arg)
        return str(left).lower() == str(right).lower()
    if op == 'Fn::Not':
        return not truth(arg[0], template, params)
    if op == 'Fn::And':
        return all(truth(item, template, params) for item in arg)
    if op == 'Fn::Or':
        return any(truth(item, template, params) for item in arg)
    raise AssertionError(node)


def render(value, template, params):
    """value with every Fn::If decided and AWS::NoValue dropped, as CloudFormation sends it."""
    value = resolve(value, template, params)
    if isinstance(value, dict) and value != NO_VALUE:
        items = ((k, render(v, template, params)) for k, v in value.items())
        return {k: v for k, v in items if v != NO_VALUE}
    if isinstance(value, list):
        return [v for v in (render(item, template, params) for item in value) if v != NO_VALUE]
    return value


def db_properties(template, **params):
    return render(template['Resources']['MyPG']['Properties'], template, params)


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
    # A default applies to every existing stack on its first update with this template:
    # true would replace its database, false would leave new stacks unencrypted.
    assert 'Default' not in param


@pytest.mark.parametrize('name', DB_TEMPLATES)
def test_empty_db_password_is_generated_into_secrets_manager(name):
    template = TEMPLATES[name]
    param = template['Parameters']['PGPassword']
    assert param['NoEcho'] is True and param['Default'] == ''
    props = db_properties(template, PGPassword='', **STANDALONE)
    assert props['MasterUserPassword'] == {'Fn::Sub': '{{resolve:secretsmanager:${PGSecret}}}'}
    secret = template['Resources']['PGSecret']
    assert secret['Condition'] == 'CreatePGSecret'
    # Letters and digits only, so the shell, the URL-free pg client and RDS all take it as is.
    assert secret['Properties']['GenerateSecretString'] == {'PasswordLength': 32, 'ExcludePunctuation': True}
    output = template['Outputs']['PGPasswordSecretArn']
    assert (output['Condition'], output['Value']) == ('CreatePGSecret', {'Ref': 'PGSecret'})
    assert condition('CreatePGSecret', template, {'PGPassword': '', **STANDALONE})


@pytest.mark.parametrize('name', DB_TEMPLATES)
def test_a_db_password_that_was_entered_is_kept(name):
    template = TEMPLATES[name]
    assert db_properties(template, PGPassword='pw', **STANDALONE)['MasterUserPassword'] == 'pw'
    assert not condition('CreatePGSecret', template, {'PGPassword': 'pw', **STANDALONE})


@pytest.mark.parametrize('name', DB_TEMPLATES)
def test_no_secret_without_a_database(name):
    assert not condition('CreatePGSecret', TEMPLATES[name], {'PGPassword': '', 'DatabaseMode': 'NoDB'})


def lambda_env(params):
    template = TEMPLATES[QUICK_BUILD.name]
    return render(template['Resources']['BRConnectorLambda']['Properties']['Environment']['Variables'], template, params)


def web_function_env(params):
    template = TEMPLATES[QUICK_BUILD.name]
    return render(template['Resources']['BRConnectorWebFn']['Properties']['EnvironmentVariables'], template, params)


def ecs_container(name, task, params):
    template = TEMPLATES[name]
    (container,) = render(template['Resources'][task]['Properties']['ContainerDefinitions'], template, params)
    return {e['Name']: e['Value'] for e in container['Environment']}, container.get('Secrets')


ECS_TASKS = [(QUICK_BUILD.name, 'ECSTaskDefinition', {'ComputeType': 'ecs'}), (ECS.name, 'ECSTaskDefinition', {})]


def test_lambda_reads_a_generated_password_by_arn():
    params = {'ComputeType': 'lambda', 'PGPassword': '', **STANDALONE}
    env = lambda_env(params)
    assert 'PGSQL_PASSWORD' not in env
    assert env['PGSQL_PASSWORD_SECRET_ARN'] == {'Ref': 'PGSecret'}
    env = lambda_env({**params, 'PGPassword': 'pw'})
    assert env['PGSQL_PASSWORD'] == 'pw' and 'PGSQL_PASSWORD_SECRET_ARN' not in env


def test_web_function_reads_a_generated_password_by_arn():
    params = {'ComputeType': 'lambda-web', 'PGPassword': '', **STANDALONE}
    env = web_function_env(params)
    assert 'PGSQL_PASSWORD' not in env
    assert env['PGSQL_PASSWORD_SECRET_ARN'] == {'Ref': 'PGSecret'}
    env = web_function_env({**params, 'PGPassword': 'pw'})
    assert env['PGSQL_PASSWORD'] == 'pw' and 'PGSQL_PASSWORD_SECRET_ARN' not in env


@pytest.mark.parametrize('name,task,extra', ECS_TASKS)
def test_ecs_injects_a_generated_password_from_the_secret(name, task, extra):
    params = {'PGPassword': '', **STANDALONE, **extra}
    env, secrets = ecs_container(name, task, params)
    assert 'PGSQL_PASSWORD' not in env
    assert secrets == [{'Name': 'PGSQL_PASSWORD', 'ValueFrom': {'Ref': 'PGSecret'}}]
    env, secrets = ecs_container(name, task, {**params, 'PGPassword': 'pw'})
    assert env['PGSQL_PASSWORD'] == 'pw' and secrets is None


@pytest.mark.parametrize('compute,roles', [
    ('ec2', ['EC2Role']),
    ('lambda', ['EC2Role', 'BRConnectorLambdaRole']),
    ('lambda-web', ['EC2Role', 'BRConnectorWebFnExecRole']),
    ('ecs', ['EC2Role', 'ECSTaskExecutionRole']),
])
def test_only_the_roles_that_start_brconnector_read_the_secret(compute, roles):
    template = TEMPLATES[QUICK_BUILD.name]
    policy = render(template['Resources']['PGSecretReadPolicy']['Properties'], template, {'ComputeType': compute})
    assert policy['Roles'] == [{'Ref': role} for role in roles]
    (statement,) = policy['PolicyDocument']['Statement']
    assert (statement['Action'], statement['Resource']) == ('secretsmanager:GetSecretValue', {'Ref': 'PGSecret'})
    assert template['Resources']['PGSecretReadPolicy']['Condition'] == 'CreatePGSecret'


def test_pinned_lambda_images_cannot_take_a_generated_password():
    rule = TEMPLATES[QUICK_BUILD.name]['Rules']['GeneratedPGPasswordOnLambda']
    assert rule['Assertions'][0]['Assert'] == {'Fn::Equals': [{'Ref': 'BRConnectorVersion'}, 'latest']}


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
        # A declared rule removes the EC2 default, so the declared rules must be the default.
        assert [{k: v for k, v in rule.items() if k != 'Description'} for rule in egress] == DEFAULT_EGRESS, logical_id


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
