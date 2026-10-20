/**
 * Chat message formatting
 *
 * Pure ESM with no browser or Vite globals: the BRConnector root test suite imports it directly.
 */

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/**
 * Escape text for use in HTML
 * @param {string} text - Plain text
 * @returns {string} Text with & < > " ' replaced by entities
 */
export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c])
}

/**
 * Turn chat text into the small HTML subset the chat view renders
 *
 * The text is escaped first, so only the <br>, <code> and <strong> tags added here are markup.
 * @param {string | null | undefined} text - Message text
 * @returns {string} HTML
 */
export function formatMessageContent(text) {
  if (!text) return ''
  return escapeHtml(text)
    .replace(/\n/g, '<br>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}
