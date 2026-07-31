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

## Server environment

Configure one AI provider in Sites runtime environment variables:

- `OPENAI_API_KEY`, or
- `AI_GATEWAY_API_KEY`

See `.env.example` for optional integration-health variables. Never commit real values.

## Validation

```bash
npm install
npm run typecheck
npm run lint
npm test
```

Production is deployed through the Sites project recorded in `.openai/hosting.json` after a successful build and test run.
