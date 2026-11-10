/**
 * PeerJS's JSON channel drops any single message of 16,300 bytes or more (and raises
 * an error). A game in progress is far bigger than that, so large messages are split
 * into frames and put back together on the other side. The channel is reliable and
 * ordered, so frames arrive complete and in sequence.
 */
export const MAX_FRAME_BYTES = 15_000;
const encoder = new TextEncoder();
const byteLength = (text: string) => encoder.encode(text).byteLength;

export interface Frame {
  __part: string;
  i: number;
  n: number;
  d: string;
}

export function toFrames(msg: unknown): unknown[] {
  const text = JSON.stringify(msg);
  if (byteLength(text) < MAX_FRAME_BYTES) return [msg];
  const id = Math.random().toString(36).slice(2, 10);
  const parts: string[] = [];
  let size = 12_000;
  for (let at = 0; at < text.length; ) {
    let piece = text.slice(at, at + size);
    // Quotes and non-ASCII grow when wrapped in a frame — shrink until it fits
    while (size > 256 && byteLength(JSON.stringify({ __part: id, i: 99999, n: 99999, d: piece })) >= MAX_FRAME_BYTES) {
      size = Math.floor(size / 2);
      piece = text.slice(at, at + size);
    }
    parts.push(piece);
    at += piece.length;
  }
  return parts.map((d, i): Frame => ({ __part: id, i, n: parts.length, d }));
}

/** Puts split messages back together. Returns null while parts are still arriving. */
export class Assembler {
  private partial = new Map<string, { parts: string[]; got: number }>();

  take(data: unknown): unknown {
    const f = data as Partial<Frame> | null;
    if (!f || typeof f !== 'object' || typeof f.__part !== 'string') return data;
    const n = Number(f.n);
    const i = Number(f.i);
    if (!(n > 0) || !(i >= 0 && i < n)) return null;
    let entry = this.partial.get(f.__part);
    if (!entry) {
      entry = { parts: new Array<string>(n), got: 0 };
      this.partial.set(f.__part, entry);
      // Never hold on to more than a few unfinished messages
      if (this.partial.size > 8) this.partial.delete(this.partial.keys().next().value as string);
    }
    if (entry.parts[i] === undefined) {
      entry.parts[i] = String(f.d ?? '');
      entry.got += 1;
    }
    if (entry.got < n) return null;
    this.partial.delete(f.__part);
    try {
      return JSON.parse(entry.parts.join('')) as unknown;
    } catch {
      return null;
    }
  }
}

