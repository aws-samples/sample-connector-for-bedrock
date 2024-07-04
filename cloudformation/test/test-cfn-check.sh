#!/bin/bash
if [[ $# -ne 1 ]]; then
    echo "Usage: $0 cfn-name-xxx.txt"
    exit 99
fi

filename=$1

# wait all stack complete 
while true ; do
    cat $filename |while read i j ; do
        # echo $i $j
        # aws cloudformation wait stack-create-complete --region ${i} --stack-name ${j}
        aws cloudformation describe-stacks --stack-name $j --region $i --query Stacks[].StackStatus --output text
    done |grep --line-buffered -v CREATE_COMPLETE |tee /tmp/$$.log
    line=$(wc -l /tmp/$$.log |awk '{print $1}')
    if [[ $line -eq 0 ]]; then
        break
    fi
    sleep 60
done

# get cloudfront url and api key
cp /dev/null api-check.txt
cat $filename |while read i j ; do
    aws cloudformation describe-stacks --region ${i} --stack-name ${j} \
        --query 'Stacks[].Outputs[?(OutputKey==`CloudFrontEc2URL` || OutputKey==`CloudFrontLambdaURL` || OutputKey==`MySSMParameterFirstUserKey`)].OutputValue' --output text |tee -a api-check.txt
done

# test keys are valid
cat api-check.txt |while read i j ; do
    echo ======================================================================
    echo $i $j
    echo ======================================================================
    curl -sL ${j}/v1/chat/completions \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${i}" \
      -d '{
      "model": "claude-3-sonnet",
      "messages": [
        {
          "role": "user",
          "content": "ping"
        }
      ],
      "stream": true,
      "temperature": 1,
      "max_tokens": 4000
    }'
    echo
done

