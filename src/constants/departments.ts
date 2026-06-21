export interface Department {
  id: string;
  name: string;
  category: string;
}

export interface DepartmentGroup {
  category: string;
  departments: Department[];
}

export const DEPARTMENT_GROUPS: DepartmentGroup[] = [
  {
    category: 'Emergency & Critical Care',
    departments: [
      { id: 'ed', name: 'Emergency Department (ED/ER)', category: 'Emergency & Critical Care' },
      { id: 'icu', name: 'ICU / Critical Care', category: 'Emergency & Critical Care' },
      { id: 'ccu', name: 'Cardiac Care Unit (CCU)', category: 'Emergency & Critical Care' },
      { id: 'nicu', name: 'NICU', category: 'Emergency & Critical Care' },
      { id: 'picu', name: 'PICU', category: 'Emergency & Critical Care' },
      { id: 'trauma', name: 'Trauma Center', category: 'Emergency & Critical Care' },
    ],
  },
  {
    category: 'Inpatient Units',
    departments: [
      { id: 'medsurg', name: 'Medical / Surgical (Med/Surg)', category: 'Inpatient Units' },
      { id: 'telemetry', name: 'Telemetry', category: 'Inpatient Units' },
      { id: 'stepdown', name: 'Step-Down / Progressive Care', category: 'Inpatient Units' },
      { id: 'pediatrics', name: 'Pediatrics', category: 'Inpatient Units' },
      { id: 'ob', name: 'Labor & Delivery (L&D)', category: 'Inpatient Units' },
      { id: 'postpartum', name: 'Postpartum / Mother-Baby', category: 'Inpatient Units' },
      { id: 'psych', name: 'Behavioral Health / Psychiatry', category: 'Inpatient Units' },
      { id: 'rehab', name: 'Inpatient Rehabilitation', category: 'Inpatient Units' },
      { id: 'oncology_inpt', name: 'Oncology (Inpatient)', category: 'Inpatient Units' },
      { id: 'neuro_inpt', name: 'Neurology (Inpatient)', category: 'Inpatient Units' },
      { id: 'ortho_inpt', name: 'Orthopedics (Inpatient)', category: 'Inpatient Units' },
    ],
  },
  {
    category: 'Perioperative',
    departments: [
      { id: 'or', name: 'Operating Room (OR)', category: 'Perioperative' },
      { id: 'preop', name: 'Pre-Op / Surgical Prep', category: 'Perioperative' },
      { id: 'pacu', name: 'PACU (Post-Anesthesia Care)', category: 'Perioperative' },
      { id: 'endo', name: 'Endoscopy / GI Lab', category: 'Perioperative' },
      { id: 'ir', name: 'Interventional Radiology (IR)', category: 'Perioperative' },
      { id: 'cath_lab', name: 'Cath Lab / EP Lab', category: 'Perioperative' },
    ],
  },
  {
    category: 'Outpatient / Ambulatory',
    departments: [
      { id: 'primary_care', name: 'Primary Care / Family Medicine', category: 'Outpatient / Ambulatory' },
      { id: 'specialty_clinic', name: 'Specialty Clinic', category: 'Outpatient / Ambulatory' },
      { id: 'urgent_care', name: 'Urgent Care', category: 'Outpatient / Ambulatory' },
      { id: 'oncology_outpt', name: 'Oncology / Infusion Center', category: 'Outpatient / Ambulatory' },
      { id: 'cardiology', name: 'Cardiology', category: 'Outpatient / Ambulatory' },
      { id: 'orthopedics', name: 'Orthopedics', category: 'Outpatient / Ambulatory' },
      { id: 'neurology', name: 'Neurology', category: 'Outpatient / Ambulatory' },
      { id: 'women_health', name: "Women's Health / OB-GYN", category: 'Outpatient / Ambulatory' },
      { id: 'peds_clinic', name: 'Pediatric Clinic', category: 'Outpatient / Ambulatory' },
      { id: 'ophthalmology', name: 'Ophthalmology', category: 'Outpatient / Ambulatory' },
      { id: 'dental', name: 'Dental / Oral Surgery', category: 'Outpatient / Ambulatory' },
      { id: 'dermatology', name: 'Dermatology', category: 'Outpatient / Ambulatory' },
      { id: 'psych_outpt', name: 'Behavioral Health (Outpatient)', category: 'Outpatient / Ambulatory' },
      { id: 'wound_care', name: 'Wound Care', category: 'Outpatient / Ambulatory' },
      { id: 'dialysis', name: 'Dialysis / Nephrology', category: 'Outpatient / Ambulatory' },
    ],
  },
  {
    category: 'Ancillary & Diagnostics',
    departments: [
      { id: 'lab', name: 'Laboratory / Pathology', category: 'Ancillary & Diagnostics' },
      { id: 'radiology', name: 'Radiology / Imaging', category: 'Ancillary & Diagnostics' },
      { id: 'pharmacy', name: 'Pharmacy', category: 'Ancillary & Diagnostics' },
      { id: 'blood_bank', name: 'Blood Bank / Transfusion', category: 'Ancillary & Diagnostics' },
      { id: 'respiratory', name: 'Respiratory Therapy', category: 'Ancillary & Diagnostics' },
      { id: 'pt', name: 'Physical Therapy', category: 'Ancillary & Diagnostics' },
      { id: 'ot', name: 'Occupational Therapy', category: 'Ancillary & Diagnostics' },
      { id: 'speech', name: 'Speech-Language Pathology', category: 'Ancillary & Diagnostics' },
      { id: 'dietary', name: 'Dietary / Nutrition', category: 'Ancillary & Diagnostics' },
      { id: 'social_work', name: 'Social Work / Case Management', category: 'Ancillary & Diagnostics' },
    ],
  },
  {
    category: 'Administrative & Revenue Cycle',
    departments: [
      { id: 'registration', name: 'Registration / Admitting', category: 'Administrative & Revenue Cycle' },
      { id: 'scheduling', name: 'Scheduling / Access Center', category: 'Administrative & Revenue Cycle' },
      { id: 'billing', name: 'Billing & Coding', category: 'Administrative & Revenue Cycle' },
      { id: 'him', name: 'Health Information Management (HIM)', category: 'Administrative & Revenue Cycle' },
      { id: 'utilization', name: 'Utilization Management', category: 'Administrative & Revenue Cycle' },
      { id: 'patient_financial', name: 'Patient Financial Services', category: 'Administrative & Revenue Cycle' },
      { id: 'prior_auth', name: 'Prior Authorization', category: 'Administrative & Revenue Cycle' },
    ],
  },
  {
    category: 'Support & Operations',
    departments: [
      { id: 'sterile_processing', name: 'Sterile Processing (SPD)', category: 'Support & Operations' },
      { id: 'bed_management', name: 'Bed Management / Capacity', category: 'Support & Operations' },
      { id: 'infection_control', name: 'Infection Control', category: 'Support & Operations' },
      { id: 'quality', name: 'Quality / Patient Safety', category: 'Support & Operations' },
      { id: 'risk_mgmt', name: 'Risk Management / Compliance', category: 'Support & Operations' },
      { id: 'it_support', name: 'IT / Help Desk', category: 'Support & Operations' },
    ],
  },
];

export const ALL_DEPARTMENTS: Department[] = DEPARTMENT_GROUPS.flatMap((g) => g.departments);

export function getDepartmentById(id: string): Department | undefined {
  return ALL_DEPARTMENTS.find((d) => d.id === id);
}
