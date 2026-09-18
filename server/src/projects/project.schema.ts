import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema, Types } from "mongoose";

export type ProjectDocument = HydratedDocument<Project>;

/** All timestamps are epoch milliseconds (Date.now()), never Date objects. */
@Schema({ timestamps: false })
export class Project {
  /** document id generated on the client (stable across uploads) */
  @Prop({ required: true, index: true })
  clientId: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  ownerId: Types.ObjectId;

  @Prop({ default: "" })
  ownerName: string;

  @Prop({ required: true, default: 32 })
  width: number;

  @Prop({ required: true, default: 32 })
  height: number;

  @Prop({ default: 1 })
  frameCount: number;

  @Prop({ default: "" })
  thumbnail: string;

  /** full PixelDocument JSON */
  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  data: Record<string, unknown>;

  @Prop({ default: false, index: true })
  published: boolean;

  @Prop({ default: "" })
  description: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ default: 0 })
  downloads: number;

  @Prop({ type: Number, required: true, default: () => Date.now() })
  createdAt: number;

  @Prop({ type: Number, required: true, default: () => Date.now(), index: true })
  updatedAt: number;

  /** when the project was (last) published to the marketplace */
  @Prop({ type: Number })
  publishedAt?: number;
}

export const ProjectSchema = SchemaFactory.createForClass(Project);
ProjectSchema.index({ ownerId: 1, clientId: 1 }, { unique: true });
