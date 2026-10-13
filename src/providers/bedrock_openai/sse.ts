import { OpenAIUsage } from './types';

export interface RelayResult {
    usage: OpenAIUsage | null;
    text: string;
    sawDone: boolean;
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

// Relays a Chat Completions SSE stream to the client one event at a time and collects what the caller
// needs to bill and log the call. It never throws: if the source or write fails, it returns what it
// has so far with error set, and stops reading the source.
export async function relayChatStream(
    source: AsyncIterable<Uint8Array | string>,
    write: (event: string) => void,
    opts: { forwardUsageChunk: boolean },
): Promise<RelayResult> {
    const result: RelayResult = { usage: null, text: '', sawDone: false };

    const relayEvent = (raw: string) => {
        // Runs of blank lines between events carry nothing, so they are not relayed.
        const event = raw.replace(/^\n+|\n+$/g, '');
        if (!event) {
            return;
        }
        const data = eventData(event);
        let forward = true;
        if (data === '[DONE]') {
            result.sawDone = true;
        } else {
            const chunk = parseJson(data);
            const usage = chunk?.usage;
            if (usage) {
                result.usage = usage;
                // Streams always ask Bedrock for usage, so a client that did not ask must not see its chunk.
                if (!opts.forwardUsageChunk && Array.isArray(chunk.choices) && chunk.choices.length === 0) {
                    forward = false;
                }
            }
            const content = chunk?.choices?.[0]?.delta?.content;
            if (typeof content === 'string') {
                result.text += content;
            }
        }
        if (forward) {
            write(event + '\n\n');
        }
    };

    const decoder = new TextDecoder();
    let buffer = '';
    try {
        for await (const chunk of source) {
            buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
            // A CRLF can be cut between two chunks, so the whole buffer is normalized, not each chunk.
            buffer = buffer.replace(/\r\n/g, '\n');
            const events = buffer.split('\n\n');
            buffer = events.pop();
            events.forEach(relayEvent);
        }
        relayEvent(buffer);
    } catch (error) {
        // The unfinished event in the buffer is dropped, because half an event would corrupt whatever the
        // caller writes next.
        result.error = error;
    }
    return result;
}
