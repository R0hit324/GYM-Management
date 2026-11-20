# Privacy Policy — DRAFT

**Status:** DRAFT — LEGAL REVIEW REQUIRED  
**Version:** 2026-11-20-draft.1  
**Last updated:** 20 November 2026  
**Effective date:** [EFFECTIVE DATE]  
**Applies to:** the Pulse Gym management mobile application and the gym services connected to it

> This is a product-specific draft based on the features that actually exist in the application. It is not legal advice and it is not approved for publication. The gym owner must complete every placeholder in [SQUARE BRACKETS] and a qualified legal adviser must review the text before it is published or relied upon. No compliance certification, encryption guarantee, backup guarantee or immediate-deletion promise is made.

The in-app reader uses the same version identifier and a condensed form of this text from `src/constants/legal.ts`. Update both together, and bump the version identifier whenever the accepted text changes.

---

## 1. Introduction

This Privacy Policy explains how **[GYM LEGAL NAME]** (“the gym”, “we”, “us”) handles personal information when you use the gym management mobile application (“the app”) and the gym services connected to it.

The app is a membership-management tool. It is not a social network, an advertising service or a medical service. This draft describes the data the app actually collects and the actions the app can actually perform.

## 2. Data controller/operator identity

The data controller/operator is **[GYM LEGAL NAME]**, **[REGISTERED BUSINESS ADDRESS]**.

Privacy contact: **[PRIVACY CONTACT EMAIL]** / **[PHONE NUMBER]**.  
Grievance or privacy officer: **[GRIEVANCE / PRIVACY OFFICER NAME AND CONTACT]**.

These details are placeholders. The gym owner must complete them before this policy is published.

## 3. Information we collect

We collect the information needed to create and secure an account, operate a gym membership, record attendance, record and receipt payments, and meet the gym’s own accounting and audit needs.

| Category | Examples of fields | Why it is needed |
|---|---|---|
| Identity and contact | Name, mobile number, email address | Account creation, verification, contact, receipts, privacy responses |
| Account and authentication | Auth user identifier, role, active status, MFA status, session metadata | Sign-in, role authorisation, account security |
| Membership | Plan, locked price, membership dates, status, freezes, plan-change requests | Operate and display the membership |
| Attendance | Check-in time/date, member and membership link, token event | Validate entry, show visit history, inactivity follow-up |
| Payments and receipts | Amount, method, reference/UTR, discount, status, recorder/verifier, reversal rows, receipt flag and PDF | Record money, verify payments, issue receipts, reports, audit |
| Staff | Staff name, role, phone, email, active status, last sign-in | Staff directory and access administration |
| Audit and operational | Audit action rows, local diagnostic log events | Security, fraud prevention, accountability, troubleshooting |

We do not collect location, contacts, photos, microphone audio or advertising identifiers. We do not store IP addresses or device fingerprints in the app’s own tables.

## 4. Information users provide

You provide your name, mobile number, email address and password when you join online. You choose a membership plan. You may provide a payment reference or UTR to reception staff, and you may provide information in a privacy request or correction request.

You do not have to provide optional marketing consent to become a member. Mandatory account and membership information is required to create and operate the membership.

## 5. Information collected automatically

The app creates local diagnostic log events (for example, a failed request or a receipt error). These logs are written to the device console in the current build and are not sent to a third-party analytics or advertising service by the app.

Supabase, as the authentication, database and storage host, may process technical request metadata such as IP address, user agent and timestamps as part of operating and securing the service. The app’s own tables do not store IP addresses or device fingerprints.

Camera access is requested only when QR scanning is used. The app does not access the camera in the background.

## 6. Membership and attendance information

Membership records show the plan you joined, the price locked at that time, the membership period, freeze history and current validity. Attendance records show when a check-in was accepted by the server.

The app uses attendance history to show your visits, support the gym’s inactivity follow-up rule, and produce operational reports for the gym. Attendance is not sold or used for advertising.

QR attendance works by displaying a short-lived token. The server stores a hash of the token, not the displayed code, and validates each scan server-side. The app does not use the camera to identify you or to record your surroundings.

## 7. Payment and receipt information

The app records membership payments taken at the gym. It does not process card, bank or UPI payments itself. A UPI QR shown by the gym is a payment address; the app records the resulting payment details entered by staff.

Payment records can include amount, method, reference/UTR, discount, who recorded it, who verified it, reversal entries and whether a receipt was issued. Receipt PDFs are stored in a private storage bucket and opened through short-lived signed links.

Payment and receipt records may be kept for accounting, fraud-prevention, dispute and audit purposes even after a membership ends or an account-deletion request is reviewed.

## 8. Authentication and account security

Authentication is provided through Supabase Auth. The app uses one-time codes for phone and email verification, password sign-in, optional multi-factor authentication for staff, and secure on-device session storage.

The app never stores your password in its own database tables, and it never stores one-time codes, authentication tokens or multi-factor secrets in consent records. Session tokens are kept on the device in Expo SecureStore where the platform supports it.

Staff accounts are issued by the gym owner. Staff actions may require multi-factor authentication. Account roles are checked on the server, not trusted from the app screen.

## 9. Purpose of data processing

We use personal information to:

- create and secure your account and verify your contact details;
- operate your membership, plan, freeze and renewal records;
- validate attendance and show your visit history;
- record, verify, reverse and receipt payments, and produce the gym’s financial reports;
- provide member support, respond to privacy requests and correct contact details;
- protect the service, investigate fraud or misuse, and maintain an audit trail;
- meet the gym’s own accounting, tax and legal obligations, as confirmed by the owner and legal adviser;
- send optional marketing only if you separately choose to receive it.

This draft does not assert a particular legal basis for each purpose. The gym owner and legal adviser must confirm the applicable bases in the relevant jurisdiction.

## 10. Access and sharing

Access is role-based and enforced by database row-level security and server functions.

- **Members** can read their own profile, membership, attendance, payments, receipts, consent records and privacy requests.
- **Receptionists** can read and update the member and payment records needed at the desk, including contact details, attendance and payment recording. They cannot read the audit log, consent records or privacy requests.
- **The Owner** can read the gym’s members, attendance, payments, receipts, staff directory, audit log, consent evidence and privacy requests.
- We do not sell personal information. We do not share it with advertisers or data brokers.

The gym may share information with its service providers, professional advisers, auditors, or authorities where required by law, subject to appropriate confidentiality and legal review.

## 11. Third-party services

The app relies on service providers that process data on the gym’s behalf:

- **Supabase** — authentication, PostgreSQL database, file storage and hosting.
- **Expo / EAS** — building and distributing the application, and over-the-air updates where enabled.
- **Email and SMS delivery used by Supabase Auth** — verification and security codes.
- **The device operating system** — camera permission, secure storage and app distribution.

The gym owner must maintain a current subprocessor list and confirm the contractual terms (including any data-processing agreement) with each provider before publication.

## 12. Supabase infrastructure and hosting

The production data is intended to be held in a Supabase project selected by the gym owner. Supabase hosts the database, authentication service and private receipt storage. Data is transmitted over HTTPS. Supabase’s platform documentation describes encryption at rest; the gym owner must confirm the production project’s settings before publication.

Backups, point-in-time recovery and restore procedures are operational settings of that project. They are not guaranteed by this draft. The gym owner is responsible for confirming and documenting them.

The app does not hold a service-role key or any secret key. Public client credentials are used, and row-level security is the access boundary.

## 13. Notifications

The current app uses verification codes for phone/email checks and account security. It does not send marketing push notifications or marketing email from the app build described here.

Notification delivery contracts exist in the codebase, but no external push, SMS or email marketing provider is configured in this build. If the gym enables notifications later, this policy and the consent choices must be updated first.

## 14. Data retention

Retention periods are not finalised in this draft. The gym owner and legal adviser must approve them before publication: **[RETENTION PERIODS — OWNER/LEGAL TO APPROVE]**. The internal framework labels every proposed period as PROPOSED and does not run automatic deletion jobs.

In general:

- account and membership data is kept while the membership is active and for a reasonable period afterwards;
- attendance and audit records support the gym’s operational and audit history;
- payment, reversal and receipt records may be retained for accounting, fraud-prevention and legal purposes;
- consent records are kept as evidence of what was accepted and when;
- local diagnostic logs are not retained by a remote logging service because none is configured.

Where a legal or business obligation requires retention, the gym may retain the relevant records after an account-deletion request. The gym will explain what was retained when it responds to the request.

## 15. Data security

The app uses role-based access control, row-level security, server-side authority functions, append-only payment and audit records, private receipt storage and optional multi-factor authentication for staff. Session tokens are stored using the platform secure-storage facility where available.

No system is completely secure. This draft does not claim a security certification or an absolute guarantee. The gym owner must keep the production project, staff accounts, devices and recovery settings under review.

## 16. User rights and requests

Subject to the law that applies to the gym, you may ask to access a copy of your information, correct inaccurate details, request deletion of your account, ask a privacy question, or withdraw optional marketing consent.

The app provides a **Privacy & data** screen for members. You can open the Privacy Policy and Terms of Service, change marketing consent, and submit a privacy request. A request is reviewed by the Owner; it is not an instant automated action.

The gym may need to verify your identity before acting on a request. The gym may refuse or limit a request where it must keep a record for a legal, accounting, fraud-prevention or audit obligation, and will explain the reason.

## 17. Account deletion

An account-deletion request is not the same as cancelling a gym membership. Cancelling a membership ends the service; deleting an account is a privacy request about the account and personal data.

When a deletion request is reviewed, the gym may delete or anonymise the authentication profile and contact details that are no longer needed. The gym may retain membership, payment, reversal, receipt and audit records where needed for accounting, fraud-prevention, dispute resolution or legal obligations.

The app does not promise immediate or complete deletion. The Owner records the decision in the request workflow. If you also want to cancel a membership, contact the gym separately using the contact details above.

## 18. Data correction

If your name, phone number, email address or other account detail is wrong, submit a correction request in the app or contact the gym. Reception staff can correct member contact details through an authorised server function, and the change is auditable.

Some historical records, such as a past payment or a past attendance event, may not be rewritten because they are part of the gym’s financial and audit history. The gym will explain an appropriate correction or annotation where that is the case.

## 19. Data breach handling

The gym owner is responsible for maintaining an incident-response process. If the gym becomes aware of a personal-data breach, it should assess the incident, contain it, preserve evidence, and notify affected people and any required authority in accordance with the law and the advice of its legal adviser.

This draft does not assert a specific notification timeframe or a certification that no breach can occur. Those points require owner and legal review.

## 20. Children’s and minors’ privacy

The service is intended for adults. The app does not currently include an age-verification step. The gym owner must confirm the minimum member age (**[MINIMUM MEMBER AGE]**) and whether guardian consent is required before this policy is published.

The gym does not knowingly intend to collect personal information from children without the consent required by applicable law. If you believe a child’s information has been provided, contact the gym so it can be reviewed.

## 21. Changes to this policy

This policy is versioned. When the gym changes it, the new version receives a new version identifier and is presented for acceptance where required. Earlier consent records are retained as evidence of the version that was accepted at the time.

The version in this draft is a pre-publication draft and must not be treated as a final or legally approved policy.

## 22. Contact information

Questions, correction requests and privacy complaints: **[PRIVACY CONTACT EMAIL]** / **[PHONE NUMBER]**.

Postal address: **[REGISTERED BUSINESS ADDRESS]**.  
Grievance/privacy officer: **[GRIEVANCE / PRIVACY OFFICER NAME AND CONTACT]**.  
Effective date: **[EFFECTIVE DATE]**.

**DRAFT — LEGAL REVIEW REQUIRED.**
