/** Read a required environment variable, failing loudly if absent. */
export function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function envOr(name: string, fallback: string): string {
  return process.env[name] || fallback;
}
