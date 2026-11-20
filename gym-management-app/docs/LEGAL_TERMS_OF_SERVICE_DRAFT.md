# Terms of Service — DRAFT

**Status:** DRAFT — LEGAL REVIEW REQUIRED  
**Version:** 2026-11-20-draft.1  
**Last updated:** 20 November 2026  
**Effective date:** [EFFECTIVE DATE]  
**Applies to:** the Pulse Gym management mobile application and the gym services connected to it

> This is a product-specific draft based on the features that actually exist in the application. It is not legal advice and it is not approved for publication. The gym owner must complete every placeholder in [SQUARE BRACKETS] and a qualified legal adviser must review the text before it is published or relied upon. Pricing, refund rules, cancellation periods, jurisdiction and liability wording are deliberately not invented here.

The in-app reader uses the same version identifier and a condensed form of this text from `src/constants/legal.ts`. Update both together, and bump the version identifier whenever the accepted text changes.

---

## 1. Acceptance of terms

These Terms of Service govern your use of the gym management app and the gym services connected to it. By creating an account or using the app, you agree to these terms and acknowledge the Privacy Policy.

If you do not agree, do not create an account or use the service. This draft must be reviewed and approved by the gym owner and legal adviser before publication.

## 2. Account registration

Members register online by providing a name, mobile number, email address and password, choosing a plan, and completing the verification steps the app requires. Staff accounts are issued by the gym owner; staff cannot self-register.

The gym may refuse, suspend or close an account where the information is false, the account is misused, or the gym is required to do so by law.

## 3. Accurate user information

You must provide accurate and current information and keep your contact details up to date. Incorrect details can prevent verification, receipts, membership notices or privacy responses from reaching you.

You may request a correction through the app or at the reception desk. The gym may ask for reasonable evidence before changing an account detail.

## 4. Account security

Keep your password, one-time codes and multi-factor device secure. Do not share your account or let another person use your session. Tell the gym promptly if you believe your account has been accessed without permission.

The gym may require multi-factor authentication for staff accounts and may revoke staff access when a role ends.

## 5. Member responsibilities

You agree to:

- follow the gym’s rules, staff instructions and safety notices;
- use only your own account and your own attendance token;
- not attempt to record a check-in for another person or tamper with the QR process;
- provide accurate payment references and not claim a payment that was not made;
- tell the gym about a disputed payment or a wrong membership record promptly.

## 6. Gym membership and validity

A membership becomes active only after the gym verifies a full payment under its rules. The app can show a pending payment or a pending plan request; neither is a completed membership.

The membership period, plan and price are recorded by the server. The gym’s current plan catalogue and prices are shown in the app or at the desk. A locked price applies to the membership period recorded for you; this draft does not invent prices or promise a future price.

Freezes, renewals and plan changes are applied only through the gym’s authorised process and may be subject to owner approval. Membership eligibility, minimum age and any joining requirements are set by the gym and must be confirmed at **[MINIMUM MEMBER AGE]** and the gym’s membership rules.

## 7. Attendance rules

Attendance is recorded when the server accepts a valid check-in. The app may show a pending or failed scan; a failed scan is not a recorded visit. Multiple check-ins on the same day may be allowed under the gym’s rules.

The gym may use attendance history for operational reports and its inactivity follow-up process. Attendance records are not a medical record and do not prove fitness or readiness to exercise.

## 8. QR attendance rules

The attendance QR is short-lived and validated on the server. Do not copy, share, photograph or reuse a code to obtain entry for someone else. Replay protection and token expiry are enforced by the backend.

The app requests camera permission only when scanning is needed. If you deny permission, the app explains the denial and offers the system-settings path where available. You can still use the rest of the app; a scan cannot be completed without camera access or an approved alternative at the desk.

The payment UPI QR is separate from the attendance QR. A payment code does not prove attendance, and an attendance code does not prove payment.

## 9. Membership freeze process

A freeze is a request, not an automatic extension. It takes effect only when the gym approves it under its rules. The app records the request, the decision, the period and the actor.

The gym may require a reason or supporting information. Freeze eligibility, minimum/maximum duration and any fee are owner-dependent and must be confirmed before publication; this draft does not invent them.

## 10. Fees and payments

Membership fees, plan prices, discounts, taxes and accepted payment methods are set by the gym and shown at the desk or in the app. This draft does not invent a price, a tax treatment or a payment method.

The app records payments; it does not itself move money. A payment reference or UTR is a reference until the gym verifies it. A recorded but unverified payment is not a completed payment.

The gym may correct a recording error through its authorised reversal process. Reversals are new records; the original record is not silently rewritten.

## 11. Payment recording

Reception staff record payments and the gym verifies them. The server calculates membership periods and keeps an audit trail. A member cannot record, verify or reverse a payment.

If you believe a payment was recorded incorrectly, contact the gym promptly. The gym will review the payment, receipt and audit records and explain the outcome.

## 12. Receipts

A receipt is issued by the gym for a verified payment. It is stored in a private bucket and opened through a short-lived signed link. A receipt is evidence of the gym’s record; it is not a tax certificate unless the gym says so.

If a receipt is missing or wrong, contact the gym. The gym may reissue or correct it through its authorised process.

## 13. Discounts and authorization

Discounts are entered at the time a payment is recorded and are subject to the gym’s authorisation rules. A saved discount on a member profile is a suggestion, not an entitlement.

Only authorised staff may apply a discount, approve a freeze or verify a payment. The app records the actor and the decision.

## 14. Cancellation and refund policies — owner review required

Cancellation and refund rules are set by the gym and must be confirmed by the owner and legal adviser. This draft deliberately does not invent a notice period, a refund entitlement, a cooling-off period or a cancellation fee.

Cancelling a membership is separate from requesting account deletion. A cancellation request ends the membership service under the gym’s rules; a deletion request concerns personal data and is reviewed separately in the app.

Approved cancellation and refund rules will be inserted here at **[CANCELLATION AND REFUND RULES — OWNER/LEGAL TO APPROVE]** before publication.

## 15. Prohibited use

You must not:

- attempt to access another person’s account, records, receipts or consent evidence;
- share attendance codes, forge a check-in or interfere with the QR process;
- record a false payment, falsify a reference, or attempt to reverse a valid payment without authority;
- probe, scrape, overload or bypass the app’s security controls;
- use the app for harassment, unlawful discrimination or any unlawful purpose;
- upload malicious code or attempt to compromise the database, storage or authentication service.

## 16. Fraud and abuse

The gym may investigate suspected fraud, payment abuse, attendance manipulation or unauthorised access. It may suspend a membership or account while an investigation is under way and may preserve the relevant records.

The gym may report suspected unlawful activity to the appropriate authority. This draft does not promise a particular investigation outcome or timeframe.

## 17. Staff and owner responsibilities

The Owner is responsible for the gym’s configuration, staff access, privacy requests, retention decisions and legal compliance. Reception staff act within the permissions the Owner grants and must not exceed them.

Staff must not use member data for personal purposes, share credentials, or access records they do not need for their role. Staff access can be revoked by the Owner and is auditable.

## 18. Service availability

The app depends on network connectivity, the device, the Expo runtime and the Supabase project. The gym does not promise uninterrupted availability. Maintenance, outages, verification delays or device problems may interrupt a scan, payment record or request.

Where the app is unavailable, the gym may use its documented manual fallback at the desk. A later entry should be recorded accurately; the app does not invent a successful action while offline.

## 19. Suspension or termination

The gym may suspend or terminate an account or membership for misuse, fraud, non-payment, a security risk, or a legal requirement. Where appropriate, the gym will explain the reason and any review path.

Ending a membership does not automatically delete payment, receipt or audit records that the gym must retain. Account deletion is handled separately under the Privacy Policy.

## 20. Limitation of liability — legal review required

This section requires legal review. The gym owner and legal adviser must decide the wording that is valid in the applicable jurisdiction. This draft does not invent a liability cap, an exclusion or a guarantee.

Nothing in these terms is intended to exclude liability that cannot lawfully be excluded. The final wording must be inserted at **[GOVERNING LAW AND COURTS]** and reviewed before publication.

## 21. Dispute resolution — owner/legal review required

The governing law, courts and any dispute-resolution process are owner/legal decisions and are placeholders in this draft: **[GOVERNING LAW AND COURTS]**. The gym should first be given a chance to review and resolve a concern through its contact details.

This draft does not create a binding arbitration clause or waive any right that cannot lawfully be waived.

## 22. Changes to terms

These terms are versioned. A material change receives a new version identifier and is presented for acceptance where required. Earlier acceptance records are kept as evidence of the version accepted at the time.

This version is a pre-publication draft and must not be described as legally approved.

## 23. Contact information

Gym: **[GYM LEGAL NAME]**, **[REGISTERED BUSINESS ADDRESS]**.  
Email: **[PRIVACY CONTACT EMAIL]**. Phone: **[PHONE NUMBER]**.  
Grievance/privacy officer: **[GRIEVANCE / PRIVACY OFFICER NAME AND CONTACT]**.  
Effective date: **[EFFECTIVE DATE]**.

**DRAFT — LEGAL REVIEW REQUIRED.**
