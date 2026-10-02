import mongoose, { Schema, Document } from "mongoose";
import type { TopicRole, Attachment } from "@/model/Topic";

export interface ResponseDoc extends Document {
  topicId: mongoose.Types.ObjectId;
  communityId: mongoose.Types.ObjectId;
  authorId: mongoose.Types.ObjectId;
  role: TopicRole;
  authorNickname?: string;
  body: string;
  image?: Attachment;
  doubts: mongoose.Types.ObjectId[];
  replyToId?: mongoose.Types.ObjectId | null;
  isHidden: boolean;
  hiddenBy?: mongoose.Types.ObjectId;
  hiddenAt?: Date;
  needsReview: boolean;
  createdAt: Date;
}

const ImageSchema = new Schema<Attachment>(
  {
    name: { type: String, required: true, trim: true },
    mime: { type: String, required: true },
    data: { type: String, required: true },
  },
  { _id: false },
);

const ResponseSchema: Schema<ResponseDoc> = new Schema({
  topicId: {
    type: Schema.Types.ObjectId,
    ref: "Topic",
    required: [true, "topic is required"],
  },
  communityId: {
    type: Schema.Types.ObjectId,
    ref: "Community",
    required: [true, "community is required"],
  },
  authorId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: [true, "author is required"],
  },
  role: {
    type: String,
    enum: ["admin", "member"],
    default: "member",
  },
  authorNickname: {
    type: String,
    trim: true,
  },
  body: {
    type: String,
    required: [true, "response body is required"],
    trim: true,
    maxlength: [2000, "response should not exceed 2000 characters"],
  },
  image: ImageSchema,
  doubts: [
    {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  replyToId: {
    type: Schema.Types.ObjectId,
    ref: "Response",
    default: null,
  },
  isHidden: {
    type: Boolean,
    default: false,
  },
  hiddenBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  hiddenAt: {
    type: Date,
  },
  needsReview: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const ResponseModel =
  (mongoose.models["Response"] as mongoose.Model<ResponseDoc>) ||
  mongoose.model<ResponseDoc>("Response", ResponseSchema);

export default ResponseModel;