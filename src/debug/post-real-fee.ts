import mongoose from "mongoose"

// importing this registers the bankOwner / dealer resolvers as a side effect
import "@services/mongodb"

import {
  User,
  HighBalanceNotice,
  DailyBalanceSnapshot,
  CustodyFeeCharge,
} from "@services/mongoose/schema"
import { getAccountBalance } from "@services/ledger/query"
import { bankOwnerAccountPath } from "@services/ledger/accounts"

import { chargeMonthlyFees } from "@core/high-balance-fee"

const TARGET_USERNAME = "mamarey"
const PERIOD = "2026-04"

const connect = async () => {
  const user = process.env.MONGODB_USER ?? "root"
  const password = process.env.MONGODB_PASSWORD ?? "password"
  const address = process.env.MONGODB_ADDRESS ?? "127.0.0.1:27017"
  const db = process.env.MONGODB_DATABASE ?? "galoy_snapshot"
  const authSource = process.env.MONGODB_AUTH_SOURCE ?? "admin"
  const uri = `mongodb://${user}:${password}@${address}/${db}?authSource=${authSource}`
  console.log(`[connect] ${address}/${db}`)
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useCreateIndex: false,
    useFindAndModify: false,
  })
}

const main = async () => {
  await connect()

  // wipe state from prior verify runs
  await HighBalanceNotice.deleteMany({})
  await DailyBalanceSnapshot.deleteMany({})
  await CustodyFeeCharge.deleteMany({})

  const target = await User.findOne({ username: TARGET_USERNAME })
  if (!target) throw new Error(`user ${TARGET_USERNAME} not found`)
  const bankOwner = await User.findOne({ role: "bankowner" })
  if (!bankOwner) throw new Error("bankowner not found")

  const targetPath = target.accountPath
  const bankPath = await bankOwnerAccountPath()
  console.log(`[paths] target=${targetPath}  bank=${bankPath}`)

  // BEFORE balances
  const targetBefore = await getAccountBalance(targetPath, { currency: "BTC" })
  const bankBefore = await getAccountBalance(bankPath, { currency: "BTC" })
  console.log(`[before] ${TARGET_USERNAME}=${targetBefore} sats   bankowner=${bankBefore} sats`)

  // Build state: one notice for target, eligible since before PERIOD,
  // 30 snapshots at current balance, all feeEligible=true.
  await HighBalanceNotice.create({
    userId: target._id,
    thresholdSats: 20_000_000,
    rateMonthly: 0.001,
    noticeSentAt: new Date("2026-02-01"),
    graceEndsAt: new Date("2026-03-03"),
    feeEligibleSince: new Date("2026-03-03"),
  })

  const [yy, mm] = PERIOD.split("-").map(Number)
  const dim = new Date(yy, mm, 0).getDate()
  for (let d = 1; d <= dim; d++) {
    const date = `${PERIOD}-${String(d).padStart(2, "0")}`
    await DailyBalanceSnapshot.create({
      userId: target._id,
      date,
      balanceSats: targetBefore,
      feeEligible: true,
    })
  }
  console.log(`[setup] notice + ${dim} snapshots for ${TARGET_USERNAME}`)

  // POST the real fee
  const results = await chargeMonthlyFees(PERIOD, { dryRun: false })
  console.log("[chargeMonthlyFees results]")
  console.table(
    results.map((r) => ({
      who: r.username ?? r.phone,
      days: r.daysCounted,
      avgExcess: r.avgExcessSats,
      feeCalc: r.feeCalculated,
      feeCharged: r.feeCharged,
      skipped: r.skippedReason ?? "",
    })),
  )

  const targetResult = results.find((r) => r.username === TARGET_USERNAME)
  if (!targetResult) throw new Error("target not in results")
  const expectedDelta = targetResult.feeCharged

  // AFTER balances
  const targetAfter = await getAccountBalance(targetPath, { currency: "BTC" })
  const bankAfter = await getAccountBalance(bankPath, { currency: "BTC" })
  console.log(`[after]  ${TARGET_USERNAME}=${targetAfter} sats   bankowner=${bankAfter} sats`)

  const targetDelta = targetAfter - targetBefore
  const bankDelta = bankAfter - bankBefore
  console.log(`[delta]  ${TARGET_USERNAME}=${targetDelta}   bankowner=${bankDelta}`)
  console.log(`[expected] feeCharged=${expectedDelta}`)

  const userOK = targetDelta === -expectedDelta
  const bankOK = bankDelta === expectedDelta
  const conservationOK = targetDelta + bankDelta === 0

  // CustodyFeeCharge row created
  const charge = await CustodyFeeCharge.findOne({
    userId: target._id,
    period: PERIOD,
  })
  console.log(`[CustodyFeeCharge row] ${charge ? "OK" : "MISSING"}`, charge?.toObject())

  console.log("\n=== VERIFICATION ===")
  console.log(`user debit matches feeCharged:    ${userOK ? "OK" : "FAIL"} (${targetDelta} vs -${expectedDelta})`)
  console.log(`bank credit matches feeCharged:   ${bankOK ? "OK" : "FAIL"} (${bankDelta} vs +${expectedDelta})`)
  console.log(`double-entry conservation:        ${conservationOK ? "OK" : "FAIL"} (Σ=${targetDelta + bankDelta})`)
  console.log(`CustodyFeeCharge row written:     ${charge ? "OK" : "FAIL"}`)

  await mongoose.disconnect()
  process.exit(userOK && bankOK && conservationOK && !!charge ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
