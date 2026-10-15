import assert from "node:assert/strict";
import test from "node:test";
import { daysUntilLocalDate, formatCampaignCountdown } from "@/lib/campaign";
import { createDevelopmentMilestone, deleteDevelopmentMilestone, getDevelopmentCampaignDate, listDevelopmentMilestones, setDevelopmentCampaignDate, updateDevelopmentMilestone } from "@/lib/life-system-dev-store";

test("campaign countdown only uses a date the user supplied and validates calendar boundaries", () => {
  assert.equal(daysUntilLocalDate("", new Date(2026, 9, 13, 12)), null);
  assert.equal(daysUntilLocalDate("2026-02-30", new Date(2026, 1, 28, 12)), null);
  assert.equal(daysUntilLocalDate("2026-02-28", new Date(2026, 1, 28, 12)), 0);
  assert.equal(daysUntilLocalDate("2026-03-01", new Date(2026, 1, 28, 12)), 1);
  assert.equal(daysUntilLocalDate("2026-02-27", new Date(2026, 1, 28, 12)), -1);
  assert.equal(formatCampaignCountdown(null), "Choose a valid campaign date");
});

test("development campaign settings and milestone CRUD stay isolated to a browser session", () => {
  const session = `campaign-dev-${Date.now()}`;
  setDevelopmentCampaignDate(session, "2026-12-31");
  assert.equal(getDevelopmentCampaignDate(session), "2026-12-31");
  assert.equal(getDevelopmentCampaignDate(`${session}-other`), undefined);
  const milestone = createDevelopmentMilestone(session, { title: "Submit portfolio", targetDate: "2026-11-30" });
  assert.equal(listDevelopmentMilestones(session)[0].id, milestone.id);
  assert.equal(updateDevelopmentMilestone(session, milestone.id, { title: "Publish portfolio", completedAt: "2026-10-13T00:00:00.000Z" })?.title, "Publish portfolio");
  assert.ok(listDevelopmentMilestones(session)[0].completedAt);
  assert.equal(listDevelopmentMilestones(`${session}-other`).length, 0);
  assert.equal(deleteDevelopmentMilestone(session, milestone.id)?.id, milestone.id);
  assert.equal(deleteDevelopmentMilestone(session, milestone.id), null);
  setDevelopmentCampaignDate(session);
  assert.equal(getDevelopmentCampaignDate(session), undefined);
});
