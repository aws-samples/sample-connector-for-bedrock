import importlib.util
from pathlib import Path

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
