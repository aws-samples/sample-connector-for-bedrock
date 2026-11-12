import crypto from "crypto";
import sharp from "sharp";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ChatRequest } from "../entity/chat_request";
import preprocess from "../util/preprocess";
import { OutputFormat, PaintStepError } from "./painter_tools";

type Message = NonNullable<ChatRequest["messages"]>[number];

export const UPLOAD_LIMITS = { count: 5, bytes: 10 * 1024 * 1024 };
export const STABILITY_LIMITS = { minSide: 64, maxPixels: 4_194_304, maxRatio: 2.5 };

const CHAT_COPY_SIDE = 1024;
const URL_LIFETIME_SECONDS = 14400;
const KEPT_FORMATS = ["jpeg", "png", "webp"] as const;
const EXTENSIONS: Record<OutputFormat, string> = { jpeg: "jpg", png: "png", webp: "webp" };
const CONTENT_TYPES: Record<OutputFormat, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const GENERATED_MARKDOWN = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g;

type Origin = "upload" | "earlier upload" | "generated";

// An upload from an earlier turn stays pending, in memory, until a tool uses it.
type Picture =
  | { name: string; origin: Origin; s3Url: string }
  | { name: string; origin: "earlier upload"; pending: Buffer };

export interface PictureStore {
  readonly bucket: string;
  readonly region: string;
  put(bytes: Uint8Array, format: OutputFormat, folder: "uploads" | "generated"): Promise<string>;
  get(s3Url: string): Promise<Uint8Array>;
}

export class S3PictureStore implements PictureStore {
  constructor(
    private readonly client: S3Client,
    readonly bucket: string,
    readonly region: string,
    private readonly prefix: string,
  ) {}

  async put(bytes: Uint8Array, format: OutputFormat, folder: "uploads" | "generated"): Promise<string> {
    const now = new Date();
    const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    const file = `${now.getTime()}-${crypto.randomUUID()}.${EXTENSIONS[format]}`;
    const key = [this.prefix, folder === "uploads" ? "uploads" : "", day, file].filter(Boolean).join("/");
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: bytes, ContentType: CONTENT_TYPES[format] }));
    return `s3://${this.bucket}/${key}`;
  }

  get(s3Url: string): Promise<Uint8Array> {
    return preprocess.downloadS3Image(s3Url, this.client, this.bucket);
  }

  presign(s3Url: string): Promise<string> {
    const key = s3Url.slice(`s3://${this.bucket}/`.length);
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: URL_LIFETIME_SECONDS });
  }
}

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const limitMb = `${UPLOAD_LIMITS.bytes / 1024 / 1024} MB`;
const UNREADABLE = "cannot be read, for example HEIC; upload JPEG, PNG or WebP";

export class PictureBook {
  private readonly pictures = new Map<string, Picture>();

  constructor(private readonly store: PictureStore) {}

  private nextName(): string {
    return `image_${this.pictures.size + 1}`;
  }

  add(origin: Origin, s3Url: string): string {
    const name = this.nextName();
    this.pictures.set(name, { name, origin, s3Url });
    return name;
  }

  addPending(bytes: Buffer): string {
    const name = this.nextName();
    this.pictures.set(name, { name, origin: "earlier upload", pending: bytes });
    return name;
  }

  async resolve(ref: string): Promise<string> {
    if (ref.startsWith("s3://")) return ref;
    const name = ref.trim().replace(/^\[|\]$/g, "");
    const picture = this.pictures.get(name);
    if (!picture) {
      throw new PaintStepError(
        `There is no picture named ${ref}. The chat model (localLlmModel) must be able to see pictures to name them. ` +
          `Pictures in this request: ${this.pictures.size ? [...this.pictures.keys()].join(", ") : "none"}.`,
      );
    }
    if (!("pending" in picture)) return picture.s3Url;

    if (picture.pending.length > UPLOAD_LIMITS.bytes) {
      throw new PaintStepError(`Picture ${name} is ${megabytes(picture.pending.length)}; the limit is ${limitMb} per picture.`);
    }
    let stored: { bytes: Uint8Array; format: OutputFormat };
    try {
      stored = await storable(picture.pending);
    } catch {
      throw new PaintStepError(`Picture ${name} ${UNREADABLE}.`);
    }
    const s3Url = await this.store.put(stored.bytes, stored.format, "uploads");
    this.pictures.set(name, { name, origin: "earlier upload", s3Url });
    return s3Url;
  }

  describe(): string {
    const where: Record<Origin, string> = {
      upload: "uploaded in the latest message",
      "earlier upload": "uploaded earlier in the conversation",
      generated: "made by painter",
    };
    return [...this.pictures.values()].map((p) => `- ${p.name}: ${where[p.origin]}`).join("\n") || "- none";
  }
}

// The S3 copy of an upload keeps its bytes. A format Stability cannot take is stored as PNG.
async function storable(bytes: Uint8Array): Promise<{ bytes: Uint8Array; format: OutputFormat }> {
  const { format } = await sharp(bytes).metadata();
  if ((KEPT_FORMATS as readonly string[]).includes(format)) return { bytes, format: format as OutputFormat };
  return { bytes: await sharp(bytes).png().toBuffer(), format: "png" };
}

export async function chatCopy(bytes: Uint8Array): Promise<string> {
  const jpeg = await sharp(bytes)
    .rotate()
    .resize(CHAT_COPY_SIDE, CHAT_COPY_SIDE, { fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 80 })
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

export async function fitForStability(name: string, bytes: Uint8Array): Promise<string> {
  let meta: sharp.Metadata;
  try {
    meta = await sharp(bytes).metadata();
  } catch {
    throw new PaintStepError(`Picture ${name} ${UNREADABLE}.`);
  }
  const turned = (meta.orientation ?? 1) >= 5;
  const width = (turned ? meta.height : meta.width) ?? 0;
  const height = (turned ? meta.width : meta.height) ?? 0;
  const size = `${width}x${height} px`;
  const { minSide, maxPixels, maxRatio } = STABILITY_LIMITS;

  if (Math.min(width, height) < minSide) {
    throw new PaintStepError(`Picture ${name} is ${size}; each side must be at least ${minSide} px.`);
  }
  if (Math.max(width, height) / Math.min(width, height) > maxRatio) {
    throw new PaintStepError(`Picture ${name} is ${size}; its aspect ratio must be between 1:${maxRatio} and ${maxRatio}:1.`);
  }

  const kept = (KEPT_FORMATS as readonly string[]).includes(meta.format);
  const format: "jpeg" | "png" | "webp" = kept ? (meta.format as "jpeg" | "png" | "webp") : "png";
  const tooBig = width * height > maxPixels;
  if (kept && !tooBig && !(meta.orientation && meta.orientation !== 1)) {
    return Buffer.from(bytes).toString("base64");
  }

  try {
    let image = sharp(bytes).rotate();
    if (tooBig) {
      const factor = Math.sqrt(maxPixels / (width * height));
      let w = Math.floor(width * factor);
      let h = Math.floor(height * factor);
      while (Math.max(w, h) / Math.min(w, h) > maxRatio) {
        if (w >= h) w -= 1;
        else h -= 1;
      }
      image = image.resize(w, h, { fit: "fill" });
    }
    return (await image.toFormat(format).toBuffer()).toString("base64");
  } catch {
    throw new PaintStepError(`Picture ${name} ${UNREADABLE}.`);
  }
}

// A presigned https URL of `bucket` becomes s3://bucket/key. Anything else is undefined.
export function presignedS3Url(url: string, bucket: string, region: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "https:" || !parsed.searchParams.has("X-Amz-Signature")) return undefined;
  const virtualHosted = parsed.hostname === `${bucket}.s3.${region}.amazonaws.com`;
  if (!virtualHosted && parsed.hostname !== `s3.${region}.amazonaws.com`) return undefined;
  let path: string;
  try {
    path = decodeURIComponent(parsed.pathname.slice(1));
  } catch {
    return undefined;
  }
  if (virtualHosted) return path ? `s3://${bucket}/${path}` : undefined;
  return path.startsWith(`${bucket}/`) && path.length > bucket.length + 1 ? `s3://${path}` : undefined;
}

function imageUrlOf(part: any): string | undefined {
  if (part?.type !== "image_url") return undefined;
  const url = typeof part.image_url === "string" ? part.image_url : part.image_url?.url;
  return typeof url === "string" ? url : undefined;
}

function decodeDataUrl(url: string): Buffer {
  return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
}

type Upload = { position: number; bytes: Buffer; copy: string; stored: { bytes: Uint8Array; format: OutputFormat } };

// This turn's uploads are checked as a set before anything is stored, so a refused message writes nothing.
async function checkUploads(message: Message): Promise<Upload[] | string> {
  const urls = (Array.isArray(message.content) ? message.content : []).map(imageUrlOf).filter((u): u is string => !!u?.startsWith("data:"));
  if (urls.length > UPLOAD_LIMITS.count) {
    return `At most ${UPLOAD_LIMITS.count} pictures in one message; this one has ${urls.length}.`;
  }
  const uploads: Upload[] = [];
  for (const [i, url] of urls.entries()) {
    const bytes = decodeDataUrl(url);
    if (bytes.length > UPLOAD_LIMITS.bytes) {
      return `Picture ${i + 1} is ${megabytes(bytes.length)}; the limit is ${limitMb} per picture.`;
    }
    try {
      uploads.push({ position: i, bytes, copy: await chatCopy(bytes), stored: await storable(bytes) });
    } catch {
      return `Picture ${i + 1} ${UNREADABLE}.`;
    }
  }
  return uploads;
}

export async function collectPictures(
  messages: Message[],
  store: PictureStore,
): Promise<{ book: PictureBook; chatMessages: Message[]; threadMessages: Message[] } | { refusal: string }> {
  const lastUser = messages.map((m) => m.role).lastIndexOf("user");
  let uploads: Upload[] = [];
  if (lastUser >= 0) {
    const checked = await checkUploads(messages[lastUser]);
    if (typeof checked === "string") return { refusal: checked };
    uploads = checked;
  }

  const book = new PictureBook(store);
  const generated = new Map<string, string>();
  const nameGenerated = (text: string) =>
    text.replace(GENERATED_MARKDOWN, (whole, url: string) => {
      const s3Url = presignedS3Url(url, store.bucket, store.region);
      if (!s3Url) return whole;
      if (!generated.has(s3Url)) generated.set(s3Url, book.add("generated", s3Url));
      return `[${generated.get(s3Url)}]`;
    });

  const chatMessages: Message[] = [];
  const threadMessages: Message[] = [];
  for (const [index, message] of messages.entries()) {
    const names = message.role === "assistant";
    if (typeof message.content === "string") {
      chatMessages.push(names ? { ...message, content: nameGenerated(message.content) } : message);
      threadMessages.push(message);
      continue;
    }
    if (!Array.isArray(message.content)) {
      chatMessages.push(message);
      threadMessages.push(message);
      continue;
    }

    const chatParts: any[] = [];
    const threadParts: any[] = [];
    let position = 0;
    for (const part of message.content) {
      const url = imageUrlOf(part);
      if (url?.startsWith("data:")) {
        const upload = index === lastUser ? uploads.find((u) => u.position === position) : undefined;
        position += 1;
        const bytes = upload?.bytes ?? decodeDataUrl(url);
        let name: string;
        let s3Url: string | undefined;
        if (upload) {
          s3Url = await store.put(upload.stored.bytes, upload.stored.format, "uploads");
          name = book.add("upload", s3Url);
        } else {
          name = book.addPending(bytes);
        }
        chatParts.push({ type: "text", text: `[${name}]` });
        const copy = upload?.copy ?? (await chatCopy(bytes).catch(() => undefined));
        if (copy) chatParts.push({ type: "image_url", image_url: { url: copy } });
        threadParts.push({ type: "text", text: s3Url ? `[${name}] ${s3Url}` : `[${name}]` });
      } else if (names && part?.type === "text" && typeof part.text === "string") {
        chatParts.push({ ...part, text: nameGenerated(part.text) });
        threadParts.push(part);
      } else {
        chatParts.push(part);
        threadParts.push(part);
      }
    }
    chatMessages.push({ ...message, content: chatParts });
    threadMessages.push({ ...message, content: threadParts });
  }
  return { book, chatMessages, threadMessages };
}
