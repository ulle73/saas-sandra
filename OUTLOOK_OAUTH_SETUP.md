# Outlook OAuth Setup (Customer Self-Service)

Goal: customers should only click `Anslut Outlook`. They must never handle API keys or env vars.

## 1. One-time platform setup (you/admin)

### Microsoft Entra App Registration
1. Open `Microsoft Entra` -> `App registrations` -> your app.
2. `Authentication`:
   - Add platform: `Web`
   - Add redirect URIs:
     - `http://localhost:3000/api/outlook/callback` (local dev)
     - `https://YOUR_DOMAIN/api/outlook/callback` (production)
3. `Supported account types`:
   - Use multi-tenant + personal accounts if you want Hotmail/Outlook.com users.
4. `API permissions` (Microsoft Graph, Delegated):
   - `Calendars.Read`
   - `User.Read`
   - `offline_access`
   - `openid`
   - `profile`
   - `email`
5. Create a `Client secret` and copy it.

### App environment variables
Set once in your environment (local `.env.local` and production host settings):

```env
OUTLOOK_TENANT_ID=common
OUTLOOK_CLIENT_ID=...
OUTLOOK_CLIENT_SECRET=...
APP_ORIGIN=https://YOUR_DOMAIN
```

Optional (usually not needed):

```env
OUTLOOK_REDIRECT_URI=https://YOUR_DOMAIN/api/outlook/callback
OUTLOOK_OAUTH_SCOPE=offline_access openid profile email User.Read Calendars.Read
```

## 2. Local development

1. In `.env.local`:

```env
APP_ORIGIN=http://localhost:3000
OUTLOOK_TENANT_ID=common
OUTLOOK_CLIENT_ID=...
OUTLOOK_CLIENT_SECRET=...
```

2. Ensure redirect URI is registered in Entra:
   - `http://localhost:3000/api/outlook/callback`
3. Run:
   - `npm run dev`
4. In app:
   - Login
   - Go to `/calendar` or `/dashboard`
   - Click `Anslut Outlook`

## 3. Production deployment

1. Set production env vars in your host (for example Vercel):
   - `OUTLOOK_TENANT_ID`
   - `OUTLOOK_CLIENT_ID`
   - `OUTLOOK_CLIENT_SECRET`
   - `APP_ORIGIN=https://YOUR_DOMAIN`
2. In Entra, ensure this redirect URI exists exactly:
   - `https://YOUR_DOMAIN/api/outlook/callback`
3. Deploy.
4. Customer flow:
   - Customer logs in
   - Customer clicks `Anslut Outlook`
   - Customer grants consent
   - Done (tokens stored server-side in `user_outlook_connections`)

## 4. Common errors and fixes

### `invalid_request` + `redirect_uri` not valid
- Cause: redirect URI mismatch.
- Fix: URI must match exactly in both places:
  - Entra App Registration
  - app runtime value (`APP_ORIGIN` or `OUTLOOK_REDIRECT_URI`)

### Works locally but not in production
- Usually `APP_ORIGIN` is wrong or missing in production env.
- Set it to exact public URL (including `https`).

### `oauth_failed` after callback
- Check `OUTLOOK_CLIENT_SECRET` is valid and not expired.
- Confirm app has required Graph delegated permissions.

## 5. Security note

If secrets were exposed in logs/chat:
- Rotate immediately:
  - `OUTLOOK_CLIENT_SECRET`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `OPENAI_API_KEY`
  - `TELEGRAM_BOT_TOKEN`
  - Any refresh/access tokens
