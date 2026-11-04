import { BillItem, Member, SplitRow } from './models';

export function calculateSplit(
  members: Member[], items: BillItem[], discount: number,
  handling: number, delivery: number, surge: number,
  paidMemberIds: string[] = []
): SplitRow[] {
  const raw = new Map<string, number>();
  members.forEach(m => raw.set(m.id, 0));
  for (const item of items) {
    const assignees = item.assignee_ids ?? [];
    if (!assignees.length) continue;
    const lineTotal = Math.max(0, Number(item.quantity) * Number(item.unit_price));
    const share = lineTotal / assignees.length;
    assignees.forEach(id => raw.set(id, (raw.get(id) ?? 0) + share));
  }
  const rawTotal = [...raw.values()].reduce((a, b) => a + b, 0);
  const discountValue = Math.min(Math.max(0, discount), rawTotal);
  const extras = Math.max(0, handling) + Math.max(0, delivery) + Math.max(0, surge);
  const netItems = rawTotal - discountValue;
  const total = netItems + extras;
  const rows = members.map(m => {
    const gross = raw.get(m.id) ?? 0;
    const afterDiscount = rawTotal ? gross * (netItems / rawTotal) : 0;
    const extraShare = netItems ? extras * (afterDiscount / netItems) : 0;
    return {
      memberId: m.id, name: m.name, itemsTotal: afterDiscount,
      chargeShare: extraShare, total: afterDiscount + extraShare,
      paid: paidMemberIds.includes(m.id)
    };
  });
  // Distribute rounding remainder to the final member so displayed amounts reconcile exactly.
  const rounded = rows.map(r => ({ ...r, itemsTotal: money(r.itemsTotal), chargeShare: money(r.chargeShare), total: money(r.total) }));
  const delta = money(total - rounded.reduce((s, r) => s + r.total, 0));
  if (rounded.length && Math.abs(delta) > 0) rounded[rounded.length - 1].total = money(rounded[rounded.length - 1].total + delta);
  return rounded;
}
export const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
