#!/bin/bash
# run test-cfn.sh true first, this will create more non-default vpc to used by false option

if [[ $# -ne 1 ]]; then
    echo "Usage: $0 true : create new vpc"
    echo "Usage: $0 false: using existing vpc (run after \"$0 true\")"
    exit 99
fi
NEWVPC=$1

if [[ ${NEWVPC} == "false" ]]; then
    # using existing not default vpc
    EXISTING_VPC_STRING=$(for i in us-east-1 us-west-2 ; do
        aws ec2 describe-vpcs --filter Name=is-default,Values=false --query 'Vpcs[0].VpcId' --output text --region $i |sort |head -n 1
    done |xargs )
    echo $EXISTING_VPC_STRING

    if [[ -z ${EXISTING_VPC_STRING} ]]; then
        echo "no existing vpc"
        exit 99
    fi
fi

UNIQ=$(TZ=EAT-8 date +%Y%m%d-%H%M%S)

# test in 2 regions
for i in us-east-1 us-west-2 ; do
    if [[ ${NEWVPC} == "false" ]]; then
        if [[ $i == "us-east-1" ]]; then
            DEFAULT_VPC=${EXISTING_VPC_STRING%% *}
        else
            DEFAULT_VPC=${EXISTING_VPC_STRING##* }
        fi
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
    for j in true false ; do
        if [[ ${NEWVPC} == "true" ]]; then
            STACK_NAME=ec2-vpc-${NEWVPC}-db-${j}-${UNIQ}
            aws cloudformation create-stack --stack-name ${STACK_NAME} \
                --parameters ParameterKey=VpcId,ParameterValue=${DEFAULT_VPC} \
                             ParameterKey=PublicSubnetId,ParameterValue=${PUB_SUBNET_ID} \
                             ParameterKey=PrivateSubnet1Id,ParameterValue=${PRI_SUBNET1_ID} \
                             ParameterKey=PrivateSubnet2Id,ParameterValue=${PRI_SUBNET2_ID} \
                             ParameterKey=NewVpc,ParameterValue=${NEWVPC} \
                             ParameterKey=ComputeType,ParameterValue=ec2 \
                             ParameterKey=KeepEc2,ParameterValue=true \
                             ParameterKey=EnableCloudfront,ParameterValue=true \
                             ParameterKey=StandaloneDB,ParameterValue=${j} \
                --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND \
                --disable-rollback \
                --template-body file://../quick-build-brconnector.yaml \
                --region $i 
            echo $i ${STACK_NAME} |tee -a cfn-name-${UNIQ}.txt
        else
            for AU in true false ; do
                for EC2 in t4g.medium t3.medium ; do
                    # same with previous command, except parameter AutoUpdateBRConnector and EC2InstanceType
                    STACK_NAME=ec2-${EC2%%.*}-vpc-${NEWVPC}-db-${j}-${UNIQ}-AU-${AU}
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
                                     ParameterKey=StandaloneDB,ParameterValue=${j} \
                                     ParameterKey=AutoUpdateBRConnector,ParameterValue=${AU} \
                        --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND \
                        --disable-rollback \
                        --template-body file://../quick-build-brconnector.yaml \
                        --region $i 
                    echo $i ${STACK_NAME} |tee -a cfn-name-${UNIQ}.txt
                done
            done
        fi
    done
    
    # test for LambdaArch set to x86_64/arm64 in Lambda ComputeType
    for j in amd64 arm64 ; do
        if [[ ${NEWVPC} == "true" ]]; then
            STACK_NAME=lambda-vpc-${NEWVPC}-${j}-${UNIQ}
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
                --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND \
                --disable-rollback \
                --template-body file://../quick-build-brconnector.yaml \
                --region $i 
            echo $i ${STACK_NAME} |tee -a cfn-name-${UNIQ}.txt
        else
            for AU in true false ; do
                STACK_NAME=lambda-vpc-${NEWVPC}-${j}-${UNIQ}-AU-${AU}
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
                                 ParameterKey=AutoUpdateBRConnector,ParameterValue=${AU} \
                    --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND \
                    --disable-rollback \
                    --template-body file://../quick-build-brconnector.yaml \
                    --region $i 
                echo $i ${STACK_NAME} |tee -a cfn-name-${UNIQ}.txt
            done
        fi
    done
done


