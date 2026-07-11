import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

// AES-256-GCM encryption for secrets stored in the database (email app passwords,
// PDF passwords). Key is derived from the ENCRYPTION_KEY env var, which is
// required at bootstrap (see main.ts).
//
// Stored format: enc:v1:<base64(iv[12] + authTag[16] + ciphertext)>
// Values without the prefix are treated as legacy plaintext and returned as-is
// by decryptSecret(), so pre-existing rows keep working; they are re-encrypted
// the next time they are saved.

const PREFIX = 'enc:v1:';

function key(): Buffer {
  return createHash('sha256').update(process.env.ENCRYPTION_KEY ?? '').digest();
}

export function encryptSecret(plain: string | null | undefined): string | null {
  if (!plain) return plain ?? null;
  if (plain.startsWith(PREFIX)) return plain; // already encrypted
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return stored ?? null;
  if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext row
  const buf = Buffer.from(stored.slice(PREFIX.length), 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

export function isEncrypted(v: string | null | undefined): boolean {
  return !!v && v.startsWith(PREFIX);
}
