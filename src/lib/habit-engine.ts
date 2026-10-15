import mongoose from "mongoose";
import { Habit, HabitLog } from "@/models";

export async function recordHabitLog(input: { userId: mongoose.Types.ObjectId; habitId: mongoose.Types.ObjectId; localDate: string; status: "done" | "rest" }) {
  const ownedHabit = await Habit.exists({ _id: input.habitId, userId: input.userId, archivedAt: null });
  if (!ownedHabit) throw new Error("Not found");
  const filter = { userId: input.userId, habitId: input.habitId, localDate: input.localDate };
  try {
    return await HabitLog.findOneAndUpdate(filter, { $set: { status: input.status, correctedAt: new Date() }, $setOnInsert: filter }, { upsert: true, new: true, runValidators: true });
  } catch (error) {
    // Concurrent first writes may race on the unique user/habit/date index.
    if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) throw error;
    return HabitLog.findOneAndUpdate(filter, { $set: { status: input.status, correctedAt: new Date() } }, { new: true, runValidators: true });
  }
}
