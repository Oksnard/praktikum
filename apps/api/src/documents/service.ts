import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { User } from "@prisma/client";
import { MaterialSchema } from "@praktikum/types";
import { tenant } from "../auth";
import { Repository } from "../repository";
import { DocumentParser, DocumentInput } from "./parser";
import { FileStorage } from "./storage";
@Injectable()
export class DocumentsService {
  constructor(
    @Inject(Repository) private db: Repository,
    @Inject(DocumentParser) private parser: DocumentParser,
    @Inject(FileStorage) private storage: FileStorage,
  ) {}
  async upload(user: User, title: unknown, file?: DocumentInput) {
    const companyId = tenant(user);
    if (
      !file ||
      typeof title !== "string" ||
      title.trim().length < 3 ||
      title.trim().length > 150
    )
      throw new BadRequestException(
        "Укажите название от 3 до 150 символов и прикрепите файл",
      );
    const parsed = await this.parser.extract(file);
    const content = MaterialSchema.parse({
      title: title.trim(),
      text: parsed.text,
    });
    const filename =
      file.originalname.replace(/[\\/\x00-\x1f\x7f]/g, "_").slice(0, 200) ||
      "document";
    let key: string;
    try {
      key = await this.storage.put(file.buffer);
    } catch {
      throw new ServiceUnavailableException(
        "Не удалось сохранить файл. Попробуйте позже",
      );
    }
    try {
      const material = await this.db.material.create({
        data: {
          companyId,
          ...content,
          attachmentKey: key,
          attachmentName: filename,
          attachmentMime: parsed.mime,
          attachmentSize: file.buffer.length,
        },
      });
      const { attachmentKey: _key, ...view } = material;
      return view;
    } catch (error) {
      await this.storage.remove(key).catch(() => undefined);
      throw error;
    }
  }
  async download(user: User, id: string) {
    const material = await this.db.material.findFirst({
      where: { id, companyId: tenant(user) },
    });
    if (!material?.attachmentKey) throw new NotFoundException("Файл не найден");
    try {
      return {
        data: await this.storage.get(material.attachmentKey),
        name: material.attachmentName ?? "document",
        mime: material.attachmentMime ?? "application/octet-stream",
      };
    } catch {
      throw new NotFoundException("Файл недоступен");
    }
  }
}
