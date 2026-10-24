import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import net from 'net';
import config from '../src/config';
import helper from '../src/util/helper';

let server: net.Server;
let port = 0;
let connections = 0;
let received: string[] = [];

beforeAll(async () => {
    server = net.createServer((socket) => {
        connections++;
        let inData = false;
        let buf = '';
        socket.write('220 fake ESMTP\r\n');
        socket.on('data', (chunk) => {
            const text = chunk.toString();
            received.push(text);
            buf += text;
            if (inData) {
                if (buf.includes('\r\n.\r\n')) {
                    inData = false;
                    buf = '';
                    socket.write('250 queued\r\n');
                }
                return;
            }
            const lines = buf.split('\r\n');
            buf = lines.pop() || '';
            for (const line of lines) {
                const cmd = line.toUpperCase();
                if (cmd.startsWith('EHLO') || cmd.startsWith('HELO')) socket.write('250-x\r\n250 AUTH PLAIN LOGIN\r\n');
                else if (cmd.startsWith('AUTH')) socket.write('235 ok\r\n');
                else if (cmd.startsWith('MAIL') || cmd.startsWith('RCPT')) socket.write('250 ok\r\n');
                else if (cmd === 'DATA') { inData = true; socket.write('354 go\r\n'); buf = lines.join('\r\n') + buf; break; }
                else if (cmd.startsWith('QUIT')) { socket.write('221 bye\r\n'); socket.end(); }
            }
        });
        socket.on('error', () => { });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as net.AddressInfo).port;
});

afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
    connections = 0;
    received = [];
});

describe('sendMailApiKey', () => {
    it('mails the new key through the configured SMTP server', async () => {
        config.smpt = { host: '127.0.0.1', port: String(port), user: 'u', pass: 'p', from: 'brc@example.com' } as any;
        await helper.sendMailApiKey('alice@example.com', 'br-KEYMARKER');
        expect(received.join('')).toContain('RCPT TO:<alice@example.com>');
        expect(received.join('')).toContain('br-KEYMARKER');
    });

    it('sends nothing when no SMTP host is configured', async () => {
        config.smpt = { host: '' } as any;
        await helper.sendMailApiKey('alice@example.com', 'br-KEYMARKER');
        expect(connections).toBe(0);
    });
});
