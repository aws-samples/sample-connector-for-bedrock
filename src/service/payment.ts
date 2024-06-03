export default {

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

        for (const key of keys) {
            const keyIndex = keys.indexOf(key);

            if (key === "key_id") {
                params.push(options.key_id);
                where += " and key_id = $" + (keyIndex + 1);
            }
        }

        const conditions: any = {
            limit: limit,
            offset: offset,
            orderBy
        }

        conditions.where = where;
        conditions.params = params;
        const items = await db.list("eiai_payment", conditions);
        const total = ~~await db.count("eiai_payment", conditions);

        return { items, total, limit, offset };
    }
}