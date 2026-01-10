import { LIMITS } from '@shared/limits';
import { sanitizeString, type ValidationResult } from '@/shared/validation';

/**
 * Validate username - alphanumeric and underscore only, 3-20 chars.
 */
export function validateUsername(username: string): ValidationResult {
  if (!username || typeof username !== 'string') {
    return { valid: false, error: 'Username is required.' };
  }

  const trimmed = username.trim();

  if (trimmed.length < LIMITS.MIN_USERNAME_LENGTH) {
    return { valid: false, error: `Username must be at least ${LIMITS.MIN_USERNAME_LENGTH} characters.` };
  }

  if (trimmed.length > LIMITS.MAX_USERNAME_LENGTH) {
    return { valid: false, error: `Username cannot exceed ${LIMITS.MAX_USERNAME_LENGTH} characters.` };
  }

  // Alphanumeric and underscore only
  const usernameRegex = /^[a-zA-Z0-9_]+$/;
  if (!usernameRegex.test(trimmed)) {
    return { valid: false, error: 'Username can only contain letters, numbers, and underscores.' };
  }

  // Cannot start with a number
  if (/^[0-9]/.test(trimmed)) {
    return { valid: false, error: 'Username cannot start with a number.' };
  }

  return { valid: true };
}

/**
 * Validate bio/description - max 500 chars.
 */
export function validateBio(bio: string): ValidationResult {
  if (!bio) {
    return { valid: true }; // Optional field
  }

  const sanitized = sanitizeString(bio);

  if (sanitized.length > LIMITS.MAX_BIO_LENGTH) {
    return { valid: false, error: `Bio cannot exceed ${LIMITS.MAX_BIO_LENGTH} characters.` };
  }

  return { valid: true };
}
