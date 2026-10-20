# Executive template live inquiry form fix — 2026-10-20

The live executive homepage previously rendered the generic RFQ form instead of the selected template layout. It now uses the existing white panel, name/email row, optional phone, project message, and blue submit button. Labels follow the active site language, and unrelated country/model/capacity fields are removed. A company field is retained only when explicitly required by that customer.

The demo template and its stylesheet are unchanged. Live forms retain the existing tenant-scoped inquiry endpoint, idempotent submission, honeypot, and success/error handling. Optional telephone validation is consistent across the executive homepage, contact form, quote dialog, and server. The server resolves the selected template from the tenant record rather than accepting a client-provided template identity. Other templates keep their existing required-field rules.

No database migration, customer content import, tenant configuration rewrite, or upload synchronization is required. This hotfix does not include the local enterprise knowledge base work.

Validation: 15 focused integration scenarios cover form layout/language, optional phone submission, required company compatibility, tenant attribution, other-template validation, homepage isolation, and demo route independence. The existing demo isolation assertion was updated to the already released neutral demo name; demo source was not changed. A real local browser submission without a phone was persisted to the intended test tenant. Production deployment uses an isolated build from GitHub main plus only this hotfix.

Deployment verified: the fixed web image is healthy, the production homepage renders the template form with optional phone, and the admin login returns HTTP 200. Counts and full row-content digests of all 113 audited business tables are identical before and after deployment. No production test inquiry, database migration, or customer-data import was performed. Database, worker, media, and existing Caddy resource settings remain unchanged.
