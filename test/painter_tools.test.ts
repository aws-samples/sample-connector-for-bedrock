import { describe, expect, it } from 'vitest';
import {
    PAINT_TOOLS, PaintStepError, PaintToolName, TEXT_TO_IMAGE_MODELS, chatTools, finishReasonMessage, imagePrice, invokeRegion, parseToolArgs,
} from '../src/providers/painter_tools';

const ULTRA = 'stability.stable-image-ultra-v1:1';
const CORE = 'stability.stable-image-core-v1:1';
const SD35 = 'stability.sd3-5-large-v1:0';

// Parses the arguments as the provider does and builds the Bedrock body for the model the tool picks.
function request(name: PaintToolName, args: object, paintModelId = ULTRA, pictures: Record<string, string> = {}) {
    const tool = PAINT_TOOLS[name];
    const modelId = tool.modelId(paintModelId);
    return { modelId, body: tool.body(parseToolArgs(tool, JSON.stringify(args)), pictures, modelId) };
}

describe('painter tool bodies', () => {
    it('txt2img sends the prompt, the ratio and a jpeg format, with no size and no mode', () => {
        expect(request('txt2img', { prompt: 'a cat', negative_prompt: 'nsfw', aspect_ratio: '16:9' }, CORE))
            .toEqual({ modelId: CORE, body: { prompt: 'a cat', negative_prompt: 'nsfw', aspect_ratio: '16:9', output_format: 'jpeg' } });
        expect(request('txt2img', { prompt: 'a cat' }).body).toEqual({ prompt: 'a cat', aspect_ratio: '1:1', output_format: 'jpeg' });
    });

    it('img2img gives SD3.5 a mode and Ultra none, and sends Core to SD3.5', () => {
        const args = { prompt: 'autumn', image_ref: 'image_1', strength: 0.5 };
        expect(request('img2img', args, ULTRA, { image: 'B64' })).toEqual({ modelId: ULTRA, body: { prompt: 'autumn', strength: 0.5, image: 'B64', output_format: 'jpeg' } });
        expect(request('img2img', args, SD35, { image: 'B64' }).body).toEqual({ prompt: 'autumn', strength: 0.5, image: 'B64', mode: 'image-to-image', output_format: 'jpeg' });
        const core = request('img2img', args, CORE, { image: 'B64' });
        expect(core.modelId).toBe(SD35);
        expect(core.body).toHaveProperty('mode', 'image-to-image');
    });

    it('search_replace sends both prompts and the picture', () => {
        expect(request('search_replace', { prompt: 'a bus', search_prompt: 'the car', image_ref: 'image_1' }, ULTRA, { image: 'B64' })).toEqual({
            modelId: 'us.stability.stable-image-search-replace-v1:0',
            body: { prompt: 'a bus', search_prompt: 'the car', image: 'B64', output_format: 'jpeg' },
        });
    });

    it('remove_background sends the picture and png, and takes no prompt', () => {
        const { modelId, body } = request('remove_background', { image_ref: 'image_2', prompt: 'ignored' }, ULTRA, { image: 'B64' });
        expect(modelId).toBe('us.stability.stable-image-remove-background-v1:0');
        expect(body).toEqual({ image: 'B64', output_format: 'png' });
        expect(chatTools().find((t) => t.function.name === 'remove_background').function.parameters.properties).not.toHaveProperty('prompt');
    });

    it('style_guide leaves out the optional fields the model did not send', () => {
        expect(request('style_guide', { prompt: 'a lake', image_ref: 'image_1' }, ULTRA, { image: 'B64' }).body)
            .toEqual({ prompt: 'a lake', image: 'B64', output_format: 'jpeg' });
        expect(request('style_guide', { prompt: 'a lake', image_ref: 'image_1', fidelity: 0.8, aspect_ratio: '4:5', negative_prompt: 'nsfw' }, ULTRA, { image: 'B64' }))
            .toMatchObject({ modelId: 'us.stability.stable-image-style-guide-v1:0', body: { fidelity: 0.8, aspect_ratio: '4:5', negative_prompt: 'nsfw' } });
    });

    it('style_transfer fills init_image and style_image, and its model ID has no image segment', () => {
        const tool = PAINT_TOOLS.style_transfer;
        expect(tool.pictures).toEqual([{ arg: 'init_image_ref', field: 'init_image' }, { arg: 'style_image_ref', field: 'style_image' }]);
        expect(request('style_transfer', { init_image_ref: 'image_1', style_image_ref: 'image_2', style_strength: 0.4 }, ULTRA, { init_image: 'A', style_image: 'B' })).toEqual({
            modelId: 'us.stability.stable-style-transfer-v1:0',
            body: { style_strength: 0.4, init_image: 'A', style_image: 'B', output_format: 'jpeg' },
        });
    });

    it.each([
        ['control_structure', 'us.stability.stable-image-control-structure-v1:0'],
        ['control_sketch', 'us.stability.stable-image-control-sketch-v1:0'],
    ] as const)('%s sends the prompt, the picture and the control strength', (name, model) => {
        expect(request(name, { prompt: 'a castle', image_ref: 'image_1', control_strength: 0.9 }, ULTRA, { image: 'B64' }))
            .toEqual({ modelId: model, body: { prompt: 'a castle', control_strength: 0.9, image: 'B64', output_format: 'jpeg' } });
    });
});

describe('parseToolArgs', () => {
    const parse = (name: PaintToolName, args: object) => parseToolArgs(PAINT_TOOLS[name], JSON.stringify(args));

    it('clamps numbers to the field range', () => {
        expect(parse('img2img', { prompt: 'p', image_ref: 'image_1', strength: 7 })).toMatchObject({ strength: 1 });
        expect(parse('img2img', { prompt: 'p', image_ref: 'image_1', strength: -3 })).toMatchObject({ strength: 0 });
        expect(parse('style_transfer', { init_image_ref: 'a', style_image_ref: 'b', change_strength: 0 })).toMatchObject({ change_strength: 0.1 });
        expect(parse('style_transfer', { init_image_ref: 'a', style_image_ref: 'b', style_strength: '0.25' })).toMatchObject({ style_strength: 0.25 });
        expect(parse('control_sketch', { prompt: 'p', image_ref: 'a', control_strength: 2 })).toMatchObject({ control_strength: 1 });
        expect(parse('style_guide', { prompt: 'p', image_ref: 'a', fidelity: 1.5 })).toMatchObject({ fidelity: 1 });
    });

    it('replaces an aspect ratio outside the list with 1:1', () => {
        expect(parse('txt2img', { prompt: 'p', aspect_ratio: '7:3' })).toMatchObject({ aspect_ratio: '1:1' });
        expect(parse('txt2img', { prompt: 'p', aspect_ratio: '9:21' })).toMatchObject({ aspect_ratio: '9:21' });
    });

    it('throws a PaintStepError for bad JSON, a non-object and a missing required argument', () => {
        for (const raw of ['{not json', '[]', 'null', '"x"']) {
            expect(() => parseToolArgs(PAINT_TOOLS.txt2img, raw)).toThrow(PaintStepError);
        }
        expect(() => parse('txt2img', {})).toThrow(/prompt/);
        expect(() => parse('txt2img', { prompt: '   ' })).toThrow(PaintStepError);
        expect(() => parse('img2img', { prompt: 'p', image_ref: 'image_1' })).toThrow(/strength/);
        expect(() => parse('remove_background', {})).toThrow(/image_ref/);
        expect(() => parse('style_transfer', { init_image_ref: 'image_1' })).toThrow(/style_image_ref/);
    });

    it('treats empty arguments as an empty object', () => {
        expect(() => parseToolArgs(PAINT_TOOLS.txt2img, '')).toThrow(/prompt/);
        expect(parseToolArgs(PAINT_TOOLS.style_transfer, '{"init_image_ref":"a","style_image_ref":"b"}')).toEqual({ init_image_ref: 'a', style_image_ref: 'b' });
    });
});

describe('model choice', () => {
    it.each(['amazon.titan-image-generator-v2:0', 'my-model', ''])('refuses %j for text to image and image to image with the supported list', (id) => {
        for (const name of ['txt2img', 'img2img'] as const) {
            expect(() => PAINT_TOOLS[name].modelId(id)).toThrow(`Unsupported paintModelId ${id}. Use one of ${TEXT_TO_IMAGE_MODELS.join(', ')}.`);
        }
    });

    it('does not read paintModelId for the six fixed tools', () => {
        for (const name of ['search_replace', 'remove_background', 'style_guide', 'style_transfer', 'control_structure', 'control_sketch'] as const) {
            expect(PAINT_TOOLS[name].modelId('my-model')).toMatch(/^us\.stability\./);
        }
    });

    it('names the eight tools', () => {
        expect(chatTools().map((t) => t.function.name)).toEqual([
            'txt2img', 'img2img', 'search_replace', 'remove_background', 'style_guide', 'style_transfer', 'control_structure', 'control_sketch',
        ]);
        const transfer = chatTools().find((t) => t.function.name === 'style_transfer').function.parameters;
        expect(transfer.required).toEqual(['init_image_ref', 'style_image_ref']);
    });
});

describe('invokeRegion', () => {
    it.each([
        [ULTRA, 'us-east-1', 'us-west-2'],
        [SD35, 'eu-west-1', 'us-west-2'],
        ['us.stability.stable-image-style-guide-v1:0', 'us-east-1', 'us-east-1'],
        ['us.stability.stable-image-style-guide-v1:0', 'us-east-2', 'us-east-2'],
        ['us.stability.stable-image-style-guide-v1:0', 'us-west-2', 'us-west-2'],
        ['us.stability.stable-image-style-guide-v1:0', 'eu-west-1', 'us-west-2'],
        ['us.stability.stable-image-style-guide-v1:0', undefined, 'us-west-2'],
    ])('sends %s from %s to %s', (modelId, host, expected) => {
        expect(invokeRegion(modelId, host)).toBe(expected);
    });
});

describe('imagePrice', () => {
    const SEARCH = 'us.stability.stable-image-search-replace-v1:0';

    it('prefers image_prices, then price_per_image, then the built-in table, then 0', () => {
        const config = { image_prices: { [ULTRA]: 0.2 }, price_per_image: 0.05 };
        expect(imagePrice(config, ULTRA)).toEqual({ price: 0.2, source: 'image_prices' });
        expect(imagePrice(config, CORE)).toEqual({ price: 0.05, source: 'price_per_image' });
        expect(imagePrice({}, CORE)).toEqual({ price: 0.04, source: 'default' });
        expect(imagePrice({}, 'my-model')).toEqual({ price: 0, source: 'none' });
        expect(imagePrice(undefined, ULTRA)).toEqual({ price: 0.14, source: 'default' });
    });

    it('has the built-in prices of all nine models', () => {
        const prices = Object.fromEntries([
            ULTRA, CORE, SD35, SEARCH, 'us.stability.stable-style-transfer-v1:0',
            'us.stability.stable-image-remove-background-v1:0', 'us.stability.stable-image-style-guide-v1:0',
            'us.stability.stable-image-control-structure-v1:0', 'us.stability.stable-image-control-sketch-v1:0',
        ].map((id) => [id, imagePrice({}, id).price]));
        expect(Object.values(prices)).toEqual([0.14, 0.04, 0.08, 0.07, 0.08, 0.07, 0.07, 0.07, 0.07]);
    });

    it('accepts a numeric string and a zero, and falls through on blank, negative and non-numeric values', () => {
        expect(imagePrice({ image_prices: { [SEARCH]: '0.09' } }, SEARCH)).toEqual({ price: 0.09, source: 'image_prices' });
        expect(imagePrice({ image_prices: { [SEARCH]: 0 } }, SEARCH)).toEqual({ price: 0, source: 'image_prices' });
        for (const bad of ['', '  ', 'abc', -1, '-0.5', NaN, Infinity, null, true, {}]) {
            expect(imagePrice({ image_prices: { [SEARCH]: bad }, price_per_image: bad }, SEARCH)).toEqual({ price: 0.07, source: 'default' });
            expect(imagePrice({ image_prices: { [SEARCH]: bad }, price_per_image: '0.03' }, SEARCH)).toEqual({ price: 0.03, source: 'price_per_image' });
        }
        expect(imagePrice({ image_prices: 'oops' }, SEARCH)).toEqual({ price: 0.07, source: 'default' });
    });
});

describe('finishReasonMessage', () => {
    it('says in plain words what happened', () => {
        expect(finishReasonMessage('Filter reason: prompt')).toMatch(/prompt was filtered/);
        expect(finishReasonMessage('Filter reason: input image')).toMatch(/input picture was filtered/);
        expect(finishReasonMessage('Filter reason: output image')).toMatch(/generated picture was filtered/);
        expect(finishReasonMessage('Inference error')).toMatch(/failed to make the picture/);
        expect(finishReasonMessage('Weird')).toContain('Weird');
    });
});
