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
// needs to bill and log the call. It never throws: if the source or a write fails before [DONE] has been
// relayed, it returns what it has so far with error set, and stops reading the source. A source failure
// after [DONE] has been relayed ends the stream normally.
export async function relayChatStream(
    source: AsyncIterable<Uint8Array | string>,
    write: (event: string) => void,
    opts: { forwardUsageChunk: boolean },
): Promise<RelayResult> {
    const result: RelayResult = { usage: null, text: '', sawDone: false };
    let writeFailed = false;

    const relayEvent = (raw: string) => {
        // Runs of blank lines between events carry nothing, so they are not relayed.
        const event = raw.replace(/^\n+|\n+$/g, '');
        if (!event) {
            return;
        }
        const data = eventData(event);
        const isDone = data === '[DONE]';
        let forward = true;
        if (!isDone) {
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
            try {
                write(event + '\n\n');
            } catch (error) {
                writeFailed = true;
                throw error;
            }
        }
        // Set only once [DONE] has reached the client, so a failed write of it is still an error.
        if (isDone) {
            result.sawDone = true;
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
        // Bedrock answers with connection: close and often resets the socket right after [DONE], so a
        // source failure once [DONE] has been relayed ends a complete stream and is not an error. A [DONE]
        // the reset cut off before its blank line is relayed first.
        let failure = error;
        if (!writeFailed && !result.sawDone && eventData(buffer.replace(/^\n+|\n+$/g, '')) === '[DONE]') {
            try {
                relayEvent(buffer);
            } catch (writeError) {
                failure = writeError;
            }
        }
        if (!result.sawDone) {
            // Any other unfinished event in the buffer is dropped, because half an event would corrupt
            // whatever the caller writes next.
            result.error = failure;
        }
    }
    return result;
}
