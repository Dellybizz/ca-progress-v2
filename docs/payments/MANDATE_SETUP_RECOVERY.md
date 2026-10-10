# Legacy mandate setup recovery

An old monthly mandate with 1,200 cycles can display an end date a century away and fail UPI authorization with RECURRING_MANDATE_END_DATE_MAX_VALIDITY_BREACHED. New checkouts retain the existing one-year schedule (12 monthly charges or one annual charge).

Pending created/authenticated mandates whose saved cycle count and billing interval exceed one year cannot be resumed. The legacy preflight also checks the freshly fetched provider count before returning authorization details. Existing paid/active mandates are preserved.

Billing exposes **Close unpaid setup** for created, unpaid records with no paid-through term. This customer-initiated action checks fresh provider state, requires zero paid cycles, and reads invoices. It refuses authenticated/active setups, payment-linked or paid invoices, incomplete invoice inventories and provider errors. Closure must be confirmed by a second provider read before the action succeeds. A subsequent customer checkout creates a fresh finite mandate; no automatic replacement or provider mutation occurs during status reads or deployment.

Validation includes actual compiled worker setup closure, refusal of active/authenticated/payment evidence, and durable checkout recovery blocking a 1,200-cycle legacy mandate without replacement creation. Real bank authorization and renewal certification remain separate from automated release checks.

## Cancelled-attempt retry cleanup

A customer-confirmed unpaid closure now saves the terminal subscription snapshot and closes linked unleased checkout attempts together, without depending on legacy commercial-policy reconciliation. An already cancelled provider setup can repair a stale created/unpaid local record after the same zero-payment checks, with no repeated cancellation request. New checkout reservation releases attempt locks only for owner-matched, provider-verified terminal records; unverified or leased attempts remain protected. Pricing clears the matching completed browser request before creating the next customer intent.

Regression coverage proves a verified closed setup permits a fresh 12-charge checkout, unverified closure cannot create a second provider subscription, and already cancelled provider state repairs both local records without a provider write.
