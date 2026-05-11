import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getEncryptionKey(): Buffer | null {
  const key = process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY;
  if (!key) return null;
  // Key must be 32 bytes for AES-256 — hash it to ensure correct length
  return crypto.createHash('sha256').update(key).digest();
}

/**
 * Encrypt a Shopify access token for storage at rest.
 * Returns base64 encoded string: iv:encrypted:tag
 */
export function encryptToken(token: string): string {
  const key = getEncryptionKey();
  if (!key) return token; // No encryption key — store plaintext (dev mode)

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(token, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const tag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${encrypted}:${tag.toString('base64')}`;
}

/**
 * Decrypt a Shopify access token from storage.
 * Handles both encrypted (iv:data:tag) and plaintext tokens.
 */
export function decryptToken(stored: string): string {
  const key = getEncryptionKey();
  if (!key) return stored; // No encryption key — assume plaintext

  const parts = stored.split(':');
  if (parts.length !== 3) return stored; // Not encrypted — plaintext fallback

  const [ivB64, encryptedB64, tagB64] = parts;

  try {
    const iv = Buffer.from(ivB64, 'base64');
    const encrypted = Buffer.from(encryptedB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
  } catch {
    // Decryption failed — token might be plaintext from before encryption was enabled
    return stored;
  }
}
