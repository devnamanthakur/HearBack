import mongoose, { Schema, Document } from "mongoose";

export interface CommunityMember {
  userId: mongoose.Types.ObjectId;
  nickname: string;
  joinedAt: Date;
  mutedUntil?: Date;
  strikes: number;
}

export interface BannedMember {
  userId: mongoose.Types.ObjectId;
  nickname: string;
  bannedAt: Date;
}

export type CommunityType = "normal" | "educational";
export type JoinPolicy = "open" | "approval";

export interface Community extends Document {
  slug: string;
  name: string;
  description: string;
  avatarColor: string;
  inviteCode: string;
  type: CommunityType;
  requiredEmailDomains: string[];
  joinPolicy: JoinPolicy;
  aiModeration: boolean;
  adminIds: mongoose.Types.ObjectId[];
  members: CommunityMember[];
  bannedUserIds: mongoose.Types.ObjectId[];
  bannedMembers: BannedMember[];
  bannedSchoolEmailHashes: string[];
  inviteCodeExpiresAt?: Date;
  createdAt: Date;
}

const MemberSchema = new Schema<CommunityMember>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "user is required"],
    },
    nickname: {
      type: String,
      required: [true, "nickname is required"],
      trim: true,
      minlength: [2, "nickname should contain at least 2 characters"],
      maxlength: [24, "nickname should not exceed 24 characters"],
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    mutedUntil: {
      type: Date,
    },
    strikes: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false },
);

const BannedMemberSchema = new Schema<BannedMember>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    nickname: {
      type: String,
      required: true,
      trim: true,
      maxlength: 24,
    },
    bannedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const CommunitySchema: Schema<Community> = new Schema({
  slug: {
    type: String,
    required: [true, "slug is required"],
    unique: true,
    trim: true,
    lowercase: true,
  },
  name: {
    type: String,
    required: [true, "community name is required"],
    trim: true,
    minlength: [3, "community name should contain at least 3 characters"],
    maxlength: [50, "community name should not exceed 50 characters"],
  },
  description: {
    type: String,
    required: [true, "community description is required"],
    trim: true,
    maxlength: [300, "description should not exceed 300 characters"],
  },
  avatarColor: {
    type: String,
    default: "#6366f1",
  },
  inviteCode: {
    type: String,
    required: [true, "invite code is required"],
    unique: true,
    uppercase: true,
    trim: true,
  },
  type: {
    type: String,
    enum: ["normal", "educational"],
    default: "normal",
  },
  requiredEmailDomains: [
    {
      type: String,
      lowercase: true,
      trim: true,
    },
  ],
  joinPolicy: {
    type: String,
    enum: ["open", "approval"],
    default: "open",
  },
  aiModeration: {
    type: Boolean,
    default: true,
  },
  adminIds: [
    {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  members: [MemberSchema],
  bannedUserIds: [
    {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  bannedMembers: [BannedMemberSchema],
  bannedSchoolEmailHashes: [
    {
      type: String,
      trim: true,
    },
  ],
  inviteCodeExpiresAt: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const CommunityModel =
  (mongoose.models["Community"] as mongoose.Model<Community>) ||
  mongoose.model<Community>("Community", CommunitySchema);

export default CommunityModel;