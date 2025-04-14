# BRConnector ECS Fargate 架构图

```mermaid
graph TD
    User[用户] -->|访问| CF[CloudFront 分发]
    CF -->|流量转发| ALB[应用负载均衡器]
    ALB -->|流量分发| ECS[ECS Fargate 集群]
    
    subgraph "VPC"
        subgraph "公有子网"
            ALB
        end
        
        subgraph "私有子网"
            ECS -->|存储数据| RDS[(RDS PostgreSQL)]
            ECS -->|调用API| Bedrock[Amazon Bedrock]
            ECS -->|读取/写入参数| SSM[SSM 参数存储]
        end
    end
    
    subgraph "其他AWS服务"
        ECS -->|写入日志| CW[CloudWatch Logs]
        Lambda[自动更新Lambda] -->|更新服务| ECS
        EventBridge[EventBridge规则] -->|触发| Lambda
    end
    
    classDef aws fill:#FF9900,stroke:#232F3E,stroke-width:2px,color:white;
    classDef service fill:#1A73E8,stroke:#0D47A1,stroke-width:2px,color:white;
    classDef network fill:#4CAF50,stroke:#388E3C,stroke-width:2px,color:white;
    
    class CF,ALB,ECS,RDS,Bedrock,SSM,CW,Lambda,EventBridge aws;
    class User service;
    class VPC network;
```

## 架构组件说明

1. **CloudFront**: 提供全球内容分发网络(CDN)服务，加速内容传输并提供HTTPS
2. **应用负载均衡器(ALB)**: 将流量分发到多个可用区的Fargate容器
3. **ECS Fargate**: 托管容器服务，运行BRConnector应用
4. **RDS PostgreSQL**: 托管关系型数据库，存储用户数据和会话
5. **Amazon Bedrock**: AI模型服务，提供基础模型API
6. **SSM参数存储**: 安全存储配置和API密钥
7. **CloudWatch Logs**: 集中化日志存储和监控
8. **Lambda & EventBridge**: 自动化更新组件

## 网络架构

- **公有子网**: 包含ALB，可从互联网访问
- **私有子网**: 包含ECS服务和RDS数据库，无法直接从互联网访问
- **安全组**: 
  - ALB安全组: 允许来自互联网的80/443端口流量
  - ECS安全组: 仅允许来自ALB的8866端口流量
  - RDS安全组: 仅允许来自ECS的5432端口流量
