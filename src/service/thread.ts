export default {

    detail: async (db: any, options: any) => {
        const id = options.id;
        if (!id) {
            throw new Error("id is required");
        }
        const thread = await db.loadById("eiai_thread", ~~id);

        if (options.key_id) {
            if (thread.key_id != options.key_id) {
                throw new Error("Unauthorized: not your thread.");
            }
        }
        return thread;
    },
    list: async (db: any, options: any) => {

        const limit = ~~(options.limit) || 20;
        const offset = ~~(options.offset) || 0;

        let where = "1=1";
        let params = [];
        let orderBy = "id desc";

        let keys = [];
        if (options.session_id) {
            keys.push("session_id");
        }
        if (options.key_id) {
            keys.push("key_id");
        }
        if (options.q) {
            keys.push("q");
        }


        for (const key of keys) {
            const keyIndex = keys.indexOf(key);

            if (key === "session_id") {
                params.push(options.session_id);
                where += " and session_id = $" + (keyIndex + 1);
                orderBy = "id asc";
            } else if (key === "key_id") {
                params.push(options.key_id);
                where += " and key_id = $" + (keyIndex + 1);
            } else if (key === "q") {
                params.push(`%${options.q}%`);
                where += ` and (prompt like $${keyIndex + 1} or completion like  $${keyIndex + 1})`;
            }
        }

        const conditions: any = {
            cols: "id,prompt,completion,session_id,tokens_in,tokens_out,fee",
            limit: limit,
            offset: offset,
            orderBy
        }

        conditions.where = where;
        conditions.params = params;
        const items = await db.list("eiai_thread", conditions);
        const total = await db.count("eiai_thread", conditions);

        return { items, total, limit, offset };
    }

}