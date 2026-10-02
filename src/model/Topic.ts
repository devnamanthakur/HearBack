import mongoose, { Schema, Document } from "mongoose";

export type TopicRole = "admin" | "member";

export interface Attachment {
  name: string;
  mime: string;
  data: string;
}

export interface Topic extends Document {
  communityId: mongoose.Types.ObjectId;
  authorId: mongoose.Types.ObjectId;
  role: TopicRole;
  authorNickname?: string;
  title: string;
  body: string;
  notesUrl?: string;
  image?: Attachment;
  attachment?: Attachment;
  doubts: mongoose.Types.ObjectId[];
  isClosed: boolean;
  isHidden: boolean;
  hiddenBy?: mongoose.Types.ObjectId;
  hiddenAt?: Date;
  needsReview: boolean;
  createdAt: Date;
}

const AttachmentSchema = new Schema<Attachment>(
  {
    name: { type: String, required: true, trim: true },
    mime: { type: String, required: true },
    data: { type: String, required: true },
  },
  { _id: false },
);

const TopicSchema: Schema<Topic> = new Schema({
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
  title: {
    type: String,
    required: [true, "topic title is required"],
    trim: true,
    minlength: [4, "title should contain at least 4 characters"],
    maxlength: [120, "title should not exceed 120 characters"],
  },
  body: {
    type: String,
    required: [true, "topic body is required"],
    trim: true,
    maxlength: [2000, "body should not exceed 2000 characters"],
  },
  notesUrl: {
    type: String,
    trim: true,
    maxlength: [500, "notes link should not exceed 500 characters"],
  },
  image: AttachmentSchema,
  attachment: AttachmentSchema,
  doubts: [
    {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  isClosed: {
    type: Boolean,
    default: false,
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

const TopicModel =
  (mongoose.models["Topic"] as mongoose.Model<Topic>) ||
  mongoose.model<Topic>("Topic", TopicSchema);

export default TopicModel;