
import DB from './postgres';
import config from '../config';
import logger from './logger';

const cache = {
  models: [],
  api_keys: [],
  connectors: [],
  run: (): Promise<boolean> | null => {
    let db: any;
    if (config.pgsql.host && config.pgsql.database) {
      db = DB.build(config.pgsql);
    }
    if (!db) {
      return null;
    }

    logger.defaultMeta.path = "global";
    logger.info("Loading models and api keys data to cache.");

    // Resolves true/false and never rejects, so the first call can be awaited safely.
    function load(): Promise<boolean> {
      return cache.loadData(db).then(res => {
        logger.defaultMeta.path = "global";
        logger.info("The cache has been flushed.")
        return true;
      }).catch((err) => {
        logger.defaultMeta.path = "global";
        logger.error("err", err?.message);
        return false;
      });
    }
    const first = load();
    setInterval(load, 60000);
    return first;
  },
  loadData: async (db: any) => {

    cache.api_keys = await db.list("eiai_key", { limit: 2000 });
    cache.models = await db.list("eiai_model", { limit: 2000 });
    cache.connectors = await db.list("eiai_bot_connector", { limit: 2000 });
    // console.log(cache.models);
    return true;
  },
  // Copies the fee columns of a key row, as the charge returned it, to the cached key.
  updateKeyFee: (row: any) => {
    for (let item of cache.api_keys) {
      if (item.id === row.id) {
        for (const col of ["total_fee", "month_fee", "balance", "updated_at"]) {
          if (col in row) {
            item[col] = row[col];
          }
        }
        break;
      }
    }
  }
}

export default cache;