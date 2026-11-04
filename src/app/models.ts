export interface Group {
  id: string;
  name: string;
  description?: string;
  created_at?: string;
}
export interface Member {
  id: string;
  group_id: string;
  name: string;
  email?: string;
}
export interface BillItem {
  id?: string;
  bill_id?: string;
  name: string;
  quantity: number;
  unit_price: number;
  assignee_ids: string[];
}
export interface Bill {
  id: string;
  group_id: string;
  title: string;
  bill_date: string;
  subtotal: number;
  discount: number;
  handling_charge: number;
  delivery_charge: number;
  surge_charge: number;
  receipt_url?: string | null;
  created_at?: string;
  items?: BillItem[];
}
export interface BillPayment {
  id: string;
  bill_id: string;
  member_id: string;
  amount: number;
  paid: boolean;
  paid_at?: string | null;
}
export interface SplitRow {
  memberId: string;
  name: string;
  itemsTotal: number;
  chargeShare: number;
  total: number;
  paid: boolean;
}
