---
name: bitcoin-jungle-wallet
description: Programmatically interact with a Bitcoin Jungle (Galoy fork) wallet via GraphQL — authenticate, receive Lightning/on-chain payments, send Lightning/on-chain payments, and confirm settlement. Use when building integrations or running ad-hoc API calls (curl, scripts, agents).
---

# Bitcoin Jungle Wallet API

Bitcoin Jungle is a custodial Bitcoin/Lightning bank built on the Galoy backend. This skill documents the GraphQL workflow most integrations need: authenticate, generate a receive invoice/address, send a payment, and confirm settlement.

## Endpoint

```
https://api.mainnet.bitcoinjungle.app/graphql
```

All requests are HTTP `POST` with `Content-Type: application/json`, body shape `{"query": "...", "variables": {...}}`. Subscriptions use the same path over `wss://`.

The GraphQL schema (source of truth) lives at `src/graphql/main/schema.graphql` in this repo. A Postman collection ships at `src/graphql/main/docs/Lightning-Integration.postman_collection.json`.

## Authentication

Two auth schemes exist. **Pick one per integration**:

| Scheme | Header | When to use |
| --- | --- | --- |
| JWT Bearer (user-scoped) | `Authorization: Bearer <jwt>` | Full access. Required for `me`, account API key management, settings, etc. |
| API key (account-scoped) | `Authorization: Basic <base64(key:secret)>` | Server-to-server integrations. Limited to send/receive/wallet ops — see below. |

API keys can ONLY be used for these mutations: `lnInvoiceCreate`, `lnNoAmountInvoiceCreate`, `lnInvoicePaymentSend`, `lnNoAmountInvoicePaymentSend`, `intraLedgerPaymentSend`, `onChainAddressCreate`, `onChainAddressCurrent`, `onChainPaymentSend`, `onChainPaymentSendAll`, `lnInvoiceFeeProbe`, `lnNoAmountInvoiceFeeProbe`. They CANNOT call `me`, so the integration must cache the `walletId` after creation.

### Step 1 — Get a JWT (one-time, requires phone)

```bash
# 1. Request SMS auth code
curl -s https://api.mainnet.bitcoinjungle.app/graphql \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "mutation($input: UserRequestAuthCodeInput!){ userRequestAuthCode(input:$input){ success errors{ message } } }",
    "variables": { "input": { "phone": "+15065551234" } }
  }'

# 2. Exchange code for JWT
curl -s https://api.mainnet.bitcoinjungle.app/graphql \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "mutation($input: UserLoginInput!){ userLogin(input:$input){ authToken errors{ message } } }",
    "variables": { "input": { "phone": "+15065551234", "code": "123456" } }
  }'
# → { "data": { "userLogin": { "authToken": "eyJhbGc...", "errors": [] } } }
```

Store the `authToken` and use it as `Authorization: Bearer <authToken>` for subsequent calls.

### Step 2 — (Recommended for servers) Mint an API key

With the JWT, create an account-scoped key. The plaintext `secret` is returned **once** — store it immediately.

```bash
JWT="eyJhbGc..."
EXPIRE_AT=$(($(date +%s) + 60*60*24*365))   # 1 year

curl -s https://api.mainnet.bitcoinjungle.app/graphql \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $JWT" \
  -d "{
    \"query\": \"mutation(\$input: AccountApiKeyCreateInput!){ accountApiKeyCreate(input:\$input){ accountApiKey{ key secret label expireAt } errors{ message } } }\",
    \"variables\": { \"input\": { \"label\": \"my-bot\", \"expireAt\": $EXPIRE_AT } }
  }"
```

Use it on every subsequent request:

```bash
API_KEY="..."; API_SECRET="..."
AUTH=$(printf "%s:%s" "$API_KEY" "$API_SECRET" | base64 -w0)
# → Authorization: Basic $AUTH
```

### Step 3 — Find the walletId

`walletId` is required by every send/receive mutation. Fetch it once (with the JWT, since `me` is JWT-only) and cache it.

```bash
curl -s https://api.mainnet.bitcoinjungle.app/graphql \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $JWT" \
  -d '{"query":"{ me { defaultAccount { defaultWalletId wallets { id walletCurrency balance } } } }"}'
```

The default BTC wallet's `id` is the `walletId` to use everywhere below.

## Receive

### Lightning — invoice with fixed amount

```bash
curl -s https://api.mainnet.bitcoinjungle.app/graphql \
  -H 'Content-Type: application/json' \
  -H "Authorization: Basic $AUTH" \
  -d '{
    "query": "mutation($input: LnInvoiceCreateInput!){ lnInvoiceCreate(input:$input){ invoice{ paymentRequest paymentHash satoshis } errors{ message } } }",
    "variables": { "input": { "walletId": "WALLET_ID", "amount": 1000, "memo": "order #42" } }
  }'
```

Returns a BOLT11 `paymentRequest` (show as a QR / share with payer) and `paymentHash` (use to track settlement).

For a no-amount ("any-amount") invoice, use `lnNoAmountInvoiceCreate` with the same shape minus `amount`. The payer chooses the amount on send.

### On-chain

```bash
# Generate a fresh address
curl -s https://api.mainnet.bitcoinjungle.app/graphql \
  -H 'Content-Type: application/json' \
  -H "Authorization: Basic $AUTH" \
  -d '{
    "query": "mutation($input: OnChainAddressCreateInput!){ onChainAddressCreate(input:$input){ address errors{ message } } }",
    "variables": { "input": { "walletId": "WALLET_ID" } }
  }'

# OR reuse the most recently issued address
# Replace onChainAddressCreate → onChainAddressCurrent (same input shape)
```

## Send

### Lightning — paying a BOLT11 invoice

Optional but recommended: probe the route fee first so the user sees the cost before committing.

```bash
# (Optional) fee probe
curl -s https://api.mainnet.bitcoinjungle.app/graphql \
  -H 'Content-Type: application/json' \
  -H "Authorization: Basic $AUTH" \
  -d '{
    "query": "mutation($input: LnInvoiceFeeProbeInput!){ lnInvoiceFeeProbe(input:$input){ amount errors{ message } } }",
    "variables": { "input": { "walletId": "WALLET_ID", "paymentRequest": "lnbc..." } }
  }'

# Send
curl -s https://api.mainnet.bitcoinjungle.app/graphql \
  -H 'Content-Type: application/json' \
  -H "Authorization: Basic $AUTH" \
  -d '{
    "query": "mutation($input: LnInvoicePaymentInput!){ lnInvoicePaymentSend(input:$input){ status errors{ message } } }",
    "variables": { "input": { "walletId": "WALLET_ID", "paymentRequest": "lnbc...", "memo": "tip" } }
  }'
```

For a no-amount invoice, use `lnNoAmountInvoicePaymentSend` and include `amount` (sats) in the input.

`status` is one of `SUCCESS`, `PENDING`, `FAILURE`, `ALREADY_PAID`. Treat `PENDING` like an in-flight HTLC — confirm it later (see "Confirm" below).

### On-chain

```bash
# (Optional) fee estimate — query, not mutation
curl -s https://api.mainnet.bitcoinjungle.app/graphql \
  -H 'Content-Type: application/json' \
  -H "Authorization: Basic $AUTH" \
  -d '{
    "query": "query($walletId: WalletId!, $address: OnChainAddress!, $amount: SatAmount!){ onChainTxFee(walletId:$walletId, address:$address, amount:$amount, targetConfirmations:1){ amount targetConfirmations } }",
    "variables": { "walletId": "WALLET_ID", "address": "bc1q...", "amount": 50000 }
  }'

# Send
curl -s https://api.mainnet.bitcoinjungle.app/graphql \
  -H 'Content-Type: application/json' \
  -H "Authorization: Basic $AUTH" \
  -d '{
    "query": "mutation($input: OnChainPaymentSendInput!){ onChainPaymentSend(input:$input){ status errors{ message } } }",
    "variables": { "input": { "walletId": "WALLET_ID", "address": "bc1q...", "amount": 50000, "memo": "withdrawal", "targetConfirmations": 1 } }
  }'
```

To sweep the wallet, use `onChainPaymentSendAll` (omit `amount`).

### Sending to another Bitcoin Jungle user (free, instant)

If you know the recipient's `walletId` (look it up via `userDefaultWalletId(username:"alice")`), use `intraLedgerPaymentSend`. This bypasses Lightning/on-chain entirely — no fees, instant settlement.

```bash
curl -s https://api.mainnet.bitcoinjungle.app/graphql \
  -H 'Content-Type: application/json' \
  -H "Authorization: Basic $AUTH" \
  -d '{
    "query": "mutation($input: IntraLedgerPaymentSendInput!){ intraLedgerPaymentSend(input:$input){ status errors{ message } } }",
    "variables": { "input": { "walletId": "WALLET_ID", "recipientWalletId": "RECIPIENT_WALLET_ID", "amount": 1000, "memo": "thanks" } }
  }'
```

## Confirm settlement

### Receiving — was my invoice paid?

**Option A: Polling (simple, works with any HTTP client).** Hit `lnInvoicePaymentStatus` (subscription field) via a regular query is NOT supported — instead poll the wallet transaction list and match by `paymentHash`:

```bash
curl -s https://api.mainnet.bitcoinjungle.app/graphql \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $JWT" \
  -d '{"query":"{ me { defaultAccount { wallets { id transactions(first: 20){ edges { node { id status direction settlementAmount memo initiationVia { ... on InitiationViaLn { paymentHash } ... on InitiationViaOnChain { address } } settlementVia { __typename } createdAt } } } } } } }"}'
```

Match the `paymentHash` you saved at invoice creation. `status: SUCCESS` means paid. (For on-chain, match by `address` and watch for `status` going `PENDING → SUCCESS`.)

**Option B: GraphQL subscription (push, real-time).** Open a websocket to the same `/graphql` path (`wss://`), authenticate with `connectionParams: { authorization: "Bearer <jwt>" }`, and subscribe:

```graphql
subscription($input: LnInvoicePaymentStatusInput!) {
  lnInvoicePaymentStatus(input: $input) {
    status   # PAID | PENDING
    errors { message }
  }
}
# variables: { "input": { "paymentRequest": "lnbc..." } }
```

For broader account-wide push notifications (any LN/onchain/intraledger update), use the `myUpdates` subscription instead. Subscriptions require JWT auth — they don't accept API keys.

### Sending — did my payment go through?

The mutation response carries the immediate result via `status`:

- `SUCCESS` — settled. Done.
- `ALREADY_PAID` — invoice was already paid (idempotent — treat as success).
- `FAILURE` — read `errors[].message`. For Lightning, common codes are `NO_ROUTE`, `INSUFFICENT_BALANCE`, `LIMIT_EXCEEDED`, `INVOICE_PAID`, `NO_LIQUIDITY`.
- `PENDING` — in-flight (Lightning HTLC pending, or on-chain tx broadcast but unconfirmed). Re-check by listing transactions and matching on `paymentHash` (LN) or scanning the `txHash` in `settlementVia` (on-chain) until `status` flips to `SUCCESS` or `FAILURE`.

```bash
# Poll for a specific paymentHash to settle
curl -s https://api.mainnet.bitcoinjungle.app/graphql \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $JWT" \
  -d '{"query":"{ me { defaultAccount { wallets { transactions(first: 50){ edges { node { status direction settlementFee initiationVia { ... on InitiationViaLn { paymentHash } } } } } } } } }"}'
```

## Balance

```bash
curl -s https://api.mainnet.bitcoinjungle.app/graphql \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $JWT" \
  -d '{"query":"{ me { defaultAccount { wallets { id walletCurrency balance } } } }"}'
```

`balance` is in sats (signed). Currently only `BTC` wallets exist.

## Minimal Node.js example (end-to-end)

```js
const ENDPOINT = "https://api.mainnet.bitcoinjungle.app/graphql"

const gql = async (query, variables, auth) => {
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    },
    body: JSON.stringify({ query, variables }),
  })
  const j = await r.json()
  if (j.errors) throw new Error(JSON.stringify(j.errors))
  return j.data
}

const basic = (key, secret) =>
  "Basic " + Buffer.from(`${key}:${secret}`).toString("base64")

// Receive 1000 sats over Lightning
const { lnInvoiceCreate } = await gql(
  `mutation($i: LnInvoiceCreateInput!){
     lnInvoiceCreate(input:$i){ invoice{ paymentRequest paymentHash } errors{ message } } }`,
  { i: { walletId: WALLET_ID, amount: 1000, memo: "order #42" } },
  basic(API_KEY, API_SECRET),
)
const { paymentRequest, paymentHash } = lnInvoiceCreate.invoice

// Pay a BOLT11 invoice
const { lnInvoicePaymentSend } = await gql(
  `mutation($i: LnInvoicePaymentInput!){
     lnInvoicePaymentSend(input:$i){ status errors{ message } } }`,
  { i: { walletId: WALLET_ID, paymentRequest: "lnbc..." } },
  basic(API_KEY, API_SECRET),
)
console.log(lnInvoicePaymentSend.status) // SUCCESS | PENDING | FAILURE | ALREADY_PAID
```

## Gotchas

- **Phone format**: E.164 only (e.g. `+15065551234`).
- **Amounts are in sats** (`SatAmount`). Never floats. `balance` may be negative on a `SignedAmount` field — it's the same unit.
- **One JWT per phone**: the JWT is tied to a user account; one phone = one account.
- **Errors**: GraphQL responses always return HTTP 200. Check both top-level `errors` (parse/validation/auth failures) AND payload-level `errors[]` (business-logic failures like `INSUFFICENT_BALANCE`).
- **Idempotency**: there is no idempotency key on send mutations. If a request times out, **don't blindly retry** — first poll the transaction list to see whether it landed.
- **Rate limits**: auth code requests, login attempts, and payments are rate-limited per phone/IP. Back off on 429-style failures rather than tight-looping.
- **API-key scope**: API keys can't read `me` or transaction history — keep a JWT around (or store the `walletId` and confirm via subscription) if your bot needs to verify receipts.
- **Confirm before declaring success**: `PENDING` means in-flight, not failed. A Lightning HTLC can resolve seconds later; an on-chain tx flips to `SUCCESS` after `targetConfirmations` blocks.
