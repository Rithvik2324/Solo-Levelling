import "server-only";
import mongoose from "mongoose";
import { Campaign, CampaignMilestone, Habit, HabitLog, PlayerProfile, Quest, QuestCompletion, QuestScheduleOverride, User, XpTransaction } from "@/models";

type CachedConnection = { connection: typeof mongoose | null; promise: Promise<typeof mongoose> | null; indexPromise: Promise<void> | null };
const globalForMongoose = globalThis as typeof globalThis & { awakeningMongoose?: CachedConnection };
const cached = globalForMongoose.awakeningMongoose ?? { connection: null, promise: null, indexPromise: null };
globalForMongoose.awakeningMongoose = cached;

export async function connectToDatabase() {
  if (!cached.connection) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("Database is not configured. Set MONGODB_URI in the server environment.");
    if (!cached.promise) {
      cached.promise = mongoose.connect(uri, {
        ...(process.env.MONGODB_DB ? { dbName: process.env.MONGODB_DB } : {}),
        serverSelectionTimeoutMS: 10000,
        autoIndex: true
      }).catch(error => {
        cached.promise = null;
        const reason = error instanceof Error ? error.message : "unknown connection error";
        console.error("MongoDB connection failed:", reason.replace(/(mongodb(?:\+srv)?:\/\/)[^@\s]+@/gi, "$1[redacted]@"));
        throw new Error("Could not connect to MongoDB. Check the server configuration and Atlas network access.");
      });
    }
    cached.connection = await cached.promise;
  }
  if (!cached.indexPromise) {
    cached.indexPromise = Promise.all([User, PlayerProfile, Quest, QuestCompletion, XpTransaction, Habit, HabitLog, Campaign, CampaignMilestone, QuestScheduleOverride].map(model => model.init())).then(() => undefined).catch(error => {
      cached.indexPromise = null;
      console.error("MongoDB index initialization failed:", error instanceof Error ? error.message : "unknown index error");
      throw new Error("Database indexes could not be initialized. Check database permissions and index configuration.");
    });
  }
  await cached.indexPromise;
  return cached.connection;
}
