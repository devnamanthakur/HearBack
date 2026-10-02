import mongoose from "mongoose";
import ReportModel from "@/model/Report";
import ModerationVerdictModel from "@/model/ModerationVerdict";
/*note:This file is used to check database connections 
to avoid multiple connection to the database*/

type ConnectionObject = {
  isConnected?: number;
};

const connection: ConnectionObject = {}; //this stores the connection state
let indexesSynced = false;

async function dbConnect(): Promise<void> {
  if (connection.isConnected) {
    return;
  }

  try {
    const db = await mongoose.connect(process.env.MONGODB_URI || "", {
      serverSelectionTimeoutMS: 8000,
    });
    connection.isConnected = db.connections[0].readyState;

    if (!indexesSynced) {
      indexesSynced = true;
      // Build the indexes the app depends on in production (the unique
      // pending-report index and the moderation TTL index) without dropping
      // any indexes a DBA may have added. `createIndexes` is non-destructive.
      void Promise.all([
        ReportModel.createIndexes(),
        ModerationVerdictModel.createIndexes(),
      ]).catch((error) => {
        console.error(
          "Failed to create model indexes. The unique pending-report index " +
            "will not exist if duplicate pending reports are already stored; " +
            "dedupe them and restart.",
          error,
        );
      });
    }
  } catch (error) {
    console.error("DB not able to be connected", error);
    throw error;
  }
}

export default dbConnect;
