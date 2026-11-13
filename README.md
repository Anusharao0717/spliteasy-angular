# SplitEasy – Angular + Supabase

A standalone Angular expense-splitting starter with Supabase email/password authentication, groups, group members, bills, item-wise assignments, proportional split calculations, payment tracking, receipt uploads, WhatsApp sharing, responsive layout and light/dark theme.

## Important

This ZIP is a clean, self-contained replacement starter, not a verified patch against every unprovided file in your existing repository. Back up your current repository before replacing files. The Supabase Publishable key is intended for browser use; never add a Supabase Secret/service-role key to Angular.

## 1. Configure Supabase

Edit `src/environments/environment.ts`:

```ts
export const environment = {
  production: true,
  supabaseUrl: 'https://YOUR_PROJECT_REF.supabase.co',
  supabaseAnonKey: 'sb_publishable_YOUR_PUBLISHABLE_KEY'
};
```

Use the Project URL and Publishable key from Supabase → Project Settings → API Keys.

In Supabase → Authentication → Providers, enable Email. In Authentication → URL Configuration, add:
- `http://localhost:4200/`
- `https://YOUR_GITHUB_USERNAME.github.io/spliteasy-angular/`

## 2. Create database tables

Open Supabase → SQL Editor, paste and run `supabase/schema.sql`.

The schema enables RLS and gives each signed-in user access only to groups they own. This starter does not yet implement invitations or shared multi-user group membership; other accounts cannot access an owner's group by default.

The SQL creates a private `receipts` bucket. The app uses signed URLs for receipts.

## 3. Run locally

Requirements: Node.js 22 (or a compatible Angular 20-supported release).

```bash
npm install
npm start
```

Open http://localhost:4200.

## 4. Deploy to GitHub Pages

The included workflow builds with base href `/spliteasy-angular/` and deploys `dist/spliteasy-angular/browser`.

1. Push this project to the `main` branch of `Anusharao0717/spliteasy-angular` (or update the repository name/base href in the workflow).
2. In GitHub repository Settings → Pages, select **GitHub Actions** as the build and deployment source.
3. Open Actions and monitor the workflow.
4. Visit `https://Anusharao0717.github.io/spliteasy-angular/`.

## Notes and current scope

- Auth: email/password signup and login. If email confirmation is enabled, verify the confirmation email before signing in.
- Groups: owner-created groups and member records.
- Bills: items can be assigned to one or more group members. Item costs are split equally among the selected assignees; discount and extra charges are allocated proportionally.
- Payments: per-member paid/unpaid status.
- Receipt storage: private bucket and signed URL.
- WhatsApp: creates a share link with the current split.
- History: loaded across groups owned by the signed-in user.

This is a starter implementation. Test database policies, authentication confirmation, uploads and deployment in your own Supabase/GitHub projects before using real financial data. For genuine multi-user shared groups, add invitations and membership-based RLS policies rather than making tables public.
