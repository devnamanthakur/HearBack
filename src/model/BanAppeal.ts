import mongoose, { Schema, Document } from "mongoose";

export type BanAppealStatus = "pending" | "approved" | "denied";

export interface BanAppeal extends Document {
  communityId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  nickname: string;
  message: string;
  status: BanAppealStatus;
  decidedBy?: mongoose.Types.ObjectId;
  decidedAt?: Date;
  createdAt: Date;
}

const BanAppealSchema: Schema<BanAppeal> = new Schema({
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
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500,
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

const BanAppealModel =
  (mongoose.models["BanAppeal"] as mongoose.Model<BanAppeal>) ||
  mongoose.model<BanAppeal>("BanAppeal", BanAppealSchema);

export default BanAppealModel;
