// This is a middleware that helps auto login to the BRClient web ui
import service from "../service/key"

const autoLoginHandler = async (ctx: any, next: any) => {
    let pathName = ctx.path;
    if (pathName == "/open/get-shared-api-key") {
        const sharedKey = await service.loadByName(ctx.db, "__shared-api-key__");
        if (!sharedKey) {
            ctx.body = "404";
            ctx.status = 404;
        }
        ctx.body = {
            "success": true,
            data: sharedKey.api_key
        };
        return;
    }

    if (pathName == "/portal-for-brclient.html") {
        ctx.body = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Portal for BRClient</title>
        </head>
        <body>
            <script>
                (async function() {
                    try {
                        // 获取 API Key
                        const response = await fetch('/open/get-shared-api-key');
                        const result = await response.json();
                        if (!result.success) {
                            throw new Error('Failed to get API key');
                        }
                        const apiKey = result.data;

                        // 获取当前页面的 schema 和 host
                        const currentUrl = window.location;
                        const BRProxyUrl = currentUrl.protocol + '//' + currentUrl.host;
                        
                        // 获取现有的 state（如果存在）
                        let existingState = {};
                        try {
                            const storedState = localStorage.getItem('state');
                            if (storedState) {
                                existingState = JSON.parse(storedState);
                            }
                        } catch (e) {
                            console.error('Error parsing existing state:', e);
                        }

                        // 合并新的状态值
                        const newState = {
                            ...existingState,
                            BRProxyUrl: BRProxyUrl,
                            openaiApiKey: apiKey,
                            useBRProxy: "True"
                        };

                        // 保存到 localStorage
                        localStorage.setItem('state', JSON.stringify(newState));
                    
                        // 重定向到 /brclient/
                        // window.location.href = '/brclient/';
                    } catch (error) {
                        console.error('Error:', error);
                        document.body.innerHTML = '<div style="color: red;">Error: Failed to initialize. Please try again later.</div>';
                    }
                })();
            </script>
        </body>
        </html>
        `;
        return;
    }
}

export default autoLoginHandler;
