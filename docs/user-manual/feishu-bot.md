# Feishu (Lark) Bot Configuration

> ⚠️Currently version only supports Feishu, does not support Lark

1. Enterprise administrator logs into the [Feishu Open Platform](https://open.feishu.cn/app/)
2. Create a custom application for the enterprise
![feishu-3.png](screenshots/feishu-3.jpg)
3. Fill in the name and description
![feishu-4.png](screenshots/feishu-4.jpg)
4. Add the `Bot` capability
![feishu-5.png](screenshots/feishu-5.jpg)
5. On the bot configuration page, click on `Events and Callbacks`
![feishu-6.png](screenshots/feishu-6.jpg)
6. Edit the `Subscription Method` and modify the request URL. The request URL is related to the server-side webhook name. For specific address details, refer to [Webhook Configuration](management.md#webhook-configuration)
![feishu-7.png](screenshots/feishu-7.jpg)
7. Then switch to the corresponding enterprise in Feishu and search for the application (the application name from step 3)
![feishu-8.png](screenshots/feishu-8.jpg)
8. Now we can test by sending questions and let the large language model answer them
![feishu-9.png](screenshots/feishu-9.jpg)
