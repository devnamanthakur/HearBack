import mongoose, { Schema, Document } from "mongoose";

export interface ModerationLog extends Document {
  communityId: mongoose.Types.ObjectId;
  actorId?: mongoose.Types.ObjectId;
  action: string;
  targetType: "topic" | "response" | "member" | "community" | "report" | "ai";
  targetId?: string;
  targetUserId?: mongoose.Types.ObjectId;
  detail?: string;
  createdAt: Date;
}

const ModerationLogSchema: Schema<ModerationLog> = new Schema({
  communityId: {
    type: Schema.Types.ObjectId,
    ref: "Community",
    required: true,
    index: true,
  },
  actorId: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  action: {
    type: String,
    required: true,
    trim: true,
    maxlength: 60,
  },
  targetType: {
    type: String,
    enum: ["topic", "response", "member", "community", "report", "ai"],
    required: true,
  },
  targetId: {
    type: String,
    trim: true,
  },
  targetUserId: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  detail: {
    type: String,
    trim: true,
    maxlength: 500,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

const ModerationLogModel =
  (mongoose.models["ModerationLog"] as mongoose.Model<ModerationLog>) ||
  mongoose.model<ModerationLog>("ModerationLog", ModerationLogSchema);

export default ModerationLogModel;
