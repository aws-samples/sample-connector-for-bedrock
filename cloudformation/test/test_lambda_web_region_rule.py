import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEMPLATE_PATH = HERE.parent / 'quick-build-brconnector.yaml'

_spec = importlib.util.spec_from_file_location('gating', HERE / 'check_claude_code_web_gating.py')
gating = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gating)

LAUNCH_REGIONS = ['us-east-1', 'us-east-2', 'us-west-2', 'ap-northeast-1', 'eu-west-1']


def _rule():
    return gating.load(TEMPLATE_PATH.read_text())['Rules']['LambdaWebRegion']


def test_rule_applies_only_to_lambda_web():
    assert _rule()['RuleCondition'] == {'Fn::Equals': [{'Ref': 'ComputeType'}, 'lambda-web']}


def test_rule_allows_exactly_the_launch_regions():
    assertions = _rule()['Assertions']
    assert len(assertions) == 1
    contains = assertions[0]['Assert']['Fn::Contains']
    assert contains[1] == {'Ref': 'AWS::Region'}
    assert sorted(contains[0]) == sorted(LAUNCH_REGIONS)


def test_assert_description_names_the_regions_and_the_alternatives():
    text = _rule()['Assertions'][0]['AssertDescription']
    assert all(r in text for r in LAUNCH_REGIONS)
    assert 'ec2' in text and 'ecs' in text and 'lambda' in text
