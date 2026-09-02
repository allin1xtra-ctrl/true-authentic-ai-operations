# True Authentic AI Operations

Owner-only, approval-first AI employee operations platform for True Authentic Apparel.

## Safety model

- All AI and integration credentials are server-only environment variables.
- No private key may use a `NEXT_PUBLIC_` name or be returned by an API.
- Analysis and drafting are separate from `propose_action` requests.
- Proposed external actions create approval records only. This application does not send email, publish content, schedule posts, contact customers or suppliers, or mutate Shopify.
- `Ready` is derived from live server-side health checks. Missing credentials show `Connection Required`; failed configured checks show `Error`.
- The page and all APIs require ChatGPT identity; production access is owner-only.

## Persistence

Cloudflare D1 (`DB`) stores conversations, approved brand memory, tasks, approvals, employee activity, integration state, and audit records.

## Claude + Shopify

Claude Sonnet 5 is the default AI engine. It can run through Vercel AI Gateway or a
server-only Anthropic API key. The Commerce Manager receives a live, read-only
Shopify snapshot containing recent order status, product, variant, price, and
inventory data. Customer names, emails, addresses, notes, and payment details
are never sent to the model.

Shopify mutations remain disabled. Requests to change products, prices,
inventory, orders, fulfillment, or themes create an approval record only.

## Server environment

Use `AI_PROVIDER=claude` with either Vercel AI Gateway access or
`ANTHROPIC_API_KEY`. GPT-5.6 Sol remains an explicit strategy and creative
fallback when `AI_PROVIDER=openai`. Higher-cost frontier models should be
reserved for manual escalation instead of routine store questions.

See `.env.example` for optional integration-health variables. Never commit real values.

## Validation

```bash
npm install
npm run typecheck
npm run lint
npm test
```

Production is deployed through the Sites project recorded in `.openai/hosting.json` after a successful build and test run.
