export function readPort(name: string, fallback: number): number {
  const raw = process.env[name];
  const port = raw === undefined ? fallback : Number(raw);
  if (
    (raw !== undefined && !/^\d+$/.test(raw)) ||
    !Number.isInteger(port) ||
    port < 0 ||
    port > 65535
  ) {
    throw new Error(`${name} must be an integer between 0 and 65535`);
  }
  return port;
}
