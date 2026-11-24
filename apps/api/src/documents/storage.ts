import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
export abstract class FileStorage {
  abstract put(data: Buffer): Promise<string>;
  abstract get(key: string): Promise<Buffer>;
  abstract remove(key: string): Promise<void>;
}
@Injectable()
export class LocalFileStorage extends FileStorage {
  private root = resolve(
    process.env.MATERIAL_UPLOAD_DIR ?? ".runtime/material-uploads",
  );
  private path(key: string) {
    if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error("Invalid storage key");
    return join(this.root, key);
  }
  async put(data: Buffer) {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const key = randomUUID();
    try {
      await writeFile(this.path(key), data, { mode: 0o600, flag: "wx" });
    } catch (error) {
      await this.remove(key).catch(() => undefined);
      throw error;
    }
    return key;
  }
  get(key: string) {
    return readFile(this.path(key));
  }
  async remove(key: string) {
    await unlink(this.path(key));
  }
}
