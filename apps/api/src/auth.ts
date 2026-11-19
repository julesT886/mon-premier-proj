import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Jetons device anonymes : `<deviceId>.<hmac>`. Pas de compte au MVP ; le jeton
 * identifie un appareil pour le rate limit et ne peut pas être forgé sans le secret.
 */
export const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function signDeviceToken(deviceId: string, secret: string): string {
  if (!DEVICE_ID_PATTERN.test(deviceId)) throw new Error('invalid device id');
  return `${deviceId}.${mac(deviceId, secret)}`;
}

/** Renvoie le deviceId si le jeton est valide, sinon null. */
export function verifyDeviceToken(token: string | undefined, secret: string): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const deviceId = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!DEVICE_ID_PATTERN.test(deviceId)) return null;
  const expected = Buffer.from(mac(deviceId, secret));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length) return null;
  return timingSafeEqual(expected, actual) ? deviceId : null;
}

function mac(deviceId: string, secret: string): string {
  return createHmac('sha256', secret).update(deviceId).digest('base64url');
}
