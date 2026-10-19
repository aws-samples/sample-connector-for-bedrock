/**
 * Images pasted or dropped into the chat input
 *
 * Pure ESM: the BRConnector root test suite imports it directly. Decoding and
 * encoding are injected (`codec`), so only `browserImageCodec` touches the DOM.
 */

const MB = 1024 * 1024

export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
export const MAX_IMAGES_PER_MESSAGE = 5
// Long edge after downscaling (Claude's recommended maximum)
export const MAX_IMAGE_EDGE = 1568
// A PNG up to this many file bytes is kept; a bigger one is re-encoded as JPEG
export const PNG_MAX_BYTES = 1 * MB
export const JPEG_QUALITY = 0.85
// Base64 limits, per image and per message. Lambda caps a synchronous request at 6 MB.
export const MAX_IMAGE_BASE64 = 3.75 * MB
export const MAX_TOTAL_BASE64 = 4.5 * MB

const DATA_URL_PREFIX = /^data:(image\/(?:png|jpeg|gif|webp));base64,/
const BASE64_DATA = /^[A-Za-z0-9+/]*={0,2}$/

const formatMB = (bytes) => `${(bytes / MB).toFixed(2)} MB`

export function isAllowedImageType(type) {
  return ALLOWED_IMAGE_TYPES.includes(type)
}

/**
 * Size that fits the long edge within maxEdge, keeping the aspect ratio (never upscales)
 * @returns {{ width: number, height: number } | null} null when the size is unusable
 */
export function fitWithin(width, height, maxEdge = MAX_IMAGE_EDGE) {
  if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) return null
  const longEdge = Math.max(width, height)
  if (longEdge <= maxEdge) return { width, height }
  const scale = maxEdge / longEdge
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  }
}

// Number of bytes the base64 text decodes to
export function base64ByteLength(data) {
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0
  return Math.floor((data.length * 3) / 4) - padding
}

/**
 * Split a base64 data URL of an allowed image type
 * @returns {{ mediaType: string, data: string, dataUrl: string } | null}
 */
export function parseImageDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null
  const match = DATA_URL_PREFIX.exec(dataUrl)
  if (!match) return null
  return { mediaType: match[1], data: dataUrl.slice(match[0].length), dataUrl }
}

// True for a base64 data URL of an allowed image type (the only <img src> the chat renders)
export function isImageDataUrl(src) {
  return typeof src === 'string' && DATA_URL_PREFIX.test(src)
}

/**
 * Image files to attach from a paste event's clipboardData
 *
 * A clipboard that also has plain text (e.g. cells copied from a spreadsheet, which
 * come with a rendered picture) is left to the browser, so text paste is unchanged.
 */
export function pickPastedImages(clipboardData) {
  if (!clipboardData) return []
  if (clipboardData.getData?.('text/plain')) return []
  const fromItems = Array.from(clipboardData.items || [])
    .filter((item) => item.kind === 'file' && isAllowedImageType(item.type))
    .map((item) => item.getAsFile())
    .filter(Boolean)
  if (fromItems.length > 0) return fromItems
  return Array.from(clipboardData.files || []).filter((f) => isAllowedImageType(f.type))
}

// Allowed image files of a drop event, and how many other files were dropped
export function pickDroppedImages(dataTransfer) {
  const all = Array.from(dataTransfer?.files || [])
  const files = all.filter((f) => isAllowedImageType(f.type))
  return { files, rejected: all.length - files.length }
}

// True when a drag carries files (a text drag is left to the textarea)
export function hasDraggedFiles(dataTransfer) {
  return Array.from(dataTransfer?.types || []).includes('Files')
}

// Split new files into the ones that fit the per-message limit and the count that does not
export function takeImageSlots(count, files, max = MAX_IMAGES_PER_MESSAGE) {
  const free = Math.max(0, max - count)
  return { accepted: files.slice(0, free), dropped: Math.max(0, files.length - free) }
}

/**
 * Downscale and encode one image for sending
 * @param {{ type?: string, name?: string }} file - File or Blob
 * @param {{ decode: Function, encode: Function }} codec - decode(file) resolves to a
 *   drawable with width/height (and optional close()); encode(source, width, height,
 *   mediaType, quality?) resolves to a data URL
 * @returns {Promise<{ image: { name, mediaType, data, dataUrl } } | { error: string }>}
 */
export async function prepareImage(file, codec) {
  const name = file?.name || 'image'
  if (!isAllowedImageType(file?.type)) {
    return { error: `${name}: only PNG, JPEG, GIF and WebP images can be attached` }
  }

  let source
  try {
    source = await codec.decode(file)
  } catch {
    return { error: `${name}: could not read the image` }
  }

  try {
    const size = fitWithin(source?.width, source?.height)
    if (!size) return { error: `${name}: could not read the image` }

    let encoded = parseImageDataUrl(await codec.encode(source, size.width, size.height, 'image/png'))
    if (!encoded || base64ByteLength(encoded.data) > PNG_MAX_BYTES) {
      encoded = parseImageDataUrl(await codec.encode(source, size.width, size.height, 'image/jpeg', JPEG_QUALITY))
    }
    if (!encoded) return { error: `${name}: could not encode the image` }
    if (encoded.data.length > MAX_IMAGE_BASE64) {
      return { error: `${name} is ${formatMB(encoded.data.length)} after compression; the limit is 3.75 MB per image` }
    }
    return { image: { name, mediaType: encoded.mediaType, data: encoded.data, dataUrl: encoded.dataUrl } }
  } catch {
    return { error: `${name}: could not encode the image` }
  } finally {
    source?.close?.()
  }
}

// Error message when the images of one message are over the base64 total, else null
export function totalSizeError(images) {
  const total = images.reduce((sum, image) => sum + image.data.length, 0)
  if (total <= MAX_TOTAL_BASE64) return null
  return `Images total ${formatMB(total)}; the limit is 4.5 MB per message. Remove an image and try again.`
}

/**
 * The message to send: the plain string without images, otherwise an Anthropic user
 * message with the image blocks followed by the text block (omitted when blank)
 * @returns {string | { role: 'user', content: object[] }}
 */
export function buildUserMessage(text, images) {
  if (!images || images.length === 0) return text
  const content = images.map((image) => ({
    type: 'image',
    source: { type: 'base64', media_type: image.mediaType, data: image.data }
  }))
  if (text && text.trim()) content.push({ type: 'text', text })
  return { role: 'user', content }
}

// data: URL for an Anthropic base64 image block of an allowed type, else null
export function imageBlockToDataUrl(block) {
  if (block?.type !== 'image') return null
  const source = block.source
  if (source?.type !== 'base64' || !isAllowedImageType(source.media_type)) return null
  if (typeof source.data !== 'string' || !BASE64_DATA.test(source.data)) return null
  return `data:${source.media_type};base64,${source.data}`
}

/**
 * Text and image data URLs of a user message's content (string or content blocks)
 * @returns {{ text: string, images: string[] }}
 */
export function splitImageContent(content) {
  if (typeof content === 'string') return { text: content, images: [] }
  const texts = []
  const images = []
  for (const block of Array.isArray(content) ? content : []) {
    if (typeof block === 'string') {
      texts.push(block)
    } else if (block?.type === 'text' && typeof block.text === 'string') {
      texts.push(block.text)
    } else {
      const url = imageBlockToDataUrl(block)
      if (url) images.push(url)
    }
  }
  return { text: texts.join('\n\n'), images }
}

// Browser codec for prepareImage (ImageBitmap + canvas)
export const browserImageCodec = {
  decode: (file) => createImageBitmap(file),
  async encode(source, width, height, mediaType, quality) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (mediaType === 'image/jpeg') {
      // JPEG has no alpha: paint transparent areas white instead of black
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
    }
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(source, 0, 0, width, height)
    return canvas.toDataURL(mediaType, quality)
  }
}
