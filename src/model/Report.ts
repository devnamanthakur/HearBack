import mongoose, { Schema, Document } from "mongoose";

export type ReportTargetType = "topic" | "response";
export type ReportStatus = "pending" | "resolved" | "dismissed";

export interface Report extends Document {
  communityId: mongoose.Types.ObjectId;
  targetType: ReportTargetType;
  targetId: mongoose.Types.ObjectId;
  reporterId: mongoose.Types.ObjectId;
  reason: string;
  note?: string;
  status: ReportStatus;
  resolvedBy?: mongoose.Types.ObjectId;
  resolvedAt?: Date;
  actionTaken?: string;
  createdAt: Date;
}

const ReportSchema: Schema<Report> = new Schema({
  communityId: {
    type: Schema.Types.ObjectId,
    ref: "Community",
    required: true,
    index: true,
  },
  targetType: {
    type: String,
    enum: ["topic", "response"],
    required: true,
  },
  targetId: {
    type: Schema.Types.ObjectId,
    required: true,
    index: true,
  },
  reporterId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  reason: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
  },
  note: {
    type: String,
    trim: true,
    maxlength: 500,
  },
  status: {
    type: String,
    enum: ["pending", "resolved", "dismissed"],
    default: "pending",
    index: true,
  },
  resolvedBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  resolvedAt: {
    type: Date,
  },
  actionTaken: {
    type: String,
    trim: true,
    maxlength: 200,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// A student can only have one *pending* report per target. Resolved/dismissed
// reports are excluded so the same content can be reported again later.
ReportSchema.index(
  { targetId: 1, reporterId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "pending" },
    name: "target_reporter_pending_unique",
  },
);

const ReportModel =
  (mongoose.models["Report"] as mongoose.Model<Report>) ||
  mongoose.model<Report>("Report", ReportSchema);

export default ReportModel;
