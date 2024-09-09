export default {
    loadById: async (db: any, id: number) => {
        return await db.loadById("eiai_bot_connector", ~~id);
    },

    detail: async (db: any, options: any) => {
        const id = options.id;
        if (!id) {
            throw new Error("id is required");
        }
        return await db.loadById("eiai_bot_connector", ~~id);
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
                where += ` and (name like $${keyIndex + 1} or provider like  $${keyIndex + 1})`;
            }
        }

        conditions.where = where;
        conditions.params = params;
        const items = await db.list("eiai_bot_connector", conditions);
        const total = ~~await db.count("eiai_bot_connector", conditions);

        return { items, total, limit, offset };
    },

    save: async (db: any, data: any) => {
        const { id, name, config, provider } = data;
        if (id) {
            const updateData: any = { id };
            name && (updateData.name = name);
            config && (updateData.config = config);
            provider && (updateData.provider = provider);
            updateData.updated_at = new Date();
            return await db.update("eiai_bot_connector", updateData, ["id", "name", "provider", "created_at", "updated_at"]);
        } else {
            if (!name) {
                throw new Error("name is required");
            }
            if (!provider) {
                throw new Error("provider is required");
            }
            if (!config) {
                throw new Error("config is required");
            }
            const existsEntity = await db.exists("eiai_bot_connector", {
                where: "name=$1 and provider=$2", params: [name, provider]
            });
            if (existsEntity) {
                throw new Error(`${name}@[${provider}] already exists`);
            }

            console.log("------------eiai_bot_connector", {
                name,
                provider,
                config
            })
            return await db.insert("eiai_bot_connector", {
                name,
                provider,
                config
            }, ["id", "name", "provider", "created_at", "updated_at"]);

        }

    },
    async delete(db: any, options: any) {
        if (!options.id) {
            throw new Error("id is required");
        }
        await db.delete("eiai_bot_connector", options.id);
        return true;

    }

}