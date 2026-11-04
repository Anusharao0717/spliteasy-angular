import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { environment } from '../environments/environment';
import { Bill, BillItem, BillPayment, Group, Member } from './models';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly configured = environment.supabaseUrl.startsWith('https://') &&
    !environment.supabaseAnonKey.includes('YOUR_SUPABASE');
  readonly client: SupabaseClient | null = this.configured
    ? createClient(environment.supabaseUrl, environment.supabaseAnonKey)
    : null;

  async currentUser(): Promise<User | null> {
    if (!this.client) return null;
    const { data } = await this.client.auth.getUser();
    return data.user;
  }

  async signIn(email: string, password: string) {
    if (!this.client) throw new Error('Add your Supabase URL and anon key in src/environments/environment.ts.');
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  }

  async signUp(email: string, password: string) {
    if (!this.client) throw new Error('Add your Supabase URL and anon key in src/environments/environment.ts.');
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error) throw error;
    return data.user;
  }

  async signOut() {
    if (!this.client) return;
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
  }

  async getGroups(): Promise<Group[]> {
    if (!this.client) return [];
    const { data, error } = await this.client.from('groups').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Group[];
  }

  async createGroup(name: string, description: string): Promise<Group> {
    if (!this.client) throw new Error('Supabase is not configured.');
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) throw new Error('Please sign in first.');
    const { data, error } = await this.client.from('groups')
      .insert({ name, description, owner_id: auth.user.id }).select().single();
    if (error) throw error;
    return data as Group;
  }

  async getMembers(groupId: string): Promise<Member[]> {
    if (!this.client) return [];
    const { data, error } = await this.client.from('members').select('*').eq('group_id', groupId).order('name');
    if (error) throw error;
    return (data ?? []) as Member[];
  }

  async addMember(groupId: string, name: string, email = ''): Promise<Member> {
    if (!this.client) throw new Error('Supabase is not configured.');
    const { data, error } = await this.client.from('members')
      .insert({ group_id: groupId, name, email: email || null }).select().single();
    if (error) throw error;
    return data as Member;
  }

  async getBills(groupId: string): Promise<Bill[]> {
    if (!this.client) return [];
    const { data, error } = await this.client.from('bills').select('*, bill_items(*)')
      .eq('group_id', groupId).order('bill_date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((b: any) => ({ ...b, items: b.bill_items ?? [] })) as Bill[];
  }

  async saveBill(input: Omit<Bill, 'id' | 'created_at'>, items: BillItem[]): Promise<Bill> {
    if (!this.client) throw new Error('Supabase is not configured.');
    const { data: bill, error } = await this.client.from('bills').insert({
      group_id: input.group_id, title: input.title, bill_date: input.bill_date,
      subtotal: input.subtotal, discount: input.discount,
      handling_charge: input.handling_charge, delivery_charge: input.delivery_charge,
      surge_charge: input.surge_charge, receipt_url: input.receipt_url ?? null
    }).select().single();
    if (error) throw error;
    const rows = items.map(i => ({
      bill_id: bill.id, name: i.name, quantity: i.quantity,
      unit_price: i.unit_price, assignee_ids: i.assignee_ids
    }));
    if (rows.length) {
      const { error: itemError } = await this.client.from('bill_items').insert(rows);
      if (itemError) throw itemError;
    }
    return { ...bill, items } as Bill;
  }

  async getPayments(billId: string): Promise<BillPayment[]> {
    if (!this.client) return [];
    const { data, error } = await this.client.from('payments').select('*').eq('bill_id', billId);
    if (error) throw error;
    return (data ?? []) as BillPayment[];
  }

  async setPayment(billId: string, memberId: string, amount: number, paid: boolean) {
    if (!this.client) throw new Error('Supabase is not configured.');
    const { error } = await this.client.from('payments').upsert({
      bill_id: billId, member_id: memberId, amount, paid, paid_at: paid ? new Date().toISOString() : null
    }, { onConflict: 'bill_id,member_id' });
    if (error) throw error;
  }

  async uploadReceipt(file: File, groupId: string): Promise<string> {
    if (!this.client) throw new Error('Supabase is not configured.');
    const safeName = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
    const path = `${groupId}/${safeName}`;
    const { error } = await this.client.storage.from('receipts').upload(path, file, { upsert: false });
    if (error) throw error;
    const { data } = this.client.storage.from('receipts').getPublicUrl(path);
    return data.publicUrl;
  }
}
