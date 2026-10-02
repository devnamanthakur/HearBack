import dbConnect from "@/lib/dbConnect";
import CommunityModel from "@/model/Community";
import ReportModel from "@/model/Report";
import TopicModel from "@/model/Topic";
import ResponseModel from "@/model/Response";
import UserModel from "@/model/User";
import { auth } from "@/lib/auth";
import { isAdmin, sameObjectId } from "@/helpers/communityUtils";
import { logModeration } from "@/lib/moderationLog";
import { hashSchoolEmail } from "@/lib/ban";
import mongoose from "mongoose";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string; reportId: string }> },
) {
  try {
    await dbConnect();
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json(
        { success: false, message: "Unauthorized" },
        { status: 401 },
      );
    }
    const { slug, reportId } = await params;

    if (!mongoose.Types.ObjectId.isValid(reportId)) {
      return Response.json(
        { success: false, message: "Invalid report id" },
        { status: 400 },
      );
    }

    const community = await CommunityModel.findOne({ slug });
    if (!community) {
      return Response.json(
        { success: false, message: "Community not found" },
        { status: 404 },
      );
    }
    if (!isAdmin(community, session.user.id)) {
      return Response.json(
        { success: false, message: "Only admins can ban authors" },
        { status: 403 },
      );
    }

    const report = await ReportModel.findOne({
      _id: reportId,
      communityId: community._id,
      status: "pending",
    });
    if (!report) {
      return Response.json(
        { success: false, message: "Pending report not found" },
        { status: 404 },
      );
    }

    const target =
      report.targetType === "topic"
        ? await TopicModel.findById(report.targetId)
        : await ResponseModel.findById(report.targetId);
    if (!target) {
      return Response.json(
        { success: false, message: "Reported content no longer exists" },
        { status: 404 },
      );
    }

    const authorId = target.authorId.toString();
    if (sameObjectId(authorId, session.user.id)) {
      return Response.json(
        { success: false, message: "You cannot ban yourself" },
        { status: 400 },
      );
    }
    if (community.adminIds.some((id) => sameObjectId(id, authorId))) {
      return Response.json(
        { success: false, message: "You cannot ban another admin" },
        { status: 400 },
      );
    }

    const author = await UserModel.findById(authorId).select(
      "schoolEmail schoolEmailVerifiedAt",
    );

    // Remember the nickname the student posted under, so an appeal can be
    // shown to the teacher under the same pseudonym they already know.
    const pastNickname =
      community.members.find((member) => sameObjectId(member.userId, authorId))
        ?.nickname ??
      target.authorNickname ??
      "Anonymous";

    // Remove membership and record both blocks without ever exposing identity.
    community.members = community.members.filter(
      (member) => !sameObjectId(member.userId, authorId),
    );
    if (!community.bannedUserIds.some((id) => sameObjectId(id, authorId))) {
      community.bannedUserIds.push(new mongoose.Types.ObjectId(authorId));
    }
    if (!community.bannedMembers.some((b) => sameObjectId(b.userId, authorId))) {
      community.bannedMembers.push({
        userId: new mongoose.Types.ObjectId(authorId),
        nickname: pastNickname,
        bannedAt: new Date(),
      });
    }
    if (
      author?.schoolEmail &&
      author.schoolEmailVerifiedAt &&
      author.schoolEmail
    ) {
      const hash = hashSchoolEmail(author.schoolEmail);
      if (!community.bannedSchoolEmailHashes.includes(hash)) {
        community.bannedSchoolEmailHashes.push(hash);
      }
    }
    await community.save();

    // Hide the reported content.
    if (report.targetType === "topic") {
      await TopicModel.updateOne(
        { _id: report.targetId },
        {
          $set: {
            isHidden: true,
            hiddenBy: new mongoose.Types.ObjectId(session.user.id),
            hiddenAt: new Date(),
            needsReview: false,
          },
        },
      );
    } else {
      await ResponseModel.updateOne(
        { _id: report.targetId },
        {
          $set: {
            isHidden: true,
            hiddenBy: new mongoose.Types.ObjectId(session.user.id),
            hiddenAt: new Date(),
            needsReview: false,
          },
        },
      );
    }

    report.status = "resolved";
    report.resolvedBy = new mongoose.Types.ObjectId(session.user.id);
    report.resolvedAt = new Date();
    report.actionTaken = "author banned (anonymous)";
    await report.save();

    await logModeration({
      communityId: community._id,
      actorId: session.user.id,
      action: "report_author_banned",
      targetType: "report",
      targetId: report._id.toString(),
      targetUserId: authorId,
      detail: `Banned author of ${report.targetType} ${report.targetId.toString()} (identity not revealed)`,
    });

    return Response.json(
      {
        success: true,
        message:
          "Author banned anonymously and the reported content was hidden. Their identity was not revealed to you.",
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error banning report author", error);
    return Response.json(
      { success: false, message: "Error banning author" },
      { status: 500 },
    );
  }
}
