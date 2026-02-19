# Lösen – Sales Intelligence SaaS (saas-1)

## 🚀 Quick start
1. **Install dependencies** (already done, but run if you clone later):
   ```bash
   npm install
   ```
2. **Create environment file**
   ```bash
   cp .env.example .env.local
   ```
   Fill in the values:
   - `NEXT_PUBLIC_SUPABASE_URL` – your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` – public anon key
   - `SUPABASE_SERVICE_ROLE_KEY` – service role key (used for server‑side ops)
   - `OPENAI_API_KEY` – for the weekly AI lead generator
   - `NEWSAPI_KEY` – to fetch company news
   - `TELEGRAM_BOT_TOKEN` & `TELEGRAM_CHAT_ID` – for notifications
  - `OUTLOOK_*` vars – optional Outlook OAuth (one-time admin setup)
    - Set `OUTLOOK_TENANT_ID`, `OUTLOOK_CLIENT_ID`, `OUTLOOK_CLIENT_SECRET`, `OUTLOOK_REDIRECT_URI`
    - For personal Microsoft accounts (Hotmail/Outlook.com), use `OUTLOOK_TENANT_ID=common`
    - For Entra work/school accounts, use your tenant GUID
   - `DATABASE_URL` – Supabase Postgres **Session Pooler (IPv4)** connection string
3. **Initialize database schema**
   ```bash
   npm run db:init
   ```
4. **Run the development server**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

## 📋 What the repo contains
- **Next.js** app with custom CSS UI (light/dark theme)
- **Supabase** client (`lib/supabase.js`) – uses the public anon key for client‑side, service role for server‑side functions.
- **Pages**:
  - `/` – sign‑in / sign‑up
  - `/dashboard` – status overview (green/yellow/red contacts)
  - `/contacts` – list, search, filter, edit, delete
  - `/contacts/new` – create a contact
  - `/companies` – list & manage companies
  - `/companies/new` – create a company
  - `/leads` – AI Lead Discovery (new potential customers only)
- **Supabase SQL bootstrap** (`supabase/schema.sql`) – canonical schema + RLS policies for all app tables.
- **AI Lead Generator** (placeholder – you can call the OpenAI API from an edge function or Cron job to fill `weekly_leads` table).
- **Styling system** – centralized in `styles/globals.css` with component classes and theme tokens.

## 🛠️ Development notes
- **Authentication** – uses Supabase Auth (email/password). After login the session is stored client‑side and passed as a prop to pages.
- **Row‑Level Security** – create RLS policies in Supabase so each user can only see his own `contacts`, `companies`, `activities`.
- **AI lead generation** – `npm run leads:generate` runs discovery mode:
  - fetches recent Swedish growth/business signal articles via NewsAPI
  - extracts candidate companies with OpenAI
  - applies criteria: likely growth, HR function, and employee estimate >= 150
  - excludes companies already in your CRM
  - stores candidates in `lead_discovery_items` with status flow (`new`, `accepted`, `rejected`, `converted`)
  - UI actions in `/leads`: open LinkedIn search, accept/reject, create company/contact draft
- **Telegram notifications** – a simple server‑side function can read new `news_items` and push a message via the Bot API.
- **Outlook self-service sync** – users can click "Anslut Outlook" and log in with Microsoft; refresh tokens are stored server-side in `user_outlook_connections` so customers do not manage API keys.

## 📦 Deploy
- Deploy the Next.js app on **Vercel** (connect the repo, set the same env vars).
- Supabase already hosts the Postgres DB and Auth.

## 📚 Resources
- Supabase docs – https://supabase.com/docs
- Next.js docs – https://nextjs.org/docs
- OpenAI API – https://platform.openai.com/docs

## Outlook OAuth Runbook
- See `OUTLOOK_OAUTH_SETUP.md` for full step-by-step setup (local + production).

---
*All secrets must stay out of the repo – keep them in `.env` or Vercel dashboard.*
