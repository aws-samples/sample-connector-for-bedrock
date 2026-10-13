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
// after [DONE], or right after the finish and usage chunks, ends a complete stream normally; in the second
// case the client gets the [DONE] it missed.
export async function relayChatStream(
    source: AsyncIterable<Uint8Array | string>,
    write: (event: string) => void,
    opts: { forwardUsageChunk: boolean },
): Promise<RelayResult> {
    const result: RelayResult = { usage: null, text: '', sawDone: false };
    let writeFailed = false;
    let sawFinish = false;
    // True while the last data chunk relayed is the usage-only chunk, which comes after the finish chunk.
    let endsWithUsage = false;

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
            const usageOnly = !!usage && Array.isArray(chunk.choices) && chunk.choices.length === 0;
            if (chunk) {
                endsWithUsage = usageOnly;
            }
            if (Array.isArray(chunk?.choices) && chunk.choices.some((choice: any) => choice?.finish_reason != null)) {
                sawFinish = true;
            }
            if (usage) {
                result.usage = usage;
                // Streams always ask Bedrock for usage, so a client that did not ask must not see its chunk.
                if (usageOnly && !opts.forwardUsageChunk) {
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
        // Bedrock answers with connection: close and often resets the socket at the very end of a stream:
        // after [DONE], inside it, or between the usage chunk and [DONE]. Streams always ask for usage, so
        // a stream whose finish chunk was followed by the usage-only chunk as its last data chunk is
        // complete: the client gets the [DONE] it missed and no error is reported.
        let failure = error;
        const doneCutOff = eventData(buffer.replace(/^\n+|\n+$/g, '')) === '[DONE]';
        if (!writeFailed && !result.sawDone && (doneCutOff || (sawFinish && endsWithUsage))) {
            try {
                relayEvent('data: [DONE]');
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
