import { BillItem, Member, SplitRow } from './models';

export function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Allocates each item's cost equally among its assigned members, then
 * allocates discount and extra charges proportionally to each member's
 * pre-adjustment share. Any rounding remainder is assigned to the last row.
 */
export function calculateSplit(
  members: Member[],
  items: BillItem[],
  discount = 0,
  handling = 0,
  delivery = 0,
  surge = 0,
  paidMemberIds: string[] = []
): SplitRow[] {
  const totals = new Map<string, number>();
  for (const member of members) totals.set(member.id, 0);

  for (const item of items) {
    const assignees = [...new Set(item.assignee_ids ?? [])]
      .filter(id => totals.has(id));
    if (!assignees.length) continue;
    const share = (Number(item.quantity) * Number(item.unit_price)) / assignees.length;
    for (const id of assignees) totals.set(id, (totals.get(id) ?? 0) + share);
  }

  const subtotal = [...totals.values()].reduce((sum, value) => sum + value, 0);
  const extras = Math.max(0, Number(handling) + Number(delivery) + Number(surge));
  const finalTotal = Math.max(0, subtotal - Math.max(0, Number(discount)) + extras);

  if (!members.length) return [];

  if (subtotal <= 0) {
    const each = finalTotal / members.length;
    let used = 0;
    return members.map((member, index) => {
      const amount = index === members.length - 1
        ? money(finalTotal - used)
        : money(each);
      used += amount;
      return { memberId: member.id, name: member.name, total: amount, paid: paidMemberIds.includes(member.id) };
    });
  }

  const raw = members.map(member => ({
    member,
    value: Math.max(0, totals.get(member.id) ?? 0) / subtotal * finalTotal
  }));
  let used = 0;
  return raw.map((entry, index) => {
    const amount = index === raw.length - 1
      ? money(finalTotal - used)
      : money(entry.value);
    used += amount;
    return {
      memberId: entry.member.id,
      name: entry.member.name,
      total: amount,
      paid: paidMemberIds.includes(entry.member.id)
    };
  });
}
