import os
import re

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(HERE, "..", "another-version-brconnector-on-ecs", "brconnector-ecs-fargate.yaml")


class _Loader(yaml.SafeLoader):
    pass


def _tag(loader, suffix, node):
    if isinstance(node, yaml.ScalarNode):
        value = loader.construct_scalar(node)
    elif isinstance(node, yaml.SequenceNode):
        value = loader.construct_sequence(node, deep=True)
    else:
        value = loader.construct_mapping(node, deep=True)
    return {suffix: value}


_Loader.add_multi_constructor("!", _tag)

with open(PATH) as f:
    TEXT = f.read()
TEMPLATE = yaml.load(TEXT, Loader=_Loader)

PREFIX_LISTS = {
    "us-east-1": "pl-3b927c52", "us-east-2": "pl-b6a144df",
    "us-west-1": "pl-4ea04527", "us-west-2": "pl-82a045eb",
    "ca-central-1": "pl-38a64351", "sa-east-1": "pl-5da64334",
    "eu-west-1": "pl-4fa04526", "eu-west-2": "pl-93a247fa",
    "eu-west-3": "pl-75b1541c", "eu-central-1": "pl-a3a144ca",
    "eu-north-1": "pl-fab65393", "ap-northeast-1": "pl-58a04531",
    "ap-northeast-2": "pl-22a6434b", "ap-northeast-3": "pl-31a14458",
    "ap-southeast-1": "pl-31a34658", "ap-southeast-2": "pl-b8a742d1",
    "ap-south-1": "pl-9aa247f3",
}


def test_key_generator_is_cryptographic():
    code = TEMPLATE["Resources"]["RandomStringLambda"]["Properties"]["Code"]["ZipFile"]
    assert "secrets.choice" in code
    assert "string.ascii_letters + string.digits" in code
    assert "random.choices" not in code
    assert "import random" not in code
    assert int(TEMPLATE["Resources"]["RandomString"]["Properties"]["RandomLength"]) >= 32


def test_no_output_carries_the_admin_key():
    outputs = TEMPLATE["Outputs"]
    assert "AdminApiKey" not in outputs
    assert "LoadBalancerURL" not in outputs
    for out in outputs.values():
        assert "MySSMParameterAdminKey.Value" not in repr(out["Value"])
        assert "RandomString" not in repr(out["Value"])
    assert "AdminApiKeyParameter" in outputs
    assert "MySSMParameterAdminKey" in repr(outputs["AdminApiKeyParameter"]["Value"])


def test_alb_admits_only_cloudfront():
    props = TEMPLATE["Resources"]["ALBSecurityGroup"]["Properties"]
    rules = props["SecurityGroupIngress"]
    assert len(rules) == 1
    rule = rules[0]
    assert rule["FromPort"] == 80 and rule["ToPort"] == 80
    assert "SourcePrefixListId" in rule and "FindInMap" in rule["SourcePrefixListId"]
    assert "CidrIp" not in rule
    assert "0.0.0.0/0" not in repr(props)


def test_prefix_list_table():
    table = TEMPLATE["Mappings"]["AWSRegionsPrefixListID"]
    assert {k: v["PrefixListID"] for k, v in table.items()} == PREFIX_LISTS


def test_docs_say_how_to_read_the_key():
    d = os.path.join(HERE, "..", "another-version-brconnector-on-ecs")
    for name in ("README-ECS-Fargate.md", "ecs-fargate-deployment.md"):
        with open(os.path.join(d, name)) as f:
            text = f.read()
        assert "aws ssm get-parameter --name /brconnector/admin-key-" in text, name
        assert not re.search(r"\*\*AdminApiKey\*\*", text), name
