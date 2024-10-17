
import { ChatRequest, ModelData } from "../entity/chat_request";
import modelService from "../service/model"
import config from '../config';
import nodemailer from 'nodemailer';
import { exec } from 'child_process';
const crypto = require('crypto');

const helper = {
    generateUUID() {
        return crypto.randomUUID();
    },
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
    refineModelParameters: async (chatRequest: ChatRequest, ctx: any): Promise<ModelData> => {
        if (ctx.cache && ctx.db) {
            const models = ctx.cache.models.filter((e: any) => e.name === chatRequest.model);
            if (models.length > 0) {
                return models[0];
            }
            throw new Error(`The model [${chatRequest.model}] is not found.`);
        }
        if (ctx.db) {
            let rtn = await modelService.loadByName(ctx.db, chatRequest.model);
            if (!rtn) {
                rtn = await modelService.loadByName(ctx.db, "default");
                // rtn = await modelService.loadByName(ctx.db, "claude-3-sonnet");
                // throw new Error(`The model [${chatRequest.model}] is not found. You may refresh to get new models.`);
            }
            if (!rtn) {
                // rtn = await modelService.loadByName(ctx.db, "claude-3-sonnet");
                throw new Error(`The model [${chatRequest.model}] is not found.`);
            }

            return rtn;
        }
        return helper.getModelDataWithoutDB(chatRequest.model);
    },
    convertImageExt: (mime?: string) => {
        if (mime.indexOf('image/jpeg') >= 0 || mime.indexOf('image/jpg') >= 0) {
            return 'jpeg';
        }
        if (mime.indexOf('image/png') >= 0) {
            return 'png';
        }
        if (mime.indexOf('image/gif') >= 0) {
            return 'gif';
        }
        if (mime.indexOf('image/webp') >= 0) {
            return 'webp';
        }
        return 'jpeg';
    },
    getModelDataWithoutDB: (model?: string): ModelData => {
        switch (model) {
            case 'claude-3-sonnet':
                return {
                    name: 'claude-3-sonnet',
                    config: {
                        modelId: 'anthropic.claude-3-sonnet-20240229-v1:0'
                    },
                    multiple: 1,
                    model_type: 1,
                    price_in: 3e-6,
                    price_out: 15e-6,
                    currency: "USD",
                    provider: 'bedrock-converse'
                };
            case 'claude-3-haiku':
                return {
                    name: 'claude-3-haiku',
                    config: {
                        modelId: "anthropic.claude-3-haiku-20240307-v1:0"
                    },
                    multiple: 1,
                    model_type: 1,
                    price_in: 0.25e-6,
                    price_out: 1.25e-6,
                    currency: "USD",
                    provider: 'bedrock-converse'
                };
            case 'claude-3-opus':
                return {
                    name: 'claude-3-opus',
                    config: {
                        modelId: "anthropic.claude-3-opus-20240229-v1:0"
                    },
                    multiple: 1,
                    model_type: 1,
                    price_in: 15e-6,
                    price_out: 75e-6,
                    currency: "USD",
                    provider: 'bedrock-converse'
                };
            case 'mistral-7b':
                return {
                    name: 'mistral-7b',
                    config: {
                        modelId: "mistral.mistral-7b-instruct-v0:2"
                    },
                    multiple: 1,
                    model_type: 1,
                    price_in: 0.15e-6,
                    price_out: 0.2e-6,
                    currency: "USD",
                    provider: 'bedrock-converse'
                };
            case 'mistral-8x7b':
                return {
                    name: 'mistral-8x7b',
                    config: {
                        modelId: "mistral.mixtral-8x7b-instruct-v0:1"
                    },
                    multiple: 1,
                    model_type: 1,
                    price_in: 0.45e-6,
                    price_out: 0.7e-6,
                    currency: "USD",
                    provider: 'bedrock-converse'
                };
            case 'mistral-large':
                return {
                    name: 'mistral-large',
                    config: {
                        modelId: "mistral.mistral-large-2402-v1:0"
                    },
                    multiple: 1,
                    model_type: 1,
                    price_in: 8e-6,
                    price_out: 24e-6,
                    currency: "USD",
                    provider: 'bedrock-converse'
                };
            case 'mistral-small':
                return {
                    name: 'mistral-small',
                    config: {
                        modelId: "mistral.mistral-small-2402-v1:0"
                    },
                    multiple: 1,
                    model_type: 1,
                    price_in: 1e-6,
                    price_out: 3e-6,
                    currency: "USD",
                    provider: 'bedrock-converse'
                };
            case 'llama3-8b':
                return {
                    name: 'llama3-8b',
                    config: {
                        modelId: "meta.llama3-8b-instruct-v1:0"
                    },
                    multiple: 1,
                    model_type: 1,
                    price_in: 0.4e-6,
                    price_out: 0.6e-6,
                    currency: "USD",
                    provider: 'bedrock-converse'
                };
            case 'llama3-70b':
                return {
                    name: 'llama3-70b',
                    config: {
                        modelId: "meta.llama3-70b-instruct-v1:0"
                    },
                    multiple: 1,
                    model_type: 1,
                    price_in: 2.65e-6,
                    price_out: 3.5e-6,
                    currency: "USD",
                    provider: 'bedrock-converse'
                };
            default:
                return {
                    name: 'claude-3-haiku',
                    config: {
                        modelId: "anthropic.claude-3-haiku-20240307-v1:0",
                        anthropic_version: "bedrock-2023-05-31"
                    },
                    multiple: 1,
                    model_type: 1,
                    price_in: 0.25e-6,
                    price_out: 1.25e-6,
                    currency: "USD",
                    provider: 'bedrock-converse'
                };
        }
    },

    /*
    refineModelParameters1: async (chatRequest: ChatRequest, ctx: any) => {
        const region = "us-east-1"; //chatRequest.config?.region || helper.selectRandomRegion(config.bedrock.region);

        //check ollama model prefix , etc ollama:mistral:v0.3
        if (config.debugMode) {
            console.log("chatRequest.model", chatRequest.model, chatRequest.model.startsWith("ollama:"))
        }
        if (chatRequest.model.startsWith("ollama:")) {
            if (chatRequest.model.split("ollama:").length > 1) {
                chatRequest.model_id = chatRequest.model.split("ollama:")[1];
                chatRequest.provider = "ollama";
                chatRequest.price_in = 0;
                chatRequest.price_out = 0;
                chatRequest.currency = "USD";
                return chatRequest;
            }
        }

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
    */



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
    },

    selectRandomRegion: (regions: any) => {
        if (!regions) {
            return config.bedrock.region || "us-east-1";
        }
        if (typeof regions === "string") {
            regions = regions.split(',').map(region => region.trim());
        }
        let selectRegion = ""
        if (regions.length === 1) {
            selectRegion = regions[0];
        }
        const randomIndex = Math.floor(Math.random() * regions.length);
        selectRegion = regions[randomIndex]
        if (config.debugMode) {
            console.log(`[selectRandomRegion]: isMultipleRegion: ${regions.length > 1}, ${selectRegion}`)
        }
        return selectRegion;

    },
    execAWSCli: (commandLine: string) => new Promise<string>((resolve, reject) => {
        if (commandLine.indexOf("aws") != 0) {
            throw new Error("aws cli must starts with 'aws '");
        }
        exec(commandLine, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else if (stderr) {
                reject(stderr);
            } else {
                resolve(stdout);
            }
        });

    })
}

export default helper;