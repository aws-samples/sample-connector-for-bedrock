export type OutputFormat = "jpeg" | "png" | "webp";
export type PaintToolName =
  | "txt2img" | "img2img" | "search_replace" | "remove_background"
  | "style_guide" | "style_transfer" | "control_structure" | "control_sketch";

export const TEXT_TO_IMAGE_MODELS = [
  "stability.stable-image-ultra-v1:1",
  "stability.stable-image-core-v1:1",
  "stability.sd3-5-large-v1:0",
] as const;
export const ASPECT_RATIOS = ["16:9", "1:1", "21:9", "2:3", "3:2", "4:5", "5:4", "9:16", "9:21"] as const;

const ULTRA = "stability.stable-image-ultra-v1:1";
const CORE = "stability.stable-image-core-v1:1";
const SD35 = "stability.sd3-5-large-v1:0";
const SEARCH_REPLACE = "us.stability.stable-image-search-replace-v1:0";
const REMOVE_BACKGROUND = "us.stability.stable-image-remove-background-v1:0";
const STYLE_GUIDE = "us.stability.stable-image-style-guide-v1:0";
const STYLE_TRANSFER = "us.stability.stable-style-transfer-v1:0";
const CONTROL_STRUCTURE = "us.stability.stable-image-control-structure-v1:0";
const CONTROL_SKETCH = "us.stability.stable-image-control-sketch-v1:0";

const IMAGE_SERVICE_REGIONS = ["us-east-1", "us-east-2", "us-west-2"];
const DEFAULT_REGION = "us-west-2";
const MAX_PROMPT_LENGTH = 10_000;

// Picture arguments hold picture names; the other arguments are clamped numbers or strings.
export type ToolArgs = Record<string, string | number>;

// A user-facing failure of one step. Its message is shown to the user as is, and it ends the request.
export class PaintStepError extends Error {}

type Param =
  | { kind: "text"; description: string }
  | { kind: "number"; description: string; min: number; max: number }
  | { kind: "aspect_ratio"; description: string; default?: string };

type PictureArg = { arg: string; field: string };

export type PaintTool = {
  name: PaintToolName;
  description: string;
  pictures: readonly PictureArg[];
  outputFormat: OutputFormat;
  modelId(paintModelId: string): string;
  parameters: { properties: Record<string, Param>; required: readonly string[] };
  // pictures holds base64 by Bedrock request field.
  body(args: ToolArgs, pictures: Record<string, string>, modelId: string): Record<string, unknown>;
};

const PROMPT: Param = { kind: "text", description: "English prompt. Translate the user's words to English." };
const NEGATIVE_PROMPT: Param = { kind: "text", description: "English negative prompt. Always include nsfw." };
const ASPECT_RATIO: Param = { kind: "aspect_ratio", description: "Shape of the new picture." };
const unit = (description: string): Param => ({ kind: "number", description, min: 0, max: 1 });
const CONTROL_STRENGTH = unit("How strongly the picture drives the result, 0 to 1. Use 0.7 unless the user asks otherwise.");

const ONE_PICTURE: readonly PictureArg[] = [{ arg: "image_ref", field: "image" }];

function unsupported(paintModelId: string): PaintStepError {
  return new PaintStepError(`Unsupported paintModelId ${paintModelId}. Use one of ${TEXT_TO_IMAGE_MODELS.join(", ")}.`);
}

function fixedModel(modelId: string): (paintModelId: string) => string {
  return () => modelId;
}

// Fields the chat model left out stay out of the body. Picture fields and output_format come from the step.
function tool(
  def: Omit<PaintTool, "body"> & { argNames: readonly string[]; extra?: (modelId: string) => Record<string, unknown> },
): PaintTool {
  const { argNames, extra, ...rest } = def;
  return {
    ...rest,
    body(args, pictures, modelId) {
      const body: Record<string, unknown> = {};
      for (const name of argNames) {
        if (args[name] !== undefined) body[name] = args[name];
      }
      return { ...body, ...pictures, ...extra?.(modelId), output_format: def.outputFormat };
    },
  };
}

export const PAINT_TOOLS: Record<PaintToolName, PaintTool> = {
  txt2img: tool({
    name: "txt2img",
    description: "Make a new picture from the text alone. Pick it only when the user gave no picture to use, or wants a fresh picture that does not depend on one.",
    pictures: [],
    outputFormat: "jpeg",
    modelId(paintModelId) {
      if (!(TEXT_TO_IMAGE_MODELS as readonly string[]).includes(paintModelId)) throw unsupported(paintModelId);
      return paintModelId;
    },
    parameters: {
      properties: { prompt: PROMPT, negative_prompt: NEGATIVE_PROMPT, aspect_ratio: { ...ASPECT_RATIO, default: "1:1" } },
      required: ["prompt"],
    },
    argNames: ["prompt", "negative_prompt", "aspect_ratio"],
  }),
  img2img: tool({
    name: "img2img",
    description: "Redraw a whole picture so that it follows the text, using the picture as the starting point. Pick it for broad changes such as another season, mood or medium. For replacing one named object use search_replace. For keeping a layout or pose use control_structure.",
    pictures: ONE_PICTURE,
    outputFormat: "jpeg",
    modelId(paintModelId) {
      if (paintModelId === ULTRA || paintModelId === SD35) return paintModelId;
      if (paintModelId === CORE) return SD35;
      throw unsupported(paintModelId);
    },
    parameters: {
      properties: {
        prompt: PROMPT,
        negative_prompt: NEGATIVE_PROMPT,
        strength: unit("How far the result may leave the picture, 0 to 1. 0 keeps the picture, 1 ignores it. Use about 0.6 for a clear change."),
      },
      required: ["prompt", "strength"],
    },
    argNames: ["prompt", "negative_prompt", "strength"],
    extra: (modelId) => (modelId === SD35 ? { mode: "image-to-image" } : {}),
  }),
  search_replace: tool({
    name: "search_replace",
    description: "Replace one named object in a picture with something else, with no mask. Everything else in the picture stays. Pick it when the user says to swap or change a specific thing.",
    pictures: ONE_PICTURE,
    outputFormat: "jpeg",
    modelId: fixedModel(SEARCH_REPLACE),
    parameters: {
      properties: {
        prompt: { kind: "text", description: "English description of what to put in place of the object." },
        search_prompt: { kind: "text", description: "English short description of the object to replace, for example \"the red car\"." },
        negative_prompt: NEGATIVE_PROMPT,
      },
      required: ["prompt", "search_prompt"],
    },
    argNames: ["prompt", "search_prompt", "negative_prompt"],
  }),
  remove_background: tool({
    name: "remove_background",
    description: "Cut the subject out of a picture and make the background transparent. The result is a PNG. It takes no text.",
    pictures: ONE_PICTURE,
    outputFormat: "png",
    modelId: fixedModel(REMOVE_BACKGROUND),
    parameters: { properties: {}, required: [] },
    argNames: [],
  }),
  style_guide: tool({
    name: "style_guide",
    description: "Make a new picture, from the text, in the style of a reference picture. The reference gives colors, brush and mood, not content. To keep the composition of the user's own picture and only change its style use style_transfer.",
    pictures: ONE_PICTURE,
    outputFormat: "jpeg",
    modelId: fixedModel(STYLE_GUIDE),
    parameters: {
      properties: {
        prompt: PROMPT,
        negative_prompt: NEGATIVE_PROMPT,
        fidelity: unit("How closely the result follows the style of the reference, 0 to 1. Default 0.5."),
        aspect_ratio: ASPECT_RATIO,
      },
      required: ["prompt"],
    },
    argNames: ["prompt", "negative_prompt", "fidelity", "aspect_ratio"],
  }),
  style_transfer: tool({
    name: "style_transfer",
    description: "Keep the composition of one picture and repaint it in the style of another picture. init_image_ref is the picture to keep. style_image_ref is the picture that gives the style. For a new picture in a reference style use style_guide.",
    pictures: [
      { arg: "init_image_ref", field: "init_image" },
      { arg: "style_image_ref", field: "style_image" },
    ],
    outputFormat: "jpeg",
    modelId: fixedModel(STYLE_TRANSFER),
    parameters: {
      properties: {
        prompt: { kind: "text", description: "Optional English prompt that guides the result." },
        negative_prompt: NEGATIVE_PROMPT,
        style_strength: unit("How strongly the style shows, 0 to 1. Default 1."),
        change_strength: { kind: "number", description: "How much the kept picture may change, 0.1 to 1. Default 0.9.", min: 0.1, max: 1 },
      },
      required: [],
    },
    argNames: ["prompt", "negative_prompt", "style_strength", "change_strength"],
  }),
  control_structure: tool({
    name: "control_structure",
    description: "Make a new picture that keeps the layout, pose or outline of an input picture while the text decides what it shows. Pick it when the user wants the same structure with different content or look.",
    pictures: ONE_PICTURE,
    outputFormat: "jpeg",
    modelId: fixedModel(CONTROL_STRUCTURE),
    parameters: {
      properties: { prompt: PROMPT, negative_prompt: NEGATIVE_PROMPT, control_strength: CONTROL_STRENGTH },
      required: ["prompt"],
    },
    argNames: ["prompt", "negative_prompt", "control_strength"],
  }),
  control_sketch: tool({
    name: "control_sketch",
    description: "Turn a drawing or sketch into a finished picture that follows its lines. The text says what the picture should show. Pick it when the input picture is a hand drawing or line art.",
    pictures: ONE_PICTURE,
    outputFormat: "jpeg",
    modelId: fixedModel(CONTROL_SKETCH),
    parameters: {
      properties: { prompt: PROMPT, negative_prompt: NEGATIVE_PROMPT, control_strength: CONTROL_STRENGTH },
      required: ["prompt"],
    },
    argNames: ["prompt", "negative_prompt", "control_strength"],
  }),
};

const PICTURE_ARG_DESCRIPTION = "Name of an input picture, such as image_1, or an s3:// URL in the configured bucket.";

// Picture arguments are always required: a step without its picture cannot run.
function schemaOf(t: PaintTool) {
  const properties: Record<string, unknown> = {};
  for (const { arg } of t.pictures) properties[arg] = { type: "string", description: PICTURE_ARG_DESCRIPTION };
  for (const [name, param] of Object.entries(t.parameters.properties)) {
    if (param.kind === "number") {
      properties[name] = { type: "number", description: param.description, minimum: param.min, maximum: param.max };
    } else if (param.kind === "aspect_ratio") {
      properties[name] = { type: "string", description: param.description, enum: [...ASPECT_RATIOS] };
    } else {
      properties[name] = { type: "string", description: param.description };
    }
  }
  return {
    type: "object",
    properties,
    required: [...t.pictures.map(({ arg }) => arg), ...t.parameters.required],
  };
}

export function chatTools(): any[] {
  return Object.values(PAINT_TOOLS).map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: schemaOf(t) },
  }));
}

function numberOf(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

export function parseToolArgs(tool: PaintTool, raw: string): ToolArgs {
  let parsed: any;
  try {
    parsed = JSON.parse(raw && raw.trim() ? raw : "{}");
  } catch {
    throw new PaintStepError(`The arguments of ${tool.name} are not valid JSON.`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new PaintStepError(`The arguments of ${tool.name} are not a JSON object.`);
  }

  const args: ToolArgs = {};
  const missing = (name: string) => new PaintStepError(`${tool.name} needs the argument ${name}.`);

  for (const { arg } of tool.pictures) {
    const value = typeof parsed[arg] === "string" ? parsed[arg].trim() : "";
    if (!value) throw missing(arg);
    args[arg] = value;
  }

  for (const [name, param] of Object.entries(tool.parameters.properties)) {
    const value = parsed[name];
    if (param.kind === "text") {
      const text = typeof value === "string" ? value.trim().slice(0, MAX_PROMPT_LENGTH) : "";
      if (text) args[name] = text;
    } else if (param.kind === "number") {
      const n = numberOf(value);
      if (n !== undefined) args[name] = Math.min(param.max, Math.max(param.min, n));
    } else if (value !== undefined && value !== null && value !== "") {
      args[name] = (ASPECT_RATIOS as readonly string[]).includes(value) ? value : "1:1";
    } else if (param.default) {
      args[name] = param.default;
    }
    if (args[name] === undefined && tool.parameters.required.includes(name)) throw missing(name);
  }
  return args;
}

// The host Region is used only for the cross-Region inference profiles; the on-demand models live in one Region.
export function invokeRegion(modelId: string, hostRegion: string | undefined): string {
  if (modelId.startsWith("us.") && hostRegion && IMAGE_SERVICE_REGIONS.includes(hostRegion)) return hostRegion;
  return DEFAULT_REGION;
}

export const DEFAULT_IMAGE_PRICES: Readonly<Record<string, number>> = {
  [ULTRA]: 0.14,
  [CORE]: 0.04,
  [SD35]: 0.08,
  [STYLE_TRANSFER]: 0.08,
  [SEARCH_REPLACE]: 0.07,
  [REMOVE_BACKGROUND]: 0.07,
  [STYLE_GUIDE]: 0.07,
  [CONTROL_STRUCTURE]: 0.07,
  [CONTROL_SKETCH]: 0.07,
};

// The config is free-form and Postgres and the admin UI produce strings, so "0.07" counts and blank does not.
function configuredPrice(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const n = numberOf(value);
  return n !== undefined && n >= 0 ? n : undefined;
}

export function imagePrice(config: any, modelId: string): { price: number; source: "image_prices" | "price_per_image" | "default" | "none" } {
  const table = config?.image_prices;
  const perModel = table && typeof table === "object" ? configuredPrice(table[modelId]) : undefined;
  if (perModel !== undefined) return { price: perModel, source: "image_prices" };
  const flat = configuredPrice(config?.price_per_image);
  if (flat !== undefined) return { price: flat, source: "price_per_image" };
  if (Object.prototype.hasOwnProperty.call(DEFAULT_IMAGE_PRICES, modelId)) return { price: DEFAULT_IMAGE_PRICES[modelId], source: "default" };
  return { price: 0, source: "none" };
}

export function finishReasonMessage(reason: unknown): string {
  switch (reason) {
    case "Filter reason: prompt":
      return "The prompt was filtered by the image model, so no picture was made. Try different wording.";
    case "Filter reason: input image":
      return "An input picture was filtered by the image model, so no picture was made.";
    case "Filter reason: output image":
      return "The generated picture was filtered by the image model, so it is not shown.";
    case "Inference error":
      return "The image model failed to make the picture. Try again.";
    default:
      return `The image model stopped without a picture (${String(reason)}).`;
  }
}
