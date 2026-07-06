/** Collapse refined prompt to one line for shell/terminal paste (no Enter). */
export function toTerminalSingleLine(text: string): string {
  return text
    .replace(/\r\n/g, " ")
    .replace(/[\r\n\u2028\u2029\u0085]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip line breaks from streaming chunks without waiting for the full response. */
export function stripTerminalStreamChunk(chunk: string): string {
  return chunk.replace(/[\r\n\u2028\u2029\u0085]/g, " ");
}
