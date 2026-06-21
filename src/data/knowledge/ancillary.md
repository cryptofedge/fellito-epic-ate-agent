# Epic Ancillary — Go-Live Knowledge Base

## Modules: Beaker (Lab/LIS), Radiant (Radiology/RIS), Willow (Pharmacy), Bugsy (Infection Control)

---

## BEAKER — LABORATORY

### Core Purpose
Beaker is Epic's LIS (Laboratory Information System). Manages specimen collection, accessioning, testing workflow, result reporting, and reference lab interfaces.

### Common Go-Live Issues & Fixes

**Specimen Routing to Wrong Accession**
- Specimen labels must be printed from Epic (Rover or lab label printers) to ensure the correct accession number.
- If a manually created accession was used, it won't link to the Epic order.
- Fix: Void the manual accession, re-accession in Beaker linked to the Epic order.
- If there is a pattern of wrong routing: → Tier 2 (accession routing config).

**Result Release Not Flowing to Ordering Provider**
- Result release requires: test verified by lab → auto-release rules trigger → result goes to ordering provider's In Basket.
- If result is verified but not routing: check auto-release configuration → Tier 2.
- CRITICAL: Critical value results must route within defined time window. If critical value not routing: → Tier 2 IMMEDIATELY.

**Reference Lab Interface Not Sending Orders**
- Reference lab orders (Quest, LabCorp, specialty labs) go through a Bridges interface.
- If orders are being placed but not transmitting: → Tier 2/3 (interface issue).
- Workaround while interface is down: manual requisition paper process. Ensure staff know the downtime procedure.

**Critical Value Notification**
- Critical values must have a documented notification to the provider within policy-defined time.
- If the critical value alert fired but provider says they weren't notified: Check In Basket routing.
- If the critical value never triggered: → Tier 2 immediately (safety).

**QC Management**
- Quality control (QC) must be run and documented before analyzers can release patient results.
- If lab staff are confused on QC workflow in Beaker: This is a training gap. Walk them through QC activity.
- If QC is failing the instrument: This is an instrument issue, not an Epic issue. Contact instrument vendor.

---

## RADIANT — RADIOLOGY

### Core Purpose
Radiant is Epic's RIS (Radiology Information System). Manages imaging orders, worklists, protocoling, transcription/dictation, and PACS integration.

### Common Go-Live Issues & Fixes

**Order Not Appearing in Radiant Worklist**
- Is the order placed AND in "ordered" status? Unaccepted orders don't appear on the worklist.
- Check: Is the order routed to the correct imaging department/modality?
- If order is confirmed placed and correctly routed but not on worklist: → Tier 2.

**PACS Integration Not Linking Images**
- PACS (image archive) must receive a study from the modality AND Radiant must have the matching accession number to link.
- If images are in PACS but not appearing in Epic: → Tier 3 (PACS integration).
- Workaround: Radiologist can launch PACS directly. Document in Radiant that images were reviewed via PACS workaround.

**Transcription/Dictation Routing Issue**
- Radiologist dictates → transcription service → report in Radiant.
- If dictation is not appearing in Radiant for review: → Tier 2/3 (transcription interface).
- If radiologist is not comfortable dictating and needs to type: Radiant supports typed reports directly.

**Protocol Assignment**
- Radiologist or technologist protocols are study-dependent. Many orgs require radiologist to protocol before tech scans.
- If protocol activity is unclear: Walk through Radiant worklist → select study → Protocol activity → assign protocol.

---

## WILLOW — PHARMACY

### Core Purpose
Willow manages inpatient pharmacy verification, dispensing, compounding, controlled substance workflows, and the interface to automated dispensing cabinets (ADCs like Pyxis/Omnicell).

### CRITICAL: High-Alert Medications
**Any high-alert medication order anomaly → Tier 2 immediately. Never troubleshoot insulin, anticoagulants, chemotherapy, or opioid order issues at Tier 1.**

### Common Go-Live Issues & Fixes

**Order Not Appearing in Willow Verification Queue**
- Is the order in "ordered" status in the clinical system? Orders don't appear until they're signed.
- Is the patient in the correct facility/care area matched to the pharmacy coverage zone?
- If order is signed and patient is in correct coverage zone but not in queue: → Tier 2.

**Drug-Drug Interaction Alert Not Firing**
- If staff expect an alert that isn't appearing: → Tier 2 (drug database configuration — do NOT assume it's safe just because the alert didn't fire).

**Dispensing Cabinet Interface Mismatch**
- ADC (Pyxis/Omnicell) should receive orders from Willow automatically.
- If a medication is in Willow but not available in the cabinet: Check if item is on the cabinet's formulary AND if the interface sent the update.
- If cabinet doesn't have the medication: Pharmacist override workflow — document per policy.
- If the interface is down and no medications are routing to cabinet: → Tier 3 (ADC vendor + Epic interface team). Activate pharmacy downtime process.

**Controlled Substance Workflow**
- Most orgs require two-nurse sign-off for controlled substance waste.
- If the witness signature field is missing or the workflow step isn't appearing: → Tier 2 (CII workflow config).
- Never skip controlled substance documentation steps — it is a DEA/legal requirement.

**Compounding**
- Compounding documentation is done in Willow with lot number, compounder ID, and expiration.
- If the compounding template is missing: → Tier 2.

---

## BUGSY — INFECTION CONTROL

### Core Purpose
Bugsy is Epic's infection surveillance module. Monitors HAI (Hospital-Acquired Infection) criteria, isolation orders, and pathogen tracking.

### Common Go-Live Issues & Fixes

**Surveillance Criteria Not Triggering**
- Bugsy runs surveillance rules against clinical data. If a known infection isn't triggering: → Tier 2 (surveillance criteria config).

**Isolation Order Not Flagging on Tracking Board**
- Isolation flag requires an active isolation order placed in the clinical system.
- If the order is placed but flag isn't showing: → Tier 2 (tracking board display configuration).
- Ensure staff know: Isolation is a clinical order, not just a note.

---

## ESCALATION QUICK-REFERENCE (Ancillary)

| Scenario | Tier | Urgency |
|---|---|---|
| Critical lab value not routing | 2 | Safety — IMMEDIATE |
| High-alert med order anomaly | 2 | Safety — IMMEDIATE |
| ADC interface systemically down | 3 | Safety + Operations |
| Reference lab interface down | 2/3 | Operations |
| PACS integration down | 3 | Operations |
| Surveillance criteria not triggering | 2 | Safety |
| Controlled substance documentation issue | 2 | Regulatory |
