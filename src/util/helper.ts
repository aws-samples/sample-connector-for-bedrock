
import { ChatRequest, ModelData } from "../entity/chat_request";
import modelService from "../service/model"
import config from '../config';
import nodemailer from 'nodemailer';
import { exec } from 'child_process';
import logger from './logger';
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
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
    parseModelString(input: string) {
        const slashIndex = input.indexOf('/');

        if (slashIndex !== -1) {
            const model = input.substring(0, slashIndex);
            const model_id = input.substring(slashIndex + 1);

            return { model: model, model_id: model_id };
        } else {
            return null;
        }
    },

    async downloadImageToBase64(url: string, client: S3Client): Promise<any> {
        if (url.indexOf('http://') >= 0 || url.indexOf('https://') >= 0) {
            const imageReq = await fetch(url);
            const blob = await imageReq.blob();
            let buffer = Buffer.from(await blob.arrayBuffer());
            return buffer.toString('base64');
        } else if (url.indexOf('s3://') >= 0) {
            const urlParts = url.replace('s3://', '').split('/');
            const bucketName = urlParts.shift();
            const key = urlParts.join('/');
            const params = {
                Bucket: bucketName,
                Key: key,
            };

            try {
                const command = new GetObjectCommand(params);
                const response = await client.send(command);
                const byteArray = await response.Body.transformToByteArray();
                return Buffer.from(byteArray).toString('base64');

            } catch (error) {
                // console.error("Error downloading and converting image:", error);
                throw error;
            }

        }
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
        const model = chatRequest.model;
        if (ctx.cache && ctx.db) {
            const models = ctx.cache.models.filter((e: any) => e.name === model);
            if (models.length > 0) {
                return models[0];
            }
            throw new Error(`The model [${model}] not found.`);
        }
        if (ctx.db) {
            let rtn = await modelService.loadByName(ctx.db, model);
            if (!rtn) {
                rtn = await modelService.loadByName(ctx.db, "default");
                if (rtn) {
                    rtn.name = "default";
                }
                // rtn = await modelService.loadByName(ctx.db, "claude-3-sonnet");
                // throw new Error(`The model [${chatRequest.model}] is not found. You may refresh to get new models.`);
            }
            if (!rtn) {
                // rtn = await modelService.loadByName(ctx.db, "claude-3-sonnet");
                throw new Error(`The model [${model}] not found.`);
            }

            return rtn;
        }
        return helper.getModelDataWithoutDB(model);
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
            case 'amazon-nova-pro':
                return {
                    name: 'amazon-nova-pro',
                    config: {
                        modelId: 'amazon.nova-pro-v1:0'
                    },
                    multiple: 1,
                    model_type: 1,
                    price_in: 0.8e-6,
                    price_out: 3.2e-6,
                    currency: "USD",
                    provider: 'bedrock-converse'
                };
            case 'amazon-nova-lite':
                return {
                    name: 'amazon-nova-lite',
                    config: {
                        modelId: 'amazon.nova-lite-v1:0'
                    },
                    multiple: 1,
                    model_type: 1,
                    price_in: 0.06e-6,
                    price_out: 0.24e-6,
                    currency: "USD",
                    provider: 'bedrock-converse'
                };
            case 'amazon-nova-micro':
                return {
                    name: 'amazon-nova-micro',
                    config: {
                        modelId: 'amazon.nova-micro-v1:0'
                    },
                    multiple: 1,
                    model_type: 1,
                    price_in: 0.035e-6,
                    price_out: 0.14e-6,
                    currency: "USD",
                    provider: 'bedrock-converse'
                };
            case 'claude-3.5-sonnet-v2':
                return {
                    name: 'claude-3.5-sonnet-v2',
                    config: {
                        modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0'
                    },
                    multiple: 1,
                    model_type: 1,
                    price_in: 3e-6,
                    price_out: 15e-6,
                    currency: "USD",
                    provider: 'bedrock-converse'
                };

            case 'claude-3.5-haiku':
                return {
                    name: 'claude-3.5-haiku',
                    config: {
                        modelId: 'anthropic.claude-3-5-haiku-20241022-v1:0'
                    },
                    multiple: 1,
                    model_type: 1,
                    price_in: 1e-6,
                    price_out: 5e-6,
                    currency: "USD",
                    provider: 'bedrock-converse'
                };
            case 'claude-3.5-sonnet':
                return {
                    name: 'claude-3.5-sonnet',
                    config: {
                        modelId: 'anthropic.claude-3-5-sonnet-20240620-v1:0'
                    },
                    multiple: 1,
                    model_type: 1,
                    price_in: 3e-6,
                    price_out: 15e-6,
                    currency: "USD",
                    provider: 'bedrock-converse'
                };
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
                html: "Your Bedrock Connector's API key is: <div style='margin:10px;padding:20px 0px;border:1px solid #ccc;width:400px;text-align:center'>" + api_key + "</div>",
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
            logger.info(`${regions.length > 1 ? "multi-region" : "single-region"}, choose: ${selectRegion}`)
        }
        return selectRegion;

    },
    selectCredentials: (credentials: any, excludeAccessKeyId: any) => {
        if (!credentials || !Array.isArray(credentials) || credentials.length === 0) {
            return null;
        }
        let availableCredentials = excludeAccessKeyId
            ? credentials.filter(cred => cred.accessKeyId !== excludeAccessKeyId)
            : credentials;

        if (availableCredentials.length === 0) {
            return null;
        }

        // 如果只有一个可用凭证，直接返回
        if (availableCredentials.length === 1) {
            return availableCredentials[0];
        }

        // 随机选择一个凭证
        const randomIndex = Math.floor(Math.random() * availableCredentials.length);
        return availableCredentials[randomIndex];
    },


    // selectCredentials: (credentials: any, excludeAK: any) => {
    //     if (!credentials || !Array.isArray(credentials)) {
    //         return null;
    //     }

    //     let selectedCredentials = {};
    //     if (credentials.length === 1) {
    //         selectedCredentials = credentials[0];
    //     }
    //     const randomIndex = Math.floor(Math.random() * credentials.length);
    //     return credentials[randomIndex];
    // },

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