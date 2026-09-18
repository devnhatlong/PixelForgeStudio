import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { JwtService } from "@nestjs/jwt";
import { Model } from "mongoose";
import * as bcrypt from "bcryptjs";
import { User, UserDocument } from "../users/user.schema";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly jwt: JwtService,
  ) {}

  private toPublic(u: UserDocument): AuthUser {
    return { id: u._id.toString(), email: u.email, name: u.name };
  }

  private validate(email?: string, password?: string) {
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new BadRequestException("Email không hợp lệ");
    if (!password || password.length < 6) throw new BadRequestException("Mật khẩu phải có ít nhất 6 ký tự");
  }

  async register(email: string, password: string, name: string) {
    this.validate(email, password);
    if (!name || name.trim().length < 2) throw new BadRequestException("Tên hiển thị quá ngắn");
    const exists = await this.userModel.exists({ email: email.toLowerCase() });
    if (exists) throw new ConflictException("Email đã được đăng ký");
    const passwordHash = await bcrypt.hash(password, 10);
    const now = Date.now();
    const user = await this.userModel.create({ email: email.toLowerCase(), passwordHash, name: name.trim(), createdAt: now, updatedAt: now, lastLoginAt: now });
    return this.issue(user);
  }

  async login(email: string, password: string) {
    if (!email || !password) throw new BadRequestException("Thiếu email hoặc mật khẩu");
    const user = await this.userModel.findOne({ email: email.toLowerCase() });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new UnauthorizedException("Email hoặc mật khẩu không đúng");
    user.lastLoginAt = Date.now();
    await user.save();
    return this.issue(user);
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new UnauthorizedException();
    return this.toPublic(user);
  }

  private issue(user: UserDocument) {
    const pub = this.toPublic(user);
    const token = this.jwt.sign({ sub: pub.id, email: pub.email, name: pub.name });
    return { token, user: pub };
  }
}
