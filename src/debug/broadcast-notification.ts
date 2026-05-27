import readline from "readline"

import { setupMongoConnectionSecondary } from "@services/mongodb"
import { User } from "@services/mongoose/schema"
import { sendBulkNotification } from "@services/notifications/notification"
import { baseLogger } from "@services/logger"

// Sends a push notification to a filtered set of users.
//
// Required env:
//   MONGODB_ADDRESS=... (and MONGODB_PASSWORD)
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/firebase-sa.json
//
// Usage from inside the cluster:
//   kubectl exec -it -n mainnet deploy/galoy-graphql -- \
//     ts-node src/debug/broadcast-notification.ts \
//       --title "Heads up" \
//       --body "Maintenance tonight at 10pm UTC" \
//       --level 1 \
//       --country US \
//       [--dry-run] [--yes]
//
// Without --yes the script prints the matched count and waits for a typed CONFIRM.

type Args = {
  title?: string
  body?: string
  level?: number
  country?: string
  dryRun: boolean
  yes: boolean
}

const parseArgs = (): Args => {
  const argv = process.argv.slice(2)
  const out: Args = { dryRun: false, yes: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    switch (a) {
      case "--title": out.title = next(); break
      case "--body": out.body = next(); break
      case "--level": out.level = parseInt(next(), 10); break
      case "--country": out.country = next(); break
      case "--dry-run": out.dryRun = true; break
      case "--yes": out.yes = true; break
      default:
        throw new Error(`unknown flag: ${a}`)
    }
  }
  return out
}

const prompt = (question: string): Promise<string> => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

const main = async () => {
  const args = parseArgs()
  if (!args.title || args.title.trim().length === 0) {
    throw new Error("--title is required")
  }

  await setupMongoConnectionSecondary()

  const query: Record<string, unknown> = {
    status: "active",
    deviceToken: { $exists: true, $not: { $size: 0 } },
  }
  if (typeof args.level === "number" && !Number.isNaN(args.level)) {
    query.level = args.level
  }
  if (args.country) {
    query["twilio.countryCode"] = args.country
  }

  const users = await User.find(query, { deviceToken: 1 }).lean()
  const tokens = users.flatMap((u) => u.deviceToken || [])

  console.log("---")
  console.log("title:    ", args.title)
  console.log("body:     ", args.body || "(none)")
  console.log("filter:   ", JSON.stringify(query))
  console.log("users:    ", users.length)
  console.log("tokens:   ", tokens.length)
  console.log("dry-run:  ", args.dryRun)
  console.log("---")

  if (args.dryRun) {
    console.log("dry-run: not sending.")
    return
  }

  if (!args.yes) {
    const answer = await prompt(`Type CONFIRM to send to ${tokens.length} device tokens: `)
    if (answer.trim() !== "CONFIRM") {
      console.log("aborted.")
      return
    }
  }

  const result = await sendBulkNotification({
    tokens,
    title: args.title,
    body: args.body,
    logger: baseLogger,
  })

  console.log("done:", result)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
