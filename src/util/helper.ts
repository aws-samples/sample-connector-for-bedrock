
import { ChatRequest } from "../entity/chat_request";
import modelService from "../service/model"
import config from '../config';
import nodemailer from 'nodemailer';

const helper = {
    genApiKey() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let key = '';
        const keyLength = 29;

        for (let i = 0; i < keyLength; i++) {
            key += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return "br-" + key;

    },
    async parseImageUrl(url: string): Promise<any> {
        if (url.indexOf('http://') >= 0 || url.indexOf('https://') >= 0) {
            const imageReq = await fetch(url);
            const blob = await imageReq.blob();
            let buffer = Buffer.from(await blob.arrayBuffer());

            return {
                "type": "base64",
                "media_type": blob.type,
                "data": buffer.toString('base64')
            };
        } else if (url.indexOf('data:') >= 0) {
            const media_type = url.substring(5, url.indexOf(';'));
            const type = url.substring(url.indexOf(';') + 1, url.indexOf(','));
            const data = url.substring(url.indexOf(',') + 1);
            return {
                type,
                media_type,
                data
            }
        }
        return null;
    },
    refineModelParameters: async (chatRequest: ChatRequest, ctx: any) => {
        const region = chatRequest.config?.region || config.bedrock.region;
        switch (chatRequest.model) {
            case 'claude-3-sonnet':
                chatRequest.model_id = "anthropic.claude-3-sonnet-20240229-v1:0";
                chatRequest.anthropic_version = "bedrock-2023-05-31";
                chatRequest.provider = "bedrock-claude3";
                chatRequest.price_in = 3.00 / 1000000;
                chatRequest.price_out = 15.00 / 1000000;
                chatRequest.currency = "USD";
                return chatRequest;
            case 'claude-3-haiku':
                chatRequest.model_id = "anthropic.claude-3-haiku-20240307-v1:0";
                chatRequest.anthropic_version = "bedrock-2023-05-31";
                chatRequest.provider = "bedrock-claude3";
                chatRequest.price_in = 0.25 / 1000000;
                chatRequest.price_out = 1.25 / 1000000;
                chatRequest.currency = "USD";
                return chatRequest;
            case 'claude-3-opus':
                chatRequest.model_id = "anthropic.claude-3-opus-20240229-v1:0";
                chatRequest.anthropic_version = "bedrock-2023-05-31";
                chatRequest.provider = "bedrock-claude3";
                chatRequest.price_in = 15.00 / 1000000;
                chatRequest.price_out = 75.00 / 1000000;
                chatRequest.currency = "USD";
                return chatRequest;
            case 'mistral-7b':
                chatRequest.model_id = "mistral.mistral-7b-instruct-v0:2";
                chatRequest.provider = "bedrock-mistral";
                if (region.indexOf("us-") >= 0) {
                    chatRequest.price_in = 0.00015 / 1000;
                    chatRequest.price_out = 0.0002 / 1000;
                } else if (region.indexOf("eu-west-3") >= 0) { // Paris pricing
                    chatRequest.price_in = 0.0002 / 1000;
                    chatRequest.price_out = 0.00026 / 1000;
                } else if (region.indexOf("ap-southeast-2") >= 0) { // 
                    chatRequest.price_in = 0.0002 / 1000;
                    chatRequest.price_out = 0.00026 / 1000;
                } else {
                    chatRequest.price_in = 0.0002 / 1000;
                    chatRequest.price_out = 0.00026 / 1000;
                }
                chatRequest.currency = "USD";
                return chatRequest;
            case 'mistral-8x7b':
                // chatRequest.model_id = "mistral.mistral-8x7b-instruct-v0:1";
                chatRequest.model_id = "mistral.mixtral-8x7b-instruct-v0:1";
                chatRequest.provider = "bedrock-mistral";
                if (region.indexOf("us-") >= 0) {
                    chatRequest.price_in = 0.00045 / 1000;
                    chatRequest.price_out = 0.0007 / 1000;
                } else if (region.indexOf("eu-west-3") >= 0) { // Paris pricing
                    chatRequest.price_in = 0.00059 / 1000;
                    chatRequest.price_out = 0.00091 / 1000;
                } else if (region.indexOf("ap-southeast-2") >= 0) { // Paris pricing
                    chatRequest.price_in = 0.00059 / 1000;
                    chatRequest.price_out = 0.00091 / 1000;
                } else {
                    chatRequest.price_in = 0.00059 / 1000;
                    chatRequest.price_out = 0.00091 / 1000;
                }
                chatRequest.currency = "USD";
                return chatRequest;
            case 'mistral-large':
                chatRequest.model_id = "mistral.mistral-large-2402-v1:0";
                chatRequest.provider = "bedrock-mistral";
                if (region.indexOf("us-") >= 0) {
                    chatRequest.price_in = 0.008 / 1000;
                    chatRequest.price_out = 0.024 / 1000;
                } else if (region.indexOf("eu-west-3") >= 0) { // Paris pricing
                    chatRequest.price_in = 0.0104 / 1000;
                    chatRequest.price_out = 0.0312 / 1000;
                } else if (region.indexOf("ap-southeast-2") >= 0) { // Sydney pricing
                    chatRequest.price_in = 0.0104 / 1000;
                    chatRequest.price_out = 0.0312 / 1000;
                } else {
                    chatRequest.price_in = 0.0104 / 1000;
                    chatRequest.price_out = 0.0312 / 1000;
                }
                chatRequest.currency = "USD";
                return chatRequest;
            case 'mistral-small':
                console.log("small...")
                chatRequest.model_id = "mistral.mistral-small-2402-v1:0";
                chatRequest.provider = "bedrock-mistral";
                if (region.indexOf("us-") >= 0) {
                    chatRequest.price_in = 0.001 / 1000;
                    chatRequest.price_out = 0.003 / 1000;
                } else {
                    chatRequest.price_in = 0.001 / 1000;
                    chatRequest.price_out = 0.003 / 1000;
                }
                chatRequest.currency = "USD";
                return chatRequest;
            case 'llama3-8b':
                chatRequest.model_id = "meta.llama3-8b-instruct-v1:0";
                chatRequest.provider = "bedrock-llama3";
                chatRequest.price_in = 0.0004 / 1000;
                chatRequest.price_out = 0.0006 / 1000;
                chatRequest.currency = "USD";
                return chatRequest;
            case 'llama3-70b':
                chatRequest.model_id = "meta.llama3-70b-instruct-v1:0";
                chatRequest.provider = "bedrock-llama3";
                chatRequest.price_in = 0.00265 / 1000;
                chatRequest.price_out = 0.0035 / 1000;
                chatRequest.currency = "USD";
                return chatRequest;
            default:
                // chatRequest.model_id = "meta.llama3-70b-instruct-v1:0";
                // chatRequest.provider = "bedrock-llama3";
                // chatRequest.price_in = 0.00265 / 1000;
                // chatRequest.price_out = 0.0035 / 1000;
                // chatRequest.currency = "USD";
                // return chatRequest;
                // const modelCustom = await modelService.loadByName(ctx.db, "s3-kb");

                console.log(ctx.db);
                if (ctx.db) {
                    const modelCustom = await modelService.loadByName(ctx.db, chatRequest.model);
                    if (modelCustom) {
                        chatRequest.config = modelCustom.config;
                        chatRequest.provider = modelCustom.config.provider;
                        if (modelCustom.config.provider === "bedrock-knowledge-base") {
                            const { price_in, price_out, currency } = await helper.refineModelParameters({
                                model: modelCustom.config.summaryModel,
                                config: modelCustom.config,
                                messages: []
                            }, ctx);
                            chatRequest.price_in = price_in;
                            chatRequest.price_out = price_out;
                            chatRequest.currency = currency;
                        }
                        return chatRequest;
                    }
                }

                chatRequest.model_id = "anthropic.claude-3-sonnet-20240229-v1:0";
                chatRequest.anthropic_version = "bedrock-2023-05-31";
                chatRequest.provider = "bedrock-claude3";
                chatRequest.price_in = 3.00 / 1000000;
                chatRequest.price_out = 15.00 / 1000000;
                chatRequest.currency = "USD";
                return chatRequest;

        }
    },



    sleep: (ms: number) => {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    sendMailApiKey: async (email: string, api_key: string) => {
        if (config.smpt && config.smpt.host) {
            const transporter = nodemailer.createTransport({
                host: config.smpt.host,
                port: ~~config.smpt.port,
                // secure: true, // Use `true` for port 465, `false` for all other ports
                auth: {
                    user: config.smpt.user,
                    pass: config.smpt.pass,
                },
            });

            const info = await transporter.sendMail({
                from: config.smpt.from,
                to: email,
                subject: "[BRConnector]Bedrock Connector Api Key",
                html: "Your Bedrock Connector's API keys is: <div style='margin:10px;padding:20px 0px;border:1px solid #ccc;width:400px;text-align:center'>" + api_key + "</div>",
            });

            console.log("Message sent: %s", info.messageId);
        }
    }
}

export default helper;