import Router from "koa-router";
// import chat from './controller/runtime/chat';
import v1 from './controller/runtime/v1';
import models from './controller/runtime/models';
import config from './config';
import admin_statistics_controller from './controller/admin/StatisticsController';
import admin_key_controller from './controller/admin/KeyController';
import admin_payment_controller from './controller/admin/PaymentController';
import admin_session_controller from './controller/admin/SessionController';
import admin_thread_controller from './controller/admin/ThreadController';
import admin_model_controller from './controller/admin/ModelController';
import admin_group_controller from './controller/admin/GroupController';
import admin_bot_connector_controller from './controller/admin/BotConnectorController';

import bot_feishu_controlller from './controller/bot/Feishu';


import user_session_controller from './controller/user/SessionController';
import user_thread_controller from './controller/user/ThreadController';
import user_key_controller from './controller/user/KeyController';
import user_model_controller from './controller/user/ModelController';

// import admin_config_controller from './controller/admin/ConfigController';

// import user_thread from './controller/user/thread';

export const router = new Router();

// AI API
router.post("/v1/chat/completions", v1.chat_completions);
router.post("/v1/completions", v1.completions);
router.post("/v1/embeddings", v1.embeddings);
router.post("/v1/images/generations", v1.images);
router.get("/v1/models", models.list);

// Admin APIs
admin_statistics_controller(router);
admin_key_controller(router);
admin_payment_controller(router);
admin_session_controller(router);
admin_thread_controller(router);
admin_model_controller(router);
admin_group_controller(router);
admin_bot_connector_controller(router);

// connectors

if (config.pgsql.host && config.pgsql.database) {
  setInterval(() => {
    bot_feishu_controlller(router);
  }, 60000);
}

// User APIs
user_session_controller(router);
user_thread_controller(router);
user_key_controller(router);
user_model_controller(router);
