# Facebook and Instagram posting: Meta app setup and App Review

RepSuites posts each approved "Plan my month" post to the business's Facebook Page
and Instagram (business account linked to that Page) at the same time as Google.
This needs one Meta app owned by Accelur8 Ltd.

## 1. Create the app

1. Go to developers.facebook.com, My Apps, Create app.
2. Use case: "Other", then app type **Business**. Name: **RepSuites**. Business portfolio: **Accelur8 Ltd**.
3. Add products:
   - **Facebook Login for Business**
   - **Instagram** (Instagram API with Facebook Login, "Instagram Graph API")

## 2. Settings

App settings, Basic:

- App domains: `repsuites.com`
- Privacy policy URL: `https://repsuites.com/privacy`
- Terms of service URL: `https://repsuites.com/terms`
- User data deletion: choose "Data deletion callback URL": `https://repsuites.com/api/meta/data-deletion`
  (status page for people: `https://repsuites.com/meta-deletion?code=...`)
- App icon: RepSuites icon (1024x1024), category: Business and pages.

Facebook Login for Business, Settings:

- Valid OAuth redirect URI: `https://repsuites.com/api/meta/oauth/callback`
- Client OAuth login: on. Web OAuth login: on. Enforce HTTPS: on. Strict mode: on.

## 3. Keys (Julius adds these himself)

Cloudflare, Workers, `repsuites`, Settings, Variables and secrets:

- `REPSUITES_META_APP_ID` (App ID, can be plain text)
- `REPSUITES_META_APP_SECRET` (App secret, type **Secret**)

Until both are set, the Posts tab shows "Facebook and Instagram are coming soon".

## 4. Before App Review (Development mode)

Only people with a role on the app (Admins, Developers, Testers) can connect.
Add yourself and a test business owner under App roles, then connect a test Page
from RepSuites (Posts tab, Connect Facebook and Instagram).

## 5. Business verification

Business settings (business.facebook.com), Security centre, Start verification for
Accelur8 Ltd (company number, address, website, a phone or email check).
Advanced Access to these permissions needs a verified business.

## 6. App Review: request Advanced Access for

| Permission                  | What to write (justification)                                                                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pages_show_list`           | RepSuites lists the Facebook Pages the business owner manages so they can pick which Page their review and update posts go to.                                                                                     |
| `pages_read_engagement`     | Needed with pages_manage_posts to read the Page's details (name, linked Instagram account) shown back to the owner after they connect.                                                                             |
| `pages_manage_posts`        | The owner approves short business updates (written from their own customer reviews) in RepSuites; we publish each one to their own Facebook Page at the time they chose. Nothing is posted without their approval. |
| `instagram_basic`           | Reads the Instagram business account linked to the owner's Page (username) so we can show which account posts go to.                                                                                               |
| `instagram_content_publish` | Publishes the same approved update, with its picture, to the owner's own Instagram business account.                                                                                                               |
| `business_management`       | Needed for Pages owned by a business portfolio so the owner can connect them through Facebook Login for Business.                                                                                                  |

## 7. Screencast for App Review (one video, 2 to 3 minutes)

1. Sign in to repsuites.com as a test business owner. Open the Posts tab.
2. Click **Connect Facebook and Instagram**. Show the Facebook Login dialog, the Page picker and the permissions screen. Allow.
3. Back in RepSuites: show "Connected to <Page> and Instagram @<account>".
4. Click **Plan my month**, show the 4 draft posts with pictures, edit one, tick Facebook and Instagram, click **Approve all**.
5. Show a post published on the Facebook Page and on Instagram (use a test Page; for the video you can set one post's time to a few minutes ahead).
6. Show **Disconnect** removing access.
   Add captions in the video explaining each step. Test login details for the reviewer: give a test RepSuites account with Growth on.

## 8. After approval

Switch the app to **Live**. Any business owner can then connect.

## Notes

- Instagram only accepts posts with a picture (JPEG). Posts without one go to Facebook only.
- Tokens are kept in Supabase Vault (one secret per business), never in the browser.
- If an owner removes RepSuites in Facebook, Meta calls the data deletion URL and we delete their tokens.
