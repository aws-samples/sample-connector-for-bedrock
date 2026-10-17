import { describe, it, expect, vi } from 'vitest';
import { regionsOf, stickyIndex } from '../src/providers/bedrock_anthropic/sticky';

describe('bedrock anthropic sticky selection', () => {
    it('stickyIndex is stable per seed and moves on with the attempt', () => {
        const seed = '0f36b242-09a8-467b-b844-8c64bbca7dad';
        const a = stickyIndex(seed, 0, 3);
        expect(stickyIndex(seed, 0, 3)).toBe(a);
        expect(stickyIndex(seed, 1, 3)).toBe((a + 1) % 3);
        expect(stickyIndex('s', 5, 1)).toBe(0);
    });

    it('stickyIndex picks at random without a seed', () => {
        const random = vi.spyOn(Math, 'random').mockReturnValue(0.75);
        expect(stickyIndex(undefined, 0, 4)).toBe(3);
        random.mockRestore();
    });

    it('regionsOf normalises strings, arrays and absence', () => {
        expect(regionsOf('us-east-1, us-west-2')).toEqual(['us-east-1', 'us-west-2']);
        expect(regionsOf(['eu-west-1'])).toEqual(['eu-west-1']);
        expect(regionsOf(undefined)).toHaveLength(1);
    });
});
