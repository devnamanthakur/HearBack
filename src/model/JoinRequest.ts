import mongoose, { Schema, Document } from "mongoose";

export type JoinRequestStatus = "pending" | "approved" | "denied";

export interface JoinRequest extends Document {
  communityId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  nickname: string;
  status: JoinRequestStatus;
  decidedBy?: mongoose.Types.ObjectId;
  decidedAt?: Date;
  createdAt: Date;
}

const JoinRequestSchema: Schema<JoinRequest> = new Schema({
  communityId: {
    type: Schema.Types.ObjectId,
    ref: "Community",
    required: true,
    index: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  nickname: {
    type: String,
    required: true,
    trim: true,
    maxlength: 24,
  },
  status: {
    type: String,
    enum: ["pending", "approved", "denied"],
    default: "pending",
    index: true,
  },
  decidedBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  decidedAt: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const JoinRequestModel =
  (mongoose.models["JoinRequest"] as mongoose.Model<JoinRequest>) ||
  mongoose.model<JoinRequest>("JoinRequest", JoinRequestSchema);

export default JoinRequestModel;
