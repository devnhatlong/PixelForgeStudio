import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import type { JwtPayload } from "./auth.guard";

/** Attaches req.user when a valid Bearer token is present; never rejects. Endpoints decide what anonymous users may do. */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (token) {
      try {
        req.user = this.jwt.verify<JwtPayload>(token);
      } catch {
        /* invalid token → anonymous */
      }
    }
    return true;
  }
}
