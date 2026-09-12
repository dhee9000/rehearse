import { del, get, put } from "@vercel/blob";
import type { Storage } from "./index";

/**
 * Private is the default and the right one for someone's audition audio: the
 * clips are readable only through this app, never from a guessable URL. Set
 * BLOB_ACCESS=public only if your store is configured that way, which lets the
 * audio route redirect to the CDN instead of proxying bytes.
 */
const ACCESS: "public" | "private" =
  process.env.BLOB_ACCESS === "public" ? "public" : "private";

export async function createBlobStorage(): Promise<Storage> {
  return {
    kind: "blob",
    async put(key, bytes, contentType) {
      const result = await put(`audio/${key}`, bytes, {
        access: ACCESS,
        contentType,
        // Keys already carry the session and turn, so don't append a suffix —
        // re-rendering a line should replace it, not accumulate copies.
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      return {
        key: result.pathname,
        // A private blob's URL isn't fetchable without credentials, so hand
        // back none and let the audio route stream it through instead.
        url: ACCESS === "public" ? result.url : null,
      };
    },
    async read(key) {
      const found = await get(key, { access: ACCESS });
      if (!found || found.statusCode !== 200) return null;
      return Buffer.from(await new Response(found.stream).arrayBuffer());
    },
    async remove(key) {
      await del(key).catch(() => undefined);
    },
  };
}
