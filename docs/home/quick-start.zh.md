# 快速启动

## 1. 准备服务器

在 AWS 上启动一个 EC2 实例或任何其他支持 Docker 的服务器。

## 2. 使用 Docker 运行 Postgres

使用以下shell命令启动一个Docker容器来托管Postgres:

```shell
docker run --name postgres \
  -e POSTGRES_PASSWORD=mysecretpassword \
  -p 5432:5432 \
  -d postgres
```

然后使用以下命令创建一个名为 `brconnector_db` 的数据库。

首先，连接到 prostgress 容器:

```shell
docker exec -it postgres psql -U postgres
```

然后，在 postgres 的 SQL 命令行中，运行以下命令来创建数据库:

```sql
CREATE DATABASE brconnector_db;
```

数据库名称不一定要是 `brconnector_db`，你可以使用任何有效的数据库名称。

如果你使用自己的数据库名称,请确保记住数据库名称,并将 `brconnector_db` 替换为你的数据库名称。

## 3. 使用 Docker 启动

直接运行以下 docker 命令来启动连接器容器。

确保将访问密钥、秘密密钥、区域的值替换为正确的值。

而且,重要的是!将 ADMIN_API_KEY 的值替换为一个复杂的密钥,而不是使用示例中的简单密钥。

```shell
docker run --name brconnector \
 --restart always --pull always \
 -p 8866:8866 \
 -e AWS_ACCESS_KEY_ID=xxxx \
 -e AWS_SECRET_ACCESS_KEY=xxxxx \
 -e AWS_DEFAULT_REGION=us-east-1 \
 -e PGSQL_HOST=172.17.0.1 \
 -e PGSQL_DATABASE=brconnector_db \
 -e PGSQL_USER=postgres \
 -e PGSQL_PASSWORD=mysecretpassword \
 -e ADMIN_API_KEY=br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
 -d cloudbeer/sample-connector-for-bedrock
```

## 4. 测试

现在,您有了第一个管理员用户,其API密钥为"br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"。

使用`curl`命令并带上API密钥来测试服务器:

```shell
curl "http://localhost:8866/admin/api-key/list" \
  -H "Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" 
```

您会得到如下的输出:

```json
{"success":true,"data":{"items":[],"total":"0","limit":20,"offset":0}}
```

## 5. 创建第一个管理员用户

上面配置的 API_KEY 仅用于启动服务器和创建第一个管理员用户。

该 API_KEY 并非设计用于作为管理员用户或普通用户使用。

使用以下命令创建第一个管理员用户:

```shell
curl -X POST "http://localhost:8866/admin/api-key/apply" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
     -d '{"name": "adminuser","group_id": 1,"role": "admin","email": "", "month_quota":"20"}'

```

输出大概如下:

```json

{"success":true,"data":{"id":1,"name":"adminuser","email":"","api_key":"br-someotherkeyvaluexxxxx","role":"admin","month_quota":"20.0000000000","balance":"0.0000000000"}}

```

记录新用户的新 api_key, 此 api_key 可用于配置您的客户端进行聊天。
此 api_key 也可用于登录 BRConnector的管理 WebUI 来管理其他 api_key。

## 6. 配置客户端

您应该使用 HTTPS 暴露连接器服务器。

在 AWS 上一种简单的方式是创建 CloudFront CDN 来提供 SSL 支持。

有关在 AWS 上设置 CloudFront 的更多信息,请参阅 AWS 的官方文档。

打开一个可以为 OpenAI 定义 Host 和 API 密钥的客户端。

在 "Host" 字段中输入 CloudFront 网址。

在"APK Key"字段中, 输入步骤 5 中创建的第一个管理员用户的 API Key。

然后,打开一个新的聊天窗口进行测试。

如果一切顺利,您就可以开始聊天了。

!!!note
    您可以使用这个 <https://github.com/aws-samples/sample-client-for-amazon-bedrock> 客户端来测试，[请查看如何配置](../user-manual/sample-client-for-bedrock.md)。

    Since 0.0.8, this client has been built into the docker image. The access address is: `http(s)://your-endpoint/brclient/`

## 7. 后台管理界面

如果您没有设置环境变量 DISABLE_UI,您现在可以通过 `http(s)://your-endpoint/manager/` 访问 BRConnector Web 管理界面。

您可以使用刚刚生成的API密钥登录并管理它。请将 `http(s)://your-endpoint` 作为主机地址输入。
