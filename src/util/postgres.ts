
import { Pool } from 'pg';

export default class PGClient {
  pool: any = null;
  debug: boolean = false;


  public static async build(config: any): Promise<PGClient | null> {
    try {
      const pGClient = new PGClient();
      const client = new Pool({
        host: config.host,
        port: config.port ? ~~config.port : 5432,
        database: config.database,
        user: config.user,
        password: config.password,
        max: config.max || 20,
        idleTimeoutMillis: config.idleTimeoutMillis || 30000,
        connectionTimeoutMillis: config.connectionTimeoutMillis || 2000,
      });
      pGClient.debug = config.debugMode;
      pGClient.pool = client;
      return pGClient;
    } catch (err: any) {
      console.error("❌ Postgres connection error: ", err.message);
    }
    return null;
  }

  public async query(sql: string, params: any): Promise<any[]> {
    if (!this.pool) {
      return []
    }
    if (this.debug) {
      console.log("------------", new Date(), "----------------------------");
      console.log("sql: ", sql);
      console.log("params: ", params);
      console.log("----------------------------------------");
    }
    const result = await this.pool.query(sql, params);

    return result.rows;
  }

  public async load(table: string, conditions: any): Promise<any> {
    conditions = conditions || {};
    conditions.where = conditions.where || "1=1";
    conditions.limit = 1;
    conditions.cols = conditions.cols || '*';
    if (conditions.orderBy) {
      conditions.orderBy = 'order by ' + conditions.orderBy;
    } else {
      conditions.orderBy = '';
    }

    // table = "'" + table + "'";
    var sql = `select ${conditions.cols} from ${table} where ${conditions.where} ${conditions.orderBy} limit ${conditions.limit}`;
    var rows = await this.query(sql, conditions.params);
    if (rows.length > 0) {
      return rows[0];
    }
    return null;
  }


  public loadByKV(table: string, key: string, value: any) {
    return this.load(table, {
      where: key + " = $1",
      params: [value]
    });
  }

  public loadById(table: string, id: any) {
    return this.loadByKV(table, "id", id);
  }

  public async insert(table: string, data: any, returning?: string[]): Promise<any> {
    const keys = Object.keys(data);

    returning = returning || ["id"];

    let placeholders = [];
    let params = [];

    for (const keyIndex in keys) {
      const mIndex = ~~keyIndex;
      placeholders.push(`$${(mIndex + 1)}`);
      params.push(data[keys[mIndex]]);
    }

    const sql = `INSERT into ${table} (${keys.join(", ")}) values (${placeholders.join(", ")}) RETURNING ${returning.join(",")}`;

    const result = await this.query(sql, params);
    return result[0];
  }

  public async update(table: string, data: any, returning?: string[]): Promise<any> {
    if (!data.id) {
      throw new Error("The updated data must include the id.");
    }

    returning = returning || ["id"];
    const keys = Object.keys(data);
    const idIndex = keys.indexOf("id");
    // delete keys[idIndex];
    keys.splice(idIndex, 1);

    let placeholders = [];
    let params = [];

    for (const keyIndex in keys) {
      const mIndex = ~~keyIndex;
      placeholders.push(`$${(mIndex + 1)}`);
      params.push(data[keys[mIndex]]);
    }

    const sql = keys.length > 1 ?
      `UPDATE ${table} SET (${keys.join(", ")}) = (${placeholders.join(", ")}) WHERE id=${data.id} RETURNING ${returning.join(",")}` :
      `UPDATE ${table} SET ${keys.join(", ")} = ${placeholders.join(", ")} WHERE id=${data.id} RETURNING ${returning.join(",")}`;

    const result = await this.query(sql, params);
    return result[0];

  }

  public save(table: string, data: any, returning?: string[]): Promise<any> {
    if (data.id) {
      return this.update(table, data, returning);
    } else {
      return this.insert(table, data, returning);
    }
  }

  public list(table: string, conditions: any): Promise<any> {
    conditions = conditions || {};
    if (!conditions.cols) {
      conditions.cols = '*';
    }
    if (!conditions.offset) {
      conditions.offset = 0;
    }
    if (!conditions.limit) {
      conditions.limit = 5;
    }
    if (!conditions.where) {
      conditions.where = "1=1"
    }
    if (conditions.orderBy) {
      conditions.orderBy = 'order by ' + conditions.orderBy;
    } else {
      conditions.orderBy = '';
    }
    // table = "`" + table + "`";
    var sql = `select ${conditions.cols} from ${table} where ${conditions.where} ${conditions.orderBy} limit ${conditions.limit} offset ${conditions.offset}`;
    return this.query(sql, conditions.params);
  }

  public async count(table: string, conditions: any): Promise<number> {
    conditions = conditions || {};
    conditions.where = conditions.where || "1=1";
    // table = "`" + table + "`";
    var sql = `select count(*) as ct from ${table} where ${conditions.where} `;
    var rows = await this.query(sql, conditions.params);
    if (rows.length > 0) {
      return rows[0].ct;
    }
    return 0;

  }

  public async sum(table: string, col: string, conditions: any): Promise<number> {
    conditions = conditions || {};
    conditions.where = conditions.where || "1=1";
    var sql = `select sum(${col}) as ct from ${table} where ${conditions.where} `;
    var rows = await this.query(sql, conditions.params);
    if (rows.length > 0) {
      return rows[0].ct;
    }
    return 0;
  }

}

