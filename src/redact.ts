/** T7: strip credential-shaped tokens from recorded logs before digesting or printing. */
export function redactSecrets(text: string): string {
  let out = text;
  out = out.replace(/Authorization\s*[:=]\s*\S+/gi, "Authorization: [REDACTED]");
  out = out.replace(/\btoken\s*[:=]\s*\S+/gi, "token=[REDACTED]");
  out = out.replace(/npm_[A-Za-z0-9]+/g, "npm_[REDACTED]");
  return out;
}
