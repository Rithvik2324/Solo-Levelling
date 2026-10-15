import assert from "node:assert/strict";
import test from "node:test";
import type { LifeModuleEntryRecord } from "@/lib/domain";
import { buildRecommendations, evaluateAchievements, isReviewWeekStart, validateAdaptiveMutation, weeklyReview } from "@/lib/adaptive-progress";
import { createCommandRecord, dismissRecommendation, getDismissedRecommendations, listCommandRecords, setNotificationState, getNotificationState, validateCommandRecord } from "@/lib/life-system-dev-store";

function moduleEntry(overrides: Partial<LifeModuleEntryRecord> & Pick<LifeModuleEntryRecord,"module"|"kind"|"status">, id: string): LifeModuleEntryRecord {
  return { id, title: id, description: "", fields: {}, createdAt: "2026-10-12T10:00:00.000Z", updatedAt: "2026-10-12T10:00:00.000Z", ...overrides };
}
function command(session: string, kind: "task"|"focusBlock"|"dailyPlan"|"dailyReview", title: string, date: string, status: string, fields: Record<string,string|number|boolean> = {}) {
  const parsed = validateCommandRecord({ kind, title, date, status, description: "", fields: kind === "focusBlock" ? { plannedMinutes: 25, breakMinutes: 5, ...fields } : kind === "dailyPlan" ? { availableMinutes: 30, ...fields } : fields });
  assert.ok(parsed.value, parsed.error ?? "valid command expected"); return createCommandRecord(session, parsed.value!);
}

test("achievement evaluation unlocks from real records and repeated evaluation is idempotent", () => {
  const entries = [moduleEntry({ module: "fitness", kind: "Training session", status: "done" }, "workout")];
  const first = evaluateAchievements(entries, []); const retry = evaluateAchievements(entries, []);
  assert.equal(first.find(item=>item.id==="first-workout")?.unlocked, true);
  assert.equal(first.find(item=>item.id==="first-workout")?.unlockedAt, "2026-10-12T10:00:00.000Z");
  assert.deepEqual(first, retry);
  assert.equal(first.find(item=>item.id==="first-quest")?.available, false);
  assert.equal(first.find(item=>item.id==="first-quest")?.unlocked, false);
  assert.equal(evaluateAchievements([],[]).every(item=>!item.unlocked), true);
});

test("recommendations use actual open due records, deduplicate, and honor today's dismissals", () => {
  const session = `adaptive-rec-${Date.now()}`;
  const late = command(session,"task","Late study","2026-10-12","todo",{priority:"urgent"});
  command(session,"task","Completed task","2026-10-13","done",{priority:"high"});
  const linked = [{id:"fitness:real",title:"Mobility",date:"2026-10-14",kind:"Training session",source:"Fitness",status:"planned",href:"/fitness#record-real",priority:"normal"}];
  const items = buildRecommendations(listCommands(session),linked,"2026-10-13");
  assert.equal(items.filter(item=>item.title==="Late study").length,1);
  assert.equal(items.some(item=>item.title==="Completed task"),false);
  assert.ok(items.some(item=>item.id.includes(late.id)));
  assert.equal(buildRecommendations(listCommands(session),linked,"2026-10-13",[items[0].id]).some(item=>item.id===items[0].id),false);
  const isolated = `adaptive-other-${Date.now()}`;
  dismissRecommendation(session,"2026-10-13",items[0].id);
  assert.ok(getDismissedRecommendations(session,"2026-10-13").includes(items[0].id));
  assert.deepEqual(getDismissedRecommendations(isolated,"2026-10-13"),[]);
});

function listCommands(session: string) {
  return listCommandRecords(session);
}

test("weekly review uses inclusive Monday-Sunday dates and labels unavailable domains", () => {
  const session = `adaptive-review-${Date.now()}`;
  command(session,"task","Monday task","2026-10-12","done");
  command(session,"task","Next Monday","2026-10-19","done");
  command(session,"focusBlock","Focus","2026-10-18","done",{elapsedSeconds:3599});
  command(session,"focusBlock","Cancelled focus","2026-10-17","cancelled",{elapsedSeconds:9000});
  command(session,"focusBlock","Paused focus","2026-10-16","paused",{elapsedSeconds:9000});
  const result = weeklyReview(listCommands(session),[moduleEntry({module:"guitar",kind:"Practice session",status:"done",date:"2026-10-18"},"music")],"2026-10-12");
  assert.equal(result.weekEnd,"2026-10-18"); assert.equal(result.personalTasksCompleted,1); assert.equal(result.focusSessions,1); assert.equal(result.focusMinutes,59);
  assert.equal(result.modules.find(item=>item.module==="Guitar")?.count,1);
  assert.equal(result.modules.find(item=>item.module==="Flute")?.covered,false);
  assert.match(result.coverage.xp,/authenticated/);
});

test("notification read and dismiss states deduplicate within a session", () => {
  const id="task:owned:2026-10-13"; const session=`adaptive-notice-${Date.now()}`;
  setNotificationState(session,id,"read","2026-10-13T00:00:00.000Z"); setNotificationState(session,id,"read","2026-10-14T00:00:00.000Z");
  assert.equal(getNotificationState(session,id).readAt,"2026-10-13T00:00:00.000Z");
  assert.equal(getNotificationState(session+"-other",id).readAt,undefined);
  setNotificationState(session,id,"dismiss","2026-10-13T00:01:00.000Z");
  assert.ok(getNotificationState(session,id).dismissedAt);
});

test("adaptive API inputs validate week boundaries and current-day dismissals", () => {
  assert.equal(isReviewWeekStart("2026-10-12"),true); assert.equal(isReviewWeekStart("2026-10-13"),false); assert.equal(isReviewWeekStart("2026-02-30"),false);
  assert.deepEqual(validateAdaptiveMutation({id:"task:abc:2026-10-13",action:"dismiss-recommendation",date:"2026-10-13"},"2026-10-13"),{id:"task:abc:2026-10-13",action:"dismiss-recommendation",date:"2026-10-13"});
  assert.equal(validateAdaptiveMutation({id:"task:abc:2026-10-13",action:"dismiss-recommendation",date:"2026-10-12"},"2026-10-13"),null);
  assert.equal(validateAdaptiveMutation({id:"../../private",action:"read"},"2026-10-13"),null);
});
