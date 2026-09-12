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

/**
 * Blob when the project is wired to a store. Vercel's newer OIDC credential
 * mode injects BLOB_STORE_ID and no static token — the SDK authenticates from
 * the runtime's OIDC identity — while a static BLOB_READ_WRITE_TOKEN is what
 * you get for local or non-Vercel use. Either one means "use Blob".
 */
export function storageMode(): StorageMode {
  return process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID
    ? "blob"
    : "fs";
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
