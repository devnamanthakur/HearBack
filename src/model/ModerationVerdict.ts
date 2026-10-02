import mongoose, { Schema, Document } from "mongoose";

/**
 * Shared verdict cache for AI content moderation.
 *
 * Only a SHA-256 hash of the normalised content and the resulting boolean are
 * stored — never the raw text — so the cache cannot become a shadow copy of
 * user content. A TTL index expires entries after 24 hours.
 */
export interface ModerationVerdict extends Document {
  hash: string;
  toxic: boolean;
  expiresAt: Date;
}

const TTL_SECONDS = 24 * 60 * 60;

const ModerationVerdictSchema: Schema<ModerationVerdict> = new Schema({
  hash: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  toxic: {
    type: Boolean,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: TTL_SECONDS },
  },
});

const ModerationVerdictModel =
  (mongoose.models["ModerationVerdict"] as mongoose.Model<ModerationVerdict>) ||
  mongoose.model<ModerationVerdict>("ModerationVerdict", ModerationVerdictSchema);

export default ModerationVerdictModel;
