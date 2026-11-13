import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from './supabase.service';
import { Bill, BillItem, BillPayment, Group, Member, SplitRow } from './models';
import { calculateSplit, money } from './bill-calculator';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  email = '';
  password = '';
  authMode: 'signin' | 'signup' = 'signin';
  isAuthenticated = false;
  userEmail = '';
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
  splitRows: SplitRow[] = [];
  payments: Record<string, boolean> = {};

  showGroupForm = false;
  showMemberForm = false;
  showBillForm = false;
  groupName = '';
  groupDescription = '';
  memberName = '';
  memberEmail = '';
  billTitle = '';
  billDate = new Date().toISOString().slice(0, 10);
  itemName = '';
  itemQty = 1;
  itemPrice = 0;
  itemAssignees: string[] = [];
  itemDrafts: BillItem[] = [];
  discount = 0;
  handling = 0;
  delivery = 0;
  surge = 0;
  receiptFile: File | null = null;
  historyBills: Array<{ bill: Bill; groupName: string }> = [];

  constructor(public db: SupabaseService) {}

  async ngOnInit(): Promise<void> {
    this.darkMode = localStorage.getItem('spliteasy-theme') === 'dark';
    this.applyTheme();
    if (!this.db.configured) {
      this.error = 'Add your Supabase Project URL and Publishable key to src/environments/environment.ts.';
      return;
    }
    try {
      const user = await this.db.currentUser();
      if (user) {
        this.isAuthenticated = true;
        this.userEmail = user.email ?? '';
        await this.loadGroups();
      }
    } catch (e) {
      console.error(e);
    }
  }

  async authenticate(): Promise<void> {
    this.error = '';
    this.notice = '';
    if (this.busy) return;
    const email = this.email.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.error = 'Enter a valid email address.';
      return;
    }
    if (!this.password || this.password.length < 6) {
      this.error = 'Password must contain at least 6 characters.';
      return;
    }
    this.busy = true;
    try {
      if (this.authMode === 'signin') {
        const user = await this.db.signIn(email, this.password);
        this.isAuthenticated = true;
        this.userEmail = user.email ?? email;
        this.password = '';
        await this.loadGroups();
        this.notice = 'Welcome back!';
      } else {
        const user = await this.db.signUp(email, this.password);
        this.password = '';
        if (!user) {
          this.notice = 'Registration submitted. Check your email for confirmation.';
          return;
        }
        const activeUser = await this.db.currentUser();
        if (activeUser) {
          this.isAuthenticated = true;
          this.userEmail = activeUser.email ?? email;
          await this.loadGroups();
          this.notice = 'Account created successfully.';
        } else {
          this.authMode = 'signin';
          this.email = email;
          this.notice = 'Account created. Verify your email, then sign in.';
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Authentication failed.';
      this.error = message.includes('Invalid login credentials')
        ? 'Invalid email or password. Check your details or create an account.'
        : message;
    } finally {
      this.busy = false;
    }
  }

  switchAuthMode(): void {
    this.authMode = this.authMode === 'signin' ? 'signup' : 'signin';
    this.password = '';
    this.error = '';
    this.notice = '';
  }

  async logout(): Promise<void> {
    try {
      await this.db.signOut();
      this.isAuthenticated = false;
      this.userEmail = '';
      this.groups = [];
      this.members = [];
      this.bills = [];
      this.selectedGroup = null;
      this.selectedBill = null;
      this.authMode = 'signin';
      this.notice = 'Signed out successfully.';
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Unable to sign out.';
    }
  }

  async loadGroups(): Promise<void> {
    try {
      this.groups = await this.db.getGroups();
      this.historyBills = [];
      for (const group of this.groups) {
        const groupBills = await this.db.getBills(group.id);
        for (const bill of groupBills) this.historyBills.push({ bill, groupName: group.name });
      }
      if (this.groups.length && !this.selectedGroup) await this.selectGroup(this.groups[0]);
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Unable to load groups.';
    }
  }

  async createGroup(): Promise<void> {
    if (!this.groupName.trim()) { this.error = 'Enter a group name.'; return; }
    this.busy = true;
    try {
      const group = await this.db.createGroup(this.groupName, this.groupDescription);
      this.groups = [group, ...this.groups];
      this.groupName = '';
      this.groupDescription = '';
      this.showGroupForm = false;
      await this.selectGroup(group);
      this.notice = 'Group created.';
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Unable to create group.';
    } finally { this.busy = false; }
  }

  async selectGroup(group: Group): Promise<void> {
    this.selectedGroup = group;
    this.selectedBill = null;
    try {
      const [members, bills] = await Promise.all([
        this.db.getMembers(group.id), this.db.getBills(group.id)
      ]);
      this.members = members;
      this.bills = bills;
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Unable to load group.';
    }
  }

  async addMember(): Promise<void> {
    if (!this.selectedGroup || !this.memberName.trim()) {
      this.error = 'Select a group and enter a member name.';
      return;
    }
    try {
      const member = await this.db.addMember(this.selectedGroup.id, this.memberName, this.memberEmail);
      this.members = [...this.members, member];
      this.memberName = '';
      this.memberEmail = '';
      this.showMemberForm = false;
      this.notice = 'Member added.';
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Unable to add member.';
    }
  }

  addItem(): void {
    const assignees = [...new Set(this.itemAssignees)];
    if (!this.itemName.trim() || this.itemQty < 1 || this.itemPrice < 0 || !assignees.length) {
      this.error = 'Enter item details and assign at least one member.';
      return;
    }
    this.itemDrafts = [...this.itemDrafts, {
      name: this.itemName.trim(), quantity: Number(this.itemQty),
      unit_price: Number(this.itemPrice), assignee_ids: assignees
    }];
    this.itemName = '';
    this.itemQty = 1;
    this.itemPrice = 0;
    this.itemAssignees = [];
    this.error = '';
  }

  removeItem(index: number): void {
    this.itemDrafts = this.itemDrafts.filter((_, i) => i !== index);
  }

  toggleAssignee(memberId: string, checked: boolean): void {
    this.itemAssignees = checked
      ? [...new Set([...this.itemAssignees, memberId])]
      : this.itemAssignees.filter(id => id !== memberId);
  }

  get subtotal(): number {
    return money(this.itemDrafts.reduce((sum, item) => sum + item.quantity * item.unit_price, 0));
  }

  get grandTotal(): number {
    return money(Math.max(0, this.subtotal - Number(this.discount)) +
      Number(this.handling) + Number(this.delivery) + Number(this.surge));
  }

  onReceipt(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (file && !file.type.startsWith('image/')) {
      this.error = 'Choose an image file.';
      input.value = '';
      return;
    }
    if (file && file.size > 8 * 1024 * 1024) {
      this.error = 'Receipt image must be 8 MB or smaller.';
      input.value = '';
      return;
    }
    this.receiptFile = file;
  }

  async saveBill(): Promise<void> {
    if (!this.selectedGroup) { this.error = 'Select a group.'; return; }
    if (!this.billTitle.trim() || !this.itemDrafts.length) {
      this.error = 'Enter a bill title and add at least one item.';
      return;
    }
    this.busy = true;
    try {
      let receiptUrl: string | null = null;
      if (this.receiptFile) receiptUrl = await this.db.uploadReceipt(this.receiptFile, this.selectedGroup.id);
      const bill = await this.db.saveBill({
        group_id: this.selectedGroup.id, title: this.billTitle.trim(),
        bill_date: this.billDate, subtotal: this.subtotal,
        discount: Number(this.discount), handling_charge: Number(this.handling),
        delivery_charge: Number(this.delivery), surge_charge: Number(this.surge),
        receipt_url: receiptUrl
      }, this.itemDrafts);
      this.bills = [bill, ...this.bills];
      this.historyBills = [{ bill, groupName: this.selectedGroup.name }, ...this.historyBills];
      this.billTitle = '';
      this.itemDrafts = [];
      this.discount = this.handling = this.delivery = this.surge = 0;
      this.receiptFile = null;
      this.showBillForm = false;
      await this.openBill(bill);
      this.notice = 'Bill saved successfully.';
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Unable to save bill.';
    } finally { this.busy = false; }
  }

  async openBill(bill: Bill): Promise<void> {
    this.selectedBill = bill;
    const payments = await this.db.getPayments(bill.id).catch(() => [] as BillPayment[]);
    this.payments = Object.fromEntries(payments.map(p => [p.member_id, p.paid]));
    this.splitRows = calculateSplit(
      this.members, bill.items ?? [], bill.discount,
      bill.handling_charge, bill.delivery_charge, bill.surge_charge,
      payments.filter(p => p.paid).map(p => p.member_id)
    );
  }

  async openHistoryBill(bill: Bill, groupId: string): Promise<void> {
    const group = this.groups.find(item => item.id === groupId);

    if (!group) {
      this.error = 'Unable to find the group for this bill.';
      return;
    }

    await this.selectGroup(group);
    await this.openBill(bill);
    this.activeTab = 'history';
  }

  async togglePaid(row: SplitRow, event: Event): Promise<void> {
    if (!this.selectedBill) return;
    const paid = (event.target as HTMLInputElement).checked;
    try {
      await this.db.setPayment(this.selectedBill.id, row.memberId, row.total, paid);
      this.payments[row.memberId] = paid;
      this.splitRows = this.splitRows.map(r => r.memberId === row.memberId ? { ...r, paid } : r);
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Unable to update payment.';
    }
  }

  grandForBill(bill: Bill): number {
    return money(Math.max(0, bill.subtotal - bill.discount) +
      bill.handling_charge + bill.delivery_charge + bill.surge_charge);
  }

  shareWhatsApp(): void {
    if (!this.selectedBill) return;
    const text = [
      `SplitEasy: ${this.selectedBill.title}`,
      `Group: ${this.selectedGroup?.name ?? ''}`,
      `Total: ₹${this.grandForBill(this.selectedBill).toFixed(2)}`,
      ...this.splitRows.map(row => `${row.name}: ₹${row.total.toFixed(2)} (${row.paid ? 'Paid' : 'Pending'})`)
    ].join('\n');
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }

  get totalBills(): number { return this.historyBills.length; }
  get totalSpend(): number {
    return this.historyBills.reduce((sum, entry) => sum + this.grandForBill(entry.bill), 0);
  }
  get totalMembers(): number { return this.members.length; }

  toggleTheme(): void {
    this.darkMode = !this.darkMode;
    localStorage.setItem('spliteasy-theme', this.darkMode ? 'dark' : 'light');
    this.applyTheme();
  }

  applyTheme(): void {
    document.documentElement.classList.toggle('dark-theme', this.darkMode);
  }

  clearMessage(): void {
    this.error = '';
    this.notice = '';
  }
}
