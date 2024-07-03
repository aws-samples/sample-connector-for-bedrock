#!/bin/bash
# 1. you need run cfn template once at least, to ensure bedrock endpoint exists
# and then run this test script
# 2. ensure you use correct branch for testing (check ec2 user data in cfn template)

UNIQ=$(TZ=EAT-8 date +%Y%m%d-%H%M%S)

# test in 2 regions
for i in us-east-1 us-west-2 ; do
    DEFAULT_VPC=$(aws ec2 describe-vpcs --filter Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text --region $i )
    FIRST_AZ=$(aws ec2 describe-availability-zones --query 'AvailabilityZones[].ZoneName' --output text --region $i |awk '{print $1}')
    SUBNET_ID=$(aws ec2 describe-subnets \
        --filters "Name=vpc-id,Values=${DEFAULT_VPC}" \
        --query 'Subnets[?(AvailabilityZone==`'"${FIRST_AZ}"'` && MapPublicIpOnLaunch==`true`)].SubnetId' \
        --output text \
        --region $i )

    # test for StandaloneDB set to true/false in EC2 ComputeType
    for j in true false ; do
        STACK_NAME=stack-ec2-${j}-${UNIQ}
        aws cloudformation create-stack --stack-name ${STACK_NAME} \
            --parameters ParameterKey=VpcId,ParameterValue=${DEFAULT_VPC} \
                         ParameterKey=SubnetId,ParameterValue=${SUBNET_ID} \
                         ParameterKey=ComputeType,ParameterValue=ec2 \
                         ParameterKey=BREndpoint,ParameterValue=false \
                         ParameterKey=KeepEc2,ParameterValue=true \
                         ParameterKey=StandaloneDB,ParameterValue=${j} \
            --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND \
            --disable-rollback \
            --template-body file://../quick-build-brconnector.yaml \
            --region $i 
        echo $i ${STACK_NAME} |tee -a cfn-name-${UNIQ}.txt
    done
    
    # test for in Lambda ComputeType
    STACK_NAME=stack-lambda-${UNIQ}
    aws cloudformation create-stack --stack-name ${STACK_NAME} \
        --parameters ParameterKey=VpcId,ParameterValue=${DEFAULT_VPC} \
                     ParameterKey=SubnetId,ParameterValue=${SUBNET_ID} \
                     ParameterKey=ComputeType,ParameterValue=lambda \
                     ParameterKey=BREndpoint,ParameterValue=false \
                     ParameterKey=KeepEc2,ParameterValue=true \
        --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND \
        --disable-rollback \
        --template-body file://../quick-build-brconnector.yaml \
        --region $i 
    echo $i ${STACK_NAME} |tee -a cfn-name-${UNIQ}.txt
done

# wait all stack complete 
cat cfn-name-${UNIQ}.txt |while read i j ; do
    echo $i $j
    aws cloudformation wait stack-create-complete --region ${i} --stack-name ${j}
done

# get cloudfront url and api key
cat cfn-name-${UNIQ}.txt |while read i j ; do
    aws cloudformation describe-stacks --region ${i} --stack-name ${j} \
        --query 'Stacks[].Outputs[?(OutputKey==`CloudFrontURL` || OutputKey==`MySSMParameterFirstUserKey`)].OutputValue' --output text |tee -a api-${UNIQ}.txt
done

# test keys are valid
cat api-${UNIQ}.txt |while read i j ; do
    curl -sL ${i}
    echo
done

