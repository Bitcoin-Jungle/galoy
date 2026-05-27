# Broadcast push notification

Send a one-off push notification to a filtered set of users by running
`src/debug/broadcast-notification.ts` from your workstation against the
production Mongo cluster + Firebase service account.

The script lives in the `galoy` repo. It's never built into the prod image —
debug scripts in this codebase are designed to be run via `ts-node` from an
operator workstation, not from inside a pod.

## Prereqs

- Local checkout of `galoy` at the commit that contains
  `src/debug/broadcast-notification.ts`.
- `corepack yarn install --frozen-lockfile` has been run in that checkout.
- `kubectl` context points at the prod cluster.
- SSH access to the bastion (`bastion.bitcoinjungle.app`).
- Permission to read the `galoy-mongodb` and `galoyapp-firebase-serviceaccount`
  secrets in the cluster.

## Why two tunnels

The prod Mongo pods are not reachable from your laptop directly. We chain
two hops:

1. **SSH tunnel laptop → bastion** on port 28015.
2. **`kubectl port-forward` on the bastion** from bastion:28015 → the
   `galoy-mongodb-0` pod on its internal 27017.

Net effect: `localhost:28015` on your laptop is `galoy-mongodb-0:27017`
in the cluster.

## Step 1 — Open the mongo tunnel

**On the bastion** (SSH there first):

```bash
ssh -i ~/.ssh/google_compute_engine \
  leesalminen_gmail_com@bastion.bitcoinjungle.app

# inside the bastion:
kubectl port-forward galoy-mongodb-0 28015:27017
# leave this running
```

**On your laptop**, in a second terminal, forward the bastion's 28015 to your local 28015:

```bash
ssh -N -L 28015:127.0.0.1:28015 \
  -i ~/.ssh/google_compute_engine \
  leesalminen_gmail_com@bastion.bitcoinjungle.app
```

If you get `bind [::1]:28015: Cannot assign requested address`, that's IPv6
binding noise — the IPv4 bind still worked. Ignore.

## Step 2 — Pull the Firebase service account key

```bash
kubectl get secret galoyapp-firebase-serviceaccount \
  -o jsonpath='{.data.galoyapp-firebase-serviceaccount\.json}' \
  | base64 -d > /tmp/fb-sa.json
chmod 600 /tmp/fb-sa.json
```

(Run from your laptop — your kubectl context already points at the prod cluster.)

## Step 3 — Set env vars

```bash
export MONGODB_ADDRESS=localhost:28015
export MONGODB_USER=root
export MONGODB_PASSWORD=password         # the actual prod root password
export MONGODB_AUTH_SOURCE=admin         # critical — root is bound to admin DB, not galoy
export GOOGLE_APPLICATION_CREDENTIALS=/tmp/fb-sa.json
export JWT_SECRET=ignored                # script doesn't use it but config loader complains
```

`MONGODB_AUTH_SOURCE=admin` matters because the script's connection string is
`mongodb://${user}:${password}@${address}/${db}` and without an explicit
`authSource`, Mongo treats the URI's database (`galoy`) as the auth database.
`root` is registered against `admin`, not `galoy`, so auth fails without this.

## Step 4 — Run the script

Always dry-run first:

```bash
cd ~/apps/galoy

corepack yarn ts-node --files -r tsconfig-paths/register \
  src/debug/broadcast-notification.ts \
    --title "Heads up" \
    --body "Maintenance tonight at 10pm UTC" \
    --active-since-days 30 \
    --dry-run
```

Dry-run prints the matched user count, token count, and the Mongo query —
but sends nothing. Inspect those numbers. If they look wrong, refine filters
before going live.

Then drop `--dry-run` to actually send. The script prints the same preview
and waits for typed `CONFIRM` before firing. Pass `--yes` to skip the prompt
(don't use this casually).

## Flags

| Flag | Description |
| --- | --- |
| `--title <string>` | **Required.** Notification title. |
| `--body <string>` | Notification body. Optional. |
| `--level <1\|2>` | Restrict to users at this account level. |
| `--country <code>` | Restrict by `twilio.countryCode` (e.g. `US`). |
| `--active-since-days <N>` | Restrict to users whose `lastIPs[].lastConnection` is within the last N days. Useful for "active users only" broadcasts. |
| `--username <name>` | Restrict to a single user by username (case-insensitive). Use this to test-send to yourself before a real broadcast. |
| `--dry-run` | Count and preview, do not send. |
| `--yes` | Skip the typed-CONFIRM prompt. |

The base query always includes `status: "active"` and a non-empty
`deviceToken` array — locked accounts and tokenless users are never
candidates.

## Notes

- **Why filter on `lastIPs[].lastConnection` instead of `lastConnection`:**
  the top-level `user.lastConnection` field exists in the schema but is
  never written. Only the per-IP `lastConnection` inside `lastIPs[]` is
  updated on each API call. See `src/app/users/get-user.ts:64-93`.
- **Why this isn't an admin GraphQL mutation:** push-blast is a one-touch
  global side effect. Keeping it script-only on the operator workstation
  means a leaked admin token can't fan out spam to every user. The trade-off
  is operational friction — which is the point.
- **Batching:** the underlying `sendBulkNotification` helper batches at
  500 tokens per FCM `sendMulticast` call (FCM's hard limit). For a
  100k-user blast that's 200 batches — typically a couple minutes of wall
  time. Don't kill the script mid-run.
- **Failure counts** in the output are usually stale FCM tokens (uninstalled
  apps). They're normal and not a sign anything is broken.

## Cleanup

```bash
shred -u /tmp/fb-sa.json
# Ctrl+C both SSH tunnels and the kubectl port-forward
```

## Troubleshooting

**`Authentication failed`** — `MONGODB_AUTH_SOURCE=admin` is missing, or
`MONGODB_USER`/`MONGODB_PASSWORD` don't match the cluster. Don't reuse
docker-compose dev creds (`testGaloy`/`password`); those belong to your
local dev mongo only.

**`Cannot find name 'UserType'`** — you forgot `--files` on the
`ts-node` invocation. `UserType` is declared in a `.d.ts` file that
ts-node skips by default; `--files` makes it pick those up.

**`no custom.yaml available. using default values`** — harmless. That
file only exists inside k8s pods.

**`bind [::1]:28015: Cannot assign requested address`** — harmless. The
IPv4 bind succeeded; ignore the IPv6 noise.
