import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, createParamDecorator } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";

export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException("Cần đăng nhập");
    try {
      req.user = this.jwt.verify<JwtPayload>(token);
      return true;
    } catch {
      throw new UnauthorizedException("Phiên đăng nhập hết hạn");
    }
  }
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): JwtPayload => {
  const req = ctx.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
  return req.user as JwtPayload;
});
