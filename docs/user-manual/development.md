# Development

This project mainly provides sample code, and it is strongly recommended that you develop it yourself with reference to this project.

## Local Development

### installation

Clone the repository.

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

If you have not disabled the WebUI, <http://localhost:8866/manager> will be bound to the WebUI.

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

### Build Docker image

After building, you can use Dockerfile to build Docker image.

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
    Please note: The above code is not included in this project. Please save the above content in the project's root directory `./Dockerfile`.

Then execute the following command:

```shell
docker build -t <registry-repo-tag> .
```
