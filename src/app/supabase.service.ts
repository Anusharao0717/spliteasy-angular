
import { Injectable } from '@angular/core';
import {
  createClient,
  SupabaseClient,
  User
} from '@supabase/supabase-js';

import { environment } from '../environments/environment';

import {
  Bill,
  BillItem,
  BillPayment,
  Group,
  Member
} from './models';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {

  // Supabase configuration
  readonly configured: boolean =
    !!environment.supabaseUrl &&
    environment.supabaseUrl.startsWith('https://') &&
    !!environment.supabaseAnonKey &&
    environment.supabaseAnonKey.startsWith('sb_publishable_');

  readonly client: SupabaseClient | null = this.configured
    ? createClient(
        environment.supabaseUrl,
        environment.supabaseAnonKey
      )
    : null;

  // Check Supabase connection
  private getClient(): SupabaseClient {
    if (!this.client) {
      throw new Error(
        'Supabase is not configured. Check environment.ts.'
      );
    }

    return this.client;
  }

  // ================================================
  // AUTHENTICATION
  // ================================================

  async currentUser(): Promise<User | null> {
    const client = this.client;

    if (!client) return null;

    const { data, error } = await client.auth.getUser();

    if (error) throw error;

    return data.user;
  }

  async signUp(
    email: string,
    password: string
  ): Promise<User | null> {
    const client = this.getClient();

    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password
    });

    if (error) throw error;

    return data.user;
  }

  async signIn(
    email: string,
    password: string
  ): Promise<User> {
    const client = this.getClient();

    const { data, error } =
      await client.auth.signInWithPassword({
        email: email.trim(),
        password
      });

    if (error) throw error;

    if (!data.user) {
      throw new Error('Unable to sign in.');
    }

    return data.user;
  }

  async signOut(): Promise<void> {
    if (!this.client) return;

    const { error } = await this.client.auth.signOut();

    if (error) throw error;
  }

  // ================================================
  // GROUPS
  // ================================================

  async getGroups(): Promise<Group[]> {
    const client = this.getClient();

    const { data, error } = await client
      .from('groups')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data ?? []) as Group[];
  }

  async createGroup(
    name: string,
    description: string
  ): Promise<Group> {
    const client = this.getClient();

    const { data: auth, error: authError } =
      await client.auth.getUser();

    if (authError) throw authError;

    if (!auth.user) {
      throw new Error('Please sign in first.');
    }

    const { data, error } = await client
      .from('groups')
      .insert({
        name: name.trim(),
        description: description.trim(),
        owner_id: auth.user.id
      })
      .select()
      .single();

    if (error) throw error;

    return data as Group;
  }

  // ================================================
  // MEMBERS
  // ================================================

  async getMembers(groupId: string): Promise<Member[]> {
    const client = this.getClient();

    const { data, error } = await client
      .from('members')
      .select('*')
      .eq('group_id', groupId)
      .order('name');

    if (error) throw error;

    return (data ?? []) as Member[];
  }

  async addMember(
    groupId: string,
    name: string,
    email = ''
  ): Promise<Member> {
    const client = this.getClient();

    const { data, error } = await client
      .from('members')
      .insert({
        group_id: groupId,
        name: name.trim(),
        email: email.trim() || null
      })
      .select()
      .single();

    if (error) throw error;

    return data as Member;
  }

  // ================================================
  // BILLS
  // ================================================

  async getBills(groupId: string): Promise<Bill[]> {
    const client = this.getClient();

    const { data, error } = await client
      .from('bills')
      .select('*, bill_items(*)')
      .eq('group_id', groupId)
      .order('bill_date', { ascending: false });

    if (error) throw error;

    return (data ?? []).map((bill: any) => ({
      ...bill,
      items: bill.bill_items ?? []
    })) as Bill[];
  }

  async saveBill(
    input: Omit<Bill, 'id' | 'created_at'>,
    items: BillItem[]
  ): Promise<Bill> {
    const client = this.getClient();

    const { data: bill, error } = await client
      .from('bills')
      .insert({
        group_id: input.group_id,
        title: input.title,
        bill_date: input.bill_date,
        subtotal: input.subtotal,
        discount: input.discount,
        handling_charge: input.handling_charge,
        delivery_charge: input.delivery_charge,
        surge_charge: input.surge_charge,
        receipt_url: input.receipt_url ?? null
      })
      .select()
      .single();

    if (error) throw error;

    const rows = items.map(item => ({
      bill_id: bill.id,
      name: item.name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      assignee_ids: item.assignee_ids
    }));

    if (rows.length > 0) {
      const { error: itemError } = await client
        .from('bill_items')
        .insert(rows);

      if (itemError) throw itemError;
    }

    return {
      ...bill,
      items
    } as Bill;
  }

  // ================================================
  // PAYMENTS
  // ================================================

  async getPayments(
    billId: string
  ): Promise<BillPayment[]> {
    const client = this.getClient();

    const { data, error } = await client
      .from('payments')
      .select('*')
      .eq('bill_id', billId);

    if (error) throw error;

    return (data ?? []) as BillPayment[];
  }

  async setPayment(
    billId: string,
    memberId: string,
    amount: number,
    paid: boolean
  ): Promise<void> {
    const client = this.getClient();

    const { error } = await client
      .from('payments')
      .upsert({
        bill_id: billId,
        member_id: memberId,
        amount,
        paid,
        paid_at: paid
          ? new Date().toISOString()
          : null
      }, {
        onConflict: 'bill_id,member_id'
      });

    if (error) throw error;
  }

  // ================================================
  // RECEIPT UPLOAD
  // ================================================

  async uploadReceipt(
    file: File,
    groupId: string
  ): Promise<string> {
    const client = this.getClient();

    if (!file.type.startsWith('image/')) {
      throw new Error('Please select an image file.');
    }

    if (file.size > 8 * 1024 * 1024) {
      throw new Error('Receipt must be 8 MB or smaller.');
    }

    const safeName =
      `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`;

    const path = `${groupId}/${safeName}`;

    const { error } = await client.storage
      .from('receipts')
      .upload(path, file, {
        upsert: false,
        contentType: file.type
      });

    if (error) throw error;

    const { data } = client.storage
      .from('receipts')
      .getPublicUrl(path);

    return data.publicUrl;
  }
}
