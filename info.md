# Info om appen: Losen

## Vad appen ar till for
Losen ar en sales-intelligence-app for B2B-forsaljning. Den hjalper saljteam att hitta ratt bolag, prioritera leads med hog sannolikhet att stanga och folja upp kontakter strukturerat i ett och samma system. Malet ar att minska manuellt arbete och gora det tydligt vem som ska kontaktas, nar och varfor.

## Kundens viktigaste onskemal
- Skapa nya leads enligt satta regler, framfor allt bolag med minst 150 anstallda och rimlig chans att bli kund.
- Ha koll pa bolag som lagts till i systemet och fa signaler nar de namns i nyheter.
- Ha en kalender for planerade aktiviteter, uppfoljningar och nasta steg.

## Regler for nya leads
- Minimikrav: bolaget ska ha minst 150 anstallda.
- Fokus pa "signbara" bolag: bolag dar det ar realistiskt att fa till mote, dialog och avslut inom rimlig tid.
- Undvik de absolut storsta globala foretagsjattarna (exempelvis Apple-typ bolag) dar inkopsprocesser ar for tunga och sannolikheten att signa ar lag.
- Prioritera bolag i segment mellan for litet och for stort, dar behov, budget och beslutsvagar brukar vara mer hanterbara.
- Prioritera bolag med tydliga signaler i omvarlden, till exempel nyheter om expansion, ny order, rekrytering eller andra handelser som tyder pa behov.
- Nar flera leads ar mojliga ska appen ranka de med hogst sannolikhet att bli affar fore "prestigebolag" med lag konverteringschans.

## Hur appen hamtar bolags- och LinkedIn-info just nu
- Steg 1: Appen hittar bolag via nyhetsflodet och AI-analys (bolagsnamn, signal, uppskattad storlek, rekommenderad roll).
- Steg 2: For varje valt bolag gor appen en bolagssokning mot LinkedIn-datakalla (RapidAPI) for att hitta ratt company-id och bolagssida.
- Steg 3: Nar bolagsmatchen hittas sparas LinkedIn company-id.
- Steg 3: Nar bolagsmatchen hittas sparas LinkedIn company-url.
- Steg 3: Nar bolagsmatchen hittas sparas LinkedIn people-search URL for HR.
- Steg 3: Nar bolagsmatchen hittas sparas LinkedIn people-search URL for CEO.
- Steg 4: Appen hamtar personer pa bolaget (paginerat) och berikar med profil-url, namn, titel, plats, e-post och telefon nar det finns.
- Steg 5: Position/roll valjs med titelregler for prioriterade titlar (target titles), fallback-titlar och exkluderade titlar (t.ex. intern/junior/student).
- Steg 5: Position/roll rankas med poang for att lyfta beslutsfattare forst.
- Steg 6: Basta kandidater sparas som kontaktforslag pa leadet och visas i Leads-vyn.

### LinkedIn fallback
- Om personens direkta LinkedIn-URL saknas men ett public identifier finns, bygger appen URL automatiskt i formatet `https://www.linkedin.com/in/{identifier}`.
- Om personberikning inte lyckas fullt ut finns fortfarande sparad fallback for manuell uppfoljning via LinkedIn company-url.
- Om personberikning inte lyckas fullt ut finns fortfarande sparad fallback for manuell uppfoljning via LinkedIn HR-search-url (byggd fran company-id).
- Om RapidAPI-nycklar saknas hoppas personflodet over, men leadet kan fortfarande hanteras med sparade/manuella LinkedIn-lankar.

## RapidAPI URL:er vi anvander for datahamtning
- `https://linkedin-jobs-data-api.p.rapidapi.com/companies/search`
- Andamal: hamtar bolagsmatchning pa LinkedIn (company-id, bolagsnamn, bolagsurl m.m.).
- Vanliga query-parametrar: `keyword`, `page_number`.

- `https://fresh-linkedin-scraper-api.p.rapidapi.com/api/v1/company/people`
- Andamal: hamtar personer kopplade till valt bolag pa LinkedIn.
- Vanliga query-parametrar: `company_id`, `page`.

## Hur RapidAPI-anropen maste goras (host, headers, osv)
- Metod: `GET`
- Obligatorisk header: `x-rapidapi-host`
- Obligatorisk header: `x-rapidapi-key`
- Nyckel hamtas fran miljo: `RAPIDAPI_KEYS` (kommaseparerad) eller `RAPIDAPI_KEY_1 ... RAPIDAPI_KEY_20`.
- Timeout styrs av: `RAPIDAPI_TIMEOUT_MS` (default 30000 ms).
- Retry styrs av: `RAPIDAPI_MAX_RETRIES` (default 2, retry vid 429/5xx/timeout).

### Endpoint 1: Company search
- URL: `https://linkedin-jobs-data-api.p.rapidapi.com/companies/search`
- `x-rapidapi-host`: `linkedin-jobs-data-api.p.rapidapi.com`
- Query: `keyword`, `page_number`
- Exempel (curl):
```bash
curl -G "https://linkedin-jobs-data-api.p.rapidapi.com/companies/search" \
  --data-urlencode "keyword=Acme" \
  --data-urlencode "page_number=1" \
  -H "x-rapidapi-host: linkedin-jobs-data-api.p.rapidapi.com" \
  -H "x-rapidapi-key: <RAPIDAPI_KEY>"
```

### Endpoint 2: Company people
- URL: `https://fresh-linkedin-scraper-api.p.rapidapi.com/api/v1/company/people`
- `x-rapidapi-host`: `fresh-linkedin-scraper-api.p.rapidapi.com`
- Query: `company_id`, `page`
- Exempel (curl):
```bash
curl -G "https://fresh-linkedin-scraper-api.p.rapidapi.com/api/v1/company/people" \
  --data-urlencode "company_id=123456" \
  --data-urlencode "page=1" \
  -H "x-rapidapi-host: fresh-linkedin-scraper-api.p.rapidapi.com" \
  -H "x-rapidapi-key: <RAPIDAPI_KEY>"
```

## Viktiga features i appen
- Kontakt- och bolagsoversikt med all relevant info samlad.
- Lead-kvalificering enligt reglerna ovan, sa att teamet jobbar pa ratt bolag fran start.
- Statusmarkering av leads/kontakter for att visa vad som ar aktivt, riskerar att tappas eller behover foljas upp.
- Aktivitetslogg med senaste kontakt och nasta aktivitet.
- Nyhetsovervakning per bolag med alerts vid viktiga handelser.
- Prioriteringslista som lyfter bolag med hogst chans att signa, baserat pa storlek, signaler och aktivitet.
- AI-stod som varje vecka foreslar prioriterade leads med kort motivering.
- Kalender for uppfoljningar, moten och nasta steg sa inget tappas mellan aktiviteter.
- Inloggning och anvandarseparerad data sa varje teammedlem bara ser sitt eget.
- Sok, filtrering och notiser for att jobba snabbare i vardagen.

## Kort sammanfattning
Appen ar byggd for strukturerad och datadriven B2B-forsaljning: hitta ratt bolag, undvika fel typ av jattebolag, agera i ratt tid och folja upp systematiskt tills affar.
