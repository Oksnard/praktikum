import { Inject, Injectable } from "@nestjs/common";
import { Repository } from "../repository";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
export abstract class FileStorage {
  abstract put(data: Buffer): Promise<string>;
  abstract get(key: string): Promise<Buffer>;
  abstract remove(key: string): Promise<void>;
}
@Injectable()
export class PostgresFileStorage extends FileStorage {
  constructor(@Inject(Repository) private db: Repository) {
    super();
  }
  async put(data: Buffer) {
    if (!data.length || data.length > 5 * 1024 * 1024)
      throw new Error("Invalid stored file size");
    const file = await this.db.storedFile.create({
      data: { data: Uint8Array.from(data) },
      select: { id: true },
    });
    return file.id;
  }
  async get(key: string) {
    if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error("Invalid storage key");
    const file = await this.db.storedFile.findUnique({
      where: { id: key },
      select: { data: true },
    });
    if (!file) throw new Error("Stored file not found");
    return Buffer.from(file.data);
  }
  async remove(key: string) {
    if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error("Invalid storage key");
    await this.db.storedFile.deleteMany({ where: { id: key } });
  }
}

export function configuredFileStorage(db: Repository): FileStorage {
  switch (process.env.MATERIAL_STORAGE ?? "local") {
    case "local":
      return new LocalFileStorage();
    case "postgres":
      return new PostgresFileStorage(db);
    default:
      throw new Error("Unsupported MATERIAL_STORAGE");
  }
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
