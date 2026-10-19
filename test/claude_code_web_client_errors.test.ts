import { describe, expect, it } from 'vitest';
import { responseError } from '../claude-code-web/web_client/src/utils/responseError.js';

const res = (status: number, statusText = '') => ({ status, statusText });

describe('responseError', () => {
    it('uses the BFF detail as the message and keeps the status', () => {
        const body = JSON.stringify({ error: 'this key has no bedrock-runtime-anthropic model', detail: 'this key has no bedrock-runtime-anthropic model' });
        const e = responseError(res(403, 'Forbidden'), body, 'Invocation failed: /health');
        expect(e).toBeInstanceOf(Error);
        expect(e.message).toBe('this key has no bedrock-runtime-anthropic model');
        expect(e.status).toBe(403);
        expect(e.statusText).toBe('Forbidden');
        expect(e.detail).toBe('this key has no bedrock-runtime-anthropic model');
    });

    it('uses a FastAPI detail or a message field', () => {
        expect(responseError(res(404), '{"detail":"Session not found"}', 'fallback').message).toBe('Session not found');
        expect(responseError(res(500), '{"message":"boom"}', 'fallback').message).toBe('boom');
    });

    it('falls back when the body is not JSON or has no usable text', () => {
        const plain = responseError(res(502, 'Bad Gateway'), '<html>bad gateway</html>', 'Invocation failed: /health');
        expect(plain.message).toBe('Invocation failed: /health');
        expect(plain.status).toBe(502);
        expect(plain.detail).toBeUndefined();

        const validation = [{ loc: ['body', 'x'], msg: 'field required' }];
        const v = responseError(res(422), JSON.stringify({ detail: validation }), 'Invocation failed: /sessions');
        expect(v.message).toBe('Invocation failed: /sessions');
        expect(v.detail).toEqual(validation);

        expect(responseError(res(500), '', 'fallback').message).toBe('fallback');
    });
});
