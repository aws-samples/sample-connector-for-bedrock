export default {
    loadById: async (db: any, id: number) => {
        return await db.loadById("eiai_group", ~~id);
    },
    loadByName: async (db: any, name: string) => {
        return await db.loadByKV("eiai_group", "name", name);
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
            limit: limit,
            offset: offset,
            orderBy: "id"
        }

        for (const key of keys) {
            const keyIndex = keys.indexOf(key);
            if (key === "q") {
                params.push(`%${options.q}%`);
                where += ` and (name like $${keyIndex + 1})`;
            }
        }

        conditions.where = where;
        conditions.params = params;
        const items = await db.list("eiai_group", conditions);
        const total = await db.count("eiai_group", conditions);

        return { items, total, limit, offset };
    },

    async save(db: any, data: any) {
        const { id, name, key } = data;
        if (id) {
            const updateData: any = { id };
            if (name) {
                const existsEntity = await db.load("eiai_group", {
                    where: "name=$1 and id<>$2",
                    params: [name, id]
                });
                if (existsEntity) {
                    throw new Error(name + " already exists");
                }
                updateData.name = name;
            }
            updateData.key = key;
            updateData.updated_at = new Date();
            return await db.update("eiai_group", updateData, ["id", "name", "key", "created_at", "updated_at"]);
        } else {
            if (!name) {
                throw new Error("name is required");
            }
            const existsEntity = await db.loadByKV("eiai_group", "name", name);
            if (existsEntity) {
                throw new Error(name + " already exists");
            }

            return await db.insert("eiai_group", {
                name,
                key
            }, ["id", "name", "key", "created_at", "updated_at"]);

        }
    },

    async delete(db: any, data: any) {
        const { id } = data;
        if (!id) {
            throw new Error("id is required");
        }
        await db.deleteMulti("eiai_group_model", {
            where: "group_id=$1",
            params: [id]
        });

        await db.delete("eiai_group", id);
        return true;
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
        if (options.group_id) {
            keys.push("group_id");
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
                where += ` and (group_name like $${keyIndex + 1} or model_name like $${keyIndex + 1})`;
            }
            if (key === "group_id") {
                params.push(options.group_id);
                where += ` and group_id=$${keyIndex + 1}`;
            }
            if (key === "model_id") {
                params.push(options.model_id);
                where += ` and model_id=$${keyIndex + 1}`;
            }
        }

        conditions.where = where;
        conditions.params = params;
        const items = await db.list("eiai_v_group_model", conditions);

        const total = ~~await db.count("eiai_v_group_model", conditions);

        return { items, total, limit, offset };
    },

    // If bound then remove, otherwise bind
    async bindModel(db: any, data: any) {
        const { group_id, model_id } = data;

        const existsDB = await db.exists("eiai_group_model", {
            where: "group_id=$1 and model_id=$2",
            params: [group_id, model_id]
        });
        console.log(existsDB);

        if (existsDB) {
            await db.deleteMulti("eiai_group_model", {
                where: "group_id=$1 and model_id=$2",
                params: [group_id, model_id]
            });
            return "deleted";
        } else {
            await db.insert("eiai_group_model", {
                group_id,
                model_id
            });
            return "created";
        }

    },



}