import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { completeQuest } from "@/lib/quest-engine";
import { recordHabitLog } from "@/lib/habit-engine";
import { Habit, HabitLog, PlayerProfile, Quest, QuestCompletion, User, XpTransaction } from "@/models";

test("Mongo quest completion is idempotent under concurrency and owner scoped", { skip: !process.env.MONGODB_TEST_URI }, async () => {
  const previousUri = process.env.MONGODB_URI; const previousDb = process.env.MONGODB_DB;
  process.env.MONGODB_URI = process.env.MONGODB_TEST_URI;
  process.env.MONGODB_DB = "awakening_integration_test";
  try {
    await connectToDatabase();
    await Promise.all([User, PlayerProfile, Quest, QuestCompletion, XpTransaction, Habit, HabitLog].map(model => model.init()));
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [owner, stranger] = await Promise.all([
      User.create({ provider: "google", providerSubject: `test-owner-${suffix}`, email: `owner-${suffix}@example.test`, displayName: "Test Owner" }),
      User.create({ provider: "google", providerSubject: `test-stranger-${suffix}`, email: `stranger-${suffix}@example.test`, displayName: "Test Stranger" })
    ]);
    const quest = await Quest.create({ userId: owner._id, title: "Concurrent completion", category: "testing", xpReward: 75, recurrence: "daily", weekdays: [] });
    const outcomes = await Promise.all([
      completeQuest({ userId: owner._id, questId: String(quest._id), idempotencyKey: `retry-${suffix}-one`, timezone: "UTC" }),
      completeQuest({ userId: owner._id, questId: String(quest._id), idempotencyKey: `retry-${suffix}-two`, timezone: "UTC" })
    ]);
    assert.equal(outcomes[0].totalXp, 75);
    assert.equal(outcomes[1].totalXp, 75);
    assert.equal(await QuestCompletion.countDocuments({ userId: owner._id, questId: quest._id }), 1);
    assert.equal(await XpTransaction.countDocuments({ userId: owner._id, sourceKey: `quest:${String(outcomes[0].completion._id)}` }), 1);
    assert.equal((await PlayerProfile.findOne({ userId: owner._id }))?.totalXp, 75);
    await assert.rejects(() => completeQuest({ userId: stranger._id, questId: String(quest._id), idempotencyKey: `unauthorized-${suffix}`, timezone: "UTC" }), /Not found/);
    await assert.rejects(() => new Quest({ userId: owner._id, title: "Bad reward", category: "testing", xpReward: 10001 }).validate());
    const habit = await Habit.create({ userId: owner._id, title: "Daily practice", weekdays: [1, 2, 3, 4, 5] });
    await Promise.all(Array.from({ length: 8 }, () => recordHabitLog({ userId: owner._id, habitId: habit._id, localDate: "2026-01-05", status: "done" })));
    assert.equal(await HabitLog.countDocuments({ userId: owner._id, habitId: habit._id, localDate: "2026-01-05" }), 1);
    assert.equal(await HabitLog.countDocuments({ userId: stranger._id, habitId: habit._id }), 0);
    await assert.rejects(() => recordHabitLog({ userId: stranger._id, habitId: habit._id, localDate: "2026-01-05", status: "done" }).then(log => { if (!log) throw new Error("Not found"); }), /Not found/);
    await Promise.all([HabitLog.deleteMany({ userId: { $in: [owner._id, stranger._id] } }), Habit.deleteMany({ userId: { $in: [owner._id, stranger._id] } }), PlayerProfile.deleteMany({ userId: { $in: [owner._id, stranger._id] } }), XpTransaction.deleteMany({ userId: { $in: [owner._id, stranger._id] } }), QuestCompletion.deleteMany({ userId: { $in: [owner._id, stranger._id] } }), Quest.deleteMany({ userId: { $in: [owner._id, stranger._id] } }), User.deleteMany({ _id: { $in: [owner._id, stranger._id] } })]);
  } finally {
    await mongoose.disconnect();
    if (previousUri === undefined) delete process.env.MONGODB_URI; else process.env.MONGODB_URI = previousUri;
    if (previousDb === undefined) delete process.env.MONGODB_DB; else process.env.MONGODB_DB = previousDb;
  }
});
