// Chat input box sizing. The .input-area (style.css) is a column holding the
// model selector row and the textarea, so its height must fit all of:
//   padding 24 top + 16 bottom, 1px border-top, model row ~28, gap 8,
//   textarea min-height 90 (border-box, includes its own border).
// Anything smaller pushes the textarea below the bottom of the window.
export const INPUT_AREA_PADDING = 24 + 16
export const INPUT_AREA_BORDER = 1
export const INPUT_MODEL_ROW_HEIGHT = 28
export const INPUT_AREA_GAP = 8
export const INPUT_TEXTAREA_MIN_HEIGHT = 90
export const INPUT_AREA_MIN_HEIGHT =
  INPUT_AREA_PADDING + INPUT_AREA_BORDER + INPUT_MODEL_ROW_HEIGHT + INPUT_AREA_GAP + INPUT_TEXTAREA_MIN_HEIGHT
export const INPUT_AREA_DEFAULT_HEIGHT = INPUT_AREA_MIN_HEIGHT
export const INPUT_AREA_MAX_HEIGHT = 400

// Returns the clamped height, or null when the value is not a finite number.
export function clampInputHeight(h) {
  if (typeof h !== 'number' || !Number.isFinite(h)) return null
  return Math.min(INPUT_AREA_MAX_HEIGHT, Math.max(INPUT_AREA_MIN_HEIGHT, h))
}
