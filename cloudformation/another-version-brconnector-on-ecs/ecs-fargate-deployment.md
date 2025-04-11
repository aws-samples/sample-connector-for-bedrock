# BRConnector ECS Fargate 部署指南

这个文档描述了如何使用ECS Fargate、CloudFront和RDS来部署BRConnector。

## 架构概览

请参考 [架构图文档](architecture-diagram.md) 查看详细的架构图和组件说明。

该架构包含以下组件：

- **ECS Fargate**: 无需管理服务器的容器编排服务，用于运行BRConnector容器
- **Amazon RDS**: 托管的PostgreSQL数据库，用于存储BRConnector的数据
- **Application Load Balancer (ALB)**: 负责分发流量到Fargate容器
- **CloudFront**: CDN服务，提供全球内容分发和HTTPS支持
- **VPC**: 包含公有和私有子网的网络基础设施
- **IAM角色**: 提供必要的权限

## 与EC2/Lambda部署的区别

与原始的`quick-build-brconnector.yaml`模板相比，ECS Fargate版本有以下优势：

1. **无需管理服务器**: 不需要维护EC2实例
2. **自动扩容**: 可以根据流量自动扩展容器数量
3. **更好的资源利用**: 按照实际使用的资源付费
4. **高可用性**: 支持跨可用区部署
5. **简化运维**: AWS管理底层基础设施

## 部署步骤

### 前置条件

- AWS CLI 已安装并配置
- 具有创建相关AWS资源的权限

### 使用AWS控制台部署

1. 登录AWS管理控制台
2. 导航至CloudFormation服务
3. 点击"创建堆栈" > "使用新资源"
4. 选择"上传模板文件"并上传`brconnector-ecs-fargate.yaml`
5. 填写堆栈名称和参数：
   - **VPC设置**: 选择新建VPC或使用现有VPC
   - **Fargate设置**: 选择CPU和内存配置
   - **数据库设置**: 配置数据库参数
   - **其他设置**: 选择BRConnector版本等
6. 点击"下一步"，添加任何标签
7. 点击"下一步"，查看设置并创建堆栈
8. 等待堆栈创建完成（大约需要15-20分钟）

### 使用AWS CLI部署

```bash
aws cloudformation deploy \
  --template-file brconnector-ecs-fargate.yaml \
  --stack-name brconnector-ecs \
  --parameter-overrides \
    NewVpc=true \
    FargateCpu=1024 \
    FargateMemory=2048 \
    DatabaseMode=Standalone \
    PGDatabase=brconnector_db \
    PGUser=postgres \
    PGPassword=mysecretpassword \
    BRConnectorVersion=latest \
    AutoUpdateBRConnector=true \
    PerformanceMode=false \
  --capabilities CAPABILITY_IAM
```

## 访问BRConnector

部署完成后，CloudFormation输出中将包含以下URL：

1. **CloudFrontURL**: 通过CloudFront访问BRConnector
2. **CloudFrontManagerURL**: 管理界面URL
3. **CloudFrontBrclientURL**: 客户端WebUI URL
4. **AdminApiKey**: 用于管理员API访问的密钥

你需要访问 https://aws-samples.github.io/sample-connector-for-bedrock/home/quick-start/#5-creat-the-first-admin-user 创建第一个用户 key，然后开始使用 BRConnector

## 配置和管理

### 查看日志

您可以在CloudWatch Logs中查看容器日志：

```bash
aws logs get-log-events \
  --log-group-name /ecs/brconnector-<堆栈名称> \
  --log-stream-name <日志流名称>
```

### 更新服务

要更新服务配置：

```bash
aws ecs update-service \
  --cluster BRConnector-ECSCluster-<堆栈名称> \
  --service BRConnector-Service-<堆栈名称> \
  --desired-count <新的任务数量>
```

### 扩展配置

要配置自动扩展：

```bash
# 创建扩展目标
aws application-autoscaling put-scalable-target \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/BRConnector-ECSCluster-<堆栈名称>/BRConnector-Service-<堆栈名称> \
  --min-capacity 1 \
  --max-capacity 10

# 配置扩展策略
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/BRConnector-ECSCluster-<堆栈名称>/BRConnector-Service-<堆栈名称> \
  --policy-name cpu-tracking-scaling-policy \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration file://scaling-policy.json
```

其中`scaling-policy.json`内容为：

```json
{
  "TargetValue": 70.0,
  "PredefinedMetricSpecification": {
    "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
  },
  "ScaleOutCooldown": 60,
  "ScaleInCooldown": 60
}
```

## 故障排除

1. **容器无法启动**:
   - 检查ECS任务定义中的环境变量
   - 查看CloudWatch Logs中的错误信息

2. **数据库连接问题**:
   - 确认安全组规则允许从ECS任务到RDS的连接
   - 验证数据库凭据是否正确

3. **CloudFront无法访问**:
   - 检查ALB健康检查是否通过
   - 验证CloudFront分配的原始服务器设置
