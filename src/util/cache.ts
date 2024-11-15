
import DB from './postgres';
import config from '../config';

const cache = {
  models: [],
  api_keys: [],
  connectors: [],
  run: () => {
    let db: any;
    if (config.pgsql.host && config.pgsql.database) {
      db = DB.build(config.pgsql);
    }
    if (!db) {
      return false;
    }
    cache.loadData(db);
    setInterval(() => {
      cache.loadData(db).then(res => {
        // console.log("cache flushed...", res)
      }, (err) => {
        console.log("err", err);
      });
    }, 60000);
  },
  loadData: async (db: any) => {
    cache.api_keys = await db.list("eiai_key", { limit: 2000 });
    cache.models = await db.list("eiai_model", { limit: 2000 });
    cache.connectors = await db.list("eiai_bot_connector", { limit: 2000 });
    // console.log(cache.models);
    return true;
  },
}

export default cache;