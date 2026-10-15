export function daysUntilLocalDate(targetDate: string, now = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(targetDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const target = new Date(year, month - 1, day);
  if (target.getFullYear() !== year || target.getMonth() !== month - 1 || target.getDate() !== day) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function formatCampaignCountdown(days: number | null): string {
  if (days === null) return "Choose a valid campaign date";
  if (days < 0) return `${Math.abs(days)} days since campaign date`;
  if (days === 0) return "Campaign day is today";
  return `${days} days remaining`;
}
