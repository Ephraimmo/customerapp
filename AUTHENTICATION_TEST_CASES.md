# Authentication Test Cases

## Scope

This document covers customer authentication workflows:

- Sign in
- Create account
- Sign out
- Session persistence and recovery
- Validation, error handling, accessibility, and security checks
- Demo-account regression checks

## Test Environment

- Application: Hearth customer app
- Supported browsers: latest Chrome, Edge, Firefox, and Safari
- Viewports: desktop, tablet, and mobile
- Network modes: online, offline, and slow/interrupted network
- Browser storage: enabled unless the test says otherwise

## Test Data

Use unique customer details for account-creation tests.

| Data | Value |
|---|---|
| Valid new name | `Test Customer` |
| Valid new email | A unique email such as `test-<timestamp>@example.com` |
| Valid phone | `+27 82 555 0100` |
| Valid password | `SecurePass123!` |
| Invalid email | `not-an-email` |
| Wrong password | `WrongPass123!` |
| Seeded demo email 1 | `demo@hearth.app` |
| Seeded demo email 2 | `thabo@hearth.app` |
| Seeded demo password | `hearth123` |

Demo credentials are test data only. They must not be displayed as one-tap login controls in the customer UI.

## Execution Rules

Record the result for each case as `Passed`, `Failed`, or `Blocked`. For failures, capture the browser, viewport, account email, timestamp, screenshot, and console/network error where applicable. Never record a real user password.

## Sign-In Test Cases

| ID | Test case | Preconditions | Steps | Expected result |
|---|---|---|---|---|
| SI-001 | Open sign-in page | User is signed out | Navigate to `/login` | Sign-in form is shown with email, password, and Sign in controls. Create Account option is available. |
| SI-002 | Sign in with valid customer account | A valid account exists | Enter valid email and password; submit | User is authenticated, success notification appears, and user is redirected to the cart/customer destination. |
| SI-003 | Sign in with email containing leading/trailing spaces | Valid account exists | Enter the valid email with spaces around it; enter the correct password; submit | Email is trimmed and login succeeds. |
| SI-004 | Sign in with different email casing | Valid account exists | Enter the valid email using different letter casing; enter the correct password; submit | Login succeeds because email matching is case-insensitive. |
| SI-005 | Sign in with wrong password | Valid account exists | Enter a valid email and wrong password; submit | Login fails, an actionable invalid-credentials message appears, and the user remains signed out. |
| SI-006 | Sign in with unknown email | No account exists for the email | Enter an unknown email and any password; submit | Login fails with an actionable invalid-credentials message. |
| SI-007 | Sign in with both fields empty | User is signed out | Submit the empty form | Browser validation prevents submission and identifies required fields. |
| SI-008 | Sign in with empty email | User is signed out | Enter a password only; submit | Submission is blocked and email is identified as required. |
| SI-009 | Sign in with empty password | User is signed out | Enter an email only; submit | Submission is blocked and password is identified as required. |
| SI-010 | Sign in with malformed email | User is signed out | Enter `not-an-email` and a password; submit | Browser validation prevents submission and identifies the email format problem. |
| SI-011 | Password is masked | Sign-in page is open | Type a password | Password characters are not displayed in plain text. |
| SI-012 | Password is not exposed in URL or storage | Sign-in page is open | Submit a sign-in attempt; inspect URL and browser storage | Password is absent from the URL, session object, and persisted user profile. |
| SI-013 | Prevent duplicate sign-in submission | Valid credentials are available | Rapidly click Sign in multiple times | At most one successful session/navigation is created and the UI remains stable. |
| SI-014 | Sign in while offline | User is signed out; network is disabled | Enter credentials and submit | The app fails gracefully with a usable error state; no false success is shown. |
| SI-015 | Recover from a failed sign-in | A failed attempt has occurred | Correct the email/password and submit again | The error clears and valid credentials authenticate successfully. |
| SI-016 | Sign-in form keyboard flow | Sign-in page is open | Navigate with Tab/Shift+Tab; press Enter to submit | Focus order is logical, visible, and the form can be submitted without a mouse. |

## Create Account Test Cases

| ID | Test case | Preconditions | Steps | Expected result |
|---|---|---|---|---|
| CA-001 | Open create-account form | User is signed out | Navigate to `/login`; choose Register/Create Account | Registration form is shown with name, email, optional phone, password, and submit controls. |
| CA-002 | Create account with valid required fields | Use a unique email | Enter valid name, email, and password; submit | Account is created, user is signed in, success notification appears, and user is redirected to the cart/customer destination. |
| CA-003 | Create account with optional phone | Use a unique email | Enter valid name, email, password, and phone; submit | Account is created and the supplied phone is stored with the customer profile. |
| CA-004 | Create account without phone | Use a unique email | Enter valid name, email, and password; leave phone empty; submit | Account is created and the documented default phone behavior is applied. |
| CA-005 | Create account with blank required fields | User is signed out | Submit the empty registration form | Browser validation prevents submission and identifies required fields. |
| CA-006 | Create account with blank name | User is signed out | Enter email and password only; submit | Submission is blocked and name is identified as required. |
| CA-007 | Create account with blank email | User is signed out | Enter name and password only; submit | Submission is blocked and email is identified as required. |
| CA-008 | Create account with blank password | User is signed out | Enter name and email only; submit | Submission is blocked and password is identified as required. |
| CA-009 | Create account with malformed email | User is signed out | Enter a malformed email, valid name, and password; submit | Browser validation prevents submission and identifies the email format problem. |
| CA-010 | Create account with whitespace around values | User is signed out | Add leading/trailing spaces to name and email; submit | Name and email are trimmed before the account is stored. |
| CA-011 | Create account with different email casing | Use a unique email | Create an account with mixed-case email; sign out; sign in using another case | Account can be signed in using case-insensitive email matching. |
| CA-012 | Create account using an existing email | Seeded or previously created account exists | Enter an existing email with new account details; submit | The result matches the product rule for existing emails and does not create ambiguous duplicate accounts. |
| CA-013 | Create account with a weak password | User is signed out | Enter a short or weak password; submit | The app follows the defined password policy; weak passwords are rejected if policy enforcement is required. |
| CA-014 | Create account with duplicate submission | Registration form is valid | Rapidly click Create Account multiple times | Only one account is created and only one authenticated session is established. |
| CA-015 | Customer profile is mirrored | Firebase is available | Create a valid account; inspect the customer record in Firebase | A customer profile is written under the expected customer UID without the password. |
| CA-016 | Firebase profile failure does not expose secrets | Firebase write is unavailable | Create a valid account while the profile write fails | Authentication completes or fails according to the product rule, an actionable warning/error is recorded, and the password is never sent to the profile record. |
| CA-017 | Registration keyboard flow | Registration form is open | Use keyboard navigation and press Enter to submit | Focus order is logical, visible, and the form is usable without a mouse. |

## Sign-Out Test Cases

| ID | Test case | Preconditions | Steps | Expected result |
|---|---|---|---|---|
| SO-001 | Sign out from account page | User is signed in | Navigate to the account/login area; click Sign out | User becomes signed out and a signed-out confirmation appears. |
| SO-002 | Sign out clears active session | User is signed in | Click Sign out; refresh the page | User remains signed out after refresh. |
| SO-003 | Sign out removes persisted session | User is signed in | Click Sign out; inspect browser storage | The authentication session key is removed; no password is stored. |
| SO-004 | Signed-out user cannot access authenticated state | User has signed out | Navigate to cart/account/order actions requiring authentication | The app shows guest state or requests sign-in; private user data is not displayed. |
| SO-005 | Sign in again after sign-out | A valid account exists | Sign out; sign in again with valid credentials | A new authenticated session is created successfully. |
| SO-006 | Sign-out control is keyboard accessible | User is signed in | Tab to Sign out and press Enter/Space | Sign out executes once and focus/feedback remains usable. |
| SO-007 | Sign out during navigation | User is signed in | Start navigating, then sign out before the next page completes | The final state is signed out and protected content is not left accessible. |

## Session and State Test Cases

| ID | Test case | Preconditions | Steps | Expected result |
|---|---|---|---|---|
| SS-001 | Restore session after refresh | User is signed in | Refresh the page | The user remains signed in after hydration and their account name is shown. |
| SS-002 | Restore session after reopening browser | User is signed in | Close and reopen the browser; revisit the app | The session behavior matches the documented persistence policy. |
| SS-003 | Corrupt session recovery | Browser storage can be edited | Replace the session value with invalid JSON; reload | The app ignores the corrupt value and loads as signed out without crashing. |
| SS-004 | Empty account storage recovery | Browser storage can be edited | Remove or corrupt the account list; reload | The app loads safely and login behavior remains consistent with the seeded-account policy. |
| SS-005 | Multiple tabs sign-out behavior | User is signed in in two tabs | Sign out in one tab; refresh or interact in the other | Cross-tab behavior matches the documented synchronization policy; stale private content is not treated as authenticated. |
| SS-006 | Guest browsing after sign-out | User has signed out | Browse restaurants, search, and view public menu pages | Public browsing remains available without an authenticated session. |

## Demo-Credential Regression Test Cases

| ID | Test case | Preconditions | Steps | Expected result |
|---|---|---|---|---|
| DR-001 | Demo credentials are not visible in login UI | User is signed out | Open `/login` and any auth dialog | No demo-login panel, demo account name, or one-tap demo button is displayed. |
| DR-002 | Demo email is not used as a placeholder | User is signed out | Inspect the email input placeholder | Placeholder uses a generic customer example and does not expose a demo email. |
| DR-003 | Demo credentials are not present in customer-facing copy | User is signed out | Search visible login text and inspect rendered UI | Demo password, names, and one-tap login instructions are not visible. |
| DR-004 | Existing seeded demo data does not create UI shortcuts | Demo accounts remain in local auth data | Open login and auth dialog | The accounts may remain available for controlled test setup, but no demo shortcut is rendered. |
| DR-005 | Normal credentials still work after demo UI removal | A normal account exists | Sign in with the normal account through the standard form | Normal sign-in works without relying on a demo button. |

## Accessibility and Security Checks

| ID | Test case | Steps | Expected result |
|---|---|---|---|
| AS-001 | Labels are associated with inputs | Inspect the sign-in and registration forms | Every input has a usable label or accessible name. |
| AS-002 | Error messages are understandable | Trigger each validation and credential error | Errors identify the problem in plain language and are not misleading. |
| AS-003 | Error text is announced | Use a screen reader and trigger an error | The error is announced or otherwise programmatically associated with the relevant form. |
| AS-004 | No password logging | Sign in and create an account while monitoring console/network logs | Password values do not appear in console logs, URLs, analytics payloads, or profile records. |
| AS-005 | Authenticated page protection | Sign out, then directly open a protected route | The app does not reveal private account data to the signed-out user. |
| AS-006 | Responsive authentication UI | Run sign-in, registration, and sign-out at mobile and desktop widths | Controls fit within the viewport, remain readable, and do not overlap. |
| AS-007 | Browser back after sign-out | Sign in, visit a private page, sign out, then press Back | Private content is not usable after sign-out; the app revalidates authentication. |

## Suggested Smoke Suite

Run these cases for every authentication-related deployment:

1. `SI-001` Open sign-in page
2. `SI-002` Valid sign-in
3. `SI-005` Wrong password
4. `CA-001` Open create-account form
5. `CA-002` Valid account creation
6. `SO-001` Sign out
7. `SO-002` Refresh after sign-out
8. `SS-001` Refresh while signed in
9. `DR-001` Demo controls are absent
10. `AS-006` Responsive authentication UI

## Exit Criteria

Authentication testing is complete when:

- All smoke-suite cases pass.
- No Critical or High authentication defects remain open.
- Invalid credentials never create a session.
- Sign-out removes the persisted session.
- Passwords are never exposed in UI, URLs, logs, or customer profile records.
- Demo credentials are not exposed as customer-facing login shortcuts.
