import yargs from "yargs"

import { setupMongoConnection } from "@services/mongodb"
import { baseLogger } from "@services/logger"

import {
  detectHighBalances,
  snapshotActiveNotices,
  chargeMonthlyFees,
} from "@core/high-balance-fee"

const logger = baseLogger.child({ module: "highBalanceCron" })

// Usage (deploy as cron):
//   daily 00:05 UTC   : ts-node src/servers/high-balance-cron.ts daily
//   monthly 1st 02:00 : ts-node src/servers/high-balance-cron.ts monthly --period=YYYY-MM [--dry-run]
//
// `daily` does both: detect newly-crossed users and snapshot all active notices.
// `monthly` posts last month's fees by default.

const previousMonth = (now = new Date()): string => {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

const main = async () => {
  const argv = await yargs
    .command("daily", "Detect new high balances + take daily snapshots")
    .command("monthly", "Charge last-month custody fees", (y) =>
      y
        .option("period", { type: "string", describe: "YYYY-MM (default: last month)" })
        .option("dry-run", { type: "boolean", default: false }),
    )
    .demandCommand(1)
    .strict()
    .parse()

  const mongoose = await setupMongoConnection()

  try {
    const cmd = argv._[0]
    if (cmd === "daily") {
      const created = await detectHighBalances()
      const snap = await snapshotActiveNotices()
      logger.info({ created, ...snap }, "daily high-balance job complete")
      // eslint-disable-next-line no-console
      console.log({ created, ...snap })
    } else if (cmd === "monthly") {
      const period = (argv.period as string) ?? previousMonth()
      const dryRun = !!argv["dry-run"]
      const results = await chargeMonthlyFees(period, { dryRun })
      const totalCharged = results.reduce((s, r) => s + r.feeCharged, 0)
      const totalCalculated = results.reduce((s, r) => s + r.feeCalculated, 0)
      logger.info(
        { period, dryRun, totalCalculated, totalCharged, count: results.length },
        "monthly fee job complete",
      )
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ period, dryRun, totalCalculated, totalCharged, results }, null, 2))
    }
  } finally {
    await mongoose.connection.close()
  }

  process.exit(0)
}

if (require.main === module) {
  main().catch((err) => {
    logger.fatal({ err }, "high-balance cron failed")
    process.exit(1)
  })
}
