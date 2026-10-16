import { AnthropicUsage, mergeAnthropicUsage } from './usage';

export const PING_EVENT = 'event: ping\ndata: {"type": "ping"}\n\n';

const DEFAULT_PING_INTERVAL_MS = 15000;

export interface AnthropicRelayResult {
    usage: AnthropicUsage | null;
    text: string;
    toolUses: { type: 'tool_use'; name: string; input: any }[];
    sawMessageStop: boolean;
    wroteAny: boolean;
    error?: unknown;
}

// The data of an SSE event: its data: lines without the prefix and one optional space, joined by newlines.
function eventData(event: string): string {
    return event
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n');
}

function parseJson(text: string): any {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

// Relays an Anthropic Messages SSE stream to the client one event at a time and collects what the caller
// needs to bill and log the call. Each complete event is written verbatim, including an upstream error
// event, which simply leaves sawMessageStop false. Bedrock sends no ping, so once the first event has been
// relayed, PING_EVENT is written every pingIntervalMs of upstream silence to keep the client connection
// alive during long thinking or tool-input pauses. It never throws: if the source or a write (a ping
// included) fails, it stops reading and returns what it has with error set. The ping timer is cleared on
// every exit path, so nothing is written after it returns. A half-received event is never written.
export async function relayAnthropicStream(
    source: AsyncIterable<Uint8Array | string>,
    write: (event: string) => void,
    opts: { pingIntervalMs?: number } = {},
): Promise<AnthropicRelayResult> {
    const pingIntervalMs = opts.pingIntervalMs ?? DEFAULT_PING_INTERVAL_MS;
    const result: AnthropicRelayResult = { usage: null, text: '', toolUses: [], sawMessageStop: false, wroteAny: false };
    let startUsage: AnthropicUsage | null = null;
    let deltaUsage: AnthropicUsage | null = null;
    // Tool calls that are open, by content block index.
    const openTools = new Map<number, { name: string; json: string }>();

    const send = (text: string) => {
        write(text);
        result.wroteAny = true;
    };

    const collect = (event: string) => {
        const data = parseJson(eventData(event));
        if (!data) {
            return;
        }
        switch (data.type) {
            case 'message_start':
                startUsage = data.message?.usage ?? null;
                result.usage = mergeAnthropicUsage(startUsage, deltaUsage);
                break;
            case 'message_delta':
                if (data.usage) {
                    // Merged one after the other, so a later delta overrides an earlier one.
                    deltaUsage = mergeAnthropicUsage(deltaUsage, data.usage);
                    result.usage = mergeAnthropicUsage(startUsage, deltaUsage);
                }
                break;
            case 'message_stop':
                result.sawMessageStop = true;
                break;
            case 'content_block_start':
                if (data.content_block?.type === 'tool_use') {
                    openTools.set(data.index, { name: data.content_block.name, json: '' });
                }
                break;
            case 'content_block_delta':
                if (data.delta?.type === 'text_delta' && typeof data.delta.text === 'string') {
                    result.text += data.delta.text;
                } else if (data.delta?.type === 'input_json_delta' && typeof data.delta.partial_json === 'string') {
                    const tool = openTools.get(data.index);
                    if (tool) {
                        tool.json += data.delta.partial_json;
                    }
                }
                break;
            case 'content_block_stop': {
                const tool = openTools.get(data.index);
                if (tool) {
                    openTools.delete(data.index);
                    // Input that is not valid JSON is kept as the raw string; no input at all means {}.
                    const input = tool.json === '' ? {} : (parseJson(tool.json) ?? tool.json);
                    result.toolUses.push({ type: 'tool_use', name: tool.name, input });
                }
                break;
            }
        }
    };

    const relayEvent = (raw: string) => {
        // Runs of blank lines between events carry nothing, so they are not relayed.
        const event = raw.replace(/^\n+|\n+$/g, '');
        if (!event) {
            return;
        }
        send(event + '\n\n');
        collect(event);
    };

    // A failed ping write ends the relay at once, even while the source is still silent. It rejects the read in
    // progress; each read has its own promise, so nothing long-lived collects a reaction per chunk.
    let failPing: (error: unknown) => void = () => {};

    let timer: ReturnType<typeof setTimeout> | undefined;
    let done = false;
    const stopTimer = () => {
        if (timer !== undefined) {
            clearTimeout(timer);
            timer = undefined;
        }
    };
    // Restarts the idle clock. It does nothing until the first event has been relayed.
    const armTimer = () => {
        stopTimer();
        if (done || !result.wroteAny) {
            return;
        }
        timer = setTimeout(() => {
            timer = undefined;
            if (done) {
                return;
            }
            try {
                send(PING_EVENT);
            } catch (error) {
                done = true;
                failPing(error);
                return;
            }
            armTimer();
        }, pingIntervalMs);
    };

    const decoder = new TextDecoder();
    let buffer = '';
    const iterator = source[Symbol.asyncIterator]();
    let finished = false;
    try {
        for (;;) {
            const step: IteratorResult<any> = await new Promise((resolve, reject) => {
                failPing = reject;
                iterator.next().then(resolve, reject);
            });
            failPing = () => {};
            if (step.done) {
                finished = true;
                break;
            }
            const chunk = step.value;
            buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
            // A CRLF can be cut between two chunks, so the whole buffer is normalized, not each chunk.
            buffer = buffer.replace(/\r\n/g, '\n');
            const events = buffer.split('\n\n');
            buffer = events.pop();
            events.forEach(relayEvent);
            armTimer();
        }
        // A tail without the closing blank line is relayed only when its data is complete JSON; a cut-off
        // event is dropped.
        const tail = buffer.replace(/^\n+|\n+$/g, '');
        if (tail && parseJson(eventData(tail))) {
            relayEvent(tail);
        }
    } catch (error) {
        // Any unfinished event in the buffer is dropped, because half an event would corrupt whatever the
        // caller writes next.
        result.error = error;
    } finally {
        done = true;
        stopTimer();
        if (!finished) {
            // Stop reading the source. It may be mid-await, so this is not waited for.
            Promise.resolve(iterator.return?.()).catch(() => {});
        }
    }
    return result;
}
