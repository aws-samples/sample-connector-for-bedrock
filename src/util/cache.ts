
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

    console.log("Loading models and api keys data to cache.");
    cache.loadData(db);
    setInterval(() => {
      cache.loadData(db).then(res => {
        console.log("The cache has been flushed.")
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
  updateKeyFee: (id: number, month_fee: number) => {
    for (let item of cache.api_keys) {
      if (item.id === id) {
        item.month_fee = month_fee;
        break;
      }
    }
  }
}

export default cache;