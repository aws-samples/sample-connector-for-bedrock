export default {
    loadById: async (db: any, id: number) => {
        return await db.loadById("eiai_model", ~~id);
    },
    loadByName: async (db: any, name: string) => {
        return await db.loadByKV("eiai_model", "name", name);
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
            cols: "id, name, config, created_at, updated_at",
            limit: limit,
            offset: offset,
            orderBy: "id desc"
        }

        for (const key of keys) {
            const keyIndex = keys.indexOf(key);
            if (key === "q") {
                params.push(`%${options.q}%`);
                where += ` and (name like $${keyIndex + 1}`;
            }
        }

        conditions.where = where;
        conditions.params = params;
        const items = await db.list("eiai_model", conditions);
        const total = await db.count("eiai_model", conditions);

        return { items, total, limit, offset };
    },

    create: async (db: any, data: any) => {
        const { name, config } = data;
        if (!name) {
            throw new Error("name is required");
        }
        const existsEntity = await db.loadByKV("eiai_model", "name", name);
        if (existsEntity) {
            throw new Error(name + " already exists");
        }

        return await db.insert("eiai_model", {
            name,
            config
        }, ["id", "name", "config"]);

    },

    async update(db: any, data: any) {
        const { id, name, config } = data;
        if (!id) {
            throw new Error("id is required");
        }
        const updateData: any = { id };
        if (name) {
            const existsEntity = await db.load("eiai_model", {
                where: "name=$1 and id<>$2",
                params: [name, id]
            });
            if (existsEntity) {
                throw new Error(name + " already exists");
            }
            updateData.name = name;
        }
        config && (updateData.config = config);
        updateData.updated_at = new Date();
        return await db.update("eiai_model", updateData, ["id", "name", "config", "updated_at"]);
    },

    async delete(db: any, id: any) {
        return await db.delete("eiai_model", id);
    },


}