import dbConnect from "@/lib/dbConnect";
import UserModel from "@/model/User";
import { auth } from "@/lib/auth";
import mongoose from "mongoose";

const checkSession = async () => {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: Response.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    ) };
  }
  return { userId: session.user.id };
};

export async function GET() {
  try {
    await dbConnect();
    const { error, userId } = await checkSession();
    if (error) return error;

    const user = await UserModel.findById(userId).select(
      "username isAcceptingMessage messages",
    );

    if (!user) {
      return Response.json(
        { success: false, message: "User not found" },
        { status: 404 },
      );
    }

    const messages = user.messages
      .map((message) => ({
        _id: message._id.toString(),
        content: message.content,
        createdAt: message.createdAt,
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return Response.json(
      {
        success: true,
        message: "Messages fetched successfully",
        username: user.username,
        isAcceptingMessage: user.isAcceptingMessage,
        messages,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error fetching messages", error);
    return Response.json(
      { success: false, message: "Error fetching messages" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await dbConnect();
    const { error, userId } = await checkSession();
    if (error) return error;

    const { messageId } = await request.json();

    if (!messageId || !mongoose.Types.ObjectId.isValid(messageId)) {
      return Response.json(
        { success: false, message: "Invalid message id" },
        { status: 400 },
      );
    }

    const result = await UserModel.updateOne(
      { _id: userId },
      { $pull: { messages: { _id: new mongoose.Types.ObjectId(messageId) } } },
    );

    if (result.modifiedCount === 0) {
      return Response.json(
        { success: false, message: "Message not found" },
        { status: 404 },
      );
    }

    return Response.json(
      { success: true, message: "Message deleted successfully" },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error deleting message", error);
    return Response.json(
      { success: false, message: "Error deleting message" },
      { status: 500 },
    );
  }
}