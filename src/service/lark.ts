const LARK_TABLE_NAME = "eiai_bot_connector"
export default {
  loadById: async (db: any, id: number) => {
    return await db.loadById(LARK_TABLE_NAME, ~~id);
  },
  loadByName: async (db: any, name: string) => {
    return await db.loadByKV(LARK_TABLE_NAME, name);
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

    if (options.provider) {
      keys.push("provider");
    }

    const conditions: any = {
      // cols: "id, name, multiple, provider, config, created_at, updated_at",
      limit: limit,
      offset: offset,
      orderBy: "id desc"
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
    const items = await db.list(LARK_TABLE_NAME, conditions);
    const total = ~~await db.count(LARK_TABLE_NAME, conditions);

    return {items, total, limit, offset};
  },

  create: async (db: any, data: any) => {
    const {name} = data;
    const existsEntity = await db.loadByKV(LARK_TABLE_NAME, "name", name);
    if (existsEntity) {
      throw new Error(name + " already exists");
    }
    return await db.insert(LARK_TABLE_NAME, data, ["id", "name"]);

  },

  async update(db: any, data: any) {
    const {id, name} = data;
    if (!id) {
      throw new Error("id is required");
    }
    if (name) {
      const existsEntity = await db.load(LARK_TABLE_NAME, {
        where: "name=$1 and id<>$2",
        params: [name, id]
      });
      if (existsEntity) {
        throw new Error(name + " already exists");
      }
    }
    data.updated_at = new Date();
    return await db.update(LARK_TABLE_NAME, data, ["id", "name", "config", "updated_at"]);
  },

  async delete(db: any, data: any) {
    const {id} = data;
    if (!id) {
      throw new Error("id is required");
    }
    await db.delete(LARK_TABLE_NAME, id);
    return true;
  },


}
