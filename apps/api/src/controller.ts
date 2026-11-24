import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import {
  RegisterSchema,
  LoginSchema,
  MaterialSchema,
  UserSchema,
  AnswerSchema,
  TopUpSchema,
  LimitSchema,
} from "@praktikum/types";
import { Allow, AuthRequest, parse, Public, userView } from "./auth";
import { AppService } from "./service";
@Controller()
export class AppController {
  constructor(@Inject(AppService) private service: AppService) {}
  @Public() @Get("health") health() {
    return { ok: true };
  }
  @Public() @Post("auth/register") register(@Body() x: unknown) {
    return this.service.register(parse(RegisterSchema, x));
  }
  @Public() @Post("auth/login") login(@Body() x: unknown) {
    return this.service.login(parse(LoginSchema, x));
  }
  @Post("auth/logout") logout(@Req() r: AuthRequest) {
    return this.service.logout(
      r.headers.authorization?.replace(/^Bearer /, "") ?? "",
    );
  }
  @Get("me") me(@Req() r: AuthRequest) {
    return userView(r.user);
  }
  @Allow("OWNER", "MANAGER", "EMPLOYEE") @Get("dashboard") dashboard(
    @Req() r: AuthRequest,
  ) {
    return this.service.dashboard(r.user);
  }
  @Allow("OWNER", "MANAGER") @Post("materials") material(
    @Req() r: AuthRequest,
    @Body() x: unknown,
  ) {
    return this.service.material(r.user, parse(MaterialSchema, x));
  }
  @Allow("OWNER", "MANAGER") @Post("materials/:id/generate") generate(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.generate(r.user, id);
  }
  @Allow("OWNER", "MANAGER", "EMPLOYEE")
  @Post("assignments/:id/attempts")
  attempt(@Req() r: AuthRequest, @Param("id") id: string, @Body() x: unknown) {
    return this.service.attempt(r.user, id, parse(AnswerSchema, x));
  }
  @Allow("OWNER") @Post("users") user(
    @Req() r: AuthRequest,
    @Body() x: unknown,
  ) {
    return this.service.addUser(r.user, parse(UserSchema, x));
  }
  @Allow("OWNER") @Patch("users/:id/limit") limit(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() x: unknown,
  ) {
    return this.service.limit(r.user, id, parse(LimitSchema, x));
  }
  @Allow("OWNER") @Post("credits/topup") topup(
    @Req() r: AuthRequest,
    @Body() x: unknown,
  ) {
    return this.service.topup(r.user, parse(TopUpSchema, x));
  }
  @Allow("SUPER_ADMIN") @Get("admin/ledger") ledger() {
    return this.service.ledger();
  }
}
