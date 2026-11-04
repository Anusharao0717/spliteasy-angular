import { Component, OnInit } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from './supabase.service';
import { Bill, BillItem, Group, Member, SplitRow } from './models';
import { calculateSplit, money } from './bill-calculator';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyPipe, DatePipe],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  userEmail = '';
  isAuthenticated = false;
  authMode: 'signin' | 'signup' = 'signin';
  email = ''; password = '';
  busy = false;
  error = '';
  notice = '';
  darkMode = false;
  activeTab: 'overview' | 'groups' | 'history' = 'overview';
  groups: Group[] = [];
  selectedGroup: Group | null = null;
  members: Member[] = [];
  bills: Bill[] = [];
  selectedBill: Bill | null = null;
  payments: Record<string, boolean> = {};
  groupName = ''; groupDescription = ''; memberName = ''; memberEmail = '';
  showGroupForm = false; showMemberForm = false; showBillForm = false;
  billTitle = ''; billDate = new Date().toISOString().slice(0, 10);
  discount = 0; handling = 0; delivery = 0; surge = 0;
  receiptFile: File | null = null;
  itemDrafts: BillItem[] = [];
  itemName = ''; itemQty = 1; itemPrice = 0; itemAssignees: string[] = [];
  splitRows: SplitRow[] = [];

  constructor(public db: SupabaseService) {}

  async ngOnInit() {
    const savedTheme = localStorage.getItem('spliteasy-theme');
    this.darkMode = savedTheme === 'dark';
    this.applyTheme();
    if (this.db.client) {
      const user = await this.db.currentUser();
      if (user) {
        this.isAuthenticated = true; this.userEmail = user.email ?? '';
        await this.loadGroups();
      }
    }
  }

  async authenticate() {
    this.error = ''; this.busy = true;
    try {
      if (this.authMode === 'signin') await this.db.signIn(this.email, this.password);
      else await this.db.signUp(this.email, this.password);
      const user = await this.db.currentUser();
      this.isAuthenticated = !!user; this.userEmail = user?.email ?? '';
      if (this.isAuthenticated) await this.loadGroups();
      this.notice = this.authMode === 'signup' ? 'Account created. If email confirmation is enabled, verify your email before signing in.' : 'Welcome back!';
    } catch (e: any) { this.error = e.message ?? 'Authentication failed.'; }
    finally { this.busy = false; }
  }

  async logout() {
    await this.db.signOut();
    this.isAuthenticated = false; this.groups = []; this.selectedGroup = null;
    this.members = []; this.bills = [];
  }

  async loadGroups() {
    try {
      this.groups = await this.db.getGroups();
      if (this.groups.length && !this.selectedGroup) await this.selectGroup(this.groups[0]);
    } catch (e: any) { this.error = e.message; }
  }

  async createGroup() {
    if (!this.groupName.trim()) return;
    this.busy = true; this.error = '';
    try {
      const group = await this.db.createGroup(this.groupName.trim(), this.groupDescription.trim());
      this.groups = [group, ...this.groups]; this.groupName = ''; this.groupDescription = '';
      this.showGroupForm = false; await this.selectGroup(group); this.notice = 'Group created.';
    } catch (e: any) { this.error = e.message; }
    finally { this.busy = false; }
  }

  async selectGroup(group: Group) {
    this.selectedGroup = group; this.selectedBill = null; this.splitRows = [];
    try {
      [this.members, this.bills] = await Promise.all([this.db.getMembers(group.id), this.db.getBills(group.id)]);
    } catch (e: any) { this.error = e.message; }
  }

  async addMember() {
    if (!this.selectedGroup || !this.memberName.trim()) return;
    try {
      const member = await this.db.addMember(this.selectedGroup.id, this.memberName.trim(), this.memberEmail.trim());
      this.members = [...this.members, member]; this.memberName = ''; this.memberEmail = '';
      this.showMemberForm = false; this.notice = 'Member added.';
    } catch (e: any) { this.error = e.message; }
  }

  addItem() {
    if (!this.itemName.trim() || this.itemPrice < 0 || this.itemQty < 1 || !this.itemAssignees.length) {
      this.error = 'Enter an item, a valid price and quantity, and assign at least one member.'; return;
    }
    this.itemDrafts = [...this.itemDrafts, {
      name: this.itemName.trim(), quantity: Number(this.itemQty),
      unit_price: Number(this.itemPrice), assignee_ids: [...this.itemAssignees]
    }];
    this.itemName = ''; this.itemQty = 1; this.itemPrice = 0; this.itemAssignees = []; this.error = '';
  }

  removeItem(index: number) { this.itemDrafts = this.itemDrafts.filter((_, i) => i !== index); }

  get subtotal() {
    return money(this.itemDrafts.reduce((sum, i) => sum + i.quantity * i.unit_price, 0));
  }
  get grandTotal() { return money(Math.max(0, this.subtotal - Number(this.discount)) + Number(this.handling) + Number(this.delivery) + Number(this.surge)); }

  async onReceipt(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (file && file.size > 8 * 1024 * 1024) { this.error = 'Receipt must be 8 MB or smaller.'; return; }
    if (file && !file.type.startsWith('image/')) { this.error = 'Please select an image file.'; return; }
    this.receiptFile = file;
  }

  async saveBill() {
    if (!this.selectedGroup || !this.billTitle.trim() || !this.itemDrafts.length) {
      this.error = 'Enter a bill title and add at least one item.'; return;
    }
    this.busy = true; this.error = '';
    try {
      let receiptUrl: string | null = null;
      if (this.receiptFile) receiptUrl = await this.db.uploadReceipt(this.receiptFile, this.selectedGroup.id);
      const bill = await this.db.saveBill({
        group_id: this.selectedGroup.id, title: this.billTitle.trim(), bill_date: this.billDate,
        subtotal: this.subtotal, discount: Number(this.discount), handling_charge: Number(this.handling),
        delivery_charge: Number(this.delivery), surge_charge: Number(this.surge), receipt_url: receiptUrl
      }, this.itemDrafts);
      this.bills = [bill, ...this.bills];
      this.billTitle = ''; this.itemDrafts = []; this.discount = 0; this.handling = 0;
      this.delivery = 0; this.surge = 0; this.receiptFile = null; this.showBillForm = false;
      await this.openBill(bill); this.notice = 'Bill saved successfully.';
    } catch (e: any) { this.error = e.message ?? 'Could not save bill.'; }
    finally { this.busy = false; }
  }

  async openBill(bill: Bill) {
    this.selectedBill = bill;
    const rows = calculateSplit(this.members, bill.items ?? [], bill.discount,
      bill.handling_charge, bill.delivery_charge, bill.surge_charge);
    this.splitRows = rows;
    try {
      const payments = await this.db.getPayments(bill.id);
      this.payments = Object.fromEntries(payments.map(p => [p.member_id, p.paid]));
      this.splitRows = calculateSplit(this.members, bill.items ?? [], bill.discount,
        bill.handling_charge, bill.delivery_charge, bill.surge_charge,
        payments.filter(p => p.paid).map(p => p.member_id));
    } catch { /* New bill may not have payment rows yet. */ }
  }

  async togglePaid(row: SplitRow, event: Event) {
    if (!this.selectedBill) return;
    const paid = (event.target as HTMLInputElement).checked;
    try {
      await this.db.setPayment(this.selectedBill.id, row.memberId, row.total, paid);
      this.payments[row.memberId] = paid;
      this.splitRows = this.splitRows.map(r => r.memberId === row.memberId ? { ...r, paid } : r);
    } catch (e: any) { this.error = e.message; }
  }

  shareWhatsApp() {
    if (!this.selectedBill) return;
    const lines = [
      `*SplitEasy — ${this.selectedBill.title}*`,
      `Group: ${this.selectedGroup?.name ?? ''}`,
      `Total: ${this.grandForBill(this.selectedBill).toFixed(2)}`,
      '', ...this.splitRows.map(r => `${r.name}: ₹${r.total.toFixed(2)}${r.paid ? ' (Paid)' : ' (Pending)'}`)
    ];
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener');
  }

  grandForBill(b: Bill) {
    return money(Math.max(0, b.subtotal - b.discount) + b.handling_charge + b.delivery_charge + b.surge_charge);
  }

  get totalBills() { return this.bills.length; }
  get totalSpend() { return this.bills.reduce((s, b) => s + this.grandForBill(b), 0); }
  toggleTheme() {
    this.darkMode = !this.darkMode; localStorage.setItem('spliteasy-theme', this.darkMode ? 'dark' : 'light');
    this.applyTheme();
  }
  applyTheme() { document.documentElement.classList.toggle('dark-theme', this.darkMode); }
  clearMessage() { this.error = ''; this.notice = ''; }
}
