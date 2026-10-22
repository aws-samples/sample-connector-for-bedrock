#!/usr/bin/env python3
"""Check that EnableClaudeCodeWeb=false leaves quick-build-brconnector.yaml unchanged.

Run from anywhere inside the repository:

    uv run --with pyyaml python3 cloudformation/test/check_claude_code_web_gating.py [BASE_REF]

BASE_REF must be a commit from before Claude Code Web was added; it defaults to 7ba1548,
the upstream main this feature branched from. Do not pass upstream/main once the feature
is merged: that template already contains it, and the check would then always fail. The
script evaluates the current template as if the switch were off and compares the result
with the template at BASE_REF:

- a gate is IsClaudeCodeWeb, or a condition defined as an `Fn::And` that holds a gate
  (IsClaudeCodeWebSearch), so every gate is false while the switch is off;
- resources and outputs whose `Condition` is a gate are dropped;
- the new parameters, the gate conditions, the new rule and the new parameter group are
  dropped;
- every `Fn::If` on a gate takes its false branch, and a false branch of `AWS::NoValue`
  drops the key or list item it sits in;
- a `Fn::Sub` variable whose value is such an `Fn::If` is inlined into the string, and a
  variable map left empty collapses back to the plain-string form;
- the descriptions of SourceRepoUrl and SourceRef may differ.

Anything else that differs, down to one space in the ec2 `docker run` line, fails with the
path of the first difference. Existing stacks must not see any change while the switch is
off: a UserData change alone makes CloudFormation stop and restart the BRConnector instance.

It also checks that every ClaudeCodeWeb* resource and output carries a gate condition, that
the ec2 `docker run` line stays a single line with `--name brconnector` when the switch is
on, because the SSM auto-update replays that line from the cloud-init log, and that
ClaudeCodeWebImageBuildId is used by ClaudeCodeWebImage alone, so changing it rebuilds the
backend image without touching the BRConnector instance or deployment package.
"""
import subprocess
import sys
from pathlib import Path

import yaml

TEMPLATE = 'cloudformation/quick-build-brconnector.yaml'
# Last upstream main without Claude Code Web.
DEFAULT_BASE_REF = '7ba1548'
GATE = 'IsClaudeCodeWeb'
PREFIX = 'ClaudeCodeWeb'
NEW_PARAMETERS = {
    'EnableClaudeCodeWeb',
    'ClaudeCodeDefaultModel',
    'ClaudeCodeBackgroundModel',
    'ClaudeCodeWebImageBuildId',
    'EnableWebSearch',
}
NEW_RULES = {'ClaudeCodeWebRequirements'}
NEW_PARAMETER_GROUP = 'Claude Code Web (optional)'
DESCRIPTION_MAY_DIFFER = {'SourceRepoUrl', 'SourceRef'}
EC2_SUB_VAR = 'CcEnvArg'
IMAGE_ONLY_PARAMETER = 'ClaudeCodeWebImageBuildId'
IMAGE_RESOURCE = 'ClaudeCodeWebImage'

# Marks a value that evaluates to AWS::NoValue, so the enclosing key or item is dropped.
DROPPED = object()


# libyaml, not the pure-Python scanner: the template has trailing tabs after some plain
# scalars, which only libyaml accepts. Stripping them instead would also hide whitespace
# changes inside UserData, which is what this check exists to catch.
if not getattr(yaml, '__with_libyaml__', False):
    raise SystemExit('FAIL: this check needs PyYAML built with libyaml (yaml.CSafeLoader)')


class CfnLoader(yaml.CSafeLoader):
    """Safe loader that turns CloudFormation short tags into their long forms."""


def _construct_tag(loader, suffix, node):
    if isinstance(node, yaml.ScalarNode):
        value = loader.construct_scalar(node)
    elif isinstance(node, yaml.SequenceNode):
        value = loader.construct_sequence(node, deep=True)
    else:
        value = loader.construct_mapping(node, deep=True)
    if suffix == 'Ref':
        return {'Ref': value}
    if suffix == 'Condition':
        return {'Condition': value}
    if suffix == 'GetAtt' and isinstance(value, str):
        value = value.split('.', 1)
    return {'Fn::' + suffix: value}


CfnLoader.add_multi_constructor('!', _construct_tag)


def load(text):
    return yaml.load(text, Loader=CfnLoader)  # nosec B506 - CfnLoader subclasses yaml.CSafeLoader


def gates(template):
    """IsClaudeCodeWeb and every condition that is an Fn::And holding a gate: all false when off."""
    found = {GATE}
    conditions = template.get('Conditions', {})
    while True:
        more = {
            name
            for name, body in conditions.items()
            if name not in found
            and isinstance(body, dict)
            and set(body) == {'Fn::And'}
            and any(item == {'Condition': g} for item in body['Fn::And'] for g in found)
        }
        if not more:
            return found
        found |= more


def is_gate_if(node, gate_names=(GATE,)):
    return isinstance(node, dict) and set(node) == {'Fn::If'} and node['Fn::If'][0] in gate_names


def switch_off(node, gate_names):
    """Evaluate every decision on a gate in node as false."""
    if is_gate_if(node, gate_names):
        false_branch = node['Fn::If'][2]
        if false_branch == {'Ref': 'AWS::NoValue'}:
            return DROPPED
        return switch_off(false_branch, gate_names)
    if isinstance(node, dict):
        if set(node) == {'Fn::Sub'} and isinstance(node['Fn::Sub'], list):
            return switch_off_sub(node['Fn::Sub'], gate_names)
        out = {}
        for key, value in node.items():
            value = switch_off(value, gate_names)
            if value is not DROPPED:
                out[key] = value
        return out
    if isinstance(node, list):
        return [v for v in (switch_off(item, gate_names) for item in node) if v is not DROPPED]
    return node


def switch_off_sub(args, gate_names):
    text, variables = args
    inlined = False
    kept = {}
    for name, value in variables.items():
        if is_gate_if(value, gate_names):
            false_branch = value['Fn::If'][2]
            if not isinstance(false_branch, str):
                raise SystemExit(f'FAIL: Fn::Sub variable {name}: the {value["Fn::If"][0]} false branch must be a plain string')
            text = text.replace('${' + name + '}', false_branch)
            inlined = True
        else:
            kept[name] = switch_off(value, gate_names)
    if inlined and not kept:
        return {'Fn::Sub': text}
    return {'Fn::Sub': [text, kept]}


def render_off(template, base):
    gate_names = gates(template)
    t = dict(template)
    t['Resources'] = {k: v for k, v in t['Resources'].items() if v.get('Condition') not in gate_names}
    if 'Outputs' in t:
        t['Outputs'] = {k: v for k, v in t['Outputs'].items() if v.get('Condition') not in gate_names}
    t['Parameters'] = {k: dict(v) for k, v in t['Parameters'].items() if k not in NEW_PARAMETERS}
    for name in DESCRIPTION_MAY_DIFFER:
        if name in t['Parameters'] and name in base.get('Parameters', {}):
            t['Parameters'][name]['Description'] = base['Parameters'][name].get('Description')
    t['Conditions'] = {k: v for k, v in t['Conditions'].items() if k not in gate_names}
    if 'Rules' in t:
        rules = {k: v for k, v in t['Rules'].items() if k not in NEW_RULES}
        if rules:
            t['Rules'] = rules
        else:
            del t['Rules']
    interface = t.get('Metadata', {}).get('AWS::CloudFormation::Interface')
    if interface and 'ParameterGroups' in interface:
        groups = [g for g in interface['ParameterGroups'] if g.get('Label', {}).get('default') != NEW_PARAMETER_GROUP]
        t['Metadata'] = dict(t['Metadata'])
        t['Metadata']['AWS::CloudFormation::Interface'] = dict(interface, ParameterGroups=groups)
    return switch_off(t, gate_names)


def first_difference(a, b, path=''):
    """Return a description of the first place a and b differ, or None."""
    if type(a) is not type(b):
        return f'{path}: type {type(a).__name__} != {type(b).__name__}'
    if isinstance(a, dict):
        for key in list(a) + [k for k in b if k not in a]:
            sub = f'{path}.{key}' if path else str(key)
            if key not in b:
                return f'{sub}: only in the current template'
            if key not in a:
                return f'{sub}: only in the base template'
            found = first_difference(a[key], b[key], sub)
            if found:
                return found
        return None
    if isinstance(a, list):
        for i, (x, y) in enumerate(zip(a, b)):
            found = first_difference(x, y, f'{path}[{i}]')
            if found:
                return found
        if len(a) != len(b):
            return f'{path}: {len(a)} items != {len(b)} items'
        return None
    if a != b:
        if isinstance(a, str):
            la, lb = a.split('\n'), b.split('\n')
            for n, (x, y) in enumerate(zip(la, lb), 1):
                if x != y:
                    return f'{path}: line {n} differs\n  current: {x!r}\n  base:    {y!r}'
            return f'{path}: {len(la)} lines != {len(lb)} lines'
        return f'{path}: {a!r} != {b!r}'
    return None


def check_conditions(template):
    gate_names = gates(template)
    problems = []
    for section in ('Resources', 'Outputs'):
        for name, body in template.get(section, {}).items():
            if name.startswith(PREFIX) and body.get('Condition') not in gate_names:
                problems.append(f'{section}.{name} lacks a gate Condition ({", ".join(sorted(gate_names))})')
    return problems


def check_ec2_docker_run_on(template):
    """With the switch on, the docker run line must still be one line naming brconnector."""
    sub = template['Resources']['MyEC2Instance']['Properties']['UserData']['Fn::Base64']['Fn::Sub']
    if isinstance(sub, str):
        return []  # Nothing is injected, so the line is the base line.
    text, variables = sub
    gate = variables.get(EC2_SUB_VAR)
    if not is_gate_if(gate):
        return [f'UserData Fn::Sub variable {EC2_SUB_VAR} is not an Fn::If on {GATE}']
    on = gate['Fn::If'][1]
    on_text = on['Fn::Sub'] if isinstance(on, dict) and isinstance(on.get('Fn::Sub'), str) else on
    if not isinstance(on_text, str) or '\n' in on_text:
        return [f'{EC2_SUB_VAR} true branch must be a single-line string or Fn::Sub string']
    lines = [l for l in text.replace('${' + EC2_SUB_VAR + '}', on_text).split('\n') if '--name brconnector' in l]
    if len(lines) != 1 or not lines[0].lstrip().startswith('docker run ') or on_text not in lines[0]:
        return [f'the switched-on docker run line must be one line holding --name brconnector and {EC2_SUB_VAR}']
    return []


def references(node, name, path=''):
    """Yield the paths under node that reference parameter name (Ref or a ${name} in Fn::Sub)."""
    if isinstance(node, dict):
        if node.get('Ref') == name:
            yield path
        sub = node.get('Fn::Sub')
        text = sub[0] if isinstance(sub, list) and sub else sub
        if isinstance(text, str) and '${' + name + '}' in text:
            yield path
        for key, value in node.items():
            yield from references(value, name, f'{path}.{key}' if path else str(key))
    elif isinstance(node, list):
        for i, value in enumerate(node):
            yield from references(value, name, f'{path}[{i}]')


def check_image_only_parameter(template):
    """The image build id may only reach ClaudeCodeWebImage."""
    own = f'Resources.{IMAGE_RESOURCE}.'
    found = list(references({k: v for k, v in template.items() if k != 'Parameters'}, IMAGE_ONLY_PARAMETER))
    if not any(p.startswith(own) for p in found):
        return [f'{IMAGE_ONLY_PARAMETER} is not used by {IMAGE_RESOURCE}']
    return [f'{IMAGE_ONLY_PARAMETER} is used outside {IMAGE_RESOURCE} at {p}' for p in found if not p.startswith(own)]


def main():
    base_ref = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_BASE_REF
    root = Path(__file__).resolve().parents[2]
    current = load((root / TEMPLATE).read_text())
    base_text = subprocess.run(
        ['git', 'show', f'{base_ref}:{TEMPLATE}'], cwd=root, check=True, capture_output=True, text=True
    ).stdout
    base = load(base_text)

    problems = check_conditions(current) + check_ec2_docker_run_on(current) + check_image_only_parameter(current)
    diff = first_difference(render_off(current, base), base)
    if diff:
        problems.append(f'switch-off render differs from {base_ref} at {diff}')
    if problems:
        for p in problems:
            print(f'FAIL: {p}')
        sys.exit(1)
    print(f'PASS: EnableClaudeCodeWeb=false renders {TEMPLATE} identical to {base_ref}')


if __name__ == '__main__':
    main()
