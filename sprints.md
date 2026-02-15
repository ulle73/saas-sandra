# 🏃‍♂️ Sprint Plan – Lösen SaaS‑1

**Goal:** Deliver a fully functional MVP in 5‑6 iterative sprints.  Each sprint ends with a **tested, deployable** feature set before the next sprint starts.

---
## Sprint 0 – Project Kick‑off & Infra (1 day)
- Create Supabase project **Lösen** (use provided password).
- Store secrets in environment variables:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Initialise Git repo, configure Vercel linked to the repo.
- Write `README.md` with quick‑start instructions.
- **✅ Acceptance:** Supabase DB reachable, Vercel preview URL live.

---
## Sprint 1 – Core DB & Auth (2 days)
1. Apply the **Prisma schema** (contacts, companies, activities, news).
2. Enable **Row‑Level Security** policies for `User → Contact/Company`.
3. Set up **Supabase Auth** (email/password sign‑up).
4. Add a tiny Next.js page `pages/api/health` returning `OK`.
5. **Test Cases**:
   - Register a user → can read/write only their own contacts.
   - Ensure unauthenticated requests are blocked.
6. **✅ Acceptance:** Auth works, DB schema deployed, RLS policies verified.

---
## Sprint 2 – Contact Dashboard UI (3 days)
1. Build a **React table** (TanStack Table) showing contacts.
2. Implement **status colour logic** (`green`, `yellow`, `red`).
3. Add forms for **Create / Edit** contacts (calls Supabase REST).
4. Real‑time sync via Supabase **realtime** channel.
5. **Test Cases**:
   - Add a contact → appears instantly on all open tabs.
   - Change `nextActivity` → colour updates to green.
   - Set `lastTouchpoint` > 4 weeks → colour turns red.
6. **✅ Acceptance:** Dashboard fully functional, colours correct, realtime updates.

---
## Sprint 3 – Company Intelligence (3 days)
1. Integrate **NewsAPI** (fetch top headlines for each company’s `newsKeywords`).
2. Store fetched items in `news_items` table.
3. Build a **News panel** in the UI showing latest alerts per company.
4. Set up a **Telegram Bot** that posts a message when a new news item meets any of the keywords (`layoff`, `order`, `marketing`).
5. **Test Cases**:
   - Add a company with keyword `layoff` → mock NewsAPI returns a layoff article → bot sends alert.
   - Verify news items are stored and displayed.
6. **✅ Acceptance:** News panel works, alerts are sent, data persisted.

---
## Sprint 4 – Weekly AI Lead Generator (4 days)
1. Create an **Edge Function** (Supabase) that runs nightly (cron) and calls **OpenAI** with the prompt (see PRD).  It analyses contacts & news, returns a JSON list of leads.
2. Store the list in a table `weekly_leads`.
3. Add a **“Weekly Leads”** page that displays the list with:
   - Reason why
   - Suggested pitch
   - Action button (create activity).
4. **Test Cases**:
   - Trigger function manually → list generated with at least 1 lead.
   - UI shows the list correctly.
5. **✅ Acceptance:** AI function runs, leads stored, UI displays them.

---
## Sprint 5 – Notifications & Polish (2 days)
1. Implement **email notifications** (SendGrid) for upcoming activities (reminder 1 hour before).
2. Add **filter & search** on contact table (by status, company, lastTouchpoint).
3. Refine UI/UX – responsive design, dark‑mode toggle.
4. Write **unit & integration tests** (Jest + Testing Library).
5. Conduct a **beta‑test** with a dummy user (seed data).
6. **✅ Acceptance:** All notifications work, UI polished, test coverage ≥ 80 %.

---
## Sprint 6 – Production Release & Documentation (1 day)
1. Merge all branches into `main` and tag **v1.0.0**.
2. Deploy to **Vercel Production** and enable custom domain `saas-1.losen.se`.
3. Write **User Guide** (`docs/USER_GUIDE.md`).
4. Write **Developer Guide** (`docs/DEV_GUIDE.md`).
5. Add **Monitoring** (Supabase logs, Vercel analytics).
6. **✅ Acceptance:** Live production URL, documentation published, monitoring active.

---
## 📈 Verification Process
- After each sprint, run the **complete test suite** locally and in CI.
- Deploy to a **staging environment**; a stakeholder review must sign‑off before moving to the next sprint.
- No code is merged to `main` until the sprint’s acceptance criteria are met.

---
**Note:** All secrets (Supabase password, API‑keys) are stored only in the Vercel / Supabase environment variable UI – never committed to the repo.
