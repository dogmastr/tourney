export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Sanitize a string by removing potentially dangerous content.
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') return '';

  return input
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Remove script-like content
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Trim
    .trim();
}

/**
 * Sanitize and validate a text field with max length.
 */
export function sanitizeTextField(input: string, maxLength: number): string {
  return sanitizeString(input).slice(0, maxLength);
}
