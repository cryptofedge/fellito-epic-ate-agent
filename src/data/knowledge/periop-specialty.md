# Epic Perioperative & Specialty Care — Go-Live Knowledge Base

## Modules: OpTime, Anesthesia, Stork (OB), Bones (Ortho), Beacon (Oncology), Cupid (Cardiology), Kaleidoscope (Ophtho), Wisdom (Dental)

---

## OPTIME — SURGICAL SERVICES

### Core Purpose
OpTime manages OR scheduling, case documentation, preference cards, block scheduling, implant tracking, and charge capture for surgical procedures.

### Common Go-Live Issues & Fixes

**Case Not Appearing on OR Schedule**
- Is the case booked in Cadence AND also placed in OpTime? They are linked but scheduling must be done in the correct module.
- Check: Is the surgeon and OR room assigned? Unassigned cases may not appear on board.
- If booking is confirmed and case still missing: → Tier 2.

**Preference Card Not Loading**
- Surgeon preference cards must be built pre-go-live and linked to the surgeon + procedure combination.
- Day 1: Many preference cards are incomplete or not mapped correctly.
- Workaround: Scrub staff proceed without preference card and document manually. Card fix → Tier 2 (build team).
- Do NOT assume the preference card is correct even when it loads — staff should verify with surgeon.

**Charge Capture Not Triggering at Case Close**
- Charge capture is triggered by completing the OpTime case closure workflow.
- Missing charge: Was the case closed properly? Walk through: case close → charges review → sign.
- If the case was closed correctly and charges are still not generating: → Tier 2 (revenue).
- Implant charges are separate — implant documentation must be completed before close.

**Implant Documentation**
- Must document: implant type, lot number, manufacturer, expiration. This is regulatory.
- Walk staff through: OpTime case activity → Implants tab → Add implant.
- If the implant catalog is missing items: → Tier 2 (item master).

**Block Schedule Confusion**
- Block schedule governs which surgeon/service has access to which OR room and when.
- Conflicts: If a case is being placed outside a surgeon's block time, the system may warn or prevent.
- Walk schedulers through block request/release process.

---

## STORK — OBSTETRICS

### Core Purpose
Stork manages the full OB workflow: prenatal visits, L&D admission, delivery documentation, newborn ADT, postpartum, and mother-baby linking.

### CRITICAL: Mother-Baby Linking
**This is the #1 safety issue in Stork Go-Lives.**
- Mother-baby link must be established after delivery. Without it: newborn orders, medications, and documentation may not associate correctly.
- Link workflow: After newborn ADT is created → go to mother's chart → Mother-Baby Link activity → search for newborn → confirm and link.
- If link was not done: Medications ordered for baby could be missed. → Tier 2 immediately. Do not wait.
- If wrong baby was linked to wrong mother: → Tier 2 + safety event. This is a patient safety issue.

**Newborn ADT Not Generating**
- Newborn ADT must be triggered from within Stork at time of delivery documentation completion.
- If delivery is documented but newborn doesn't appear in system: → Tier 2. Do not manually attempt to create a new patient record — risk of duplicate/overlay.

**GBS / Group B Strep Order Set**
- GBS status from prenatal record should pull into L&D. If it's not there, staff need to ask provider to confirm and document.
- If GBS order set is not available in the L&D order panels: → Tier 2 (order set config).

**Fetal Strip Documentation**
- External fetal monitor documentation has a specific flowsheet. Continuous paper strip should be supplemented by Epic documentation.
- If the fetal monitoring flowsheet is not appearing: → Tier 2.

---

## BONES — ORTHOPEDICS

### Core Purpose
Bones (the ortho module built on Epic) handles joint replacement workflows, fracture care, injection documentation, and orthopedic procedure tracking. Often runs within OpTime + EpicCare.

### Common Go-Live Issues & Fixes

**Joint Injection Documentation**
- Injection documentation is done in the ambulatory note with a specific procedure template.
- Walk provider through: Procedure note activity → Injection template → Laterality → medication/dose → attestation.
- If the injection template is missing: → Tier 2 (template build).

**Implant/Hardware Documentation (Arthroplasty)**
- For joint replacement: implant documentation is mandatory in OpTime before case close.
- Component-level documentation required: femoral component, tibial component, insert, etc.
- If the implant catalog is missing the specific product: → Tier 2 (item master add).

**PROMIS / Outcome Questionnaire**
- PROMIS questionnaires route to patient via MyChart or kiosk pre-visit.
- If patients aren't getting questionnaires: Check MyChart enrollment and questionnaire routing setup. → Tier 2 if systemically broken.

---

## BEACON — ONCOLOGY

### Core Purpose
Beacon manages chemotherapy regimens, treatment plans, cycle documentation, lab monitoring, and oncology-specific order management.

### CRITICAL: Chemotherapy Safety
**Any chemotherapy order question or dose safety alert issue → Tier 2 immediately. Do not troubleshoot chemo dose questions at Tier 1.**

**Treatment Plan Not Loading**
- Beacon treatment plans must be built and assigned to the patient before the encounter.
- If the plan exists but isn't showing in the encounter: → Tier 2.
- If the plan was never built: → Tier 2 (build team, and alert charge nurse — treatment cannot proceed until plan is in place).

**Cycle Documentation**
- Cycle documentation must be completed each treatment visit to track cumulative dose.
- Walk nursing through: Open Beacon order → Administer cycle → Document administration → Complete cycle.
- If cycle number is wrong: → Tier 2 (cannot correct cumulative dose at Tier 1 — patient safety).

---

## CUPID — CARDIOLOGY

### Core Purpose
Cupid manages cardiology-specific workflows: ECG management, cath lab cases, cardiology notes, and device integration (ECG machines, Holter monitors).

### Common Go-Live Issues & Fixes

**ECG Device Integration Not Reading Into Chart**
- ECG machines must be integrated at the interface level. Day 1 issues often relate to device pairing.
- If ECG was done and trace is not appearing in chart: → Tier 3 (device integration). Workaround: scan paper ECG as document.

**Cath Lab Case Workflow**
- Cath lab runs through OpTime for case management but has Cupid-specific documentation.
- Walk staff through: Case is in OpTime → Cupid documentation (hemodynamics, findings) → procedure note → charges.

---

## ESCALATION QUICK-REFERENCE (Periop & Specialty)

| Scenario | Tier | Urgency |
|---|---|---|
| Wrong baby linked to mother | 2 | Safety — IMMEDIATE |
| Newborn ADT not generating | 2 | Safety — IMMEDIATE |
| Chemo dose safety alert issue | 2 | Safety — IMMEDIATE |
| OpTime charges not capturing | 2 | Revenue |
| Surgeon preference card missing | 2 | Operations |
| Implant catalog item missing | 2 | Operations |
| ECG device integration down | 3 | Operations |
