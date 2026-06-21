# Epic Interop & Data — Go-Live Knowledge Base

## Modules: Bridges (Interfaces), Care Everywhere, EpicCare Link, Clarity/Caboodle/Cogito, Reporting Workbench, Identity (MPI)

---

## BRIDGES — INTERFACES

### Core Purpose
Bridges is Epic's integration engine. Manages HL7 messages, FHIR APIs, and all inbound/outbound interfaces with external systems (lab, pharmacy, ADT feeds, billing systems, device integrations).

### CRITICAL: Interface Down = Escalate Fast
Interface failures cascade quickly across departments. A lab interface down affects every ordered test. An ADT feed down breaks downstream billing and external systems. These are never Tier 1 fixes.

### Common Go-Live Issues & Fixes

**HL7 Message Not Sending/Receiving**
- If orders aren't going to reference labs, or ADT messages aren't reaching external systems: This is an interface issue.
- → Tier 2/3 immediately. The interface team needs to check the queue in Bridges.

**Interface Queue Backing Up**
- Backed-up queues mean messages are generated but not processed. Usually indicates receiving system is down or rejecting.
- → Tier 2/3. Interface analyst must investigate the queue.

**Test vs. Production Environment**
- Go-Live day 1 risk: interfaces may still be pointed at test/UAT environments.
- If messages are going out but not being received as expected: Confirm with Tier 2 that all interfaces were flipped to production.

---

## CARE EVERYWHERE

### Core Purpose
Care Everywhere enables exchange of clinical documents with external Epic and non-Epic organizations via CommonWell, Carequality, and Epic's own Care Everywhere network.

### Common Go-Live Issues & Fixes

**Outside Records Query Returning No Results**
- Patient must have a matching record at the queried organization.
- Check: Is Care Everywhere enabled for this patient? Patient consent may be required per org policy.
- If query is consistently returning nothing: → Tier 2 (Care Everywhere configuration, network enrollment).

**Document Reconciliation Workflow**
- When outside records are retrieved, providers need to reconcile medications, allergies, and problems into the local chart.
- Walk providers through: Care Everywhere activity → select documents → reconcile items.
- This is almost always a training gap, not a system issue.

---

## CLARITY / CABOODLE / COGITO

### Core Purpose
Clarity: Epic's reporting database (SQL Server). Caboodle: Epic's data warehouse (EDW). Cogito: Epic's analytics platform (Radar dashboards, Reporting Workbench, SlicerDicer).

### Common Go-Live Issues & Fixes

**Reports Not Returning Expected Data Post-Go-Live**
- Go-Live day 1: data in reporting lags real-time by the ETL refresh schedule (often nightly).
- Teach analysts: Live Epic data ≠ Clarity data on day 1. Clarity reflects prior-day data until ETL runs.
- If the ETL job did not run: → Tier 2/3 (analytics team).

**Dashboard Metric Mismatch**
- Common: count in Radar dashboard doesn't match what provider sees in chart.
- Usually a time-window or population filter difference, not a system error.
- If the mismatch is clearly a data error: → Tier 2 (analytics).

---

## ESCALATION QUICK-REFERENCE (Interop & Data)

| Scenario | Tier | Urgency |
|---|---|---|
| Lab/pharmacy/ADT interface down | 2/3 | Safety + Operations — HIGH |
| Interfaces pointed at test env (production day) | 2/3 | Operations — IMMEDIATE |
| ETL job not running | 2/3 | Operations |
| Care Everywhere not enrolling | 2 | Operations |
