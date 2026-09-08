/**
 * `crypto.randomUUID()` is restricted to secure contexts (HTTPS or `localhost`) by
 * browser spec — Customer #1's real deployment (`http://<LAN IP>:3001`) is neither, so
 * it is `undefined` there even though `crypto.getRandomValues()` (no such restriction)
 * still works. Falls back to a standards-correct RFC 4122 v4 UUID built from
 * `crypto.getRandomValues()` when `randomUUID` is unavailable.
 */
export function generateUuid(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
