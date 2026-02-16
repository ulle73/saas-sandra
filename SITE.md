# Project Vision & Constitution: Lösen

> **AGENT INSTRUCTION:** Read this file before every iteration. It serves as the project's "Long-Term Memory." If `next-prompt.md` is empty, pick the highest priority item from Section 5 OR invent a new page that fits the project vision.

## 1. Core Identity
* **Project Name:** Lösen
* **Stitch Project ID:** `12356634150435692596`
* **Mission:** A sales-intelligence SaaS that aggregates contacts, tracks interactions, and provides AI-generated outreach insights.
* **Target Audience:** Salespeople and Account Managers managing high-volume prospect lists.
* **Voice:** Professional, efficient, insightful, and empowering.

## 2. Visual Language (Stitch Prompt Strategy)
*Strictly adhere to these descriptive rules when prompting Stitch. Do NOT use code.*

* **The "Vibe" (Adjectives):**
    * *Primary:* **Nordic** (Clean, minimalist, functional).
    * *Secondary:* **Financial** (Trustworthy, precise, data-rich).
    * *Tertiary:* **Light** (Airy, high whitespace, high contrast).

## 3. Architecture & File Structure
* **Root:** `pages/` (Next.js context) or `site/public/` (Stitch export context)
* **Asset Flow:** Stitch generates to `queue/` -> Integrated into Next.js components or pages.
* **Navigation Strategy:**
    * **Sidebar:** Overview, Contacts, Weekly Leads, Intelligence, Settings.

## 4. Live Sitemap (Current State)
*The Agent MUST update this section when a new page is successfully merged.*

* [x] `dashboard.html` - Contact list with color-coded status rows.
* [ ] `leads.html` - Weekly AI-generated leads and outreach snippets.
* [ ] `intelligence.html` - Real-time company news and alerts.

## 5. The Roadmap (Backlog)
*If `next-prompt.md` is empty or completed, pick the next task from here.*

### High Priority
- [x] **Contact Dashboard:** Main list view with green/yellow/red status indicators.
- [ ] **Weekly Leads:** AI-prioritized task list for outreach.

### Medium Priority
- [ ] **Company Intelligence View:** Feed of news alerts and keyword detections.
- [ ] **Contact Details:** Deep dive into a single contact's history and notes.

## 6. Creative Freedom Guidelines
1. **Stay On-Brand:** Adhere to the Nordic Financial Light aesthetic.
2. **Data Clarity:** Prioritize scanability of large contact lists.
3. **Naming Convention:** Use lowercase, descriptive filenames.

## 7. Rules of Engagement
1. Do not recreate pages in Section 4.
2. Always update `next-prompt.md` before completing.
3. Consume ideas from Section 6 when you use them.
4. Keep the loop moving.
