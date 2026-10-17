import config from "../../config";

// 32-bit FNV-1a over the UTF-8 bytes of the text.
function fnv1a32(text: string): number {
    let hash = 0x811c9dc5;
    for (const byte of Buffer.from(text, 'utf8')) {
        hash ^= byte;
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
}

// The regions a model may use, as a list. A comma string or an array is accepted, as in
// helper.selectRandomRegion; when none is set, the gateway's own region applies.
export function regionsOf(regions: unknown): string[] {
    const list = typeof regions === 'string' ? regions.split(',') : Array.isArray(regions) ? regions : [];
    const names = list.map((region) => String(region).trim()).filter(Boolean);
    return names.length > 0 ? names : [config.bedrock.region || 'us-east-1'];
}

// Which of count choices a call should use. The same seed (a session id) always starts at the same one, and
// each retry attempt moves on to the next. Without a seed the pick is random.
export function stickyIndex(seed: string | undefined, attempt: number, count: number): number {
    if (count <= 1) {
        return 0;
    }
    if (!seed) {
        return Math.floor(Math.random() * count);
    }
    return (fnv1a32(seed) + attempt) % count;
}
