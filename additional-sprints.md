# Additional Sprints – Gap Closure Plan for Lösen MVP

Det här är en kompletterande plan baserad på faktisk kodstatus jämfört med `prd.md`.

## Sprint A – Critical Stabilization (1-2 dagar)
- Mål: Få appen körbar end-to-end utan runtime/databasfel.
- Skapa och applicera databas-schema i Supabase för:
  - `contacts`
  - `companies`
  - `activities`
  - `news_items`
  - `weekly_leads`
- Lägg till constraints/index:
  - FK mellan `contacts.company_id -> companies.id`
  - FK mellan `activities.contact_id -> contacts.id`
  - unique index på `news_items.url` (för säkra upserts)
- Verifiera att CRUD fungerar för bolag och kontakter i UI.
- Acceptance:
  - Inga fel av typen "Could not find the table ... in the schema cache".
  - Skapa/uppdatera/radera kontakt och bolag fungerar i UI.

## Sprint B – Data Model + RLS Hardening (2-3 dagar)
- Mål: Uppfylla PRD-krav på multi-user isolation och säkerhet.
- Lägg till `user_id` på `companies`, `news_items`, `weekly_leads`.
- Aktivera RLS på alla domäntabeller.
- Policies:
  - Endast `auth.uid() = user_id` får läsa/skriva.
  - Cascading regler för delete/update testas.
- Byt frontend-queries så de alltid filtrerar på `session.user.id`.
- Acceptance:
  - Ingen cross-user data leakage i tester.
  - All data är user-scoped.

## Sprint C – App Logic Fixes (2 dagar)
- Mål: Fixa logiska buggar som ger fel data eller instabilitet.
- `pages/contacts/new.js`:
  - ersätt felaktig `useState(() => ...)` med `useEffect`.
- Centralisera statusberäkning (green/yellow/red) i en helper.
- Säkerställ att status uppdateras automatiskt vid create/edit.
- Lägg till korrekt felhantering (`error` från Supabase) i samtliga CRUD-flöden.
- Acceptance:
  - Status färg och statusfält matchar alltid.
  - Inga tysta fel vid insert/update/delete.

## Sprint D – News + Alerts Pipeline (2-3 dagar)
- Mål: Göra company intelligence-funktionen verkligt användbar.
- Korrigera schema-mismatch i `scripts/fetch-news.js`:
  - använd fält som finns i tabellen (`source`, `news_type`, etc.).
- Implementera klassificering av `news_type` baserat på PRD-keywords.
- Lägg till idempotent körning (upsert med fungerande conflict target).
- Koppla Telegram-notiser till nya relevanta news-items.
- Acceptance:
  - Nyheter sparas korrekt och visas konsekvent.
  - Telegram skickas endast för nya/relevanta events.

## Sprint E – Weekly AI Leads (2-3 dagar)
- Mål: Leverera PRD-funktion för veckovisa prioriterade leads.
- Flytta lead-generering till server-säkert flöde (Edge Function/Cron).
- Korrigera `scripts/generate-leads.js`:
  - ta bort beroende av `supabase.auth.getUser()` i server-script.
  - filtrera på explicit `user_id`.
  - ta bort felaktigt filter `.is('status', null)`.
- Spara 5-10 leads per vecka med `reason` + `pitch`.
- Acceptance:
  - Veckokörning producerar leads i `weekly_leads`.
  - `/leads` visar riktiga poster per användare.

## Sprint F – Deployment Readiness + Quality (2 dagar)
- Mål: Produktionsredo leverans enligt PRD.
- Ta bort hemligheter från klientexponering i `next.config.js`.
- Dela upp klient/server-konfiguration för Supabase-klienter.
- Lägg till smoke tests för:
  - auth flow
  - contact/company CRUD
  - lead rendering
  - telegram API route
- Dokumentera migration + env + release checklist.
- Acceptance:
  - Inga serverhemligheter exponeras till browsern.
  - CI passerar med funktionella tester.

## Milestones
- M1: Sprint A+B klara => stabil och säker datagrund.
- M2: Sprint C+D klara => korrekt daglig användning + nyhetsvärde.
- M3: Sprint E+F klara => full MVP enligt PRD och deploybar.
