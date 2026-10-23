"""The lambda compute type: function URL permissions and the helper-instance cleanup order."""
import importlib.util
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEMPLATE_PATH = HERE.parent / 'quick-build-brconnector.yaml'

_spec = importlib.util.spec_from_file_location('gating', HERE / 'check_claude_code_web_gating.py')
gating = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gating)

RESOURCES = gating.load(TEMPLATE_PATH.read_text())['Resources']
PERMISSIONS = {n: r for n, r in RESOURCES.items() if r['Type'] == 'AWS::Lambda::Permission'}
SAME = ('Condition', 'DependsOn', 'FunctionName', 'Principal', 'SourceArn')


def with_action(action):
    return {n: r for n, r in PERMISSIONS.items() if r['Properties']['Action'] == action}


def test_there_are_function_url_permissions():
    assert len(with_action('lambda:InvokeFunctionUrl')) == 2


def test_each_function_url_permission_has_an_invoke_function_companion():
    companions = list(with_action('lambda:InvokeFunction').values())
    for name, url in with_action('lambda:InvokeFunctionUrl').items():
        matches = [
            c for c in companions
            if all(c.get(k) == url.get(k) for k in ('Condition', 'DependsOn'))
            and all(c['Properties'].get(k) == url['Properties'].get(k) for k in ('FunctionName', 'Principal', 'SourceArn'))
        ]
        assert len(matches) == 1, f'{name} needs exactly one lambda:InvokeFunction companion'
        assert matches[0]['Properties'].get('InvokedViaFunctionUrl') is True, name


def test_invoke_function_for_everyone_is_limited_to_function_url_calls():
    for name, perm in with_action('lambda:InvokeFunction').items():
        if perm['Properties']['Principal'] == '*':
            assert perm['Properties'].get('InvokedViaFunctionUrl') is True, name


def cleanup_lines():
    text, _ = RESOURCES['MyEC2Instance']['Properties']['UserData']['Fn::Base64']['Fn::Sub']
    return [l.strip() for l in text.split('\n') if '${DeleteEC2Lambda}' in l and not l.strip().startswith('#')]


def test_cleanup_waits_for_the_configuration_update_before_invoking():
    lines = cleanup_lines()
    pos = {}
    for kind in ('update-function-configuration', 'wait function-updated', 'lambda invoke'):
        hits = [i for i, l in enumerate(lines) if re.search(r'aws lambda ' + kind.removeprefix('lambda ') + r'\b', l)]
        assert len(hits) == 1, (kind, lines)
        pos[kind] = hits[0]
    assert pos['update-function-configuration'] < pos['wait function-updated'] < pos['lambda invoke']
