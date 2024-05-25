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

        let where = "1=1";
        let params = [];

        let keys = [];
        if (options.q) {
            keys.push("q");
        }

        const conditions: any = {
            cols: "*",
            limit: limit,
            offset: offset,
            orderBy: "id desc"
        }

        for (const key of keys) {
            const keyIndex = keys.indexOf(key);
            if (key === "q") {
                params.push(`%${options.q}%`);
                where += ` and (name like $${keyIndex + 1} or email like  $${keyIndex + 1})`;
            }

        }


        conditions.where = where;
        conditions.params = params;
        const items = await db.list("eiai_key", conditions);
        const total = await db.count("eiai_key", conditions);

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
        return await db.update("eiai_key", updateData, ["id", "name", "email", "api_key", "role", "month_quota", "balance"]);
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
    }

}