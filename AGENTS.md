# RepSuites

Local visibility for local businesses: Google Maps ranking, reviews, Google
Business Profile tools and AI search checks.

- Stack: TanStack Start on a Cloudflare Worker (`npm run build:cf`), Supabase
  project `ljosiwovyixvvxokyuel` (production only).
- Printed QR codes point at `https://www.repsuites.com/feedback/<id>`. Never
  change that address or delete a `qr_links` row; deactivate instead.
- Copy rule: no em dashes in any user-facing text. Use a simple hyphen.
- Never force push.
