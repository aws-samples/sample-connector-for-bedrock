import * as lark from '@larksuiteoapi/node-sdk';
import { receive } from './Feishu';

type Entry = { fingerprint: string; ws: lark.WSClient };

// One WebSocket client per Feishu connector, keyed by connector name.
const clients = new Map<string, Entry>();

const logError = (what: string, name: string, error: any) =>
  console.error(`${what} for ${name}:`, error?.message, error?.response?.status);

const closeClient = (name: string, entry: Entry) => {
  try {
    entry.ws.close({ force: true });
  } catch (error: any) {
    logError('Failed to close Feishu client', name, error);
  }
};

const resolveConfig = (connector: any) => {
  const { appId, appSecret, encryptKey } = connector.config || {};
  return {
    appId: process.env.FEISHU_APP_ID || appId,
    appSecret: process.env.FEISHU_APP_SECRET || appSecret,
    encryptKey,
  };
};

const startClient = (name: string, cfg: ReturnType<typeof resolveConfig>): lark.WSClient => {
  const baseConfig = { appId: cfg.appId, appSecret: cfg.appSecret };
  const ws = new lark.WSClient(baseConfig);
  const client = new lark.Client(baseConfig);
  const eventDispatcher = new lark.EventDispatcher({}).register({
    'im.message.receive_v1': async (data) => {
      try {
        await receive(client, data, name);
      } catch (error: any) {
        console.error(`Error processing message for ${name}:`, error?.message, error?.response?.status);
      }
    },
  });
  Promise.resolve(ws.start({ eventDispatcher })).catch((error: any) => logError('Feishu client stopped', name, error));
  return ws;
};

// Brings the running clients in line with the connector list. Never throws.
export async function syncFeishuClients(connectors: any[]): Promise<void> {
  const wanted = new Set<string>();
  for (const connector of connectors) {
    const name = connector?.name;
    try {
      wanted.add(name);
      const cfg = resolveConfig(connector);
      const fingerprint = JSON.stringify([cfg.appId, cfg.appSecret, cfg.encryptKey]);
      const current = clients.get(name);
      if (current && current.fingerprint === fingerprint) continue;
      if (current) {
        closeClient(name, current);
        clients.delete(name);
      }
      console.log(`Feishu bot [${name}] connected...`);
      clients.set(name, { fingerprint, ws: startClient(name, cfg) });
    } catch (error: any) {
      logError('Failed to start Feishu client', name, error);
    }
  }
  for (const [name, entry] of [...clients]) {
    if (wanted.has(name)) continue;
    closeClient(name, entry);
    clients.delete(name);
  }
}

export function closeAllFeishuClients(): void {
  for (const [name, entry] of clients) closeClient(name, entry);
  clients.clear();
}
