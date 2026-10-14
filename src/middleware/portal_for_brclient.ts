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

                            
                            const currentUrl = window.location;
                            const BRProxyUrl = currentUrl.protocol + '//' + currentUrl.host;
                            // This BRClient is served by BRConnector, so it always talks to BRConnector, even
                            // before it has an API key. Otherwise it calls Bedrock directly and asks for AWS keys.
                            existingConfig.state.BRProxyUrl = BRProxyUrl;
                            existingConfig.state.useBRProxy = "True";

                            try {
                                const response = await fetch('/open/get-shared-api-key');
                                if (response.status !== 404) {
                                    const result = await response.json();
                                    if (result.success) {
                                        existingConfig.state.openaiApiKey = result.data;
                                    }
                                }
                            } catch (error) {
                                console.error('Error fetching API key:', error);
                            }

                                existingConfig.state.lastUpdateTime = Date.now();
                                localStorage.setItem('access-control', JSON.stringify(existingConfig));
                            
                        } catch (e) {
                            console.error('Error parsing existing config:', e);
                        }

                        // Without an API key BRClient cannot call BRConnector yet, so open the settings page,
                        // where the user enters one.
                        window.location.href = existingConfig.state.openaiApiKey ? '/brclient/' : '/brclient/#/settings';
                    } catch (error) {
                        console.error('Error:', error);
                        document.body.innerHTML = \`
                            <div style="color: red; padding: 20px; text-align: center;">
                                <h3>Init failure.</h3>
                                <p>\${error.message || 'Retry later'}</p>
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
