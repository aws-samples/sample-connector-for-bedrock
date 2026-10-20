/**
 * Date and time utility functions
 * Handles timezone-aware date formatting and comparisons
 */

/**
 * Format a date string to relative time (e.g., "5m ago", "2h ago")
 * Handles timezone differences by comparing UTC timestamps
 *
 * @param {string} dateStr - ISO date string from server
 * @returns {string} Formatted relative time string
 */
export function formatRelativeTime(dateStr) {
  try {
    // Parse the date string and convert to UTC timestamp
    const date = new Date(dateStr)

    // Check if date is valid
    if (isNaN(date.getTime())) {
      return dateStr
    }

    // Get current time in UTC
    const now = new Date()

    // Calculate difference in milliseconds (both are in local time, so difference is correct)
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    // Handle negative differences (future dates)
    if (diffMins < 0) {
      return 'just now'
    }

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`

    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`

    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 30) return `${diffDays}d ago`

    const diffMonths = Math.floor(diffDays / 30)
    if (diffMonths < 12) return `${diffMonths}mo ago`

    const diffYears = Math.floor(diffDays / 365)
    return `${diffYears}y ago`
  } catch (error) {
    console.error('Error formatting date:', error)
    return dateStr
  }
}

/**
 * Format a date string to absolute time
 *
 * @param {string} dateStr - ISO date string from server
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string
 */
export function formatAbsoluteTime(dateStr, options = {}) {
  try {
    const date = new Date(dateStr)

    if (isNaN(date.getTime())) {
      return dateStr
    }

    const defaultOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      ...options
    }

    return new Intl.DateTimeFormat('en-US', defaultOptions).format(date)
  } catch (error) {
    console.error('Error formatting absolute date:', error)
    return dateStr
  }
}

/**
 * Compare two date strings for sorting
 *
 * @param {string} dateStrA - First ISO date string
 * @param {string} dateStrB - Second ISO date string
 * @returns {number} Comparison result (-1, 0, or 1)
 */
export function compareDates(dateStrA, dateStrB) {
  try {
    const dateA = new Date(dateStrA)
    const dateB = new Date(dateStrB)

    if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
      return 0
    }

    return dateB.getTime() - dateA.getTime() // Descending order (newest first)
  } catch (error) {
    console.error('Error comparing dates:', error)
    return 0
  }
}
