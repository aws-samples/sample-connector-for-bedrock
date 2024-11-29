# 开发指南

本项目是示例代码，强烈建议您参考本项目自行开发。

## 本地开发模式

Clone 本项目。

安装依赖：

```shell
npm install
# or
yarn
```

### 环境变量配置

.env 文件

> 这个文件放在项目根目录.

 ```env
 PGSQL_HOST=127.0.0.1
 PGSQL_DATABASE=brconnector_db
 PGSQL_USER=postgres
 PGSQL_PASSWORD=mysecretpassword
 PGSQL_DEBUG_MODE=ok
 ADMIN_API_KEY=br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 DEBUG_MODE=true
 ```

 支持如下环境变量：

| Key      | Required     | Default value | Description |
| ------------- | ------------- | ------------- | ------------- |
| ADMIN_API_KEY | yes  | | You need to set this value to generate the first API key. |
| PGSQL_HOST | no | | The address of the PostgreSQL. If the database is not configured, then the connector is just a pure proxy.|
| PGSQL_PORT | no | 5432 | The port of the PostgreSQL. |
| PGSQL_DATABASE | no | | The name of the PostgreSQL database. |
| PGSQL_USER | no | | The login user for the PostgreSQL. |
| PGSQL_PASSWORD | no | | The password user for the PostgreSQL. |
| PGSQL_MAX |  no | 80 | The maximum connection pool size for PostgreSQL.|
| PGSQL_DEBUG_MODE | no | false | If you set this parameter, it will print out the SQL statements and parameters in the console. |
| AWS_ACCESS_KEY_ID | no  | | If your application has been authorized through an IAM policy, you don't need to set this variable. |
| AWS_SECRET_ACCESS_KEY | no | | If your application has been authorized through an IAM policy, you don't need to set this variable. |
| AWS_DEFAULT_REGION | no | 'us-east-1' | |
| DEBUG_MODE | no |  false | If you set this parameter, it will print out a lot of debugging information in the console. |
| DISABLE_UI | no | false | Setting this value will not publish the front-end UI.|
| SMTP_HOST | no |  | SMTP server host address. Setting up an SMTP Server allows you to send your API key directly to the user's email inbox. |
| SMTP_PORT | no | 465 | SMTP server port number |
| SMTP_USER | no |  | SMTP server username |
| SMTP_PASS | no |  |  SMTP server password |
| SMPT_FROM | no |  | SMTP sender email address, your SMTP server maybe verify this |
| PERFORMANCE_MODE | no |  | 如果您设置了这个环境变量，那么将不再保存聊天记录和更新消费了。意味着控费功能将失效。 |

### 启动后台

 ```shell
 npm run dev
 # or
 yarn dev
 ```

 If you have configured postgres, the tables will be created automatically.

### 启动管理界面

 ```shell
 npm run dev-ui
 # or
 yarn dev-ui
 ```

## 构建

### 一起构建

```shell
npm run build
# or
yarn build
```

The above command will compile the frontend and backend applications into the dist/public and dist/server directories, respectively.

After a successful compilation, navigate to the dist directory and execute `node server/index.js`.

If you have not disabled the WebUI, <http://localhost:8866/manager> will be bound to the WebUI.

### 构建后端 (可选)

```shell
npm run build-server
# or
yarn build-server
```

### 构建前端 (可选)

```shell
npm run build-ui
# or
yarn build-ui
```

### Docker 镜像

编译完成之后，你可以使用  Dockerfile 来构建你的镜像。

The content of the Dockerfile:

```dockerfile
FROM node:20

RUN apt update && apt install -y awscli

COPY ./dist /app
WORKDIR /app
COPY ./src/scripts/* ./src/scripts/
COPY ./package.json .

RUN npm install --omit=dev

HEALTHCHECK --interval=5s --timeout=3s \
  CMD curl -fs http://localhost:8866/ || exit 1

EXPOSE 8866

CMD ["node", "server/index.js"]

```

!!! note
    上面的 Dockefile 没有包含在项目中。

然后执行打包命令：

```shell
docker build -t <registry-repo-tag> .
```
