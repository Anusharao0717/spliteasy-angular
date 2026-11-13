import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { environment } from '../environments/environment';
import { Bill, BillItem, BillPayment, Group, Member } from './models';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly configured =
    !!environment.supabaseUrl &&
    environment.supabaseUrl.startsWith('https://') &&
    !!environment.supabaseAnonKey &&
    environment.supabaseAnonKey.startsWith('sb_publishable_');

  readonly client: SupabaseClient | null = this.configured
    ? createClient(environment.supabaseUrl, environment.supabaseAnonKey)
    : null;

  private getClient(): SupabaseClient {
    if (!this.client) throw new Error('Supabase is not configured. Check src/environments/environment.ts.');
    return this.client;
  }

  async currentUser(): Promise<User | null> {
    const client = this.client;
    if (!client) return null;
    const { data, error } = await client.auth.getUser();
    if (error && error.name !== 'AuthSessionMissingError') throw error;
    return data.user ?? null;
  }

  async signUp(email: string, password: string): Promise<User | null> {
    const { data, error } = await this.getClient().auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: window.location.origin + window.location.pathname }
    });
    if (error) throw error;
    return data.user;
  }

  async signIn(email: string, password: string): Promise<User> {
    const { data, error } = await this.getClient().auth.signInWithPassword({
      email: email.trim(), password
    });
    if (error) throw error;
    if (!data.user) throw new Error('Login did not return a user.');
    return data.user;
  }

  async signOut(): Promise<void> {
    const { error } = await this.getClient().auth.signOut();
    if (error) throw error;
  }

  async getGroups(): Promise<Group[]> {
    const { data, error } = await this.getClient()
      .from('groups').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Group[];
  }

  async createGroup(name: string, description: string): Promise<Group> {
    const client = this.getClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError) throw authError;
    if (!auth.user) throw new Error('Please sign in first.');
    const { data, error } = await client.from('groups')
      .insert({ name: name.trim(), description: description.trim() || null, owner_id: auth.user.id })
      .select('*').single();
    if (error) throw error;
    return data as Group;
  }

  async getMembers(groupId: string): Promise<Member[]> {
    const { data, error } = await this.getClient().from('members')
      .select('*').eq('group_id', groupId).order('name');
    if (error) throw error;
    return (data ?? []) as Member[];
  }

  async addMember(groupId: string, name: string, email = ''): Promise<Member> {
    const { data, error } = await this.getClient().from('members')
      .insert({ group_id: groupId, name: name.trim(), email: email.trim() || null })
      .select('*').single();
    if (error) throw error;
    return data as Member;
  }

  async getBills(groupId: string): Promise<Bill[]> {
    const { data, error } = await this.getClient().from('bills')
      .select('*, bill_items(*)').eq('group_id', groupId)
      .order('bill_date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      ...row,
      items: row.bill_items ?? []
    })) as Bill[];
  }

  async saveBill(input: Omit<Bill, 'id' | 'created_at' | 'items'>, items: BillItem[]): Promise<Bill> {
    const client = this.getClient();
    const { data: bill, error } = await client.from('bills').insert({
      group_id: input.group_id,
      title: input.title,
      bill_date: input.bill_date,
      subtotal: input.subtotal,
      discount: input.discount,
      handling_charge: input.handling_charge,
      delivery_charge: input.delivery_charge,
      surge_charge: input.surge_charge,
      receipt_url: input.receipt_url
    }).select('*').single();
    if (error) throw error;

    if (items.length) {
      const rows = items.map(item => ({
        bill_id: bill.id,
        name: item.name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        assignee_ids: item.assignee_ids
      }));
      const { error: itemError } = await client.from('bill_items').insert(rows);
      if (itemError) {
        // Avoid leaving an empty bill if item insertion fails.
        await client.from('bills').delete().eq('id', bill.id);
        throw itemError;
      }
    }
    return { ...bill, items } as Bill;
  }

  async getPayments(billId: string): Promise<BillPayment[]> {
    const { data, error } = await this.getClient().from('payments')
      .select('*').eq('bill_id', billId);
    if (error) throw error;
    return (data ?? []) as BillPayment[];
  }

  async setPayment(billId: string, memberId: string, amount: number, paid: boolean): Promise<void> {
    const { error } = await this.getClient().from('payments').upsert({
      bill_id: billId,
      member_id: memberId,
      amount,
      paid,
      paid_at: paid ? new Date().toISOString() : null
    }, { onConflict: 'bill_id,member_id' });
    if (error) throw error;
  }

  async uploadReceipt(file: File, groupId: string): Promise<string> {
    const client = this.getClient();
    if (!file.type.startsWith('image/')) throw new Error('Select an image receipt.');
    if (file.size > 8 * 1024 * 1024) throw new Error('Receipt must be 8 MB or smaller.');
    const filename = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
    const path = `${groupId}/${filename}`;
    const { error } = await client.storage.from('receipts').upload(path, file, {
      upsert: false, contentType: file.type
    });
    if (error) throw error;
    const { data, error: urlError } = await client.storage.from('receipts').createSignedUrl(path, 60 * 60 * 24 * 7);
    if (urlError) throw urlError;
    return data.signedUrl;
  }
}
