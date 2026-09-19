import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export type FolderDocument = HydratedDocument<Folder>;

/** Folder ids are generated on the client so local and cloud stay in sync. Timestamps are epoch ms. */
@Schema({ timestamps: false })
export class Folder {
  @Prop({ required: true, index: true })
  clientId: string;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  ownerId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: Number, required: true, default: () => Date.now() })
  createdAt: number;

  @Prop({ type: Number, required: true, default: () => Date.now() })
  updatedAt: number;
}

export const FolderSchema = SchemaFactory.createForClass(Folder);
FolderSchema.index({ ownerId: 1, clientId: 1 }, { unique: true });
