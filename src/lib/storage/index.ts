/** Where rendered audio lives. Filesystem locally, Vercel Blob when hosted. */
export interface Storage {
  readonly kind: "fs" | "blob";
  /** Returns the key to store, plus a directly-servable URL when there is one. */
  put(
    key: string,
    bytes: Buffer,
    contentType: string,
  ): Promise<{ key: string; url: string | null }>;
  /** Bytes, or null when the object isn't there. */
  read(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
}

export type StorageMode = "fs" | "blob";

export function storageMode(): StorageMode {
  return process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "fs";
}

declare global {
  var __rehearseStorage: Promise<Storage> | undefined;
}

export function storage(): Promise<Storage> {
  globalThis.__rehearseStorage ??= connect();
  return globalThis.__rehearseStorage;
}

async function connect(): Promise<Storage> {
  if (storageMode() === "blob") {
    const { createBlobStorage } = await import("./blob");
    return createBlobStorage();
  }
  const { createFsStorage } = await import("./fs");
  return createFsStorage();
}
