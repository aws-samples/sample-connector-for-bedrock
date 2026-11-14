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
    pytest.param('ClaudeCodeWebWorkspaceBucket', 'IsPainter', id='shared-bucket-without-claude-code-web'),
    pytest.param('ClaudeCodeWebRepository', 'CreateWorkspaceBucket', id='unshared-resource-under-the-or'),
])
def test_a_claude_code_web_resource_outside_its_gate_is_reported(name, condition):
    t = gating.load(TEMPLATE_PATH.read_text())
    t['Resources'][name]['Condition'] = condition
    assert any(name in p for p in gating.structural_problems(t))


def test_the_switch_off_render_keeps_the_shared_bucket_for_painter():
    off = gating.render_off(gating.load(TEMPLATE_PATH.read_text()))
    assert off['Resources']['ClaudeCodeWebWorkspaceBucket']['Condition'] == 'CreateWorkspaceBucket'
    assert off['Conditions']['CreateWorkspaceBucket'] == {'Condition': 'IsPainter'}
