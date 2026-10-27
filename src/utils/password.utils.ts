import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(8).toString('hex');
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;

  return `${buf.toString('hex')}.${salt}`;
}

/** 32 hex chars (128 bits). Fits UserSpec password maxLength (64) after hashing is applied separately. */
function generateRandomPassword(): string {
  return randomBytes(16).toString('hex');
}

async function comparePasswords(
  storedPassword: string,
  suppliedPassword: string,
): Promise<boolean> {
  // Basic validation to prevent errors with undefined passwords
  if (!storedPassword?.includes('.')) {
    return false; // Invalid format, can't compare
  }

  const [hashedPassword, salt] = storedPassword.split('.');
  if (!salt) {
    return false; // No salt found
  }

  const buf = (await scryptAsync(suppliedPassword, salt, 64)) as Buffer;
  return buf.toString('hex') === hashedPassword;
}

export const passwordUtils = {
  hashPassword,
  comparePasswords,
  generateRandomPassword,
};
