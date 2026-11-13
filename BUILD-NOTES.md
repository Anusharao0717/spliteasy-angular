# Build and setup notes

- All Supabase service methods called by the Angular component are implemented.
- The environment variable name is consistently `supabaseAnonKey`.
- The signup form binds email with `[(ngModel)]="email"` and validates non-empty email before calling Supabase.
- The signup service sends the browser URL as the email confirmation redirect.
- The SQL schema enables row-level security and scopes all app data to the group owner.
- The receipts bucket is private; the service returns a signed URL.

Build was not executed in this environment because package installation requires network access. Run `npm install` and `npm run build` locally or let GitHub Actions build it. Do not assume the project has passed CI until the workflow reports success.
