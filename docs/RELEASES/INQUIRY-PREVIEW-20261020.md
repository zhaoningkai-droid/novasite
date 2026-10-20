# Published preview inquiry routing fix — 2026-10-20

A published customer website could be viewed at the admin host `/s/<company>/<locale>`, but its form POST was rejected with HTTP 404 because only the customer host was accepted. This caused a real submission failure on the preview URL even though independent customer-domain submissions worked.

The inquiry endpoint now recognizes a published site's preview URL when Origin, Referer, source URL, site slug, supported locale, and customer page path agree. It still resolves the tenant and published state from the database. Unknown hosts, mismatched companies and unrelated admin pages remain rejected; public inquiry validation, persistence, deduplication and rate checks remain in place. This does not permit unpublished companies to receive public preview inquiries.

Removed optional-phone labels from the live executive homepage in every language. Restored the customer's configured phone requirement on both client and server; no template-specific forced override remains. Demo template source and stylesheet are unchanged.

Validation: the exact admin-host preview failure was reproduced as HTTP 404. Twenty focused integration cases pass, covering the recognized preview source, mismatch rejection, published-only lookup, correct tenant attribution, independent customer hosts, field layout and customer-controlled phone requirements. Targeted TypeScript and ESLint checks pass. No database migration or existing customer-content update is required.
