import helper from "../util/helper";

export default {
    loadById: async (db: any, id: number) => {
        return await db.loadById("eiai_key", ~~id);
    },

    detail: async (db: any, options: any) => {
        const id = options.id;
        if (!id) {
            throw new Error("id is required");
        }
        const iId = ~~id;
        if (iId === -1) {
            throw new Error("Please create an admin key via the API first.");
        }
        const api_key = await db.loadById("eiai_key", ~~id);

        return api_key;
    },
    list: async (db: any, options: any) => {

        const limit = ~~(options.limit) || 20;
        const offset = ~~(options.offset) || 0;
        let orderBy = options.orderBy || "update-1"

        switch (orderBy) {
            case "id-0":
                orderBy = "id";
                break;
            case "id-1":
                orderBy = "id desc";
                break;
            case "month-0":
                orderBy = "month_fee";
                break;
            case "month-1":
                orderBy = "month_fee desc";
                break;
            case "name-0":
                orderBy = "name";
                break;
            case "name-1":
                orderBy = "name desc";
                break;
            case "total-0":
                orderBy = "total_fee";
                break;
            case "total-1":
                orderBy = "total_fee desc";
                break;
            case "quota-0":
                orderBy = "month_quota";
                break;
            case "quota-1":
                orderBy = "month_quota desc";
                break;
            case "balance-0":
                orderBy = "balance";
                break;
            case "balance-1":
                orderBy = "balance desc";
                break;
            case "update-0":
                orderBy = "updated_at";
                break;
            case "update-1":
                orderBy = "updated_at desc";
                break;
            default:
                orderBy = "updated_at desc";
        }

        let where = "1=1";
        let params = [];

        let keys = [];
        if (options.q) {
            keys.push("q");
        }
        if (options.name) {
            keys.push("name");
        }
        if (options.group_id) {
            keys.push("group_id");
        }
        if (options.role) {
            keys.push("role");
        }

        const conditions: any = {
            cols: "*",
            limit: limit,
            offset: offset,
            orderBy
        }

        for (const key of keys) {
            const keyIndex = keys.indexOf(key);
            if (key === "q") {
                params.push(`%${options.q}%`);
                where += ` and (name like $${keyIndex + 1} or api_key like $${keyIndex + 1} or email like $${keyIndex + 1})`;
            }

            if (key === "name") {
                params.push(`${options.name}`);
                where += ` and name=$${keyIndex + 1}`;
            }
            if (key === "group_id") {
                params.push(`${options.group_id}`);
                where += ` and group_id=$${keyIndex + 1}`;
            }
            if (key === "role") {
                params.push(`${options.role}`);
                where += ` and role=$${keyIndex + 1}`;
            }
        }


        conditions.where = where;
        conditions.params = params;
        const items = await db.list("eiai_v_key_group", conditions);
        const total = ~~await db.count("eiai_v_key_group", conditions);

        return { items, total, limit, offset };
    },

    create: async (db: any, options: any) => {

        if (!options.name) {
            throw new Error("name is required");
        }

        let apiKey: string = "";
        for (let i = 0; i < 10; i++) {
            apiKey = helper.genApiKey();
            const existsKey = await db.loadByKV("eiai_key", "api_key", apiKey)
            if (!existsKey) {
                break;
            }
        }

        const email = options.email;
        const result = await db.insert("eiai_key", {
            name: options.name,
            api_key: apiKey,
            group_id: options.group_id || 0,
            role: options.role || "user",
            email,
            month_quota: options.month_quota || 0,
            balance: options.balance || 0,
        }, ["id", "name", "email", "api_key", "role", "month_quota", "balance"]);

        if (email) {
            const emailRegex = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/;
            if (emailRegex.test(email)) {
                helper.sendMailApiKey(email, apiKey);
            }
        }
        return result;
    },

    async rebillMonthly(db: any, id: number) {
        const updateData: any = {
            id,
            month_fee: 0
        };
        return await db.update("eiai_key", updateData, ["id"]);
    },

    async update(db: any, data: any) {
        if (!data.id) {
            throw new Error("id is required");
        }
        const updateData: any = {
            id: data.id
        }
        data.role && (updateData.role = data.role);
        data.group_id && (updateData.group_id = data.group_id);
        data.name && (updateData.name = data.name);
        data.month_quota != undefined && (updateData.month_quota = data.month_quota);
        updateData.updated_at = new Date()
        return await db.update("eiai_key", updateData, ["id", "name", "email", "api_key", "group_id", "role", "month_quota", "balance"]);
    },

    recharge: async (db: any, options: any) => {

        if (!options.api_key && !options.id) {
            throw new Error("api_key or id is required");
        }

        if (!options.balance || 1.0 * options.balance <= 0) {
            throw new Error("balance is required");
        }

        const key = options.id ?
            await db.loadById("eiai_key", options.id) :
            await db.loadByKV("eiai_key", "api_key", options.api_key);
        if (!key) {
            throw new Error("api_key or id is invalid");
        }

        await db.insert("eiai_payment", {
            key_id: key.id,
            fee: 1.0 * options.balance
        });

        return await db.update("eiai_key", {
            id: key.id,
            balance: 1.0 * key.balance + 1.0 * options.balance,
            updated_at: new Date()
        }, ["id", "name", "email", "api_key", "role", "month_quota", "balance"]);
    },

    // If bound then remove, otherwise bind
    async bindModel(db: any, data: any) {
        const { key_id, model_id } = data;

        const existsDB = await db.exists("eiai_key_model", {
            where: "key_id=$1 and model_id=$2",
            params: [key_id, model_id]
        });
        console.log(existsDB);

        if (existsDB) {
            await db.deleteMulti("eiai_key_model", {
                where: "key_id=$1 and model_id=$2",
                params: [key_id, model_id]
            });
            return "deleted";
        } else {
            await db.insert("eiai_key_model", {
                key_id,
                model_id
            });
            return "created";
        }
    },

    async listModels(db: any, options: any) {

        const limit = ~~(options.limit) || 20;
        const offset = ~~(options.offset) || 0;

        let where = "1=1";
        let params = [];

        let keys = [];
        if (options.q) {
            keys.push("q");
        }
        if (options.key_id) {
            keys.push("key_id");
        }
        if (options.model_id) {
            keys.push("model_id");
        }

        const conditions: any = {
            limit: limit,
            offset: offset,
            orderBy: "id"
        }

        for (const key of keys) {
            const keyIndex = keys.indexOf(key);
            if (key === "q") {
                params.push(`%${options.q}%`);
                where += ` and (key_name like $${keyIndex + 1} or model_name like $${keyIndex + 1})`;
            }
            if (key === "key_id") {
                params.push(options.key_id);
                where += ` and key_id=$${keyIndex + 1}`;
            }
            if (key === "model_id") {
                params.push(options.model_id);
                where += ` and model_id=$${keyIndex + 1}`;
            }

        }

        conditions.where = where;
        conditions.params = params;
        const items = await db.list("eiai_v_key_model", conditions);

        const total = ~~await db.count("eiai_v_key_model", conditions);

        return { items, total, limit, offset };

    },

    async resetKey(db: any, options: any) {

        if (!options.api_key && !options.id) {
            throw new Error("api_key or id is required");
        }

        const key = options.id ?
            await db.loadById("eiai_key", options.id) :
            await db.loadByKV("eiai_key", "api_key", options.api_key);
        if (!key) {
            throw new Error("api_key or id is invalid");
        }

        let apiKey: string = "";
        for (let i = 0; i < 10; i++) {
            apiKey = helper.genApiKey();
            const existsKey = await db.loadByKV("eiai_key", "api_key", apiKey)
            if (!existsKey) {
                break;
            }
        }

        return await db.update("eiai_key", {
            id: key.id,
            api_key: apiKey,
            updated_at: new Date()
        }, ["id", "name", "email", "api_key", "role", "month_quota", "balance"]);

    },

    async delete(db: any, options: any) {
        if (!options.api_key && !options.id) {
            throw new Error("api_key or id is required");
        }
        const key = options.id ?
            await db.loadById("eiai_key", options.id) :
            await db.loadByKV("eiai_key", "api_key", options.api_key);
        if (!key) {
            throw new Error("api_key or id is invalid");
        }

        const keyId = key.id;

        await db.deleteMulti("eiai_key_model", {
            where: "key_id=$1",
            params: [keyId]
        });
        await db.deleteMulti("eiai_thread", {
            where: "key_id=$1",
            params: [keyId]
        });
        await db.deleteMulti("eiai_session", {
            where: "key_id=$1",
            params: [keyId]
        });
        await db.deleteMulti("eiai_payment", {
            where: "key_id=$1",
            params: [keyId]
        });
        await db.deleteMulti("eiai_payment", {
            where: "key_id=$1",
            params: [keyId]
        });
        await db.delete("eiai_key", keyId);
        return true;

    }

}
