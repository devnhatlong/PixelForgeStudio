import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AuthGuard, CurrentUser, JwtPayload } from "./auth.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  register(@Body() body: { email: string; password: string; name: string }) {
    return this.auth.register(body?.email, body?.password, body?.name);
  }

  @Post("login")
  login(@Body() body: { email: string; password: string }) {
    return this.auth.login(body?.email, body?.password);
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: JwtPayload) {
    return this.auth.me(user.sub);
  }
}
