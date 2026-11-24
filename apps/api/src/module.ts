import { DocumentsController } from "./documents/controller";
import { DocumentsService } from "./documents/service";
import { DocumentParser } from "./documents/parser";
import { FileStorage, LocalFileStorage } from "./documents/storage";
import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Repository } from "./repository";
import { AuthGuard } from "./auth";
import { AppController } from "./controller";
import { AppService } from "./service";
import { AiProvider, AiService, configuredAiProvider } from "./ai";
import {
  MockNotificationSender,
  MockPaymentProvider,
  NotificationSender,
  PaymentProvider,
} from "./providers";
@Module({
  controllers: [AppController, DocumentsController],
  providers: [
    Repository,
    DocumentsService,
    DocumentParser,
    { provide: FileStorage, useClass: LocalFileStorage },
    AppService,
    AiService,
    { provide: AiProvider, useFactory: configuredAiProvider },
    { provide: PaymentProvider, useClass: MockPaymentProvider },
    { provide: NotificationSender, useClass: MockNotificationSender },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
