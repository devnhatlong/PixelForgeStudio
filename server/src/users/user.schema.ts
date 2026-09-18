import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type UserDocument = HydratedDocument<User>;

/** All timestamps are epoch milliseconds (Date.now()), never Date objects. */
@Schema({ timestamps: false })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true, index: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: Number, required: true, default: () => Date.now() })
  createdAt: number;

  @Prop({ type: Number, required: true, default: () => Date.now() })
  updatedAt: number;

  @Prop({ type: Number })
  lastLoginAt?: number;
}

export const UserSchema = SchemaFactory.createForClass(User);
