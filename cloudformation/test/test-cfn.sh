#!/bin/bash
UNIQ=$(TZ=EAT-8 date +%Y%m%d-%H%M%S)

for i in us-east-1 us-west-2 ; do
    DEFAULT_VPC=$(aws ec2 describe-vpcs --filter Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text --region $i )
    FIRST_AZ=$(aws ec2 describe-availability-zones --query 'AvailabilityZones[].ZoneName' --output text --region $i |awk '{print $1}')
    SUBNET_ID=$(aws ec2 describe-subnets \
        --filters "Name=vpc-id,Values=${DEFAULT_VPC}" \
        --query 'Subnets[?(AvailabilityZone==`'"${FIRST_AZ}"'` && MapPublicIpOnLaunch==`true`)].SubnetId' \
        --output text \
        --region $i )

    for j in true false ; do
        aws cloudformation create-stack --stack-name stack-name-${j}-${UNIQ} \
            --parameters ParameterKey=VpcId,ParameterValue=${DEFAULT_VPC} \
                        ParameterKey=SubnetId,ParameterValue=${SUBNET_ID} \
                        ParameterKey=StandaloneDB,ParameterValue=${j} \
            --capabilities CAPABILITY_NAMED_IAM \
            --disable-rollback \
            --template-body file://../quick-build-brconnector.yaml \
            --region $i 
        echo $i stack-name-${j}-${UNIQ} |tee -a cfn-name-${UNIQ}.txt
    done
done

cat cfn-name-${UNIQ}.txt |while read i j ; do
    echo $i $j
    aws cloudformation wait stack-create-complete --region ${i} --stack-name ${j}
done

cat cfn-name-${UNIQ}.txt |while read i j ; do
    aws cloudformation describe-stacks --region ${i} --stack-name ${j} \
        --query 'Stacks[].Outputs[?(OutputKey==`CloudFrontURL` || OutputKey==`MySSMParameterFirstUserKey`)].OutputValue' --output text |tee -a api-${UNIQ}.txt
done

cat api-${UNIQ}.txt |while read i j ; do
    curl -sL ${i}
    echo
done

