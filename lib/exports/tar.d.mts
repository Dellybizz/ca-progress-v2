export type TarEntry = {
  path: string;
  size: number;
  body: string | Uint8Array | ArrayBuffer | ReadableStream<Uint8Array>;
  mtime?: number | Date;
  mode?: number;
};

export declare function sanitizeTarPath(input: unknown): string;
export declare function buildTarHeader(input: { path: string; size: number; mtime?: number | Date; mode?: number }): Uint8Array;
export declare function generateTarChunks(
  entries: AsyncIterable<TarEntry> | Iterable<TarEntry>,
  options?: { mtime?: number | Date },
): AsyncGenerator<Uint8Array, void, unknown>;
export declare function textTarEntry(path: string, text: unknown, options?: { mtime?: number | Date; mode?: number }): TarEntry;
