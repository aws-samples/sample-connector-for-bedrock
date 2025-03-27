# BRConnector ECS Fargate 部署方案

此目录包含使用AWS ECS Fargate、CloudFront和RDS部署BRConnector的CloudFormation模板和相关文档。这种部署方案与原始的EC2/Lambda方法相比，提供了更好的可伸缩性、更少的管理开销和更高的成本效益。

## 文件结构

- [`brconnector-ecs-fargate.yaml`](brconnector-ecs-fargate.yaml) - 主要CloudFormation模板
- [`ecs-fargate-deployment.md`](ecs-fargate-deployment.md) - 详细部署指南
- [`architecture-diagram.md`](architecture-diagram.md) - 架构图和组件说明
- [`scaling-policy.json`](scaling-policy.json) - 用于ECS服务自动扩缩的策略配置

## 快速开始

### 使用AWS控制台部署

1. 登录AWS管理控制台
2. 导航至CloudFormation服务
3. 点击"创建堆栈" > "使用新资源"
4. 上传`brconnector-ecs-fargate.yaml`模板
5. 按照提示配置参数并完成部署

### 使用AWS CLI部署

```bash
aws cloudformation deploy \
  --template-file brconnector-ecs-fargate.yaml \
  --stack-name brconnector-fargate \
  --parameter-overrides \
    NewVpc=true \
    DatabaseMode=Standalone \
    BRConnectorVersion=latest \
  --capabilities CAPABILITY_IAM
```

## 与原始部署方案的比较

| 特性 | ECS Fargate | EC2 | Lambda |
| --- | --- | --- | --- |
| 服务器管理 | 无需管理服务器 | 需要管理EC2实例 | 无需管理服务器 |
| 伸缩性 | 自动伸缩，按需扩容 | 手动伸缩 | 自动伸缩，有并发限制 |
| 成本模型 | 按实际使用计费 | 按实例时间计费 | 按调用次数和持续时间计费 |
| 冷启动 | 较慢（1-2分钟） | 无 | 有（毫秒级到秒级） |
| 最长运行时间 | 无限制 | 无限制 | 15分钟限制 |
| 适用场景 | 中等到高流量，可预测的负载 | 稳定负载，需要特定配置 | 不频繁访问，突发流量 |

## 架构亮点

- **高可用架构**：服务部署在多个可用区
- **自动扩缩**：根据CPU使用率自动调整容器数量
- **安全网络设计**：使用公有/私有子网和安全组隔离
- **CDN加速**：通过CloudFront提供全球分发和HTTPS支持
- **自动更新机制**：定期检查并部署新版本

## 后续步骤

1. 查看[部署指南](ecs-fargate-deployment.md)获取详细信息
2. 参考[架构图](architecture-diagram.md)了解整体架构设计
3. 根据需要自定义[扩缩策略](scaling-policy.json)

## 注意事项

- ECS Fargate比EC2提供更少的自定义选项，如果需要特定的系统配置，可能需要调整容器镜像
- 首次部署可能需要15-20分钟完成
- 确保AWS账户中有足够的ECS Fargate、RDS和CloudFront服务配额
