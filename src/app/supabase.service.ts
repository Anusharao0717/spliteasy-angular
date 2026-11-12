
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

  readonly configured =
    environment.supabaseUrl.startsWith('https://') &&
    !environment.supabaseAnonKey.includes('sb_publishable_hTqdhILf9Sm1ijkvB8wB4w_OqFngvbE');

  readonly client: SupabaseClient | null = this.configured
    ? createClient(
        environment.supabaseUrl,
        environment.supabaseAnonKey
      )
    : null;

  // Get currently logged-in user
  async currentUser(): Promise<User | null> {
    if (!this.client) return null;

    const { data, error } = await this.client.auth.getUser();

    if (error) throw error;

    return data.user;
  }

  // Register new account
  async signUp(email: string, password: string) {
    if (!this.client) {
      throw new Error('Supabase is not configured.');
    }

    const { data, error } = await this.client.auth.signUp({
      email,
      password
    });

    if (error) throw error;

    return data.user;
  }

  // Sign in
  async signIn(email: string, password: string) {
    if (!this.client) {
      throw new Error('Supabase is not configured.');
    }

    const { data, error } = await this.client.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    return data.user;
  }

  // Sign out
  async signOut(): Promise<void> {
    if (!this.client) return;

    const { error } = await this.client.auth.signOut();

    if (error) throw error;
  }

  // Get all groups
  async getGroups(): Promise<Group[]> {
    if (!this.client) return [];

    const { data, error } = await this.client
      .from('groups')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data ?? []) as Group[];
  }

  // Create group
  async createGroup(
    name: string,
    description: string
  ): Promise<Group> {

    if (!this.client) {
      throw new Error('Supabase is not configured.');
    }

    const { data: auth } = await this.client.auth.getUser();

    if (!auth.user) {
      throw new Error('Please sign in first.');
    }

    const { data, error } = await this.client
      .from('groups')
      .insert({
        name,
        description,
        owner_id: auth.user.id
      })
      .select()
      .single();

    if (error) throw error;

    return data as Group;
  }

  // Get group members
  async getMembers(groupId: string): Promise<Member[]> {
    if (!this.client) return [];

    const { data, error } = await this.client
      .from('members')
      .select('*')
      .eq('group_id', groupId)
      .order('name');

    if (error) throw error;

    return (data ?? []) as Member[];
  }

  // Add member
  async addMember(
    groupId: string,
    name: string,
    email = ''
  ): Promise<Member> {

    if (!this.client) {
      throw new Error('Supabase is not configured.');
    }

    const { data, error } = await this.client
      .from('members')
      .insert({
        group_id: groupId,
        name,
        email: email || null
      })
      .select()
      .single();

    if (error) throw error;

    return data as Member;
  }

  // Get bills
  async getBills(groupId: string): Promise<Bill[]> {
    if (!this.client) return [];

    const { data, error } = await this.client
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

  // Save bill and its items
  async saveBill(
    input: Omit<Bill, 'id' | 'created_at'>,
    items: BillItem[]
  ): Promise<Bill> {

    if (!this.client) {
      throw new Error('Supabase is not configured.');
    }

    const { data: bill, error } = await this.client
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
      const { error: itemError } = await this.client
        .from('bill_items')
        .insert(rows);

      if (itemError) throw itemError;
    }

    return {
      ...bill,
      items
    } as Bill;
  }

  // Get bill payments
  async getPayments(billId: string): Promise<BillPayment[]> {
    if (!this.client) return [];

    const { data, error } = await this.client
      .from('payments')
      .select('*')
      .eq('bill_id', billId);

    if (error) throw error;

    return (data ?? []) as BillPayment[];
  }

  // Update payment status
  async setPayment(
    billId: string,
    memberId: string,
    amount: number,
    paid: boolean
  ): Promise<void> {

    if (!this.client) {
      throw new Error('Supabase is not configured.');
    }

    const { error } = await this.client
      .from('payments')
      .upsert({
        bill_id: billId,
        member_id: memberId,
        amount,
        paid,
        paid_at: paid ? new Date().toISOString() : null
      }, {
        onConflict: 'bill_id,member_id'
      });

    if (error) throw error;
  }

  // Upload receipt
  async uploadReceipt(
    file: File,
    groupId: string
  ): Promise<string> {

    if (!this.client) {
      throw new Error('Supabase is not configured.');
    }

    const safeName =
      `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`;

    const path = `${groupId}/${safeName}`;

    const { error } = await this.client.storage
      .from('receipts')
      .upload(path, file, {
        upsert: false
      });

    if (error) throw error;

    const { data } = this.client.storage
      .from('receipts')
      .getPublicUrl(path);

    return data.publicUrl;
  }
}
