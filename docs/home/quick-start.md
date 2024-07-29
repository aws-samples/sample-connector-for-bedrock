# Quick start

## 1. Prepare a server to host the connector

Launch an EC2 on AWS or any other server with docker support.

## 2. Run Postgres with docker

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

## 3. Start the connector server with docker

Run the following docker command directly to start the connector container.

Make sure to replace the value of access key, secret key, region to be right ones.

And, important! replace the value of ADMIN_API_KEY to be a complex key instead of using the simple one in the sample.

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

## 4. Test the connector server

Now, you have the first admin user with the API_KEY "br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx".

And the server export port 8866 to the hosting EC2.

Test the server with the API_Key using `curl` command:

```shell
curl "http://localhost:8866/admin/api-key/list" \
  -H "Authorization: Bearer br_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" 
```

You will get something like the following if every things go well:

```json
{"success":true,"data":{"items":[],"total":"0","limit":20,"offset":0}}
```

## 5. Creat the first admin user

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
and this api_key can be used to login the connector's manager WebUI to manage other api_key.

## 6. Config client to connect to the connector server

You should expose the connector server with HTTPS.

One simple way to do it on AWS is creating a CloudFront CDN to provide SSL support.

For more information about setting up CloudFront on AWS, please refer to official document of AWS.

Open a client that can define Host and API Key for OpenAI.

In Host field enter the CloudFront url.

In the "APK Key" field, enter the API_Key of your first admin user, which is the one you created in step 5.

Then, open a new chat to test.

If every thing goes well, you can start to chat.

!!!note
    You can use the sample client provided by <https://github.com/aws-samples/sample-client-for-amazon-bedrock> to test this project, [View how to config](../user-manual/sample-client-for-bedrock.md).

    Since 0.0.8, this client has been built into the docker image. The access address is: `http(s)://your-endpoint/brclient/`

## 7. The connector's WebUI

If you have not set the environment variable DISABLE_UI, you can now access the BRConnector WebUI via <https://your-endpoint/manager>.

You can log in and manage it using the API key you just generated. Enter <https://your-endpoint> as the Host.
