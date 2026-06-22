# FELLITO — Epic ATE Go-Live Support Agent

**Powered by Eclat Universe**

FELLITO is an AI-powered At-The-Elbow (ATE) Go-Live support consultant for Epic EHR implementations. He's only live during an active Go-Live event. Outside of one, the app sits in standby.

---

## Stack

- **Mobile**: React Native + Expo + TypeScript (matching cryptofedge conventions)
- **AI**: Claude Sonnet 4.6 via Anthropic API (white-labeled as "Eclat Universe")
- **Voice**: ElevenLabs — Fellito's voice clone (PTT-style responses)
- **RAG**: Node.js backend with lightweight TF-IDF vector store for orientation doc ingestion
- **Backend**: Express.js (keeps API keys server-side, never in the mobile bundle)

---

## App Structure

| Screen | Purpose |
|---|---|
| Onboarding | Consultant profile + Go-Live event + module assignment |
| Standby | Dormant state, upcoming schedule, orientation doc upload |
| Go-Live Active | Voice + text chat with Fellito, organized by Epic module tabs |
| Orientation Upload | Drag/drop PDF ingestion with PHI warn-and-confirm guard |
| Escalation | One-tap Tier 2/3/4 escalation with auto-generated issue summary |
| Session Log | Searchable history of all Go-Live Q&A for post-event debrief |

---

## Knowledge Base

Module-specific Go-Live knowledge lives in `src/data/knowledge/`:

- `patient-access.md` — Prelude, Grand Central, Cadence, Welcome
- `clinical-core.md` — EpicCare Ambulatory/Inpatient, ASAP (ED), ClinDoc, Haiku/Canto/Rover
- `periop-specialty.md` — OpTime, Anesthesia, Stork (OB), Bones, Beacon, Cupid, Kaleidoscope, Wisdom
- `ancillary.md` — Beaker, Radiant, Willow, Bugsy
- `revenue-cycle.md` — Resolute HB/PB, Tapestry
- `interop-data.md` — Bridges, Care Everywhere, Clarity/Caboodle/Cogito
- `patient-facing.md` — MyChart, Healthy Planet, Cheers

---

## PHI Guardrail

FELLITO never touches patient data. The app enforces:

1. **Client-side PHI scan** on all chat input and uploaded filenames before sending
2. **Warn-and-confirm modal** (not a hard block) — consultant must explicitly confirm before proceeding
3. **Audit log** of every warning shown + whether the user confirmed (stored in app state)
4. **System prompt hard rule** — Fellito will refuse to engage with PHI regardless of how a request is phrased

---

## Setup

### 1. Environment

```bash
cp .env.example .env
# Fill in:
# ANTHROPIC_API_KEY
# ELEVENLABS_API_KEY  (fresh key — never reuse from other projects)
# ELEVENLABS_VOICE_ID  (Fellito's voice clone ID from ElevenLabs)
# BACKEND_URL  (default: http://localhost:3001)
```

### 2. Mobile app

```bash
npm install
npm start
```

### 3. Backend

```bash
cd backend
npm install
npm start
```

### 4. ElevenLabs voice setup

1. Clone your voice in ElevenLabs
2. Copy the Voice ID into `.env` as `ELEVENLABS_VOICE_ID`
3. Create a **new** ElevenLabs API key for this project — do not reuse keys from FEDGE 2.O or other projects

---

## Escalation Tiers

| Tier | Who | When |
|---|---|---|
| 0 | Self-service (tip sheets) | User just needs the how-to |
| 1 | ATE / Super User (Fellito's lane) | Training gap, floor-level fix |
| 2 | Command Center Analyst | Config issue, role access, system error |
| 3/4 | Vendor / Epic Backend | Interface failure, hosting issue, certified build |

---

## Data Boundary

FELLITO handles:
- Department/module workflow documentation
- Go-Live orientation materials and tip sheets
- Build/configuration documentation (non-patient)

FELLITO never sees:
- Patient names, MRNs, DOBs, SSNs
- Clinical records or charts
- Any PHI in any form

---

*Eclat Universe · FELLITO v1.0*

---

## License & Brand

**FEDGE 2.O | Powered by Rafael Fellito Rodriguez and Eclat Universe**

© 2026 FEDGE 2.O. All rights reserved.

This project is part of the FEDGE 2.O ecosystem and is protected under full intellectual property rights reserved by Rafael Fellito Rodriguez and Eclat Universe.

### License Details
- **Type:** Proprietary - All Rights Reserved
- **Owner:** Rafael Fellito Rodriguez and Eclat Universe
- **Brand:** FEDGE 2.O
- **Status:** Protected and Confidential

### Key Rights
- All intellectual property retained
- Reproduction prohibited without permission
- Distribution rights reserved
- Derivative works not permitted
- Commercial use requires authorization

### Attribution
When referencing this software, please include:
- FEDGE 2.O
- Rafael Fellito Rodriguez
- Eclat Universe

### Inquiries
For licensing, partnerships, or usage permissions:
**Email:** cryptofedge@gmail.com
