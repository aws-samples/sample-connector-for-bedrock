# Sample Connector for Bedrock

This is a bedrock API forwarding tool sample that can issue virtual keys, log chats, and manage costs.

It is compatible with any OPENAI client that can define Host and API Key.

## Deploying

Although this project is in rapic iterating, we still provide a relative easy way to deploy.

Please follow these steps to deploy:

### 1. Prepare a server to host the connector

Launch an EC2 on AWS or any other server with docker support.

### 2. Run Postgres with docker

Launch a docker container to host postgres with the following shell command:

```shell
docker run --name postgres \
  -e POSTGRES_PASSWORD=mysecretpassword \
  -p 5432:5432 \
  -d postgres
```

Then create a database named `brconnector_db` with the following command.

At first, attach to the prostgress container:

```shell
docker exec -it postgres psql -U postgres
```

Then, in the SQL command line of postgres, run the following command to create the database:

```sql
CREATE DATABASE brconnector_db;
```

The database name is not necessary to be `brconnector_db`, you can use what ever valid database name you want.

If you use your own database name, make sure that you remember the database name and replace `brconnector_db` with your database name.

### 3. Start the connector server with docker

Run the following docker command directly to start the connector container.

Make sure to replace the value of access key, secret key, region to be right ones.

And, important! replace the value of ADMIN_API_KEY to be a complex key instead of using the simple one in the sample.

```shell
docker run --name brconnector \
 --restart always \
 -p 8866:8866 \
 -e AWS_ACCESS_KEY_ID=xxxx \
 -e AWS_SECRET_ACCESS_KEY=xxxxx \
 -e AWS_DEFAULT_REGION=us-east-1 \
 -e PGSQL_HOST=172.17.0.1 \
 -e PGSQL_DATABASE=brconnector_db \
 -e PGSQL_USER=postgres \
 -e PGSQL_PASSWORD=mysecretpassword \
 -e ADMIN_API_KEY=br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
 -d cloudbeer/sample-connector-for-bedrock:0.0.1
```

### 4. Test the connector server

Now, you have the first admin user with the API_KEY "br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx".

And the server export port 8866 to the hosting EC2.

Test the server with the API_Key using `curl` command:

```shell
curl "http://localhost:8866/admin/api-key/list"     -H "Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

```

You will get something like the following if every things go well:

```json
{"success":true,"data":{"items":[],"total":"0","limit":20,"offset":0}}
```

### 5. Creat the first admin user

The API_KEY configed above is only used for booting the server and create first admin user.

This API_KEY is not designed to be used as admin user or normal user.

Create the first admin user with the following command:

```shell
curl -X POST "http://localhost:8866/admin/api-key/apply" \
     -H "Content-Type: application/json" \
  -H "Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
     -d '{"name": "adminuser","group_id": 1,"role": "admin","email": "", "month_quota":"20"}'

```

You will get some response like the following:

```json

{"success":true,"data":{"id":1,"name":"adminuser","email":"","api_key":"br-someotherkeyvaluexxxxx","role":"admin","month_quota":"20.0000000000","balance":"0.0000000000"}}

```

Record the new api_key for the new user,
this api_key can be used to config your client to chat.
and this api_key can be used to login the connector's WebUI to manage other api_key.

### 6. Config client to connect to the connector server

You should expose the connector server with HTTPS.

One simple way to do it on AWS is creating a CloudFront CDN to provide SSL support.

For more information about setting up CloudFront on AWS, please refer to official document of AWS.

Open a client that can define Host and API Key for OpenAI.

In Host field enter the CloudFront url.

In the "APK Key" field, enter the API_Key of your first admin user, which is the one you created in step 5.

Then, open a new chat to test.

If every thing goes well, you can start to chat.

### 7. The connector's WebUI

If you have not set the environment variable DISABLE_UI, you can now access the BRConnector WebUI via <https://your-endpoint/webui>.

You can log in and manage it using the API key you just generated. Enter <https://your-endpoint> as the Host.

## Dev Mode

Install dependencies:

```shell
npm install
# or
yarn
```

### Environment

the .env file

 Place it in the root directory of the project.

 ```env
 PGSQL_HOST=127.0.0.1
 PGSQL_DATABASE=brconnector_db
 PGSQL_USER=postgres
 PGSQL_PASSWORD=mysecretpassword
 PGSQL_DEBUG_MODE=ok
 ADMIN_API_KEY=br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 DEBUG_MODE=true
 ```

The connector supports the following environment variables:

| Key      | Required     | Default value | Description |
| ------------- | ------------- | ------------- | ------------- |
| ADMIN_API_KEY | yes  | | You need to set this value to generate the first API key. |
| PGSQL_HOST | no | | The address of the PostgreSQL. |
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

### Run backend

 ```shell
 npm run dev
 # or
 yarn dev
 ```

 If you have configured postgres, the tables will be created automatically.

### Run fontend

 ```shell
 npm run dev-ui
 # or
 yarn dev-ui
 ```

## Build

### Build the backend and frontend together

```shell
npm run build
# or
yarn build
```

The above command will compile the frontend and backend applications into the dist/public and dist/server directories, respectively.

After a successful compilation, navigate to the dist directory and execute `node server/index.js`.

If you have not disabled the WebUI, <http://localhost:8866/webui> will be bound to the WebUI.

### Build back-end (Option)

```shell
npm run build-server
# or
yarn build-server
```

### Build front-end (Option)

```shell
npm run build-ui
# or
yarn build-ui
```

### Build docker image

The content of the Dockerfile:

```dockerfile
FROM node:20

COPY ./dist /app
WORKDIR /app
COPY ./src/scripts/create.sql ./src/scripts/create.sql
COPY ./package.json .

RUN npm install --omit=dev

HEALTHCHECK --interval=5s --timeout=3s \
  CMD curl -fs http://localhost:8866/ || exit 1

EXPOSE 8866

CMD ["node", "server/index.js"]

```

> Please note: The above code is not included in this project. Please save the above content in the project's root directory `./Dockerfile`.

Then execute the following command:

```shell
docker build -t <same-tag> .
```

## API Specification

### Chat API

```text
POST /v1/chat/completions
Content-Type: application/json
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{
  "model": "claude-3-sonnet",
  "messages": [
    {
      "role": "user",
      "content": "ping"
    }
  ],
  "stream": true,
  "temperature": 1,
  "max_tokens": 4096
}
```

### Admin API

Create an api key

```text
POST /admin/api-key/apply
Content-Type: application/json
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{
  "name": "jack",
  "group_id": 1,
  "role": "user",
  "email": "",
  "month_quota": 1.00
}
```

Create an api key with admin role

```text
POST /admin/api-key/apply
Content-Type: application/json
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{
  "name": "rob",
  "group_id": 1,
  "role": "admin",
  "email": ""
}
```

Update api key's info

```text
POST /admin/api-key/update
Content-Type: application/json
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{
  "id": 2,
  "name": "张三",
  "month_quota": 10.00
}
```

recharge up an  API key

```text
POST /admin/api-key/recharge
Content-Type: application/json
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

{
  "api_key": "br-xxxxxxxxxxxxxxx",
  "balance": 0.23
}
```

recharge history

```
GET /admin/payment/list?key_id=
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

```

List api keys

```text
GET /admin/api-key/list?q=&limit=10&offset=
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

List sessions

```text
GET /admin/session/list?q=&limit=10&offset=&key_id=
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

List threads / histories

```text
GET /admin/thread/list?q=&limit=10&offset=&key_id=&session_id=
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### User API

My sessions

```text
GET /user/session/list?q=&limit=10&offset=
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

My session detail

```text
GET /user/session/detail/1
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

My threads / histories

```text
GET /user/thread/list?q=&limit=10&offset=&session_id=
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

My thread detail

```text
GET /user/thread/detail/1
Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Disclaimer

This connector is an open-source software aimed at providing proxy services for using Bedrock services. We make our best efforts to ensure the security and legality of the software, but we are not responsible for the users' behavior.

The connector is intended solely for personal learning and research purposes. Users shall not use it for any illegal activities, including but not limited to hacking, spreading illegal information, etc. Otherwise, users shall bear the corresponding legal responsibilities themselves. Users are responsible for complying with the laws and regulations in their respective jurisdictions and shall not use the connector for any illegal or non-compliant purposes. The developers and maintainers of this software shall not be liable for any disputes, losses, or legal liabilities arising from the use of this connector.

We reserve the right to modify or terminate the connector's code at any time without further notice. Users are expected to understand and comply with the relevant local laws and regulations.

If you have any questions regarding this disclaimer, please feel free to contact us through the open-source channels.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.
