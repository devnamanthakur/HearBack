import mongoose, { Schema, Document } from "mongoose";

export interface RateLimit extends Document {
  key: string;
  count: number;
  expiresAt: Date;
}

const RateLimitSchema: Schema<RateLimit> = new Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  count: {
    type: Number,
    required: true,
    default: 0,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 },
  },
});

const RateLimitModel =
  (mongoose.models["RateLimit"] as mongoose.Model<RateLimit>) ||
  mongoose.model<RateLimit>("RateLimit", RateLimitSchema);

export default RateLimitModel;
