import dbConnect from "@/lib/dbConnect";
import CommunityModel from "@/model/Community";
import ReportModel from "@/model/Report";
import { auth } from "@/lib/auth";
import { parseJsonObject } from "@/helpers/parseBody";
import { isAdmin } from "@/helpers/communityUtils";
import { logModeration } from "@/lib/moderationLog";
import mongoose from "mongoose";

export async function PATCH(
  request: Request,
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
        { success: false, message: "Only admins can review reports" },
        { status: 403 },
      );
    }

    const body = await parseJsonObject(request);
    const action = typeof body?.action === "string" ? body.action : "";
    if (action !== "dismiss" && action !== "resolve") {
      return Response.json(
        { success: false, message: "action must be dismiss or resolve" },
        { status: 400 },
      );
    }

    const report = await ReportModel.findOne({
      _id: reportId,
      communityId: community._id,
    });
    if (!report) {
      return Response.json(
        { success: false, message: "Report not found" },
        { status: 404 },
      );
    }

    report.status = action === "dismiss" ? "dismissed" : "resolved";
    report.resolvedBy = new mongoose.Types.ObjectId(session.user.id);
    report.resolvedAt = new Date();
    if (typeof body?.actionTaken === "string" && body.actionTaken.trim()) {
      report.actionTaken = body.actionTaken.trim().slice(0, 200);
    }
    await report.save();

    await logModeration({
      communityId: community._id,
      actorId: session.user.id,
      action: action === "dismiss" ? "report_dismissed" : "report_resolved",
      targetType: "report",
      targetId: report._id.toString(),
      detail: report.actionTaken,
    });

    return Response.json(
      {
        success: true,
        message:
          action === "dismiss" ? "Report dismissed" : "Report resolved",
        status: report.status,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error updating report", error);
    return Response.json(
      { success: false, message: "Error updating report" },
      { status: 500 },
    );
  }
}
