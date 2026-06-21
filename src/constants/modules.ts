export interface EpicModule {
  id: string;
  name: string;
  group: string;
  primaryRoles: string[];
  commonGoLiveIssues: string[];
  escalationTriggers: string[];
  knowledgeFile: string;
}

export const EPIC_MODULE_GROUPS = [
  'Patient Access & Scheduling',
  'Clinical Core',
  'Perioperative & Specialty',
  'Ancillary',
  'Revenue Cycle',
  'Interop & Data',
  'Patient-Facing',
] as const;

export const EPIC_MODULES: EpicModule[] = [
  // ─── Patient Access & Scheduling ───
  {
    id: 'prelude',
    name: 'Prelude',
    group: 'Patient Access & Scheduling',
    primaryRoles: ['Registration Specialist', 'ADT Coordinator'],
    commonGoLiveIssues: [
      'Guarantor account not linking correctly',
      'Insurance eligibility check failing',
      'Duplicate MPI/overlay risk at registration',
      'Coverage priority order wrong',
      'Patient search returning wrong results',
    ],
    escalationTriggers: [
      'MPI overlay (two patients merged incorrectly) → Tier 2 immediate',
      'Insurance verification system-down → Tier 3',
      'ADT feed not sending → Tier 2/3',
    ],
    knowledgeFile: 'patient-access',
  },
  {
    id: 'grand-central',
    name: 'Grand Central',
    group: 'Patient Access & Scheduling',
    primaryRoles: ['ADT Coordinator', 'Bed Manager', 'House Supervisor'],
    commonGoLiveIssues: [
      'Bed requests not routing correctly',
      'Discharge disposition options missing',
      'Housekeeping tasks not generating',
      'Patient placement workflow confusion',
    ],
    escalationTriggers: [
      'Bed board not updating → Tier 2',
      'Discharge not triggering downstream tasks → Tier 2',
    ],
    knowledgeFile: 'patient-access',
  },
  {
    id: 'cadence',
    name: 'Cadence',
    group: 'Patient Access & Scheduling',
    primaryRoles: ['Scheduler', 'Front Desk', 'Access Center'],
    commonGoLiveIssues: [
      'Appointment type not showing available slots',
      'Provider template not loaded for the week',
      'Referral auth not attaching to appointment',
      'Double-booking occurring on shared resource',
      'Wait list not functioning as expected',
      'Recall reminders not generating',
    ],
    escalationTriggers: [
      'Template missing for entire department → Tier 2 (build)',
      'MyChart online scheduling broken → Tier 2',
    ],
    knowledgeFile: 'patient-access',
  },
  {
    id: 'welcome',
    name: 'Welcome (Kiosk)',
    group: 'Patient Access & Scheduling',
    primaryRoles: ['Front Desk', 'Patient'],
    commonGoLiveIssues: [
      'Kiosk not finding patient appointment',
      'Check-in completing but staff not seeing update',
      'Copay collection not processing',
      'Kiosk hardware connectivity issue',
    ],
    escalationTriggers: [
      'Payment gateway error → Tier 2/3',
      'Hardware failure → vendor',
    ],
    knowledgeFile: 'patient-access',
  },

  // ─── Clinical Core ───
  {
    id: 'epiccare-ambulatory',
    name: 'EpicCare Ambulatory',
    group: 'Clinical Core',
    primaryRoles: ['Physician', 'APP', 'MA', 'Clinical Staff'],
    commonGoLiveIssues: [
      'SmartText/SmartPhrase not finding results',
      'BestPractice Advisory firing inappropriately',
      'Order panel missing expected orders',
      'Referral workflow steps unclear',
      'In Basket routing wrong',
      'Result routing not going to correct provider',
      'Rooming workflow (MA) steps out of order',
    ],
    escalationTriggers: [
      'Orders not transmitting to pharmacy → Tier 2',
      'Results not routing → Tier 2',
      'Patient safety alert suppressed incorrectly → Tier 2 + safety flag',
    ],
    knowledgeFile: 'clinical-core',
  },
  {
    id: 'epiccare-inpatient',
    name: 'EpicCare Inpatient',
    group: 'Clinical Core',
    primaryRoles: ['Hospitalist', 'Nurse', 'Case Manager'],
    commonGoLiveIssues: [
      'Rounding list not showing assigned patients',
      'Discharge order not releasing patient',
      'Medication reconciliation workflow confusion',
      'Problem list not importing from outside records',
      'Nursing flowsheet row missing',
    ],
    escalationTriggers: [
      'Med rec blocking discharge → Tier 2',
      'Critical results not routing → Tier 2 + safety',
    ],
    knowledgeFile: 'clinical-core',
  },
  {
    id: 'asap',
    name: 'ASAP (Emergency)',
    group: 'Clinical Core',
    primaryRoles: ['ED Physician', 'ED Nurse', 'Registration'],
    commonGoLiveIssues: [
      'Tracking board not showing patient status',
      'Triage documentation pathway unclear',
      'Disposition not clearing patient from board',
      'LWBS/AMA documentation workflow',
      'Downtime procedure confusion',
    ],
    escalationTriggers: [
      'Tracking board down → Tier 3 (patient safety)',
      'Medication orders not transmitting → Tier 2 + safety',
    ],
    knowledgeFile: 'clinical-core',
  },
  {
    id: 'clindoc',
    name: 'ClinDoc',
    group: 'Clinical Core',
    primaryRoles: ['RN', 'CNA', 'Allied Health'],
    commonGoLiveIssues: [
      'Flowsheet row not available for selected patient class',
      'Pain reassessment reminder not triggering',
      'Fall risk/skin assessment pathway missing step',
      'MAR administration documentation confusion',
    ],
    escalationTriggers: [
      'MAR not reflecting medication from pharmacy → Tier 2',
      'Missing required flowsheet for regulatory compliance → Tier 2',
    ],
    knowledgeFile: 'clinical-core',
  },
  {
    id: 'haiku-canto-rover',
    name: 'Haiku / Canto / Rover',
    group: 'Clinical Core',
    primaryRoles: ['Physician', 'Nurse', 'Phlebotomist'],
    commonGoLiveIssues: [
      'Mobile app not connecting to network',
      'Barcode scan for specimen not working',
      'Rover collection workflow unclear',
      'Push notifications not reaching device',
    ],
    escalationTriggers: [
      'MDM/device enrollment issue → IT/Tier 3',
      'Specimen collection errors systemically → Tier 2',
    ],
    knowledgeFile: 'clinical-core',
  },

  // ─── Perioperative & Specialty ───
  {
    id: 'optime',
    name: 'OpTime',
    group: 'Perioperative & Specialty',
    primaryRoles: ['Surgeon', 'OR Nurse', 'Anesthesia', 'OR Scheduler'],
    commonGoLiveIssues: [
      'Case not appearing on OR schedule',
      'Preference card not loading for surgeon/procedure',
      'Charge capture not triggering at case close',
      'Implant documentation workflow unclear',
      'Block schedule not reflecting correctly',
    ],
    escalationTriggers: [
      'Case charges not capturing → Tier 2 (revenue)',
      'Anesthesia record not linking to case → Tier 2',
      'Surgeon preference card completely missing → Tier 2 (build)',
    ],
    knowledgeFile: 'periop-specialty',
  },
  {
    id: 'anesthesia',
    name: 'Anesthesia',
    group: 'Perioperative & Specialty',
    primaryRoles: ['Anesthesiologist', 'CRNA'],
    commonGoLiveIssues: [
      'Pre-op H&P not pulling into anesthesia record',
      'Vital sign import from monitor not working',
      'Post-op note routing incorrect',
    ],
    escalationTriggers: [
      'Anesthesia device integration down → Tier 3',
    ],
    knowledgeFile: 'periop-specialty',
  },
  {
    id: 'stork',
    name: 'Stork (OB)',
    group: 'Perioperative & Specialty',
    primaryRoles: ['OB Physician', 'L&D Nurse', 'Postpartum Nurse'],
    commonGoLiveIssues: [
      'Mother-baby linking not completing',
      'Newborn ADT not generating',
      'GBS/Group B strep order set not firing',
      'Fetal strip documentation pathway unclear',
      'Delivery summary not routing to PCP',
    ],
    escalationTriggers: [
      'Mother-baby link failure (safety) → Tier 2 immediately',
      'Newborn not appearing on nursery tracking → Tier 2 (safety)',
    ],
    knowledgeFile: 'periop-specialty',
  },
  {
    id: 'bones',
    name: 'Bones (Ortho)',
    group: 'Perioperative & Specialty',
    primaryRoles: ['Orthopedic Surgeon', 'Ortho Nurse'],
    commonGoLiveIssues: [
      'Joint injection documentation workflow',
      'Implant/hardware documentation for arthroplasty',
      'Outcome questionnaire (PROMIS) not routing to patient',
      'Post-op protocol order set unclear',
    ],
    escalationTriggers: [
      'Implant registry interface not sending → Tier 2/3',
    ],
    knowledgeFile: 'periop-specialty',
  },
  {
    id: 'beacon',
    name: 'Beacon (Oncology)',
    group: 'Perioperative & Specialty',
    primaryRoles: ['Oncologist', 'Oncology Nurse', 'Chemo Pharmacist'],
    commonGoLiveIssues: [
      'Treatment plan not loading correctly',
      'Chemotherapy protocol dose calculation question',
      'Cycle documentation pathway unclear',
      'Lab result thresholds not triggering hold',
    ],
    escalationTriggers: [
      'Chemotherapy dose safety alert suppressed → Tier 2 + safety immediately',
      'Treatment plan missing → Tier 2',
    ],
    knowledgeFile: 'periop-specialty',
  },
  {
    id: 'cupid',
    name: 'Cupid (Cardiology)',
    group: 'Perioperative & Specialty',
    primaryRoles: ['Cardiologist', 'Cardiology Nurse', 'Echo Tech'],
    commonGoLiveIssues: [
      'ECG device integration not reading into chart',
      'Cath lab case workflow unclear',
      'Cardiology-specific order sets missing',
    ],
    escalationTriggers: [
      'ECG/device integration down → Tier 3',
    ],
    knowledgeFile: 'periop-specialty',
  },
  {
    id: 'kaleidoscope',
    name: 'Kaleidoscope (Ophthalmology)',
    group: 'Perioperative & Specialty',
    primaryRoles: ['Ophthalmologist', 'Ophthalmic Tech'],
    commonGoLiveIssues: [
      'Device import for visual fields/OCT not working',
      'Refraction documentation workflow unclear',
      'Ophthalmic procedure charge capture',
    ],
    escalationTriggers: ['Device integration failure → Tier 3'],
    knowledgeFile: 'periop-specialty',
  },
  {
    id: 'wisdom',
    name: 'Wisdom (Dental)',
    group: 'Perioperative & Specialty',
    primaryRoles: ['Dentist', 'Dental Hygienist'],
    commonGoLiveIssues: [
      'Dental charting odontogram not rendering',
      'Procedure code/charge mapping unclear',
    ],
    escalationTriggers: ['Odontogram rendering failure → Tier 2'],
    knowledgeFile: 'periop-specialty',
  },

  // ─── Ancillary ───
  {
    id: 'beaker',
    name: 'Beaker (Lab)',
    group: 'Ancillary',
    primaryRoles: ['Lab Tech', 'Lab Manager', 'Pathologist'],
    commonGoLiveIssues: [
      'Specimen routing to wrong accession',
      'Result release not flowing to ordering provider',
      'Reference lab interface not sending order',
      'Critical value notification not triggering',
      'QC management workflow unclear',
    ],
    escalationTriggers: [
      'Critical value not routing (safety) → Tier 2 immediately',
      'Reference lab interface down → Tier 2/3',
    ],
    knowledgeFile: 'ancillary',
  },
  {
    id: 'radiant',
    name: 'Radiant (Radiology)',
    group: 'Ancillary',
    primaryRoles: ['Radiologist', 'Rad Tech', 'Rad Scheduler'],
    commonGoLiveIssues: [
      'Order not appearing in Radiant worklist',
      'PACS integration not linking images to report',
      'Transcription/dictation routing issue',
      'Protocol assignment workflow unclear',
    ],
    escalationTriggers: [
      'PACS integration down → Tier 3',
      'Stat imaging result not routing → Tier 2 (safety)',
    ],
    knowledgeFile: 'ancillary',
  },
  {
    id: 'willow',
    name: 'Willow (Pharmacy)',
    group: 'Ancillary',
    primaryRoles: ['Pharmacist', 'Pharmacy Tech'],
    commonGoLiveIssues: [
      'Order not appearing in Willow verification queue',
      'Drug-drug interaction alert not firing',
      'Dispensing cabinet interface mismatch',
      'Compounding workflow documentation unclear',
      'Controlled substance workflow (two-RN sign-off)',
    ],
    escalationTriggers: [
      'High-alert medication order not alerting → Tier 2 (safety)',
      'Dispensing cabinet feed down → Tier 3',
      'Orders not transmitting from clinical system → Tier 2',
    ],
    knowledgeFile: 'ancillary',
  },
  {
    id: 'bugsy',
    name: 'Bugsy (Infection Control)',
    group: 'Ancillary',
    primaryRoles: ['Infection Preventionist'],
    commonGoLiveIssues: [
      'Surveillance criteria not triggering alert',
      'Isolation order not flagging on tracking board',
    ],
    escalationTriggers: ['Surveillance failure → Tier 2 (safety)'],
    knowledgeFile: 'ancillary',
  },

  // ─── Revenue Cycle ───
  {
    id: 'resolute-hb',
    name: 'Resolute HB',
    group: 'Revenue Cycle',
    primaryRoles: ['Biller', 'Coder', 'HIM'],
    commonGoLiveIssues: [
      'Claim not generating after discharge',
      'Charge not attaching to correct account',
      'Denial workflow unclear',
      'COB (coordination of benefits) setup question',
    ],
    escalationTriggers: [
      'Claim generation stopped systemically → Tier 2 (revenue)',
    ],
    knowledgeFile: 'revenue-cycle',
  },
  {
    id: 'resolute-pb',
    name: 'Resolute PB',
    group: 'Revenue Cycle',
    primaryRoles: ['Biller', 'Coder'],
    commonGoLiveIssues: [
      'Professional fee charge not flowing from clinical encounter',
      'Provider NPI not attached to claim',
      'ERA/EOB posting workflow',
    ],
    escalationTriggers: ['Charges not flowing to PB → Tier 2 (revenue)'],
    knowledgeFile: 'revenue-cycle',
  },
  {
    id: 'tapestry',
    name: 'Tapestry (Managed Care)',
    group: 'Revenue Cycle',
    primaryRoles: ['Managed Care Analyst', 'Contracting'],
    commonGoLiveIssues: [
      'Contract not applying to claim correctly',
      'Capitation payment not posting',
      'Auth/referral requirement not triggering',
    ],
    escalationTriggers: ['Contract calculation error → Tier 2/3 (revenue)'],
    knowledgeFile: 'revenue-cycle',
  },

  // ─── Interop & Data ───
  {
    id: 'bridges',
    name: 'Bridges (Interfaces)',
    group: 'Interop & Data',
    primaryRoles: ['Interface Analyst', 'IT'],
    commonGoLiveIssues: [
      'HL7 message not sending/receiving',
      'Interface engine queue backing up',
      'Test message vs. production message routing',
    ],
    escalationTriggers: [
      'Interface down (lab, pharmacy, ADT feed) → Tier 2/3 immediately',
    ],
    knowledgeFile: 'interop-data',
  },
  {
    id: 'care-everywhere',
    name: 'Care Everywhere',
    group: 'Interop & Data',
    primaryRoles: ['Physician', 'Nurse'],
    commonGoLiveIssues: [
      'Outside records query returning no results',
      'Patient not consented for Care Everywhere',
      'Document reconciliation workflow unclear',
    ],
    escalationTriggers: ['Network connectivity → Tier 3'],
    knowledgeFile: 'interop-data',
  },
  {
    id: 'clarity-caboodle',
    name: 'Clarity / Caboodle / Cogito',
    group: 'Interop & Data',
    primaryRoles: ['Analyst', 'Data Architect'],
    commonGoLiveIssues: [
      'Report not returning expected data post-go-live',
      'ETL job not running on schedule',
      'Dashboard metric mismatch day-1',
    ],
    escalationTriggers: ['Data pipeline failure → Tier 2/3'],
    knowledgeFile: 'interop-data',
  },

  // ─── Patient-Facing ───
  {
    id: 'mychart',
    name: 'MyChart',
    group: 'Patient-Facing',
    primaryRoles: ['Patient', 'Front Desk', 'MyChart Support'],
    commonGoLiveIssues: [
      'Patient cannot activate MyChart account',
      'After Visit Summary not appearing in portal',
      'Messaging not routing to correct provider inbox',
      'Online scheduling not showing availability',
      'Proxy access setup questions',
    ],
    escalationTriggers: [
      'Activation code systemically failing → Tier 2',
      'Patient messages not routing → Tier 2',
    ],
    knowledgeFile: 'patient-facing',
  },
  {
    id: 'healthy-planet',
    name: 'Healthy Planet',
    group: 'Patient-Facing',
    primaryRoles: ['Care Manager', 'Population Health'],
    commonGoLiveIssues: [
      'Registry not populating patients meeting criteria',
      'Outreach campaign workflow unclear',
      'Care gap closing documentation',
    ],
    escalationTriggers: ['Registry criteria misconfigured → Tier 2 (build)'],
    knowledgeFile: 'patient-facing',
  },
  {
    id: 'cheers',
    name: 'Cheers (CRM)',
    group: 'Patient-Facing',
    primaryRoles: ['Marketing', 'Patient Relations'],
    commonGoLiveIssues: [
      'Campaign list not generating correctly',
      'Communication preference not saving',
    ],
    escalationTriggers: [],
    knowledgeFile: 'patient-facing',
  },
];

export const MODULE_GROUPS_WITH_MODULES = EPIC_MODULE_GROUPS.map((group) => ({
  group,
  modules: EPIC_MODULES.filter((m) => m.group === group),
}));

export function getModuleById(id: string): EpicModule | undefined {
  return EPIC_MODULES.find((m) => m.id === id);
}

export function getModulesByGroup(group: string): EpicModule[] {
  return EPIC_MODULES.filter((m) => m.group === group);
}
