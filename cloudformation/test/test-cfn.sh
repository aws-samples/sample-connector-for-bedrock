#!/bin/bash -x
# run test-cfn.sh true first, this will create more non-default vpc to used by false option

if [[ $# -ne 0 ]]; then
    echo "Usage: $0 "
    exit 99
fi

NEWVPC=false

# using existing not default vpc
for i in us-east-1 us-west-2 ; do
    EXISTING_VPC_STRING=$(aws ec2 describe-vpcs --filter Name=is-default,Values=false --query 'Vpcs[0].VpcId' --output text --region $i |grep -v None |sort |head -n 1)
    if [[ -z ${EXISTING_VPC_STRING} ]]; then
        # create vpc for testing
        STACK_NAME=vpc-$(TZ=EAT-8 date +%s)
        aws cloudformation create-stack --stack-name ${STACK_NAME} \
            --capabilities CAPABILITY_IAM --region ${i} \
            --template-body https://sample-connector-bedrock.s3.us-west-2.amazonaws.com/brconnector-vpc-cfn.yaml
        aws cloudformation wait stack-create-complete --stack-name ${STACK_NAME} --region ${i}

        while read line ; do
            eval "$line"
        done <<< $(aws cloudformation describe-stacks --stack-name ${STACK_NAME} --region ${i} \
            --query 'Stacks[0].Outputs[?OutputKey==`VpcId` || OutputKey==`PublicSubnetId` || OutputKey==`PrivateSubnet1Id` || OutputKey==`PrivateSubnet2Id`].[OutputKey,`=`,OutputValue]' \
            --output text |tr -d '\t')
        echo $VpcId $PublicSubnetId 
        echo $PrivateSubnet1Id $PrivateSubnet2Id

        EXISTING_VPC_STRING=$(aws ec2 describe-vpcs --filter Name=is-default,Values=false --query 'Vpcs[0].VpcId' --output text --region $i |grep -v None |sort |head -n 1)
        echo $EXISTING_VPC_STRING
    fi

    UNIQ=$(TZ=EAT-8 date +%s)

    if [[ ${NEWVPC} == "false" ]]; then
        DEFAULT_VPC=$EXISTING_VPC_STRING
        FIRST_AZ=$(aws ec2 describe-availability-zones --query 'AvailabilityZones[].ZoneName' --output text --region $i |awk '{print $1}')
        SECOND_AZ=$(aws ec2 describe-availability-zones --query 'AvailabilityZones[].ZoneName' --output text --region $i |awk '{print $2}')
        echo ${FIRST_AZ} ${SECOND_AZ}
    
        PUB_SUBNET_ID=$(aws ec2 describe-subnets \
            --filters "Name=vpc-id,Values=${DEFAULT_VPC}" \
            --query 'Subnets[?(AvailabilityZone==`'"${FIRST_AZ}"'` && MapPublicIpOnLaunch==`true`)].SubnetId' \
            --output text \
            --region $i )
        PRI_SUBNET1_ID=$(aws ec2 describe-subnets \
            --filters "Name=vpc-id,Values=${DEFAULT_VPC}" \
            --query 'Subnets[?(AvailabilityZone==`'"${FIRST_AZ}"'` && MapPublicIpOnLaunch==`false`)].SubnetId' \
            --output text \
            --region $i )
        PRI_SUBNET2_ID=$(aws ec2 describe-subnets \
            --filters "Name=vpc-id,Values=${DEFAULT_VPC}" \
            --query 'Subnets[?(AvailabilityZone==`'"${SECOND_AZ}"'` && MapPublicIpOnLaunch==`false`)].SubnetId' \
            --output text \
            --region $i )
        echo $PUB_SUBNET_ID $PRI_SUBNET1_ID $PRI_SUBNET2_ID
    fi

    # test for StandaloneDB set to true/false in EC2 ComputeType
    for j in Standalone EC2Integrated NoDB ; do
        for AU in true false ; do
            for EC2 in t4g.medium t3.medium ; do
                # same with previous command, except parameter AutoUpdateBRConnector and EC2InstanceType
                STACK_NAME=ec2-${EC2%%.*}-vpc-${NEWVPC::1}-db-${j}-${UNIQ}-AU-${AU}
                aws cloudformation create-stack --stack-name ${STACK_NAME} \
                    --parameters ParameterKey=VpcId,ParameterValue=${DEFAULT_VPC} \
                                    ParameterKey=PublicSubnetId,ParameterValue=${PUB_SUBNET_ID} \
                                    ParameterKey=PrivateSubnet1Id,ParameterValue=${PRI_SUBNET1_ID} \
                                    ParameterKey=PrivateSubnet2Id,ParameterValue=${PRI_SUBNET2_ID} \
                                    ParameterKey=NewVpc,ParameterValue=${NEWVPC} \
                                    ParameterKey=ComputeType,ParameterValue=ec2 \
                                    ParameterKey=EC2InstanceType,ParameterValue=${EC2} \
                                    ParameterKey=KeepEc2,ParameterValue=true \
                                    ParameterKey=EnableCloudfront,ParameterValue=true \
                                    ParameterKey=DatabaseMode,ParameterValue=${j} \
                                    ParameterKey=AutoUpdateBRConnector,ParameterValue=${AU} \
                    --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND \
                    --disable-rollback \
                    --template-body file://../quick-build-brconnector.yaml \
                    --region $i 
                echo $i ${STACK_NAME} |tee -a cfn-name-${UNIQ}.txt
            done
        done
    done
    
    # test for LambdaArch set to x86_64/arm64 in Lambda ComputeType
    for j in amd64 arm64 ; do
        for AU in true false ; do
            for DB in Standalone NoDB ; do 
                STACK_NAME=lam-vpc-${NEWVPC::1}-${j}-${UNIQ}-AU-${AU}-DB-${DB}
                # same with previous command, except parameter AutoUpdateBRConnector
                aws cloudformation create-stack --stack-name ${STACK_NAME} \
                    --parameters ParameterKey=VpcId,ParameterValue=${DEFAULT_VPC} \
                                    ParameterKey=PublicSubnetId,ParameterValue=${PUB_SUBNET_ID} \
                                    ParameterKey=PrivateSubnet1Id,ParameterValue=${PRI_SUBNET1_ID} \
                                    ParameterKey=PrivateSubnet2Id,ParameterValue=${PRI_SUBNET2_ID} \
                                    ParameterKey=NewVpc,ParameterValue=${NEWVPC} \
                                    ParameterKey=ComputeType,ParameterValue=lambda \
                                    ParameterKey=KeepEc2,ParameterValue=true \
                                    ParameterKey=EnableCloudfront,ParameterValue=true \
                                    ParameterKey=LambdaArch,ParameterValue=${j} \
                                    ParameterKey=DatabaseMode,ParameterValue=${DB} \
                                    ParameterKey=AutoUpdateBRConnector,ParameterValue=${AU} \
                    --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND \
                    --disable-rollback \
                    --template-body file://../quick-build-brconnector.yaml \
                    --region $i 
                echo $i ${STACK_NAME} |tee -a cfn-name-${UNIQ}.txt
            done
        done
    done
done


