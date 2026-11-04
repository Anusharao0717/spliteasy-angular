# SplitEasy — Angular + Supabase

A responsive group bill splitter with groups, members, item assignment, proportional discounts/charges, payment status, bill history, WhatsApp sharing and receipt image upload.

## Requirements
- Node.js 20.19+ (or a Node version supported by Angular 20)
- npm
- A Supabase project

## 1. Install
```bash
npm install
```

## 2. Configure Supabase
1. Create a project at https://supabase.com/dashboard.
2. Open Project Settings → API.
3. Copy the Project URL and anon/publishable key.
4. Paste them into `src/environments/environment.ts`.
5. Never use the `service_role` key in frontend code.

## 3. Create database and storage
Open Supabase → SQL Editor, paste and run `supabase/schema.sql`.

The SQL creates groups, members, bills, bill items and payments tables, RLS policies, and a receipts storage bucket (public image URLs; authenticated uploads).

## 4. Run
```bash
npm start
```
Open http://localhost:4200.

## 5. First use
1. Create an account and sign in.
2. Create a group (e.g. Friends).
3. Open Groups and add members.
4. Select the group and choose Create bill.
5. Add items, assign one or more members to each item.
6. Enter discount and extra charges; upload a receipt image if desired.
7. Save the bill to see the split, mark payments as paid, or share the settlement via WhatsApp.

## Calculation rules
- An item's line total is quantity × unit price.
- If multiple members are assigned to an item, that line is split equally between them.
- The overall discount is allocated proportionally across item subtotals.
- Handling, delivery and surge charges are allocated proportionally based on each member's discounted item share.
- Currency values are rounded to two decimals; rounding remainder is applied to the last member so the displayed split reconciles to the bill total.

## Important implementation notes
- This starter uses owner-only group access. It is not yet a collaborative invite system: members are entries in a group, not Supabase login accounts.
- Receipt uploads use a public bucket so saved receipt links can be opened directly. For sensitive receipts, switch to a private bucket, use signed URLs, and add storage object policies that verify the group owner from the first folder segment.
- The bill and item inserts are currently separate requests. For production-grade atomic saves, move bill creation and item insertion into a PostgreSQL RPC transaction.
- Payment tracking records paid/unpaid state per member and bill; it does not process money.
- Add email verification redirect URLs in Supabase Authentication → URL Configuration before production deployment.
