import { describe, expect, it } from 'vitest';
import {
    INPUT_AREA_DEFAULT_HEIGHT,
    INPUT_AREA_GAP,
    INPUT_ATTACHMENT_ROW_HEIGHT,
    INPUT_AREA_MAX_HEIGHT,
    INPUT_AREA_MIN_HEIGHT,
    INPUT_TEXTAREA_MIN_HEIGHT,
    clampInputHeight,
    inputAreaHeight,
} from '../claude-code-web/web_client/src/utils/inputHeight.js';

describe('clampInputHeight', () => {
    it('leaves room for padding, model row, gap and the 90px textarea', () => {
        expect(INPUT_AREA_MIN_HEIGHT).toBeGreaterThan(INPUT_TEXTAREA_MIN_HEIGHT + 40 + 28 + 8);
        expect(INPUT_AREA_DEFAULT_HEIGHT).toBeGreaterThanOrEqual(INPUT_AREA_MIN_HEIGHT);
    });
    it('raises too-small heights to the minimum and caps at 400', () => {
        expect(clampInputHeight(60)).toBe(INPUT_AREA_MIN_HEIGHT);
        expect(clampInputHeight(120)).toBe(INPUT_AREA_MIN_HEIGHT);
        expect(clampInputHeight(250)).toBe(250);
        expect(clampInputHeight(900)).toBe(INPUT_AREA_MAX_HEIGHT);
    });
    it('rejects non-finite values', () => {
        expect(clampInputHeight(NaN)).toBeNull();
        expect(clampInputHeight(Infinity)).toBeNull();
    });
});

describe('inputAreaHeight', () => {
    it('adds the attachment row and one gap while the row is shown', () => {
        expect(inputAreaHeight(200, false)).toBe(200);
        expect(inputAreaHeight(200, true)).toBe(200 + INPUT_ATTACHMENT_ROW_HEIGHT + INPUT_AREA_GAP);
    });
    it('leaves room for the 48px thumbnails', () => {
        expect(INPUT_ATTACHMENT_ROW_HEIGHT).toBeGreaterThanOrEqual(48);
    });
});
