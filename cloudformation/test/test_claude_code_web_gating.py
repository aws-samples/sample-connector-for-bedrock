import importlib.util
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
TEMPLATE_PATH = HERE.parent / 'quick-build-brconnector.yaml'

_spec = importlib.util.spec_from_file_location('gating', HERE / 'check_claude_code_web_gating.py')
gating = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gating)


def test_current_template_passes_the_structural_checks():
    assert gating.structural_problems(gating.load(TEMPLATE_PATH.read_text())) == []


def test_an_ungated_reference_to_a_claude_code_web_resource_is_reported():
    t = gating.load(TEMPLATE_PATH.read_text())
    t['Resources']['ECSTaskDefinition']['Properties']['Tags'] = [{'Key': 'x', 'Value': {'Ref': 'ClaudeCodeWebRuntime'}}]
    assert any('ClaudeCodeWebRuntime' in p for p in gating.structural_problems(t))


@pytest.mark.parametrize('name, condition', [
    pytest.param('ClaudeCodeWebWorkspaceBucket', 'IsEc2', id='shared-bucket-under-a-condition'),
    pytest.param('ClaudeCodeWebRepository', None, id='resource-without-a-gate'),
    pytest.param('ClaudeCodeWebRepository', 'ClaudeCodeWebRequested', id='resource-under-the-switch-alone'),
])
def test_a_claude_code_web_resource_outside_its_gate_is_reported(name, condition):
    t = gating.load(TEMPLATE_PATH.read_text())
    t['Resources'][name].pop('Condition', None)
    if condition:
        t['Resources'][name]['Condition'] = condition
    assert any(p.startswith(f'Resources.{name} ') for p in gating.structural_problems(t))


def test_the_switch_off_render_keeps_the_shared_bucket():
    off = gating.render_off(gating.load(TEMPLATE_PATH.read_text()))
    assert 'Condition' not in off['Resources']['ClaudeCodeWebWorkspaceBucket']


def test_a_status_output_under_a_condition_is_reported():
    t = gating.load(TEMPLATE_PATH.read_text())
    t['Outputs']['ClaudeCodeWebStatus']['Condition'] = 'IsClaudeCodeWeb'
    assert any(p.startswith('Outputs.ClaudeCodeWebStatus ') for p in gating.structural_problems(t))


def test_a_reference_to_the_switch_parameter_outside_the_switch_is_reported():
    t = gating.load(TEMPLATE_PATH.read_text())
    t['Resources']['ECSTaskDefinition']['Properties']['Tags'] = [{'Key': 'x', 'Value': {'Ref': 'EnableClaudeCodeWeb'}}]
    assert any('EnableClaudeCodeWeb at Resources.ECSTaskDefinition' in p for p in gating.structural_problems(t))


@pytest.mark.parametrize('name, body', [
    pytest.param('ClaudeCodeWebRequested', {'Fn::Equals': [{'Ref': 'EnableWebSearch'}, 'true']}, id='switch-on-another-parameter'),
    pytest.param('IsClaudeCodeWeb', {'Fn::Not': [{'Condition': 'IsLambda'}]}, id='gate-without-the-switch'),
])
def test_a_switch_the_off_render_cannot_rely_on_is_reported(name, body):
    t = gating.load(TEMPLATE_PATH.read_text())
    t['Conditions'][name] = body
    assert any(p.startswith('condition ') for p in gating.structural_problems(t))


def test_the_switch_off_render_says_why_claude_code_web_is_missing():
    off = gating.render_off(gating.load(TEMPLATE_PATH.read_text()))
    assert off['Outputs']['ClaudeCodeWebStatus'] == {
        'Description': 'Whether Claude Code Web was deployed, and if not, why',
        'Value': 'Not deployed: EnableClaudeCodeWeb is false.',
    }
