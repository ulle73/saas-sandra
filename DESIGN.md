# Design System: Nordic Financial Light

## 1. Visual Goal
- Clean, modern B2B SaaS interface
- Professional and trustworthy tone
- Fast to scan for busy sales users

## 2. Core Style
- Minimal visual noise
- Clear hierarchy and spacing
- Readable density for data-heavy pages

## 3. Color Tokens
- Primary: deep navy / midnight blue
- Surface: white
- Surface-muted: `#F5F7FA`
- Text-primary: dark slate
- Text-secondary: cool gray
- Status-success: green
- Status-warning: amber/yellow
- Status-danger: red

## 4. Typography
- Font: Inter or Roboto
- Heading weight: 600-700
- Body weight: 400-500
- Keep label and table text legible at dense layouts

## 5. Component Guidelines
- Sidebar navigation with clear active state
- Top header with page title and primary action
- Data tables with row separation (border or zebra striping)
- KPI and summary cards with subtle shadows and rounded corners
- Form layouts with clear labels and helpful empty states

## 6. Design System Notes for Stitch Generation (REQUIRED BLOCK)
Copy this block into each `next-prompt.md` task:

```markdown
**DESIGN SYSTEM (REQUIRED):**
- Style: Nordic Financial Light
- Direction: simple, easy to scan, professional
- Priorities:
  1. Clarity first (avoid decorative clutter)
  2. Strong visual hierarchy (title, key actions, content)
  3. Consistent spacing and alignment
- Layout:
  - Desktop-first
  - Sidebar + top header for authenticated pages
  - Card and table patterns for CRM data
- Visual language:
  - White/light-gray surfaces
  - Navy primary accents
  - Green/yellow/red status badges
  - Soft shadows, subtle borders
- Typography:
  - Inter or Roboto
  - Bold headings, neutral readable body text
- Mandatory output quality:
  - Produce a polished page suitable for screenshot export.
  - Keep spacing and contrast clean so the image is presentation-ready.
```
