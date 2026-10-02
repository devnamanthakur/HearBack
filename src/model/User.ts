import mongoose, { Schema, Document } from "mongoose";

export interface Message extends Document {
  content: string;
  createdAt: Date;
}

const MessageSchema: Schema<Message> = new Schema({
  content: {
    type: String,
    required: [true, "message content is required"],
    minlength: [4, "message should contain at least 4 characters"],
    maxlength: [500, "message should not exceed 500 characters"],
  },
  createdAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
});

export interface User extends Document {
  username: string;
  email: string;
  password: string;
  verifyCode: string;
  verifyCodeExpiry: Date;
  isVerified: boolean;
  isAcceptingMessage: boolean;
  messages: Message[];
  schoolEmail?: string;
  schoolDomain?: string;
  schoolEmailVerifiedAt?: Date;
  pendingSchoolEmail?: string;
  schoolVerifyCode?: string;
  schoolVerifyCodeExpiry?: Date;
}

const UserSchema: Schema<User> = new Schema({
  username: {
    type: String,
    required: [true, "username is required"],
    unique: true,
    trim: true,
    minlength: [4, "username should contain at least 4 characters"],
    maxlength: [20, "username should not exceed 20 characters"],
  },
  email: {
    type: String,
    required: [true, "email is required"],
    unique: true,
    match: [
      /^[\w.-]+@([\w-]+\.)+[\w-]{2,4}$/,
      "Please fill a valid email address",
    ],
  },
  password: {
    type: String,
    required: [true, "password is required"],
  },
  verifyCode: {
    type: String,
    required: [true, "please enter the verification code"],
  },
  verifyCodeExpiry: {
    type: Date,
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  isAcceptingMessage: {
    type: Boolean,
    required: true,
    default: true,
  },

  messages: [MessageSchema],

  schoolEmail: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,
  },
  schoolDomain: {
    type: String,
    lowercase: true,
    trim: true,
  },
  schoolEmailVerifiedAt: {
    type: Date,
  },
  pendingSchoolEmail: {
    type: String,
    lowercase: true,
    trim: true,
  },
  schoolVerifyCode: {
    type: String,
  },
  schoolVerifyCodeExpiry: {
    type: Date,
  },
});

const UserModel =
  (mongoose.models["User"] as mongoose.Model<User>) ||
  mongoose.model<User>("User", UserSchema);

export default UserModel;
