/**
 * WS-8 — in-app legal documents (DRAFT — LEGAL REVIEW REQUIRED).
 *
 * This module is the single source for the version identifiers and the
 * readable text used by the legal screen and the join-flow consent links.
 * The longer-form drafts live in docs/LEGAL_PRIVACY_POLICY_DRAFT.md and
 * docs/LEGAL_TERMS_OF_SERVICE_DRAFT.md; both must stay in step when the
 * owner/legal adviser approves a version.
 *
 * Rules encoded here:
 *   * The text describes the app that actually exists (Supabase auth,
 *     membership/attendance/payment records, private receipts, audit log,
 *     local-only operational logging, camera only for QR scanning).
 *   * Owner identity, contact details, jurisdiction, age limits, retention
 *     periods and refund/cancellation rules are placeholders. Nothing is
 *     invented.
 *   * No compliance certification, encryption guarantee, backup guarantee
 *     or immediate-deletion promise is made.
 *   * A version bump is a new consent version. Never edit a published
 *     version in place without changing its identifier.
 */

export const LEGAL_DRAFT_LABEL = 'DRAFT — LEGAL REVIEW REQUIRED';

export const LEGAL_DOCUMENT_VERSION = '2026-11-20-draft.1';

export const LEGAL_PLACEHOLDERS = [
  '[GYM LEGAL NAME]',
  '[REGISTERED BUSINESS ADDRESS]',
  '[PRIVACY CONTACT EMAIL]',
  '[PHONE NUMBER]',
  '[GRIEVANCE / PRIVACY OFFICER NAME AND CONTACT]',
  '[GOVERNING LAW AND COURTS]',
  '[MINIMUM MEMBER AGE]',
  '[RETENTION PERIODS — OWNER/LEGAL TO APPROVE]',
  '[CANCELLATION AND REFUND RULES — OWNER/LEGAL TO APPROVE]',
  '[EFFECTIVE DATE]',
] as const;

export type LegalDocumentId = 'privacy' | 'terms';

export interface LegalSection {
  /** Stable anchor; also used by tests to assert required coverage. */
  id: string;
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface LegalDocument {
  id: LegalDocumentId;
  title: string;
  shortTitle: string;
  version: string;
  updated: string;
  draft: true;
  summary: string;
  sections: LegalSection[];
}

const PRIVACY_SECTIONS: LegalSection[] = [
  {
    id: 'introduction',
    heading: '1. Introduction',
    paragraphs: [
      'This Privacy Policy explains how [GYM LEGAL NAME] (“the gym”, “we”, “us”) handles personal information when you use the gym management mobile application (“the app”) and the gym services connected to it.',
      'The app is a membership-management tool. It is not a social network, an advertising service or a medical service. This draft describes the data the app actually collects and the actions the app can actually perform.',
    ],
  },
  {
    id: 'controller',
    heading: '2. Who operates the service',
    paragraphs: [
      'The data controller/operator is [GYM LEGAL NAME], [REGISTERED BUSINESS ADDRESS].',
      'Privacy contact: [PRIVACY CONTACT EMAIL] / [PHONE NUMBER]. Grievance or privacy officer: [GRIEVANCE / PRIVACY OFFICER NAME AND CONTACT].',
      'These details are placeholders. The gym owner must complete them before this policy is published.',
    ],
  },
  {
    id: 'information-collected',
    heading: '3. Information we collect',
    paragraphs: [
      'We collect the information needed to create and secure an account, operate a gym membership, record attendance, record and receipt payments, and meet the gym’s own accounting and audit needs.',
    ],
    bullets: [
      'Identity and contact data: name, mobile number and email address.',
      'Account data: authentication identifier, account role, account status, and security settings such as multi-factor authentication.',
      'Membership data: plan, locked price, membership dates, status, freezes and plan-change requests.',
      'Attendance data: check-in time and date, the member and membership it belongs to, and the attendance token event that authorised it.',
      'Payment and receipt data: amount, method, reference/UTR, status, discount, recording and verification actors, reversal records, receipt flag and receipt file.',
      'Staff data: staff name, role, phone, email, active/inactive status and last sign-in time.',
      'Audit and operational data: authority-action audit entries, and local diagnostic logs produced by the app.',
    ],
  },
  {
    id: 'information-you-provide',
    heading: '4. Information you provide',
    paragraphs: [
      'You provide your name, mobile number, email address and password when you join online. You choose a membership plan. You may provide a payment reference or UTR to reception staff, and you may provide information in a privacy request or correction request.',
      'You do not have to provide optional marketing consent to become a member. Mandatory account and membership information is required to create and operate the membership.',
    ],
  },
  {
    id: 'automatic-collection',
    heading: '5. Information collected automatically',
    paragraphs: [
      'The app creates local diagnostic log events (for example, a failed request or a receipt error). These logs are written to the device console in the current build and are not sent to a third-party analytics or advertising service by the app.',
      'Supabase, as the authentication, database and storage host, may process technical request metadata such as IP address, user agent and timestamps as part of operating and securing the service. The app’s own tables do not store IP addresses or device fingerprints.',
      'The app does not collect location, contacts, photos, microphone audio or advertising identifiers. Camera access is requested only when QR scanning is used.',
    ],
  },
  {
    id: 'membership-attendance',
    heading: '6. Membership and attendance information',
    paragraphs: [
      'Membership records show the plan you joined, the price locked at that time, the membership period, freeze history and current validity. Attendance records show when a check-in was accepted by the server.',
      'The app uses attendance history to show your visits, support the gym’s inactivity follow-up rule, and produce operational reports for the gym. Attendance is not sold or used for advertising.',
      'QR attendance works by displaying a short-lived token. The server stores a hash of the token, not the displayed code, and validates each scan server-side. The app does not use the camera to identify you or to record your surroundings.',
    ],
  },
  {
    id: 'payments-receipts',
    heading: '7. Payment and receipt information',
    paragraphs: [
      'The app records membership payments taken at the gym. It does not process card, bank or UPI payments itself. A UPI QR shown by the gym is a payment address; the app records the resulting payment details entered by staff.',
      'Payment records can include amount, method, reference/UTR, discount, who recorded it, who verified it, reversal entries and whether a receipt was issued. Receipt PDFs are stored in a private storage bucket and opened through short-lived signed links.',
      'Payment and receipt records may be kept for accounting, fraud-prevention, dispute and audit purposes even after a membership ends or an account-deletion request is reviewed.',
    ],
  },
  {
    id: 'authentication-security',
    heading: '8. Authentication and account security',
    paragraphs: [
      'Authentication is provided through Supabase Auth. The app uses one-time codes for phone and email verification, password sign-in, optional multi-factor authentication for staff, and secure on-device session storage.',
      'The app never stores your password in its own database tables, and it never stores one-time codes, authentication tokens or multi-factor secrets in consent records. Session tokens are kept on the device in Expo SecureStore where the platform supports it.',
      'Staff accounts are issued by the gym owner. Staff actions may require multi-factor authentication. Account roles are checked on the server, not trusted from the app screen.',
    ],
  },
  {
    id: 'purposes',
    heading: '9. Why we use information',
    bullets: [
      'Create and secure your account and verify your contact details.',
      'Operate your membership, plan, freeze and renewal records.',
      'Validate attendance and show your visit history.',
      'Record, verify, reverse and receipt payments, and produce the gym’s financial reports.',
      'Provide member support, respond to privacy requests and correct contact details.',
      'Protect the service, investigate fraud or misuse, and maintain an audit trail.',
      'Meet the gym’s own accounting, tax and legal obligations, as confirmed by the owner and legal adviser.',
      'Send optional marketing only if you separately choose to receive it.',
    ],
  },
  {
    id: 'access-sharing',
    heading: '10. Who can access your information',
    paragraphs: [
      'Access is role-based and enforced by database row-level security and server functions.',
    ],
    bullets: [
      'Members can read their own profile, membership, attendance, payments, receipts, consent records and privacy requests.',
      'Receptionists can read and update the member and payment records needed at the desk, including contact details, attendance and payment recording. They cannot read the audit log, consent records or privacy requests.',
      'The Owner can read the gym’s members, attendance, payments, receipts, staff directory, audit log, consent evidence and privacy requests.',
      'We do not sell personal information. We do not share it with advertisers or data brokers.',
    ],
  },
  {
    id: 'third-parties',
    heading: '11. Third-party services',
    paragraphs: [
      'The app relies on service providers that process data on the gym’s behalf:',
    ],
    bullets: [
      'Supabase — authentication, PostgreSQL database, file storage and hosting.',
      'Expo / EAS — building and distributing the application, and over-the-air updates where enabled.',
      'Email and SMS delivery used by Supabase Auth to send verification and security codes.',
      'The device operating system — camera permission, secure storage and app distribution.',
    ],
  },
  {
    id: 'supabase-hosting',
    heading: '12. Supabase infrastructure and hosting',
    paragraphs: [
      'The production data is intended to be held in a Supabase project selected by the gym owner. Supabase hosts the database, authentication service and private receipt storage. Data is transmitted over HTTPS. Supabase’s platform documentation describes encryption at rest; the gym owner must confirm the production project’s settings before publication.',
      'Backups, point-in-time recovery and restore procedures are operational settings of that project. They are not guaranteed by this draft. The gym owner is responsible for confirming and documenting them.',
      'The app does not hold a service-role key or any secret key. Public client credentials are used, and row-level security is the access boundary.',
    ],
  },
  {
    id: 'notifications',
    heading: '13. Notifications and messages',
    paragraphs: [
      'The current app uses verification codes for phone/email checks and account security. It does not send marketing push notifications or marketing email from the app build described here.',
      'Notification delivery contracts exist in the codebase, but no external push, SMS or email marketing provider is configured in this build. If the gym enables notifications later, this policy and the consent choices must be updated first.',
    ],
  },
  {
    id: 'retention',
    heading: '14. How long we keep information',
    paragraphs: [
      'Retention periods are not finalised in this draft. The gym owner and legal adviser must approve them before publication: [RETENTION PERIODS — OWNER/LEGAL TO APPROVE]. The internal framework labels every proposed period as PROPOSED and does not run automatic deletion jobs.',
      'In general, account and membership data is kept while the membership is active and for a reasonable period afterwards; attendance and audit records support the gym’s operational and audit history; payment, reversal and receipt records may be retained for accounting, fraud-prevention and legal purposes; consent records are kept as evidence of what was accepted and when.',
      'Where a legal or business obligation requires retention, the gym may retain the relevant records after an account-deletion request. The gym will explain what was retained when it responds to the request.',
    ],
  },
  {
    id: 'security',
    heading: '15. Data security',
    paragraphs: [
      'The app uses role-based access control, row-level security, server-side authority functions, append-only payment and audit records, private receipt storage and optional multi-factor authentication for staff. Session tokens are stored using the platform secure-storage facility where available.',
      'No system is completely secure. This draft does not claim a security certification or an absolute guarantee. The gym owner must keep the production project, staff accounts, devices and recovery settings under review.',
    ],
  },
  {
    id: 'rights',
    heading: '16. Your rights and requests',
    paragraphs: [
      'Subject to the law that applies to the gym, you may ask to access a copy of your information, correct inaccurate details, request deletion of your account, ask a privacy question, or withdraw optional marketing consent.',
      'The app provides a Privacy & data screen for members. You can open the Privacy Policy and Terms of Service, change marketing consent, and submit a privacy request. A request is reviewed by the Owner; it is not an instant automated action.',
      'The gym may need to verify your identity before acting on a request. The gym may refuse or limit a request where it must keep a record for a legal, accounting, fraud-prevention or audit obligation, and will explain the reason.',
    ],
  },
  {
    id: 'account-deletion',
    heading: '17. Account deletion',
    paragraphs: [
      'An account-deletion request is not the same as cancelling a gym membership. Cancelling a membership ends the service; deleting an account is a privacy request about the account and personal data.',
      'When a deletion request is reviewed, the gym may delete or anonymise the authentication profile and contact details that are no longer needed. The gym may retain membership, payment, reversal, receipt and audit records where needed for accounting, fraud-prevention, dispute resolution or legal obligations.',
      'The app does not promise immediate or complete deletion. The Owner records the decision in the request workflow. If you also want to cancel a membership, contact the gym separately using the contact details above.',
    ],
  },
  {
    id: 'correction',
    heading: '18. Correcting your information',
    paragraphs: [
      'If your name, phone number, email address or other account detail is wrong, submit a correction request in the app or contact the gym. Reception staff can correct member contact details through an authorised server function, and the change is auditable.',
      'Some historical records, such as a past payment or a past attendance event, may not be rewritten because they are part of the gym’s financial and audit history. The gym will explain an appropriate correction or annotation where that is the case.',
    ],
  },
  {
    id: 'breach',
    heading: '19. Data breach handling',
    paragraphs: [
      'The gym owner is responsible for maintaining an incident-response process. If the gym becomes aware of a personal-data breach, it should assess the incident, contain it, preserve evidence, and notify affected people and any required authority in accordance with the law and the advice of its legal adviser.',
      'This draft does not assert a specific notification timeframe or a certification that no breach can occur. Those points require owner and legal review.',
    ],
  },
  {
    id: 'minors',
    heading: '20. Children and minors',
    paragraphs: [
      'The service is intended for adults. The app does not currently include an age-verification step. The gym owner must confirm the minimum member age ([MINIMUM MEMBER AGE]) and whether guardian consent is required before this policy is published.',
      'The gym does not knowingly intend to collect personal information from children without the consent required by applicable law. If you believe a child’s information has been provided, contact the gym so it can be reviewed.',
    ],
  },
  {
    id: 'changes',
    heading: '21. Changes to this policy',
    paragraphs: [
      'This policy is versioned. When the gym changes it, the new version receives a new version identifier and is presented for acceptance where required. Earlier consent records are retained as evidence of the version that was accepted at the time.',
      'The version in this draft is a pre-publication draft and must not be treated as a final or legally approved policy.',
    ],
  },
  {
    id: 'contact',
    heading: '22. Contact',
    paragraphs: [
      'Questions, correction requests and privacy complaints: [PRIVACY CONTACT EMAIL] / [PHONE NUMBER].',
      'Postal address: [REGISTERED BUSINESS ADDRESS]. Grievance/privacy officer: [GRIEVANCE / PRIVACY OFFICER NAME AND CONTACT].',
      'Effective date: [EFFECTIVE DATE]. This draft is marked DRAFT — LEGAL REVIEW REQUIRED.',
    ],
  },
];

const TERMS_SECTIONS: LegalSection[] = [
  {
    id: 'acceptance',
    heading: '1. Acceptance of these terms',
    paragraphs: [
      'These Terms of Service govern your use of the gym management app and the gym services connected to it. By creating an account or using the app, you agree to these terms and acknowledge the Privacy Policy.',
      'If you do not agree, do not create an account or use the service. This draft must be reviewed and approved by the gym owner and legal adviser before publication.',
    ],
  },
  {
    id: 'registration',
    heading: '2. Account registration',
    paragraphs: [
      'Members register online by providing a name, mobile number, email address and password, choosing a plan, and completing the verification steps the app requires. Staff accounts are issued by the gym owner; staff cannot self-register.',
      'The gym may refuse, suspend or close an account where the information is false, the account is misused, or the gym is required to do so by law.',
    ],
  },
  {
    id: 'accurate-information',
    heading: '3. Accurate information',
    paragraphs: [
      'You must provide accurate and current information and keep your contact details up to date. Incorrect details can prevent verification, receipts, membership notices or privacy responses from reaching you.',
      'You may request a correction through the app or at the reception desk. The gym may ask for reasonable evidence before changing an account detail.',
    ],
  },
  {
    id: 'account-security',
    heading: '4. Account security',
    paragraphs: [
      'Keep your password, one-time codes and multi-factor device secure. Do not share your account or let another person use your session. Tell the gym promptly if you believe your account has been accessed without permission.',
      'The gym may require multi-factor authentication for staff accounts and may revoke staff access when a role ends.',
    ],
  },
  {
    id: 'member-responsibilities',
    heading: '5. Member responsibilities',
    bullets: [
      'Follow the gym’s rules, staff instructions and safety notices.',
      'Use only your own account and your own attendance token.',
      'Do not attempt to record a check-in for another person or tamper with the QR process.',
      'Provide accurate payment references and do not claim a payment that was not made.',
      'Tell the gym about a disputed payment or a wrong membership record promptly.',
    ],
  },
  {
    id: 'membership-validity',
    heading: '6. Membership and validity',
    paragraphs: [
      'A membership becomes active only after the gym verifies a full payment under its rules. The app can show a pending payment or a pending plan request; neither is a completed membership.',
      'The membership period, plan and price are recorded by the server. The gym’s current plan catalogue and prices are shown in the app or at the desk. A locked price applies to the membership period recorded for you; this draft does not invent prices or promise a future price.',
      'Freezes, renewals and plan changes are applied only through the gym’s authorised process and may be subject to owner approval.',
    ],
  },
  {
    id: 'attendance-rules',
    heading: '7. Attendance rules',
    paragraphs: [
      'Attendance is recorded when the server accepts a valid check-in. The app may show a pending or failed scan; a failed scan is not a recorded visit. Multiple check-ins on the same day may be allowed under the gym’s rules.',
      'The gym may use attendance history for operational reports and its inactivity follow-up process. Attendance records are not a medical record and do not prove fitness or readiness to exercise.',
    ],
  },
  {
    id: 'qr-rules',
    heading: '8. QR attendance rules',
    paragraphs: [
      'The attendance QR is short-lived and validated on the server. Do not copy, share, photograph or reuse a code to obtain entry for someone else. Replay protection and token expiry are enforced by the backend.',
      'The app requests camera permission only when scanning is needed. If you deny permission, the app explains the denial and offers the system-settings path where available. You can still use the rest of the app; a scan cannot be completed without camera access or an approved alternative at the desk.',
      'The payment UPI QR is separate from the attendance QR. A payment code does not prove attendance, and an attendance code does not prove payment.',
    ],
  },
  {
    id: 'freeze',
    heading: '9. Membership freeze process',
    paragraphs: [
      'A freeze is a request, not an automatic extension. It takes effect only when the gym approves it under its rules. The app records the request, the decision, the period and the actor.',
      'The gym may require a reason or supporting information. Freeze eligibility, minimum/maximum duration and any fee are owner-dependent and must be confirmed before publication; this draft does not invent them.',
    ],
  },
  {
    id: 'fees-payments',
    heading: '10. Fees and payments',
    paragraphs: [
      'Membership fees, plan prices, discounts, taxes and accepted payment methods are set by the gym and shown at the desk or in the app. This draft does not invent a price, a tax treatment or a payment method.',
      'The app records payments; it does not itself move money. A payment reference or UTR is a reference until the gym verifies it. A recorded but unverified payment is not a completed payment.',
      'The gym may correct a recording error through its authorised reversal process. Reversals are new records; the original record is not silently rewritten.',
    ],
  },
  {
    id: 'payment-recording',
    heading: '11. Payment recording and verification',
    paragraphs: [
      'Reception staff record payments and the gym verifies them. The server calculates membership periods and keeps an audit trail. A member cannot record, verify or reverse a payment.',
      'If you believe a payment was recorded incorrectly, contact the gym promptly. The gym will review the payment, receipt and audit records and explain the outcome.',
    ],
  },
  {
    id: 'receipts',
    heading: '12. Receipts',
    paragraphs: [
      'A receipt is issued by the gym for a verified payment. It is stored in a private bucket and opened through a short-lived signed link. A receipt is evidence of the gym’s record; it is not a tax certificate unless the gym says so.',
      'If a receipt is missing or wrong, contact the gym. The gym may reissue or correct it through its authorised process.',
    ],
  },
  {
    id: 'discounts',
    heading: '13. Discounts and authorization',
    paragraphs: [
      'Discounts are entered at the time a payment is recorded and are subject to the gym’s authorisation rules. A saved discount on a member profile is a suggestion, not an entitlement.',
      'Only authorised staff may apply a discount, approve a freeze or verify a payment. The app records the actor and the decision.',
    ],
  },
  {
    id: 'cancellation-refunds',
    heading: '14. Cancellation and refunds',
    paragraphs: [
      'Cancellation and refund rules are set by the gym and must be confirmed by the owner and legal adviser. This draft deliberately does not invent a notice period, a refund entitlement, a cooling-off period or a cancellation fee.',
      'Cancelling a membership is separate from requesting account deletion. A cancellation request ends the membership service under the gym’s rules; a deletion request concerns personal data and is reviewed separately in the app.',
      'Approved cancellation and refund rules will be inserted here at [CANCELLATION AND REFUND RULES — OWNER/LEGAL TO APPROVE] before publication.',
    ],
  },
  {
    id: 'prohibited-use',
    heading: '15. Prohibited use',
    bullets: [
      'Attempting to access another person’s account, records, receipts or consent evidence.',
      'Sharing attendance codes, forging a check-in or interfering with the QR process.',
      'Recording a false payment, falsifying a reference, or attempting to reverse a valid payment without authority.',
      'Probing, scraping, overloading or bypassing the app’s security controls.',
      'Using the app for harassment, unlawful discrimination or any unlawful purpose.',
      'Uploading malicious code or attempting to compromise the database, storage or authentication service.',
    ],
  },
  {
    id: 'fraud-abuse',
    heading: '16. Fraud and abuse',
    paragraphs: [
      'The gym may investigate suspected fraud, payment abuse, attendance manipulation or unauthorised access. It may suspend a membership or account while an investigation is under way and may preserve the relevant records.',
      'The gym may report suspected unlawful activity to the appropriate authority. This draft does not promise a particular investigation outcome or timeframe.',
    ],
  },
  {
    id: 'staff-owner',
    heading: '17. Staff and owner responsibilities',
    paragraphs: [
      'The Owner is responsible for the gym’s configuration, staff access, privacy requests, retention decisions and legal compliance. Reception staff act within the permissions the Owner grants and must not exceed them.',
      'Staff must not use member data for personal purposes, share credentials, or access records they do not need for their role. Staff access can be revoked by the Owner and is auditable.',
    ],
  },
  {
    id: 'availability',
    heading: '18. Service availability',
    paragraphs: [
      'The app depends on network connectivity, the device, the Expo runtime and the Supabase project. The gym does not promise uninterrupted availability. Maintenance, outages, verification delays or device problems may interrupt a scan, payment record or request.',
      'Where the app is unavailable, the gym may use its documented manual fallback at the desk. A later entry should be recorded accurately; the app does not invent a successful action while offline.',
    ],
  },
  {
    id: 'suspension-termination',
    heading: '19. Suspension or termination',
    paragraphs: [
      'The gym may suspend or terminate an account or membership for misuse, fraud, non-payment, a security risk, or a legal requirement. Where appropriate, the gym will explain the reason and any review path.',
      'Ending a membership does not automatically delete payment, receipt or audit records that the gym must retain. Account deletion is handled separately under the Privacy Policy.',
    ],
  },
  {
    id: 'liability',
    heading: '20. Limitation of liability',
    paragraphs: [
      'This section requires legal review. The gym owner and legal adviser must decide the wording that is valid in the applicable jurisdiction. This draft does not invent a liability cap, an exclusion or a guarantee.',
      'Nothing in these terms is intended to exclude liability that cannot lawfully be excluded. The final wording must be inserted at [GOVERNING LAW AND COURTS] and reviewed before publication.',
    ],
  },
  {
    id: 'disputes',
    heading: '21. Dispute resolution',
    paragraphs: [
      'The governing law, courts and any dispute-resolution process are owner/legal decisions and are placeholders in this draft: [GOVERNING LAW AND COURTS]. The gym should first be given a chance to review and resolve a concern through its contact details.',
      'This draft does not create a binding arbitration clause or waive any right that cannot lawfully be waived.',
    ],
  },
  {
    id: 'changes',
    heading: '22. Changes to these terms',
    paragraphs: [
      'These terms are versioned. A material change receives a new version identifier and is presented for acceptance where required. Earlier acceptance records are kept as evidence of the version accepted at the time.',
      'This version is a pre-publication draft and must not be described as legally approved.',
    ],
  },
  {
    id: 'contact',
    heading: '23. Contact',
    paragraphs: [
      'Gym: [GYM LEGAL NAME], [REGISTERED BUSINESS ADDRESS]. Email: [PRIVACY CONTACT EMAIL]. Phone: [PHONE NUMBER].',
      'Grievance/privacy officer: [GRIEVANCE / PRIVACY OFFICER NAME AND CONTACT]. Effective date: [EFFECTIVE DATE].',
    ],
  },
];

export const LEGAL_DOCUMENTS: Record<LegalDocumentId, LegalDocument> = {
  privacy: {
    id: 'privacy',
    title: 'Privacy Policy',
    shortTitle: 'Privacy Policy',
    version: LEGAL_DOCUMENT_VERSION,
    updated: '20 November 2026',
    draft: true,
    summary:
      'How the gym app collects, uses, stores and shares member, attendance, payment and account information — and how to make a privacy request.',
    sections: PRIVACY_SECTIONS,
  },
  terms: {
    id: 'terms',
    title: 'Terms of Service',
    shortTitle: 'Terms of Service',
    version: LEGAL_DOCUMENT_VERSION,
    updated: '20 November 2026',
    draft: true,
    summary:
      'The rules for using the gym app and membership services, including attendance, freezes, payments, receipts and account conduct.',
    sections: TERMS_SECTIONS,
  },
};

export const CONSENT_DOCUMENT_VERSIONS = {
  privacyPolicy: LEGAL_DOCUMENTS.privacy.version,
  termsOfService: LEGAL_DOCUMENTS.terms.version,
} as const;

/** Resolve a route parameter to a known document; unknown values return null. */
export function getLegalDocument(id: string | undefined | null): LegalDocument | null {
  if (id === 'privacy') return LEGAL_DOCUMENTS.privacy;
  if (id === 'terms') return LEGAL_DOCUMENTS.terms;
  return null;
}
