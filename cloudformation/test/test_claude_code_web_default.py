"""Claude Code Web is on by default and skips itself where the deployment cannot run it.

A deployment that cannot run it (lambda, no database, a pinned BRConnectorVersion on ec2 or
ecs) must still be created: no Rule fails, no Claude Code Web resource or output exists
except the ones every stack has, nothing left refers to what is missing, and the
ClaudeCodeWebStatus output says why. A stack created before this default keeps
EnableClaudeCodeWeb 'false' on a console update, and its BRConnector instance must render
exactly as it did.
"""
import importlib.util
import subprocess
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location('iam_scope', HERE / 'test_iam_scope.py')
iam = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(iam)
gating = iam.gating

TEMPLATE = iam.TEMPLATE
RESOURCES = TEMPLATE['Resources']
OUTPUTS = TEMPLATE['Outputs']
COMPUTE_TYPES = ['ec2', 'lambda', 'ecs', 'lambda-web']
EVERY_STACK = gating.SHARED | gating.STATUS
# The template before painter and before Claude Code Web was on by default.
BEFORE = '86deac17350a2ddc116e8d18882a6c723b23354f'

STATUS = {
    'deployed': 'Deployed. Sign in at the ClaudeCodeWebUrl output.',
    'off': 'Not deployed: EnableClaudeCodeWeb is false.',
    'lambda': 'Not deployed: ComputeType lambda is not supported, because its 60-second timeout cuts off long'
              ' streams. Use ec2, ecs or lambda-web.',
    'database': 'Not deployed: Claude Code Web needs a database, because it refuses the admin key. Set DatabaseMode'
                ' to Standalone, or to EC2Integrated with ComputeType ec2.',
    'version': 'Not deployed: Claude Code Web needs BRConnectorVersion latest with ComputeType ec2 or ecs, because'
               ' the pinned versions predate /cc.',
}
PINNED = '0.0.19'
CASES = [
    pytest.param({}, 'deployed', id='defaults'),
    pytest.param({'ComputeType': 'ecs', 'DatabaseMode': 'Standalone'}, 'deployed', id='ecs-standalone'),
    pytest.param({'ComputeType': 'lambda-web', 'DatabaseMode': 'Standalone'}, 'deployed', id='lambda-web-standalone'),
    pytest.param({'ComputeType': 'lambda-web', 'DatabaseMode': 'Standalone', 'BRConnectorVersion': PINNED}, 'deployed',
                 id='lambda-web-pinned'),
    pytest.param({'EnableClaudeCodeWeb': 'false'}, 'off', id='switch-off'),
    pytest.param({'EnableClaudeCodeWeb': 'false', 'ComputeType': 'lambda'}, 'off', id='switch-off-lambda'),
    pytest.param({'ComputeType': 'lambda', 'DatabaseMode': 'Standalone'}, 'lambda', id='lambda-standalone'),
    pytest.param({'ComputeType': 'lambda', 'DatabaseMode': 'EC2Integrated'}, 'lambda', id='lambda-ec2integrated'),
    pytest.param({'ComputeType': 'lambda', 'DatabaseMode': 'NoDB', 'BRConnectorVersion': PINNED}, 'lambda',
                 id='lambda-nodb-pinned'),
    pytest.param({'ComputeType': 'ec2', 'DatabaseMode': 'NoDB'}, 'database', id='ec2-nodb'),
    pytest.param({'ComputeType': 'ecs', 'DatabaseMode': 'NoDB'}, 'database', id='ecs-nodb'),
    pytest.param({'ComputeType': 'lambda-web', 'DatabaseMode': 'NoDB'}, 'database', id='lambda-web-nodb'),
    pytest.param({'ComputeType': 'ecs', 'DatabaseMode': 'EC2Integrated'}, 'database', id='ecs-ec2integrated'),
    pytest.param({'ComputeType': 'lambda-web', 'DatabaseMode': 'EC2Integrated'}, 'database',
                 id='lambda-web-ec2integrated'),
    pytest.param({'ComputeType': 'ec2', 'DatabaseMode': 'NoDB', 'BRConnectorVersion': PINNED}, 'database',
                 id='ec2-nodb-pinned'),
    pytest.param({'ComputeType': 'ec2', 'BRConnectorVersion': PINNED}, 'version', id='ec2-pinned'),
    pytest.param({'ComputeType': 'ecs', 'DatabaseMode': 'Standalone', 'BRConnectorVersion': PINNED}, 'version',
                 id='ecs-pinned'),
]


def parameters(template=TEMPLATE, **overrides):
    params = {name: p.get('Default', '') for name, p in template['Parameters'].items()}
    params['AWS::Region'] = 'us-west-2'
    params.update(overrides)
    return params


def value(node, params):
    if isinstance(node, dict) and set(node) == {'Ref'}:
        node = params[node['Ref']]
    if isinstance(node, bool):
        return 'true' if node else 'false'
    assert isinstance(node, (str, int)), node
    return str(node)


def holds(node, params):
    """A Rule's RuleCondition or Assert, evaluated the way CloudFormation does before it creates anything."""
    (fn, args), = node.items()
    if fn == 'Fn::Equals':
        return value(args[0], params) == value(args[1], params)
    if fn == 'Fn::Not':
        return not holds(args[0], params)
    if fn == 'Fn::And':
        return all(holds(a, params) for a in args)
    if fn == 'Fn::Or':
        return any(holds(a, params) for a in args)
    if fn == 'Fn::Contains':
        return value(args[1], params) in [value(v, params) for v in args[0]]
    raise AssertionError(f'unexpected rule function {fn}')


def failing_rules(params):
    return [
        name for name, rule in TEMPLATE.get('Rules', {}).items()
        if ('RuleCondition' not in rule or holds(rule['RuleCondition'], params))
        and not all(holds(a['Assert'], params) for a in rule['Assertions'])
    ]


def present(section, truth):
    return {name for name, body in TEMPLATE[section].items() if body.get('Condition') is None or truth[body['Condition']]}


def claude_code_web_names(truth):
    gated = gating.gates(TEMPLATE)
    return {
        name
        for section in ('Resources', 'Outputs')
        for name in present(section, truth)
        if name.startswith(gating.PREFIX) or TEMPLATE[section][name].get('Condition') in gated
    }


@pytest.mark.parametrize('overrides, status', CASES)
def test_no_rule_stops_the_stack(overrides, status):
    assert failing_rules(parameters(**overrides)) == []


@pytest.mark.parametrize('overrides, status', CASES)
def test_the_status_output_says_whether_claude_code_web_was_deployed(overrides, status):
    truth = iam.truth_table(parameters(**overrides))
    assert truth['IsClaudeCodeWeb'] is (status == 'deployed')
    assert iam.resolve(OUTPUTS['ClaudeCodeWebStatus']['Value'], truth) == STATUS[status]


@pytest.mark.parametrize('overrides, status', CASES)
def test_claude_code_web_exists_only_where_it_was_deployed(overrides, status):
    truth = iam.truth_table(parameters(**overrides))
    found = claude_code_web_names(truth)
    if status == 'deployed':
        assert {'ClaudeCodeWebRuntime', 'ClaudeCodeWebComputePolicy', 'ClaudeCodeWebUrl'} <= found
    else:
        assert found == EVERY_STACK


@pytest.mark.parametrize('overrides, status', CASES)
def test_nothing_refers_to_a_resource_the_stack_does_not_have(overrides, status):
    truth = iam.truth_table(parameters(**overrides))
    missing = set(RESOURCES) - present('Resources', truth)
    for section in ('Resources', 'Outputs'):
        for name in present(section, truth):
            body = {k: v for k, v in TEMPLATE[section][name].items() if k != 'Condition'}
            assert list(gating.mentions(iam.resolve(body, truth), missing)) == [], (section, name)


def test_the_defaults_deploy_claude_code_web_on_ec2_with_its_database():
    params = parameters()
    assert (params['EnableClaudeCodeWeb'], params['ComputeType'], params['DatabaseMode'], params['BRConnectorVersion']) == (
        'true', 'ec2', 'EC2Integrated', 'latest')
    assert iam.truth_table(params)['IsClaudeCodeWeb']


def cc_env_arg(truth):
    return [iam.resolve(sub[1][gating.EC2_SUB_VAR], truth) for sub in gating.userdata_scripts(TEMPLATE)]


def template_before():
    try:
        return gating.template_at(HERE.parents[1], BEFORE)
    except (OSError, subprocess.CalledProcessError):
        pytest.skip(f'commit {BEFORE} is not in this clone (a shallow checkout), so there is no template to compare with')


@pytest.mark.parametrize('compute', COMPUTE_TYPES)
def test_a_stack_with_the_switch_off_gets_no_claude_code_web(compute):
    truth = iam.truth_table(parameters(EnableClaudeCodeWeb='false', ComputeType=compute))
    assert claude_code_web_names(truth) == EVERY_STACK
    assert cc_env_arg(truth) == ['', '']


@pytest.mark.parametrize('compute', COMPUTE_TYPES)
def test_a_stack_with_the_switch_off_keeps_its_brconnector_instance(compute):
    before = template_before()
    assert before['Parameters']['EnableClaudeCodeWeb']['Default'] == 'false'
    assert RESOURCES['MyEC2Instance'] == before['Resources']['MyEC2Instance']
    now = iam.truth_table(parameters(EnableClaudeCodeWeb='false', ComputeType=compute))
    then = iam.truth_table(parameters(before, ComputeType=compute), before)
    assert iam.resolve(RESOURCES['MyEC2Instance'], now) == iam.resolve(before['Resources']['MyEC2Instance'], then)
