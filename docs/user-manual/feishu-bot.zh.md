# 飞书机器人

> Since Docker image version 0.0.13

!!! note

    当前版本仅支持飞书，不支持 Lark(飞书国际版)。

1. 企业管理员登录[飞书开放平台](https://open.feishu.cn/app/)

2. 创建企业自建应用
![feishu-3.png](screenshots/feishu-3.jpg)

3. 填写名字和描述
![feishu-4.png](screenshots/feishu-4.jpg)

4. 添加`机器人`能力
![feishu-5.png](screenshots/feishu-5.jpg)

5. 在机器人配置页面中，点击`事件与回调`
![feishu-6.png](screenshots/feishu-6.jpg)

6. 编辑`订阅方式`，修改请求地址。请求地址和服务端配置的 webhook 名字有关，形如：`https://<yourdomain>/bot/feishu/<webhook-name>/webhook/event`。具体地址参考[webhoook-配置]。(management.zh.md#webhoook-配置)
![feishu-7.png](screenshots/feishu-7.jpg)

7. 添加权限
![feishu-10.png](screenshots/feishu-10.png)

8. 然后在飞书中切换到对应企业，搜索应用（步骤 3 中的应用名）
![feishu-8.png](screenshots/feishu-8.jpg)

9. 然后我们就可以测试发送问题，让大预言模型来回答了
![feishu-9.png](screenshots/feishu-9.jpg)
