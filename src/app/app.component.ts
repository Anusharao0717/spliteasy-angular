
import { Component, OnInit } from '@angular/core';
import {
  CommonModule,
  CurrencyPipe,
  DatePipe
} from '@angular/common';
import { FormsModule } from '@angular/forms';

import { SupabaseService } from './supabase.service';

import {
  Bill,
  BillItem,
  Group,
  Member,
  SplitRow
} from './models';

import {
  calculateSplit,
  money
} from './bill-calculator';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CurrencyPipe,
    DatePipe
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {

  // ================================================
  // AUTHENTICATION
  // ================================================

  userEmail = '';

  isAuthenticated = false;

  authMode: 'signin' | 'signup' = 'signin';

  email = '';
  password = '';

  busy = false;

  error = '';
  notice = '';

  // ================================================
  // THEME AND NAVIGATION
  // ================================================

  darkMode = false;

  activeTab: 'overview' | 'groups' | 'history' = 'overview';

  // ================================================
  // GROUPS AND MEMBERS
  // ================================================

  groups: Group[] = [];

  selectedGroup: Group | null = null;

  members: Member[] = [];

  bills: Bill[] = [];

  // ================================================
  // BILL AND PAYMENT DETAILS
  // ================================================

  selectedBill: Bill | null = null;

  payments: Record<string, boolean> = {};

  groupName = '';
  groupDescription = '';

  memberName = '';
  memberEmail = '';

  showGroupForm = false;
  showMemberForm = false;
  showBillForm = false;

  billTitle = '';
  billDate = new Date().toISOString().slice(0, 10);

  discount = 0;
  handling = 0;
  delivery = 0;
  surge = 0;

  receiptFile: File | null = null;

  itemDrafts: BillItem[] = [];

  itemName = '';
  itemQty = 1;
  itemPrice = 0;
  itemAssignees: string[] = [];

  splitRows: SplitRow[] = [];

  constructor(public db: SupabaseService) {}

  // ================================================
  // INITIALIZATION
  // ================================================

  async ngOnInit(): Promise<void> {

    const savedTheme = localStorage.getItem('spliteasy-theme');

    this.darkMode = savedTheme === 'dark';

    this.applyTheme();

    if (!this.db.configured || !this.db.client) {
      this.error = 'Please configure your Supabase project.';
      return;
    }

    try {

      const user = await this.db.currentUser();

      if (user) {
        this.isAuthenticated = true;
        this.userEmail = user.email ?? '';

        await this.loadGroups();
      }

    } catch (e: unknown) {

      console.error('Session initialization error:', e);

    }
  }

  // ================================================
  // AUTHENTICATION
  // ================================================

  async authenticate(): Promise<void> {

    this.error = '';
    this.notice = '';

    // Prevent multiple submissions
    if (this.busy) {
      return;
    }

    // Validate email
    const email = this.email.trim();

    if (!email) {
      this.error = 'Please enter your email address.';
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(email)) {
      this.error = 'Please enter a valid email address.';
      return;
    }

    // Validate password
    if (!this.password) {
      this.error = 'Please enter your password.';
      return;
    }

    if (this.password.length < 6) {
      this.error = 'Password must contain at least 6 characters.';
      return;
    }

    this.busy = true;

    try {

      // --------------------------------------------
      // SIGN IN
      // --------------------------------------------

      if (this.authMode === 'signin') {

        const user = await this.db.signIn(
          email,
          this.password
        );

        this.isAuthenticated = true;
        this.userEmail = user.email ?? email;

        this.email = '';
        this.password = '';

        await this.loadGroups();

        this.notice = 'Welcome back! You are signed in.';

      }

      // --------------------------------------------
      // SIGN UP
      // --------------------------------------------

      else {

        const createdUser = await this.db.signUp(
          email,
          this.password
        );

        if (!createdUser) {
          throw new Error(
            'Account creation failed. Please try again.'
          );
        }

        // Try to detect whether Supabase created a session.
        // When email confirmation is enabled, there may be no session.
        let activeUser = null;

        try {
          activeUser = await this.db.currentUser();
        } catch {
          activeUser = null;
        }

        if (activeUser) {

          this.isAuthenticated = true;
          this.userEmail = activeUser.email ?? email;

          this.email = '';
          this.password = '';

          await this.loadGroups();

          this.notice = 'Your account has been created successfully.';

        } else {

          this.isAuthenticated = false;

          this.notice =
            'Account created successfully! Please check your email and verify your account before signing in.';

          // Keep email for convenient login after verification.
          this.email = email;
          this.password = '';
          this.authMode = 'signin';

        }

      }

    } catch (e: unknown) {

      console.error('Authentication error:', e);

      const message = e instanceof Error
        ? e.message
        : 'Authentication failed. Please try again.';

      if (message.includes('Invalid login credentials')) {
        this.error =
          'Incorrect email or password. Please check your details or create an account.';
      } else if (message.toLowerCase().includes('email not confirmed')) {
        this.error =
          'Please verify your email address before signing in.';
      } else if (message.toLowerCase().includes('already registered')) {
        this.error =
          'This email is already registered. Please sign in instead.';
      } else {
        this.error = message;
      }

    } finally {

      this.busy = false;

    }
  }

  // Switch between sign in and sign up
  switchAuthMode(): void {

    this.authMode =
      this.authMode === 'signin' ? 'signup' : 'signin';

    this.error = '';
    this.notice = '';
    this.password = '';

  }

  // ================================================
  // LOGOUT
  // ================================================

  async logout(): Promise<void> {

    this.error = '';
    this.notice = '';

    try {

      await this.db.signOut();

      this.isAuthenticated = false;
      this.userEmail = '';

      this.groups = [];
      this.selectedGroup = null;

      this.members = [];
      this.bills = [];

      this.selectedBill = null;
      this.splitRows = [];

      this.email = '';
      this.password = '';

      this.authMode = 'signin';

      this.notice = 'You have been signed out.';

    } catch (e: unknown) {

      this.error = e instanceof Error
        ? e.message
        : 'Unable to sign out.';

    }

  }

  // ================================================
  // LOAD GROUPS
  // ================================================

  async loadGroups(): Promise<void> {

    try {

      this.groups = await this.db.getGroups();

      if (
        this.groups.length > 0 &&
        !this.selectedGroup
      ) {
        await this.selectGroup(this.groups[0]);
      }

    } catch (e: unknown) {

      this.error = e instanceof Error
        ? e.message
        : 'Unable to load groups.';

    }

  }

  // ================================================
  // CREATE GROUP
  // ================================================

  async createGroup(): Promise<void> {

    if (!this.groupName.trim()) {
      this.error = 'Please enter a group name.';
      return;
    }

    this.busy = true;
    this.error = '';

    try {

      const group = await this.db.createGroup(
        this.groupName.trim(),
        this.groupDescription.trim()
      );

      this.groups = [group, ...this.groups];

      this.groupName = '';
      this.groupDescription = '';

      this.showGroupForm = false;

      await this.selectGroup(group);

      this.notice = 'Group created successfully.';

    } catch (e: unknown) {

      this.error = e instanceof Error
        ? e.message
        : 'Unable to create group.';

    } finally {

      this.busy = false;

    }

  }

  // ================================================
  // SELECT GROUP
  // ================================================

  async selectGroup(group: Group): Promise<void> {

    this.selectedGroup = group;

    this.selectedBill = null;
    this.splitRows = [];

    try {

      const [members, bills] = await Promise.all([
        this.db.getMembers(group.id),
        this.db.getBills(group.id)
      ]);

      this.members = members;
      this.bills = bills;

    } catch (e: unknown) {

      this.error = e instanceof Error
        ? e.message
        : 'Unable to load group details.';

    }

  }

  // ================================================
  // ADD MEMBER
  // ================================================

  async addMember(): Promise<void> {

    if (!this.selectedGroup) {
      this.error = 'Please select a group.';
      return;
    }

    if (!this.memberName.trim()) {
      this.error = 'Please enter a member name.';
      return;
    }

    try {

      const member = await this.db.addMember(
        this.selectedGroup.id,
        this.memberName.trim(),
        this.memberEmail.trim()
      );

      this.members = [...this.members, member];

      this.memberName = '';
      this.memberEmail = '';

      this.showMemberForm = false;

      this.notice = 'Member added successfully.';

    } catch (e: unknown) {

      this.error = e instanceof Error
        ? e.message
        : 'Unable to add member.';

    }

  }

  // ================================================
  // BILL ITEMS
  // ================================================

  addItem(): void {

    if (
      !this.itemName.trim() ||
      this.itemPrice < 0 ||
      this.itemQty < 1 ||
      !this.itemAssignees.length
    ) {

      this.error =
        'Enter an item, a valid price and quantity, and assign at least one member.';

      return;

    }

    this.itemDrafts = [
      ...this.itemDrafts,
      {
        name: this.itemName.trim(),
        quantity: Number(this.itemQty),
        unit_price: Number(this.itemPrice),
        assignee_ids: [...this.itemAssignees]
      }
    ];

    this.itemName = '';
    this.itemQty = 1;
    this.itemPrice = 0;
    this.itemAssignees = [];

    this.error = '';

  }

  removeItem(index: number): void {

    this.itemDrafts = this.itemDrafts.filter(
      (_, i) => i !== index
    );

  }

  // ================================================
  // BILL CALCULATIONS
  // ================================================

  get subtotal(): number {

    return money(
      this.itemDrafts.reduce(
        (sum, item) =>
          sum + item.quantity * item.unit_price,
        0
      )
    );

  }

  get grandTotal(): number {

    return money(
      Math.max(
        0,
        this.subtotal - Number(this.discount)
      ) +
      Number(this.handling) +
      Number(this.delivery) +
      Number(this.surge)
    );

  }

  // ================================================
  // RECEIPT UPLOAD
  // ================================================

  async onReceipt(event: Event): Promise<void> {

    const input = event.target as HTMLInputElement;

    const file = input.files?.[0] ?? null;

    if (
      file &&
      file.size > 8 * 1024 * 1024
    ) {

      this.error = 'Receipt must be 8 MB or smaller.';
      input.value = '';
      return;

    }

    if (
      file &&
      !file.type.startsWith('image/')
    ) {

      this.error = 'Please select an image file.';
      input.value = '';
      return;

    }

    this.receiptFile = file;
    this.error = '';

  }

  // ================================================
  // SAVE BILL
  // ================================================

  async saveBill(): Promise<void> {

    if (!this.selectedGroup) {
      this.error = 'Please select a group.';
      return;
    }

    if (!this.billTitle.trim() || !this.itemDrafts.length) {

      this.error =
        'Enter a bill title and add at least one item.';

      return;

    }

    this.busy = true;
    this.error = '';

    try {

      let receiptUrl: string | null = null;

      if (this.receiptFile) {

        receiptUrl = await this.db.uploadReceipt(
          this.receiptFile,
          this.selectedGroup.id
        );

      }

      const bill = await this.db.saveBill({

        group_id: this.selectedGroup.id,

        title: this.billTitle.trim(),

        bill_date: this.billDate,

        subtotal: this.subtotal,

        discount: Number(this.discount),

        handling_charge: Number(this.handling),

        delivery_charge: Number(this.delivery),

        surge_charge: Number(this.surge),

        receipt_url: receiptUrl

      }, this.itemDrafts);

      this.bills = [bill, ...this.bills];

      this.billTitle = '';
      this.itemDrafts = [];

      this.discount = 0;
      this.handling = 0;
      this.delivery = 0;
      this.surge = 0;

      this.receiptFile = null;

      this.showBillForm = false;

      await this.openBill(bill);

      this.notice = 'Bill saved successfully.';

    } catch (e: unknown) {

      this.error = e instanceof Error
        ? e.message
        : 'Could not save bill.';

    } finally {

      this.busy = false;

    }

  }

  // ================================================
  // OPEN BILL AND CALCULATE SPLIT
  // ================================================

  async openBill(bill: Bill): Promise<void> {

    this.selectedBill = bill;

    const rows = calculateSplit(
      this.members,
      bill.items ?? [],
      bill.discount,
      bill.handling_charge,
      bill.delivery_charge,
      bill.surge_charge
    );

    this.splitRows = rows;

    try {

      const payments = await this.db.getPayments(bill.id);

      this.payments = Object.fromEntries(
        payments.map(p => [
          p.member_id,
          p.paid
        ])
      );

      this.splitRows = calculateSplit(
        this.members,
        bill.items ?? [],
        bill.discount,
        bill.handling_charge,
        bill.delivery_charge,
        bill.surge_charge,
        payments
          .filter(p => p.paid)
          .map(p => p.member_id)
      );

    } catch (e: unknown) {

      console.error('Payment loading error:', e);

    }

  }

  // ================================================
  // PAYMENT STATUS
  // ================================================

  async togglePaid(
    row: SplitRow,
    event: Event
  ): Promise<void> {

    if (!this.selectedBill) {
      return;
    }

    const paid = (
      event.target as HTMLInputElement
    ).checked;

    try {

      await this.db.setPayment(
        this.selectedBill.id,
        row.memberId,
        row.total,
        paid
      );

      this.payments[row.memberId] = paid;

      this.splitRows = this.splitRows.map(r =>
        r.memberId === row.memberId
          ? { ...r, paid }
          : r
      );

    } catch (e: unknown) {

      this.error = e instanceof Error
        ? e.message
        : 'Unable to update payment.';

    }

  }

  // ================================================
  // WHATSAPP SHARING
  // ================================================

  shareWhatsApp(): void {

    if (!this.selectedBill) {
      return;
    }

    const lines = [

      `*SplitEasy — ${this.selectedBill.title}*`,

      `Group: ${this.selectedGroup?.name ?? ''}`,

      `Total: ${this.grandForBill(this.selectedBill).toFixed(2)}`,

      '',

      ...this.splitRows.map(row =>
        `${row.name}: ₹${row.total.toFixed(2)}${row.paid ? ' (Paid)' : ' (Pending)'}`
      )

    ];

    window.open(
      `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`,
      '_blank',
      'noopener'
    );

  }

  // ================================================
  // TOTALS
  // ================================================

  grandForBill(bill: Bill): number {

    return money(
      Math.max(
        0,
        bill.subtotal - bill.discount
      ) +
      bill.handling_charge +
      bill.delivery_charge +
      bill.surge_charge
    );

  }

  get totalBills(): number {

    return this.bills.length;

  }

  get totalSpend(): number {

    return this.bills.reduce(
      (sum, bill) =>
        sum + this.grandForBill(bill),
      0
    );

  }

  // ================================================
  // THEME
  // ================================================

  toggleTheme(): void {

    this.darkMode = !this.darkMode;

    localStorage.setItem(
      'spliteasy-theme',
      this.darkMode ? 'dark' : 'light'
    );

    this.applyTheme();

  }

  applyTheme(): void {

    document.documentElement.classList.toggle(
      'dark-theme',
      this.darkMode
    );

  }

  // ================================================
  // CLEAR MESSAGES
  // ================================================

  clearMessage(): void {

    this.error = '';
    this.notice = '';

  }

}
