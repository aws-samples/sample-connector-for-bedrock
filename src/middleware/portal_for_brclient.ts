// This is a middleware that helps auto login to the BRClient web ui
import service from "../service/key"

const autoLoginHandler = async (ctx: any, next: any) => {
    let pathName = ctx.path;
    if (pathName == "/open/get-shared-api-key") {
        const sharedKey = await service.loadByName(ctx.db, "__shared-api-key__");
        if (!sharedKey) {
            ctx.body = "404";
            ctx.status = 404;
            return;
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
                        // 获取现有的配置
                        let existingConfig = {
                            state: {},
                            version: 2
                        };
                        
                        try {
                            const storedConfig = localStorage.getItem('access-control');
                            if (storedConfig) {
                                const parsedConfig = JSON.parse(storedConfig);
                                existingConfig = {
                                    state: { ...parsedConfig.state },
                                    version: parsedConfig.version || 2
                                };
                            }

                            // 如果已经设置了 BRProxy，则跳过
                            if (existingConfig.state.useBRProxy === "True" && existingConfig.state.BRProxyUrl) {
                                console.log("BRProxyUrl already set, skip");
                            } else {
                                // 获取当前页面的 schema 和 host
                                const currentUrl = window.location;
                                const BRProxyUrl = currentUrl.protocol + '//' + currentUrl.host;
                                
                                // 尝试获取共享 API key
                                try {
                                    const response = await fetch('/open/get-shared-api-key');
                                    if (response.status === 404) {
                                        // 如果获取不到 API key，只设置 BRProxyUrl
                                        existingConfig.state.BRProxyUrl = BRProxyUrl;
                                    } else {
                                        const result = await response.json();
                                        if (result.success) {
                                            // 如果成功获取到 API key，设置所有相关配置
                                            existingConfig.state.BRProxyUrl = BRProxyUrl;
                                            existingConfig.state.openaiApiKey = result.data;
                                            existingConfig.state.useBRProxy = "True";
                                        } else {
                                            // API 调用成功但返回失败，只设置 BRProxyUrl
                                            existingConfig.state.BRProxyUrl = BRProxyUrl;
                                        }
                                    }
                                } catch (error) {
                                    // 如果请求出错，只设置 BRProxyUrl
                                    console.error('Error fetching API key:', error);
                                    existingConfig.state.BRProxyUrl = BRProxyUrl;
                                }

                                existingConfig.state.lastUpdateTime = Date.now();
                                // 保存到 localStorage
                                localStorage.setItem('access-control', JSON.stringify(existingConfig));
                            }
                        } catch (e) {
                            console.error('Error parsing existing config:', e);
                        }

                        // 重定向到 /brclient/
                        window.location.href = '/brclient/';
                    } catch (error) {
                        console.error('Error:', error);
                        document.body.innerHTML = \`
                            <div style="color: red; padding: 20px; text-align: center;">
                                <h3>初始化失败</h3>
                                <p>\${error.message || '请稍后重试'}</p>
                                <button onclick="window.location.reload()" style="margin-top: 10px; padding: 5px 10px;">重试</button>
                            </div>
                        \`;
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
