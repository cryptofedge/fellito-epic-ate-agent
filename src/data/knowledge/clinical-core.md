# Epic Clinical Core — Go-Live Knowledge Base

## Modules: EpicCare Ambulatory, EpicCare Inpatient, ASAP (ED), ClinDoc, Haiku/Canto/Rover

---

## EPICCARE AMBULATORY

### Core Purpose
Ambulatory clinical documentation for outpatient encounters: office visits, telehealth, procedure notes. Covers order management, referrals, In Basket messaging, and SmartTools.

### Common Go-Live Issues & Fixes

**SmartText/SmartPhrase Not Finding Results**
- Search is case-sensitive for the dot-prefix. Remind provider: type the period + shortcut (e.g., `.ROSNEG`).
- If SmartPhrase was built but not shared to provider or department: → Tier 2 (share the phrase).
- Check: Is the provider in the right specialty context? Some phrases are specialty-locked.

**BestPractice Advisory (BPA) Firing Inappropriately**
- Confirm the BPA is firing for the correct scenario — providers sometimes see unfamiliar alerts because build wasn't tested in their specialty context.
- If a BPA is suppressing when it shouldn't (safety concern): → Tier 2 immediately.
- If a BPA is firing but shouldn't (false positive): Document the scenario → Tier 2 (build review). Do NOT coach providers to dismiss alerts they haven't reviewed.

**Order Panel Missing Expected Orders**
- Verify the provider is in the correct department/specialty context — order panels are often department-linked.
- Favorite orders vs. order panels: Make sure they know the difference. Day 1 confusion is almost always "I used to have a button for this."
- If the order panel was built but isn't visible: → Tier 2 (order panel sharing/preferences).

**In Basket Routing Wrong**
- Results, messages, and rx refill requests routing to wrong provider or pool: → Tier 2 (In Basket routing config).
- Temp fix: Provider can manually re-route from their In Basket.

**Rooming Workflow (MA)**
- MAs often skip steps or complete out of order.
- Standard flow: Open rooming activity → Vitals → Reason for visit → Medications review → Allergies confirm → Hand off to provider.
- If a rooming step is missing from their workflow: → Tier 2 (rooming activity config).

---

## EPICCARE INPATIENT

### Core Purpose
Inpatient clinical documentation: admission H&P, progress notes, nursing documentation, order management, discharge workflows.

### Common Go-Live Issues & Fixes

**Rounding List Not Showing Assigned Patients**
- Provider's patient list is based on their attending assignment in the ADT system. If not assigned: patients won't appear.
- Fix: Confirm attending assignment is correct in Grand Central or ADT. If assignment is correct but still not showing: → Tier 2.
- Hospitalists often forget to manually add patients to a custom list — teach them list management.

**Discharge Order Not Releasing Patient**
- Discharge requires: Discharge order signed AND Discharge disposition documented AND all required fields complete.
- Walk through each element. Missing disposition or unsigned orders are the most common blockers.
- If all elements are complete and patient still stuck: → Tier 2.

**Medication Reconciliation Blocking**
- Med rec must be completed by physician before discharge. Cannot be skipped.
- Common confusion: Providers think the nurse did it. Med rec is a physician function for the discharge summary.
- If a med is erroneously appearing in the reconciliation list: → Tier 2.

**Nursing Flowsheet Row Missing**
- Patient class or care area may not match the flowsheet configuration.
- Check: Is the patient in the right level of care (ICU vs. floor)? Different patient classes have different flowsheet rows.
- If a clinically required row is missing: → Tier 2 (build).

---

## ASAP — EMERGENCY DEPARTMENT

### Core Purpose
ED workflow management: tracking board, triage, order management, disposition, downtime procedures.

### Common Go-Live Issues & Fixes

**Tracking Board Not Showing Patient Status**
- Refresh the board. If auto-refresh is off: teach staff to enable it.
- If a patient was registered but not appearing: Check if ADT transaction completed in Prelude.
- Full board outage: → Tier 3 (patient safety). Activate paper downtime immediately — do not wait.

**Triage Documentation Pathway Unclear**
- Standard ASAP triage flow: Register → Triage (vitals + chief complaint + acuity) → Bed assignment → Provider picks up.
- ESI level must be documented — it drives acuity display on tracking board.
- Very common training gap day 1. Walk them through the triage navigator.

**Disposition Not Clearing Patient from Board**
- Disposition must be documented AND discharge order must be placed AND charge capture completed (if applicable).
- If all done and patient still on board: Check if bed is still showing "occupied" in Grand Central. May need bed status update → Tier 2.

**LWBS / AMA Documentation**
- Left Without Being Seen: specific activity in ASAP. Must be documented — it's a regulatory requirement.
- AMA (Against Medical Advice): Specific AMA note and order required. Walk staff through the process — it's different from a standard discharge.

---

## CLINDOC — NURSING DOCUMENTATION

### Core Purpose
Inpatient and ED nursing documentation: flowsheets, assessments, MAR administration, care plans, I&O.

### Common Go-Live Issues & Fixes

**Flowsheet Row Missing**
- Most common: patient class mismatch. Confirm patient is in correct care area / patient class.
- If correct and still missing: → Tier 2 (flowsheet build).

**MAR Administration Documentation**
- Walk nurses through: MAR → select medication → Administer → document route/site/dose → sign.
- "I gave it but didn't document" happens all day 1. Emphasize: if it's not in the MAR, it didn't happen.
- If a medication is on the MAR that wasn't ordered: → Tier 2 immediately (patient safety).

**Pain Reassessment Not Triggering**
- Reassessment reminders are time-based after pain intervention. Nurse must document pain score after giving med.
- If the reminder isn't appearing at all: → Tier 2 (flowsheet configuration).

**Fall Risk / Skin Assessment**
- These are required assessments with specific navigator pathways. Walk staff through the navigator.
- Missing required assessment at admission is very common day 1 — training gap, not a system issue.

---

## HAIKU / CANTO / ROVER — MOBILE

### Core Purpose
Haiku: physician mobile (iPhone/Android). Canto: physician iPad. Rover: nursing mobile for bedside documentation and specimen collection.

### Common Go-Live Issues & Fixes

**Mobile App Not Connecting**
- First check: Is the device on the correct network (hospital WiFi, not cellular)?
- MDM profile installed? (Device must be enrolled in device management.)
- If network is good and MDM enrolled but still can't connect: → IT/Tier 3.

**Barcode Scan Not Working (Rover)**
- Confirm the specimen label barcode format matches what Rover expects (configuration issue if new label format).
- Camera permission enabled for the app?
- If labels are correct and permissions are on but scan fails: → Tier 2.

**Rover Collection Workflow**
- Patient list → Select patient → Pending collections → Scan patient wristband → Scan tube label → Collect → Complete.
- Missing a step is the most common error. Walk them through it once — it sticks.

---

## ESCALATION QUICK-REFERENCE (Clinical Core)

| Scenario | Tier | Urgency |
|---|---|---|
| Critical result not routing to provider | 2 | Safety — IMMEDIATE |
| Tracking board / ED board down | 3 | Safety — IMMEDIATE |
| High-alert med on MAR not ordered | 2 | Safety — IMMEDIATE |
| BPA suppressing safety alert | 2 | Safety |
| Orders not transmitting to pharmacy | 2 | Safety |
| Med rec blocking discharge | 2 | Operations |
| Flowsheet row missing | 2 | Operations |
| Discharge order not releasing | 2 | Operations |
