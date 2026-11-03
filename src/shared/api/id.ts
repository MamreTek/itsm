/** IDs identify synthetic Mock records, not sessions or authorization tokens. */
export function createId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Plain HTTP on a private LAN is not a secure context; getRandomValues is available there.
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
