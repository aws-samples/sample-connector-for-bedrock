"""The roles in ROLES grant only the calls their scripts make.

The scripts are read from the template itself: the helper's UserData and the nightly SSM
document (EC2Role), and the buildspecs of the CodeBuild projects that run as CodeBuildRole
and WebFnPackageBuildRole. Every `aws <service> <operation>` call in them, and every
`regctl image copy` into the private registry, must appear in CALLS, and each action CALLS
names must be granted on the resource CALLS names, in every combination of the parameters
that decide which resources and statements exist. Conversely, each (action, resource,
Condition) these roles grant must come from CALLS or NOT_A_CALL. Other roles, and other
commands such as docker push, are not checked here.
"""
import fnmatch
import importlib.util
import itertools
import json
import re
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
TEMPLATE_PATH = HERE.parent / 'quick-build-brconnector.yaml'

_spec = importlib.util.spec_from_file_location('gating', HERE / 'check_claude_code_web_gating.py')
gating = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gating)

TEMPLATE = gating.load(TEMPLATE_PATH.read_text())
RESOURCES = TEMPLATE['Resources']

ROLES = ['EC2Role', 'DeleteEC2LambdaExecutionRole', 'CodeBuildRole', 'WebFnPackageBuildRole']
STAR_OK = {'bedrock:ListFoundationModels', 'ecr:GetAuthorizationToken', 'ecr-public:GetAuthorizationToken',
           'sts:GetServiceBearerToken', 'ec2:CreateNetworkInterface', 'ec2:DescribeDhcpOptions',
           'ec2:DescribeNetworkInterfaces', 'ec2:DeleteNetworkInterface', 'ec2:DescribeSubnets',
           'ec2:DescribeSecurityGroups', 'ec2:DescribeVpcs'}
BROAD_MANAGED = ('FullAccess', 'AdminAccess', 'AdministratorAccess', 'AmazonEC2ReadOnlyAccess')

# The managed policies a call relies on, with the statements it needs, as published in the
# AWS managed policy reference.
MANAGED = {
    'AmazonElasticContainerRegistryPublicReadOnly': [
        {'Effect': 'Allow', 'Action': ['ecr-public:GetAuthorizationToken', 'sts:GetServiceBearerToken'], 'Resource': '*'},
    ],
}


def sub(text):
    return {'Fn::Sub': text}


def get_att(name, attribute='Arn'):
    return {'Fn::GetAtt': [name, attribute]}


def ssm_parameter(name):
    return sub('arn:${AWS::Partition}:ssm:${AWS::Region}:${AWS::AccountId}:parameter' + name)


ECR_PUSH = ['ecr:BatchCheckLayerAvailability', 'ecr:BatchGetImage', 'ecr:GetDownloadUrlForLayer',
            'ecr:InitiateLayerUpload', 'ecr:UploadLayerPart', 'ecr:CompleteLayerUpload', 'ecr:PutImage']
LAMBDA_REPO = get_att('PrivateECRRepository')
CLEANUP_FUNCTION = get_att('DeleteEC2Lambda')
BRCONNECTOR_FUNCTION = get_att('BRConnectorLambda')
ECS_SERVICE_LINKED_ROLE = sub(
    'arn:${AWS::Partition}:iam::${AWS::AccountId}:role/aws-service-role/ecs.amazonaws.com/AWSServiceRoleForECS')
ECS_SERVICE_NAME = {'StringEquals': {'iam:AWSServiceName': 'ecs.amazonaws.com'}}

# (call, its target as written in the script) -> [(actions, resource, statement Condition)].
# The target is the value of --name, --function-name, --stack-name, --aws-service-name or
# --key, or the destination repository of a regctl copy.
CALLS = {
    ('ecr get-login-password', None): [(['ecr:GetAuthorizationToken'], '*', None)],
    ('ecr-public get-login-password', None): [
        (['ecr-public:GetAuthorizationToken', 'sts:GetServiceBearerToken'], '*', None)],
    ('ssm get-parameter', '/brconnector/pgdb-${AWS::StackName}'): [
        (['ssm:GetParameter'], ssm_parameter('/brconnector/pgdb-${AWS::StackName}'), None)],
    ('ssm put-parameter', '/brconnector/first-user-key-${AWS::StackName}'): [
        (['ssm:PutParameter'], ssm_parameter('/brconnector/first-user-key-${AWS::StackName}'), None)],
    ('ssm put-parameter', '/brconnector/admin-key-${AWS::StackName}'): [
        (['ssm:PutParameter'], ssm_parameter('/brconnector/admin-key-${AWS::StackName}'), None)],
    ('iam create-service-linked-role', 'ecs.amazonaws.com'): [
        (['iam:CreateServiceLinkedRole'], ECS_SERVICE_LINKED_ROLE, ECS_SERVICE_NAME)],
    ('lambda update-function-configuration', '${DeleteEC2Lambda}'): [
        (['lambda:UpdateFunctionConfiguration'], CLEANUP_FUNCTION, None)],
    # The waiter polls GetFunctionConfiguration.
    ('lambda wait', '${DeleteEC2Lambda}'): [(['lambda:GetFunctionConfiguration'], CLEANUP_FUNCTION, None)],
    ('lambda invoke', '${DeleteEC2Lambda}'): [(['lambda:InvokeFunction'], CLEANUP_FUNCTION, None)],
    ('regctl image copy', '${AWS::AccountId}.dkr.ecr.${AWS::Region}.amazonaws.com/$REPO_PREFIX/$IMG_LAMBDA'): [
        (ECR_PUSH, LAMBDA_REPO, None)],
    # CodeBuildProject: STACK_NAME is this stack, FUNCTION_NAME its MyFunctionName output.
    ('cloudformation describe-stacks', '${STACK_NAME}'): [
        (['cloudformation:DescribeStacks'], {'Ref': 'AWS::StackId'}, None)],
    ('regctl image copy', '${ACCOUNT_ID}.dkr.ecr.${AWS_DEFAULT_REGION}.amazonaws.com/${ECR_REPO}'): [
        (ECR_PUSH, LAMBDA_REPO, None)],
    ('lambda get-function', '${FUNCTION_NAME}'): [(['lambda:GetFunction'], BRCONNECTOR_FUNCTION, None)],
    # Lambda reads the image with the caller's permissions.
    ('lambda update-function-code', '${FUNCTION_NAME}'): [
        (['lambda:UpdateFunctionCode'], BRCONNECTOR_FUNCTION, None),
        (['ecr:BatchGetImage', 'ecr:GetDownloadUrlForLayer'], LAMBDA_REPO, None)],
    # WebFnPackageBuild
    ('s3api put-object', 'brconnector/function.zip'): [
        (['s3:PutObject'], sub('arn:${AWS::Partition}:s3:::${WebFnCodeBucket}/brconnector/function.zip'), None)],
}

LOGS = ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents']
VPC_NETWORK_INTERFACE = ['ec2:CreateNetworkInterface', 'ec2:DescribeDhcpOptions', 'ec2:DescribeNetworkInterfaces',
                         'ec2:DeleteNetworkInterface', 'ec2:DescribeSubnets', 'ec2:DescribeSecurityGroups',
                         'ec2:DescribeVpcs']
SUBNET_ARN = 'arn:${AWS::Partition}:ec2:${AWS::Region}:${AWS::AccountId}:subnet/${SubnetId}'
BEDROCK_INVOKE = ['bedrock:InvokeModelWithResponseStream', 'bedrock:InvokeModel']


def build_log_group(project_name):
    group = 'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/codebuild/' + project_name
    return [sub(group), sub(group + ':*')]


def codebuild_subnet_condition():
    subnets = RESOURCES['CodeBuildProject']['Properties']['VpcConfig']['Subnets']
    return {
        'StringEquals': {'ec2:AuthorizedService': 'codebuild.amazonaws.com'},
        'ArnEquals': {'ec2:Subnet': [{'Fn::Sub': [SUBNET_ARN, {'SubnetId': s}]} for s in subnets]},
    }


# Grants a role holds for something other than a script call: [(actions, resource, Condition)].
NOT_A_CALL = {
    # BRConnector itself, which runs on the helper EC2 for every compute type.
    'EC2Role': [
        (BEDROCK_INVOKE, 'arn:aws:bedrock:*::foundation-model/*', None),
        (BEDROCK_INVOKE, 'arn:aws:bedrock:*:*:inference-profile/*', None),
        (['bedrock:ListFoundationModels'], '*', None),
    ],
    'DeleteEC2LambdaExecutionRole': [
        (['ec2:TerminateInstances'], sub('arn:${AWS::Partition}:ec2:${AWS::Region}:${AWS::AccountId}:instance/*'),
         {'StringEquals': {'aws:ResourceTag/aws:cloudformation:stack-name': {'Ref': 'AWS::StackName'}}}),
    ],
    'CodeBuildRole': [(LOGS, group, None) for group in build_log_group('MyCodeBuildProject-${AWS::StackName}')] + [
        # "Allow CodeBuild access to AWS services required to create a VPC network interface".
        (VPC_NETWORK_INTERFACE, '*', None),
        (['ec2:CreateNetworkInterfacePermission'],
         sub('arn:${AWS::Partition}:ec2:${AWS::Region}:${AWS::AccountId}:network-interface/*'),
         codebuild_subnet_condition()),
    ],
    'WebFnPackageBuildRole': [(LOGS, group, None) for group in build_log_group('${AWS::StackName}-webfn-package')],
}

# Managed policies that may sit on a role while S3Bucket exists; none of them writes to S3,
# per the AWS managed policy reference.
MANAGED_WITHOUT_S3_WRITE = {'AmazonSSMManagedInstanceCore', 'AmazonElasticContainerRegistryPublicReadOnly',
                            'AWSLambdaBasicExecutionRole'}

# The parameters that decide which roles, policies and statements exist.
SCENARIO_PARAMETERS = {
    'ComputeType': ['ec2', 'lambda', 'lambda-web', 'ecs'],
    'DatabaseMode': ['Standalone', 'EC2Integrated', 'NoDB'],
    'EnableClaudeCodeWeb': ['true', 'false'],
    'AutoUpdateBRConnector': ['true', 'false'],
    'KeepEc2': ['true', 'false'],
    'VpcStackName': ['', 'vpc'],
}
DROPPED = object()


def as_list(value):
    return value if isinstance(value, list) else [value]


def managed_name(arn):
    text = arn['Fn::Sub'] if isinstance(arn, dict) else arn
    return text.rsplit('/', 1)[-1]


# ---------------------------------------------------------------------------
# Conditions
# ---------------------------------------------------------------------------

def scenarios():
    names = list(SCENARIO_PARAMETERS)
    for values in itertools.product(*SCENARIO_PARAMETERS.values()):
        params = {name: p.get('Default', '') for name, p in TEMPLATE['Parameters'].items()}
        params.update(zip(names, values))
        params['AWS::Region'] = 'us-west-2'
        yield dict(zip(names, values)), truth_table(params)


def truth_table(params):
    conditions = TEMPLATE['Conditions']
    truth = {}

    def value(node):
        if isinstance(node, dict) and set(node) == {'Ref'}:
            node = params[node['Ref']]
        # An unquoted true or false in the template loads as a bool.
        if isinstance(node, bool):
            return 'true' if node else 'false'
        assert isinstance(node, (str, int)), node
        return str(node)

    def evaluate(node):
        (fn, args), = node.items()
        if fn == 'Fn::Equals':
            return value(args[0]) == value(args[1])
        if fn == 'Fn::And':
            return all(evaluate(a) for a in args)
        if fn == 'Fn::Or':
            return any(evaluate(a) for a in args)
        if fn == 'Fn::Not':
            return not evaluate(args[0])
        if fn == 'Condition':
            return cond(args)
        raise AssertionError(f'unexpected condition function {fn}')

    def cond(name):
        if name not in truth:
            truth[name] = evaluate(conditions[name])
        return truth[name]

    for name in conditions:
        cond(name)
    return truth


def resolve(node, truth):
    """node with every Fn::If decided and AWS::NoValue dropped."""
    if isinstance(node, dict):
        if set(node) == {'Fn::If'}:
            name, yes, no = node['Fn::If']
            return resolve(yes if truth[name] else no, truth)
        if node == {'Ref': 'AWS::NoValue'}:
            return DROPPED
        out = {}
        for key, value in node.items():
            value = resolve(value, truth)
            if value is not DROPPED:
                out[key] = value
        return out
    if isinstance(node, list):
        return [v for v in (resolve(item, truth) for item in node) if v is not DROPPED]
    return node


def present(name, truth):
    condition = RESOURCES[name].get('Condition')
    return condition is None or truth[condition]


# ---------------------------------------------------------------------------
# Grants
# ---------------------------------------------------------------------------

def attached_policies(role, truth):
    """The AWS::IAM::Policy resources attached to role in this scenario."""
    for name, body in RESOURCES.items():
        if body['Type'] == 'AWS::IAM::Policy' and present(name, truth):
            props = resolve(body['Properties'], truth)
            if {'Ref': role} in props.get('Roles', []):
                yield name, props


def statements(role, truth, managed=True):
    """Every statement that applies to role in this scenario: inline, attached and managed."""
    assert present(role, truth), role
    props = resolve(RESOURCES[role]['Properties'], truth)
    found = [st for p in props.get('Policies', []) for st in as_list(p['PolicyDocument']['Statement'])]
    for _, policy in attached_policies(role, truth):
        found += as_list(policy['PolicyDocument']['Statement'])
    if managed:
        for arn in props.get('ManagedPolicyArns', []):
            found += MANAGED.get(managed_name(arn), [])
    return found


def granted(found, action, resource, condition):
    return any(
        st.get('Effect') == 'Allow'
        and action in as_list(st.get('Action', []))
        and resource in as_list(st.get('Resource', []))
        and st.get('Condition') == condition
        for st in found
    )


def own_statements(role, truth):
    """The statements role grants itself: inline, and attached policies other than Claude Code Web's."""
    props = resolve(RESOURCES[role]['Properties'], truth)
    found = [st for p in props.get('Policies', []) for st in as_list(p['PolicyDocument']['Statement'])]
    for name, policy in attached_policies(role, truth):
        if not name.startswith('ClaudeCodeWeb'):
            found += as_list(policy['PolicyDocument']['Statement'])
    return found


def triples(entries, truth):
    """{(action, resource, Condition)} for CALLS-style entries in this scenario, JSON-encoded so they hash."""
    return {
        (action, json.dumps(resolve(resource, truth), sort_keys=True), json.dumps(resolve(condition, truth), sort_keys=True))
        for actions, resource, condition in entries
        for action in actions
    }


def every_scenario_role():
    """(scenario, truth, role) for each role in ROLES that exists in the scenario."""
    for scenario, truth in scenarios():
        for role in ROLES:
            if present(role, truth):
                yield scenario, truth, role


# ---------------------------------------------------------------------------
# Scripts
# ---------------------------------------------------------------------------

def userdata():
    text, _ = RESOURCES['MyEC2Instance']['Properties']['UserData']['Fn::Base64']['Fn::Sub']
    return text


def ssm_document():
    steps = RESOURCES['EC2AutoUpdateSSMDocument']['Properties']['Content']['mainSteps']
    return '\n'.join(command for step in steps for command in step['inputs']['runCommand'])


def buildspec(project):
    spec = yaml.safe_load(RESOURCES[project]['Properties']['Source']['BuildSpec'])
    return '\n'.join(
        command
        for phase in spec['phases'].values()
        for command in phase.get('commands', [])
        if isinstance(command, str)
    )


def instance_role():
    profile = RESOURCES['MyEC2Instance']['Properties']['IamInstanceProfile']['Ref']
    (role,) = RESOURCES[profile]['Properties']['Roles']
    return role['Ref']


def service_role(project):
    role = RESOURCES[project]['Properties']['ServiceRole']
    assert role['Fn::GetAtt'][1] == 'Arn', role
    return role['Fn::GetAtt'][0]


def sources():
    """(label, resource that holds the script, script text, role the script runs as), for ROLES."""
    yield 'UserData', 'MyEC2Instance', userdata(), instance_role()
    # The association targets this stack's instance, so the document runs as its role.
    yield 'SSM document', 'EC2AutoUpdateSSMDocument', ssm_document(), instance_role()
    for name, body in RESOURCES.items():
        if body['Type'] == 'AWS::CodeBuild::Project' and service_role(name) in ROLES:
            yield f'{name} buildspec', name, buildspec(name), service_role(name)


AWS_WORD = re.compile(r'(?<![^\s(|;&`])aws(?=\s)')
AWS_CALL = re.compile(r'aws\s+([^\s|;&)]+)\s+([^\s|;&)]+)')
TARGET = re.compile(r'--(?:name|function-name|stack-name|aws-service-name|key)\s+("?)([^\s"]+)\1')
REGCTL_COPY = re.compile(r'regctl\s+image\s+copy\s+(\S+)\s+(\S+)')


def script_lines(text):
    for line in text.split('\n'):
        stripped = line.strip()
        if stripped and not stripped.startswith('#'):
            yield stripped


def calls(text):
    """(call, target, line) for each aws call and each regctl copy into a private registry."""
    found = []
    for line in script_lines(text):
        for word in AWS_WORD.finditer(line):
            m = AWS_CALL.match(line, word.start())
            assert m and not m.group(1).startswith('-') and not m.group(2).startswith('-'), f'cannot parse: {line}'
            rest = line[m.end():].split('|', 1)[0]
            target = TARGET.search(rest)
            found.append((f'{m.group(1)} {m.group(2)}', target.group(2).rstrip(')') if target else None, line))
        for m in REGCTL_COPY.finditer(line):
            destination = re.sub(r':[^/:]+$', '', m.group(2))
            if '.dkr.ecr.' in destination:
                found.append(('regctl image copy', destination, line))
    return found


def wanted_calls(role, scenario, truth):
    """The CALLS keys of the scripts that run as role in this scenario."""
    for _, holder, text, source_role in sources():
        if source_role != role or not present(holder, truth):
            continue
        for call, target, _ in calls(text):
            # The UserData copies the lambda image only when ComputeType is lambda; the
            # private repository exists only then.
            if holder == 'MyEC2Instance' and call == 'regctl image copy' and scenario['ComputeType'] != 'lambda':
                continue
            yield call, target


def covers_log_bucket(resource):
    """Whether a statement Resource can name S3Bucket or an object in it."""
    if any(True for _ in gating.mentions(resource, {'S3Bucket'})):
        return True
    if isinstance(resource, dict) and set(resource) == {'Fn::Sub'}:
        text = resource['Fn::Sub'][0] if isinstance(resource['Fn::Sub'], list) else resource['Fn::Sub']
        resource = re.sub(r'\$\{[^}]*\}', '\x00', text.replace('${AWS::Partition}', 'aws'))
    if not isinstance(resource, str):
        return False
    return any(fnmatch.fnmatchcase(arn, resource) for arn in (
        'arn:aws:s3:::ssmlogbucket-i-0123456789abcdef0', 'arn:aws:s3:::ssmlogbucket-i-0123456789abcdef0/ssmoutput/x'))


def is_s3_write(action):
    return action == '*' or (action.startswith('s3:') and not action[3:].startswith(('Get', 'List', 'Head')))


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_no_broad_managed_policy():
    for scenario, truth, role in every_scenario_role():
        props = resolve(RESOURCES[role]['Properties'], truth)
        for arn in props.get('ManagedPolicyArns', []):
            assert not managed_name(arn).endswith(BROAD_MANAGED), (role, arn)


def test_no_wildcard_action():
    for scenario, truth, role in every_scenario_role():
        for st in statements(role, truth, managed=False):
            for action in as_list(st['Action']):
                assert '*' not in action, (role, action, scenario)


def test_star_resource_only_for_allowed_actions():
    for scenario, truth, role in every_scenario_role():
        for st in statements(role, truth, managed=False):
            if '*' in as_list(st['Resource']):
                assert set(as_list(st['Action'])) <= STAR_OK, (role, st)


def test_every_cli_call_is_granted():
    seen = set()
    for label, holder, text, role in sources():
        found = calls(text)
        assert found, label
        for call, target, line in found:
            assert (call, target) in CALLS, f'{label}: unmapped call {call!r} on {target!r}: {line}'
            seen.add((call, target))
    for scenario, truth in scenarios():
        for role in ROLES:
            if not present(role, truth):
                continue
            grants = statements(role, truth)
            for key in wanted_calls(role, scenario, truth):
                for actions, resource, condition in CALLS[key]:
                    for action in actions:
                        assert granted(grants, action, resource, condition), (
                            f'{role} lacks {action} on {resource} for {key[0]} ({scenario})')
    # Every line of CALLS is still used by some script.
    assert seen == set(CALLS), set(CALLS) - seen


def test_ec2_role_copies_into_the_lambda_repository_only_on_lambda():
    for scenario, truth in scenarios():
        actions = {a for st in statements('EC2Role', truth, managed=False) for a in as_list(st['Action'])}
        if scenario['ComputeType'] == 'lambda':
            assert set(ECR_PUSH) <= actions
        else:
            assert not set(ECR_PUSH) & actions, scenario


def test_no_grant_beyond_the_calls():
    # Every (action, resource, Condition) a role in ROLES grants itself is one that a call
    # of its scripts in this scenario, or NOT_A_CALL, names.
    for scenario, truth, role in every_scenario_role():
        allowed = triples(NOT_A_CALL[role], truth)
        for key in wanted_calls(role, scenario, truth):
            allowed |= triples(CALLS[key], truth)
        for st in own_statements(role, truth):
            assert st.get('Effect') == 'Allow' and set(st) <= {'Sid', 'Effect', 'Action', 'Resource', 'Condition'}, (role, st)
            for action in as_list(st['Action']):
                for resource in as_list(st['Resource']):
                    grant = (action, json.dumps(resource, sort_keys=True), json.dumps(st.get('Condition'), sort_keys=True))
                    assert grant in allowed, (role, grant, scenario)


def test_cleanup_function_terminates_only_this_stacks_instances():
    role = RESOURCES['DeleteEC2LambdaExecutionRole']['Properties']
    assert [managed_name(arn) for arn in role['ManagedPolicyArns']] == ['AWSLambdaBasicExecutionRole']
    found = [st for p in role.get('Policies', []) for st in as_list(p['PolicyDocument']['Statement'])]
    assert found == [{
        'Effect': 'Allow',
        'Action': 'ec2:TerminateInstances',
        'Resource': sub('arn:${AWS::Partition}:ec2:${AWS::Region}:${AWS::AccountId}:instance/*'),
        'Condition': {'StringEquals': {'aws:ResourceTag/aws:cloudformation:stack-name': {'Ref': 'AWS::StackName'}}},
    }]
    fn = RESOURCES['DeleteEC2Lambda']['Properties']
    assert fn['Role'] == get_att('DeleteEC2LambdaExecutionRole')
    code = fn['Code']['ZipFile']
    code = code['Fn::Sub'] if isinstance(code, dict) else code
    assert re.findall(r'instance\.(\w+)\(', code) == ['terminate']
    # The instance carries the stack-name tag CloudFormation adds, which the nightly
    # association also selects on.
    targets = RESOURCES['EC2AutoUpdateAssociation']['Properties']['Targets']
    assert targets == [{'Key': 'tag:aws:cloudformation:stack-name', 'Values': [sub('${AWS::StackName}')]}]


def test_no_role_writes_to_the_ssm_log_bucket():
    # S3Bucket has DeletionPolicy Delete and nothing empties it, so it must stay empty:
    # delete-stack cannot remove a bucket that holds objects. No principal may write to it.
    assert not [n for n, b in RESOURCES.items()
                if b['Type'] == 'AWS::S3::BucketPolicy' and any(True for _ in gating.mentions(b, {'S3Bucket'}))]
    checked = 0
    for scenario, truth in scenarios():
        if not present('S3Bucket', truth):
            continue
        checked += 1
        for name, body in RESOURCES.items():
            if body['Type'] != 'AWS::IAM::Role' or not present(name, truth):
                continue
            props = resolve(body['Properties'], truth)
            for arn in props.get('ManagedPolicyArns', []):
                assert managed_name(arn) in MANAGED_WITHOUT_S3_WRITE, (name, arn, scenario)
            for st in statements(name, truth, managed=False):
                assert 'NotAction' not in st and 'NotResource' not in st, (name, st)
                writes = [a for a in as_list(st['Action']) if is_s3_write(a)]
                if writes and st.get('Effect') == 'Allow':
                    assert not [r for r in as_list(st['Resource']) if covers_log_bucket(r)], (name, st, scenario)
    assert checked


def test_build_logs_go_to_the_projects_log_group():
    for project in ('CodeBuildProject', 'WebFnPackageBuild'):
        name = RESOURCES[project]['Properties']['Name']
        name = name['Fn::Sub'] if isinstance(name, dict) else name
        group = 'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/codebuild/' + name
        role = service_role(project)
        found = [st for p in RESOURCES[role]['Properties']['Policies'] for st in as_list(p['PolicyDocument']['Statement'])]
        logs = [st for st in found if any(a.startswith('logs:') for a in as_list(st['Action']))]
        assert logs == [{
            'Effect': 'Allow',
            'Action': ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
            'Resource': [sub(group), sub(group + ':*')],
        }], project


def test_codebuild_vpc_access_follows_the_guide():
    # "Allow CodeBuild access to AWS services required to create a VPC network interface",
    # CodeBuild User Guide, identity-based policy examples.
    found = [st for p in RESOURCES['CodeBuildRole']['Properties']['Policies'] for st in as_list(p['PolicyDocument']['Statement'])]
    assert {
        'Effect': 'Allow',
        'Action': ['ec2:CreateNetworkInterface', 'ec2:DescribeDhcpOptions', 'ec2:DescribeNetworkInterfaces',
                   'ec2:DeleteNetworkInterface', 'ec2:DescribeSubnets', 'ec2:DescribeSecurityGroups',
                   'ec2:DescribeVpcs'],
        'Resource': '*',
    } in found
    subnets = RESOURCES['CodeBuildProject']['Properties']['VpcConfig']['Subnets']
    assert len(subnets) == 2
    subnet_arn = 'arn:${AWS::Partition}:ec2:${AWS::Region}:${AWS::AccountId}:subnet/${SubnetId}'
    assert {
        'Effect': 'Allow',
        'Action': 'ec2:CreateNetworkInterfacePermission',
        'Resource': sub('arn:${AWS::Partition}:ec2:${AWS::Region}:${AWS::AccountId}:network-interface/*'),
        'Condition': {
            'StringEquals': {'ec2:AuthorizedService': 'codebuild.amazonaws.com'},
            'ArnEquals': {'ec2:Subnet': [{'Fn::Sub': [subnet_arn, {'SubnetId': s}]} for s in subnets]},
        },
    } in found


def test_call_parser_reads_the_scripts():
    # Guards the parser: the calls each script is known to make are found, and nothing
    # that is not an aws CLI call (cfn-signal, header names, image names) is taken for one.
    assert ('lambda invoke', '${DeleteEC2Lambda}') in {(c, t) for c, t, _ in calls(userdata())}
    assert ('ecr-public get-login-password', None) in {(c, t) for c, t, _ in calls(ssm_document())}
    assert {c for c, _, _ in calls('/opt/aws/bin/cfn-signal -s true x\nyum install -y aws-cfn-bootstrap\n'
                                   'curl -H "X-aws-ec2-metadata-token: $T" x\n# aws s3 rm x')} == set()
    line = 'X=$(aws ssm get-parameter --name "/a/b" --output text)'
    assert calls(line) == [('ssm get-parameter', '/a/b', line)]
