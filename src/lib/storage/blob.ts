import { del, put } from "@vercel/blob";
import type { Storage } from "./index";

export async function createBlobStorage(): Promise<Storage> {
  return {
    kind: "blob",
    async put(key, bytes, contentType) {
      const result = await put(`audio/${key}`, bytes, {
        access: "public",
        contentType,
        // Keys already carry the session and turn, so don't append a suffix —
        // re-rendering a line should replace it, not accumulate copies.
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      return { key: result.pathname, url: result.url };
    },
    async read(key) {
      // Blob objects are served from their public URL; this is only the
      // fallback path for a clip whose URL wasn't recorded.
      const base = process.env.BLOB_BASE_URL;
      if (!base) return null;
      const res = await fetch(`${base.replace(/\/$/, "")}/${key}`);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    },
    async remove(key) {
      await del(key).catch(() => undefined);
    },
  };
}
