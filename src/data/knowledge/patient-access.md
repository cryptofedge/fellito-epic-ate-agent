# Epic Patient Access & Scheduling — Go-Live Knowledge Base

## Modules: Prelude (Registration/ADT), Grand Central (ADT/Bed Management), Cadence (Scheduling), Welcome (Kiosk)

---

## PRELUDE — Registration & ADT

### Core Purpose
Prelude manages patient registration, demographic collection, insurance verification, guarantor accounts, and ADT (Admit/Discharge/Transfer) transactions. It is the front door of the Epic ecosystem — bad data here cascades downstream.

### Common Go-Live Issues & Fixes

**Duplicate MPI / Overlay Risk**
- Most critical Prelude issue. If a registrar creates a new record for an existing patient, you get a duplicate.
- Fix at Tier 1: If not yet confirmed — search by DOB, SSN last 4, address before creating new. Show the registrar the search parameters.
- If overlay has already occurred (wrong patient data merged): → TIER 2 IMMEDIATELY. This is a patient safety event. Do not attempt to resolve at floor level.

**Insurance Eligibility Check Failing**
- First check: Is the payer attached? Is the subscriber ID entered correctly (no spaces, correct format per payer)?
- If manual eligibility check fails but payer is correct: check if the real-time eligibility (RTE) interface is down → Tier 2/3.
- Workaround: manual verification via payer portal, mark insurance as manually verified.

**Guarantor Account Not Linking**
- Guarantor must exist in Epic before linking. Search for guarantor first — don't create duplicates.
- If self-pay and guarantor setup is unclear: walk through the guarantor relationship screen step by step.

**Coverage Priority Order Wrong**
- Primary/Secondary/Tertiary must be set in Prelude, not assumed by the system.
- Fix: Show registrar how to re-sequence in the Coverage screen.

**Patient Search Returning Wrong Results**
- Check search parameters — name, DOB, SSN. Typos are common on day 1.
- If "ghost" records appearing: → Tier 2 (MPI cleanup needed).

---

## GRAND CENTRAL — ADT / Bed Management

### Core Purpose
Grand Central manages real-time bed board, placement requests, housekeeping task generation, and discharge workflows. Primary users: bed coordinators, house supervisors.

### Common Go-Live Issues & Fixes

**Bed Requests Not Routing**
- Verify the request is being submitted to the right unit. Confirm unit configuration matches physical layout.
- If bed requests going to wrong team: → Tier 2 (bed board routing config).

**Discharge Not Triggering Downstream Tasks**
- Ensure "Discharge" order is signed and disposition is documented — both are required for task generation.
- If tasks still not generating after both are confirmed: → Tier 2.

**Housekeeping Tasks Not Appearing**
- Housekeeping module must be integrated. Confirm your org went live with housekeeping integration.
- Check if EVS has a separate login/app — not all orgs use Epic for housekeeping.

**Patient Placement Workflow**
- Walk users through: Request → Coordinator reviews → Assign bed → Accept.
- Confusion is almost always training gap on day 1. Use the tip sheet.

---

## CADENCE — Scheduling

### Core Purpose
Cadence handles appointment scheduling, provider template management, referral management, wait lists, and recall. Primary users: schedulers, front desk, access center.

### Common Go-Live Issues & Fixes

**Appointment Type Not Showing Available Slots**
- Most common cause: provider template not built or not activated for the current week.
- Check: Does the provider have an active template? (Template Management > View Template for the provider/date)
- If template exists but no slots showing: → Tier 2 (template activation or slot release build issue).

**Provider Template Not Loaded**
- Very common week 1. Schedulers assume templates auto-populate.
- Fix: Verify template was built in build phase. If missing entirely → Tier 2.
- Temporary workaround: Overbook or use "direct scheduling" if org enabled it.

**Referral Auth Not Attaching**
- Auth must exist in the patient's record before linking to appointment.
- Walk scheduler through: referral search → attach to appointment fields.
- If auth is there but not linking: → Tier 2 (referral workflow config).

**Double-Booking on Shared Resource**
- Check resource template — shared resources (rooms, equipment) must have their own templates.
- If two providers sharing a room both booked simultaneously: → Tier 2 (resource conflict rules).

**Recall Reminders Not Generating**
- Recall must be documented at checkout. Train staff: Recall is entered in the Checkout activity, not automatically created.

---

## WELCOME — Kiosk Check-In

### Core Purpose
Welcome enables self-service patient check-in, demographic/insurance verification, consent capture, and copay collection via kiosk or tablet.

### Common Go-Live Issues & Fixes

**Kiosk Not Finding Patient Appointment**
- Verify the appointment is in "Arrived" status or is within the check-in window (configurable — typically 30 min before).
- Check kiosk is on correct facility/department.
- If appointment exists and window is correct but still not finding: → Tier 2 (kiosk configuration).

**Check-In Completing But Staff Not Seeing Update**
- Confirm staff are refreshing the arrival dashboard or have auto-refresh enabled.
- If update truly not posting: → Tier 2 (kiosk integration config).

**Copay Collection Not Processing**
- Verify payment gateway is configured and active.
- Card reader connected and paired to the kiosk?
- If gateway confirmed down: → Tier 3 (vendor issue). Workaround: collect at front desk.

---

## ESCALATION QUICK-REFERENCE (Patient Access)

| Scenario | Tier | Urgency |
|---|---|---|
| MPI overlay (patients merged) | 2 | Safety — IMMEDIATE |
| Real-time eligibility interface down | 2/3 | Operations |
| Bed board not updating | 2 | Operations |
| Provider template missing for department | 2 | Operations |
| Kiosk payment gateway down | 3 | Revenue |
| Duplicate records (no overlay yet) | 2 | Operations |
