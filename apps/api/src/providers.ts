import { Inject, Injectable } from "@nestjs/common";
import { Repository } from "./repository";
export abstract class PaymentProvider {
  abstract createTopUp(
    amount: number,
    key: string,
  ): Promise<{ status: "MOCKED"; amount: number; key: string }>;
}
@Injectable()
export class MockPaymentProvider extends PaymentProvider {
  async createTopUp(amount: number, key: string) {
    return { status: "MOCKED" as const, amount, key };
  }
}
export abstract class NotificationSender {
  abstract send(
    companyId: string,
    userId: string,
    message: string,
  ): Promise<void>;
}
@Injectable()
export class MockNotificationSender extends NotificationSender {
  constructor(@Inject(Repository) private db: Repository) {
    super();
  }
  async send(companyId: string, userId: string, message: string) {
    await this.db.notification.create({ data: { companyId, userId, message } });
  }
}
// Text is persisted directly in PostgreSQL; no file provider is needed in this MVP.
