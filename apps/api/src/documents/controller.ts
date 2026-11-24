import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Req,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Allow, AuthRequest } from "../auth";
import { MAX_FILE_BYTES, DocumentInput } from "./parser";
import { DocumentsService } from "./service";
@Controller("materials")
export class DocumentsController {
  constructor(@Inject(DocumentsService) private service: DocumentsService) {}
  @Allow("OWNER", "MANAGER")
  @Post("upload")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: MAX_FILE_BYTES,
        files: 1,
        fields: 1,
        fieldSize: 600,
        parts: 2,
      },
    }),
  )
  upload(
    @Req() request: AuthRequest,
    @Body("title") title: unknown,
    @UploadedFile() file?: DocumentInput,
  ) {
    return this.service.upload(request.user, title, file);
  }
  @Allow("OWNER", "MANAGER", "EMPLOYEE")
  @Get(":id/file")
  @Header("Cache-Control", "private, no-store")
  @Header("X-Content-Type-Options", "nosniff")
  async download(@Req() request: AuthRequest, @Param("id") id: string) {
    const file = await this.service.download(request.user, id);
    return new StreamableFile(file.data, {
      type: file.mime,
      disposition: `attachment; filename="document"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      length: file.data.length,
    });
  }
}
