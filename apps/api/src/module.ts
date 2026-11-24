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
  controllers: [AppController],
  providers: [
    Repository,
    AppService,
    AiService,
    { provide: AiProvider, useFactory: configuredAiProvider },
    { provide: PaymentProvider, useClass: MockPaymentProvider },
    { provide: NotificationSender, useClass: MockNotificationSender },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
