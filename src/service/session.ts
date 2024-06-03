export default {

    detail: async (db: any, options: any) => {
        const id = options.id;
        if (!id) {
            throw new Error("id is required");
        }
        const session = await db.loadById("eiai_session", ~~id);

        if (options.key_id) {
            if (session.key_id != options.key_id) {
                throw new Error("Unauthorized: not your session.");
            }
        }
        return session;
    },
    list: async (db: any, options: any) => {
        const limit = parseInt(options.limit) || 20;
        const offset = parseInt(options.offset) || 0;

        let where = "1=1";
        let params = [];
        let orderBy = options.orderBy || "id desc";

        let keys = [];
        if (options.key_id) {
            keys.push("key_id");
        }
        if (options.q) {
            keys.push("q");
        }

        for (const key of keys) {
            const keyIndex = keys.indexOf(key);

            if (key === "key_id") {
                params.push(options.key_id);
                where += " and key_id = $" + (keyIndex + 1);
                orderBy = "id asc";
            } else if (key === "q") {
                params.push(`%${options.q}%`);
                where += ` and title like $${keyIndex + 1}`;
            }
        }

        const conditions: any = {
            limit: limit,
            offset: offset,
            orderBy
        }

        conditions.where = where;
        conditions.params = params;
        const items = await db.list("eiai_session", conditions);
        const total = ~~await db.count("eiai_session", conditions);

        return { items, total, limit, offset };
    }

}