# Feishu Bot

> Since Docker image version 0.0.13

!!! note

    Currently version only supports Feishu, does not support Lark(Feishu international version).

1. Enterprise administrator logs into the [Feishu Open Platform](https://open.feishu.cn/app/)

2. Create a custom application for the enterprise
![feishu-3.png](attachments/feishu-bot.zh/IMG-feishu-bot.zh.jpg)

3. Fill in the name and description
![feishu-4.png](attachments/feishu-bot.zh/IMG-feishu-bot.zh-1.jpg)

4. Add the `Bot` capability
![feishu-5.png](attachments/feishu-bot.zh/IMG-feishu-bot.zh-2.jpg)

5. On the bot configuration page, click on `Events and Callbacks`
![feishu-6.png](attachments/feishu-bot/IMG-feishu-bot.jpg)

6. Edit the `Subscription Method` and modify the request URL. The request URL is related to the server-side webhook name, such as `https://<yourdomain>/bot/feishu/<webhook-name>/webhook/event`. For specific address details, refer to [Webhook Configuration](management.md#webhook-configuration)
![feishu-7.png](attachments/feishu-bot.zh/IMG-feishu-bot.zh-4.jpg)

7. Add permissions
![IMG-feishu-bot.png](attachments/feishu-bot/IMG-feishu-bot.png)

8. Then switch to the corresponding enterprise in Feishu and search for the application (the application name from step 3)
![feishu-8.png](attachments/feishu-bot.zh/IMG-feishu-bot.zh-5.jpg)

9. Now we can test by sending questions and let the large language model answer them
![feishu-9.png](attachments/feishu-bot.zh/IMG-feishu-bot.zh-6.jpg)
