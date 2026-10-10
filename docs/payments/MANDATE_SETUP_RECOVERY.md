# Legacy mandate setup recovery

An old monthly mandate with 1,200 cycles can display an end date a century away and fail UPI authorization with RECURRING_MANDATE_END_DATE_MAX_VALIDITY_BREACHED. New checkouts retain the existing one-year schedule (12 monthly charges or one annual charge).

Pending created/authenticated mandates whose saved cycle count and billing interval exceed one year cannot be resumed. The legacy preflight also checks the freshly fetched provider count before returning authorization details. Existing paid/active mandates are preserved.

Billing exposes **Close unpaid setup** for created, unpaid records with no paid-through term. This customer-initiated action checks fresh provider state, requires zero paid cycles, and reads invoices. It refuses authenticated/active setups, payment-linked or paid invoices, incomplete invoice inventories and provider errors. Closure must be confirmed by a second provider read before the action succeeds. A subsequent customer checkout creates a fresh finite mandate; no automatic replacement or provider mutation occurs during status reads or deployment.

Validation includes actual compiled worker setup closure, refusal of active/authenticated/payment evidence, and durable checkout recovery blocking a 1,200-cycle legacy mandate without replacement creation. Real bank authorization and renewal certification remain separate from automated release checks.

## Cancelled-attempt retry cleanup

A customer-confirmed unpaid closure now saves the terminal subscription snapshot and closes linked unleased checkout attempts together, without depending on legacy commercial-policy reconciliation. An already cancelled provider setup can repair a stale created/unpaid local record after the same zero-payment checks, with no repeated cancellation request. New checkout reservation releases attempt locks only for owner-matched, provider-verified terminal records; unverified or leased attempts remain protected. Pricing clears the matching completed browser request before creating the next customer intent.

Regression coverage proves a verified closed setup permits a fresh 12-charge checkout, unverified closure cannot create a second provider subscription, and already cancelled provider state repairs both local records without a provider write.

## Worker provider transport

A workerd reproduction identified another site-wide blocker: redirect `error` is rejected synchronously by the deployed Workers runtime, before any Razorpay request. Checkout, renewal verification and signed inbox recovery now share a provider transport using `manual`, clearable timeouts, and existing non-success response rejection. Credentials never follow redirects. A real workerd regression test exercises the compiled production provider client for GET, POST and a rejected redirect; deterministic Node-only provider mocks had missed the runtime incompatibility.

Old one-year attempts without the new manual-v1 transport marker are known to have failed before dispatch through this client. Only a complete empty provider identity inventory permits their release as failed; a discovered matching subscription is recovered normally, and new transport timeouts remain uncertain. The next explicit customer purchase can replace the confirmed pre-dispatch failure once. No recurring debit or authorization is performed by diagnosis or deployment.

## Prepaid billing dates versus manual access

A rejected live checkout carried a start_at in 2042 because every existing access grant was treated as prepaid service. All three checkout builders now use one shared, owner-scoped prepaid query: recurring dates require provider verification, paid financial state, a captured cycle and a future paid-through anchor; legacy one-time access requires a matching paid order and verified captured payment identity. Manual grants, owner privileges, trials and grace do not defer payment. Their saved access records are not changed.

Provider failures now expose only a safe HTTP status and validated field name, and persist that classification for support. Provider bodies, credentials and customer details remain excluded. SQLite regressions cover the 2042 manual grant, preserved genuine prepaid periods, refunded/unverified records, and mismatched legacy payment ownership.
