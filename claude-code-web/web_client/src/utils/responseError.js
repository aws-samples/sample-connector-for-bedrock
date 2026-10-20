/**
 * Errors for failed HTTP responses
 *
 * Pure ESM with no browser or Vite globals: the BRConnector root test suite imports it directly.
 */

/**
 * Build the error thrown for a failed response, so the UI shows the server's reason
 *
 * The BRConnector BFF sends `{ error, detail }` and the backend sends FastAPI's `{ detail }`; a string `detail`
 * (or `message`) becomes the error message, otherwise the fallback is used.
 * @param {{ status: number, statusText?: string }} response - The failed response
 * @param {string} bodyText - Its body as text
 * @param {string} fallbackMessage - Message when the body carries no usable text
 * @returns {Error & { status: number, statusText?: string, detail?: unknown }} The error
 */
export function responseError(response, bodyText, fallbackMessage) {
  let data = null
  try {
    data = JSON.parse(bodyText)
  } catch {
    // Not JSON
  }
  const detail = data && typeof data === 'object' ? data.detail || data.message : undefined
  const error = new Error(typeof detail === 'string' && detail ? detail : fallbackMessage)
  error.status = response.status
  error.statusText = response.statusText
  if (detail !== undefined) error.detail = detail
  return error
}
