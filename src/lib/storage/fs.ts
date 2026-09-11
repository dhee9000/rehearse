import fsp from "node:fs/promises";
import path from "node:path";
import { localDataDir } from "../db/sqlite";
import type { Storage } from "./index";

export async function createFsStorage(): Promise<Storage> {
  const dir = path.join(localDataDir(), "audio");
  await fsp.mkdir(dir, { recursive: true });

  // basename keeps a crafted key from escaping the audio directory.
  const resolve = (key: string) => path.join(dir, path.basename(key));

  return {
    kind: "fs",
    async put(key, bytes) {
      await fsp.writeFile(resolve(key), bytes);
      return { key, url: null };
    },
    async read(key) {
      try {
        return await fsp.readFile(resolve(key));
      } catch {
        return null;
      }
    },
    async remove(key) {
      await fsp.rm(resolve(key), { force: true });
    },
  };
}
