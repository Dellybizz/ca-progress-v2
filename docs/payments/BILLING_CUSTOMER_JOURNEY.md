# Billing customer journey

Pricing shows the published Free, Basic and Pro allocation. Choosing a paid plan opens a keyboard-accessible review dialog with payment method, optional promo, due-today quote, recurring price and finite authorization terms. Eligibility and final promotional price are resolved server-side before provider authorization.

Checkout retains its immutable saved attempt and original terms. Embedded Razorpay remains the primary authorization flow; the validated provider-hosted URL is also available if the embedded panel cannot load. An interrupted checkout can be continued without creating a replacement payment.

Billing displays server-verified access rather than trusting a `payment` URL parameter. Checkout verification runs sequentially in the foreground with bounded backoff (12 checks, maximum 30 seconds between checks), request timeouts, cleanup on unmount and terminal-state termination. Delayed provider responses preserve the saved attempt. Verified access refreshes the plan automatically. Pending renewals have a separate bounded synchronization observer. Background webhooks and existing recovery maintenance remain authoritative when the page is closed.

Stopping renewal, pausing, resuming, changing plans and closing an unpaid setup require an explicit confirmation. Backend eligibility, provider evidence, paid-through protection and idempotency remain enforced. No automatic observer authorizes, creates, cancels or replaces a subscription. Prices and provider contracts are unchanged.

Validation includes deterministic observer tests for retry limits, terminal states, successful activation, hidden/busy pages, provider failure and unmount races, plus the existing worker financial and lifecycle suite.
