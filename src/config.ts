export default {
    pgsql: {
        host: process.env.PGSQL_HOST,
        port: process.env.PGSQL_PORT || 5432,
        database: process.env.PGSQL_DATABASE,
        user: process.env.PGSQL_USER,
        password: process.env.PGSQL_PASSWORD,
        debugMode: process.env.PGSQL_DEBUG_MODE === "true" || process.env.PGSQL_DEBUG_MODE === "1" || false,
        max: process.env.PGSQL_MAX || 80
    },
    bedrock: {
        //env ENV AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION 
        aws_access_key: process.env.AWS_ACCESS_KEY_ID,
        aws_secret_key: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_DEFAULT_REGION || "us-east-1"
    },
    admin_api_key: process.env.ADMIN_API_KEY,
    debugMode: process.env.DEBUG_MODE === "true" || process.env.DEBUG_MODE === "1" || false,
    disableUI: process.env.DISABLE_UI === "true" || process.env.DISABLE_UI === "1" || false,
    smpt: {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
        from: process.env.SMPT_FROM
    },
    performanceMode: process.env.PERFORMANCE_MODE === "true" || process.env.PERFORMANCE_MODE === "1" || false
}
