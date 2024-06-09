# quick deploy using cloudformation
## Prerequisites
- Enable Claude 3 Sonnet or Haiku in your region - If you are new to using Anthropic models, go to the [Amazon Bedrock console](https://console.aws.amazon.com/bedrock/) and choose **Model access** on the bottom left pane. Request access separately for Claude 3 Sonnet or Haiku.

## Deploy
- In Same region, download [quick-build-brclient.yaml](quick-build-brclient.yaml) and upload to cloudformation console. 
    - give a name to this cloudformation stack
    - default use amazon linux 2 AMI
    - default use t3.medium instance type
    - default postgresql password is `mysecretpassword`
    - choose a vpc with public subnets
    - choose one public subnet 
![IMG-quick-build-brclient-on-ec2-1](IMG-quick-build-brclient-on-ec2-1.png)

- Until deploy successfully, go to output page and copy cloudfront URL and first user key to your bedrock client settings page.
![IMG-quick-build-brclient-on-ec2-2](IMG-quick-build-brclient-on-ec2-2.png)

