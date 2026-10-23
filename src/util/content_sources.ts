// Content blocks a caller sends in Bedrock's own shape are passed on as sent. Their sources must be inline.
import { withAnthropicType } from './anthropic_error';

export const S3_LOCATION_NOT_ACCEPTED = 's3Location sources are not accepted; send the content inline.';

// True when the block, or any block nested in it (such as toolResult content), has a source with s3Location.
export function hasS3LocationSource(block: unknown): boolean {
    const pending: unknown[] = [block];
    while (pending.length > 0) {
        const value: any = pending.pop();
        if (!value || typeof value !== 'object') {
            continue;
        }
        const source = value.source;
        if (source && typeof source === 'object' && Object.prototype.hasOwnProperty.call(source, 's3Location')) {
            return true;
        }
        for (const child of Object.values(value)) {
            if (child && typeof child === 'object') {
                pending.push(child);
            }
        }
    }
    return false;
}

// Throws a 400 (invalid_request_error on /v1/messages) for a block with an s3Location source.
export function assertInlineSources(block: unknown): void {
    if (hasS3LocationSource(block)) {
        throw withAnthropicType(Object.assign(new Error(S3_LOCATION_NOT_ACCEPTED), { statusCode: 400 }), 'invalid_request_error');
    }
}
