import mongoose from "mongoose"

import {
  User,
  HighBalanceNotice,
  DailyBalanceSnapshot,
} from "@services/mongoose/schema"
import { getAccountBalance } from "@services/ledger/query"

import {
  detectHighBalances,
  snapshotActiveNotices,
  chargeMonthlyFees,
  HIGH_BALANCE_THRESHOLD_SATS,
  HIGH_BALANCE_FEE_RATE_MONTHLY,
} from "@core/high-balance-fee"

// Run against galoy_snapshot (the imported prod backup):
//   MONGODB_USER=root MONGODB_PASSWORD=password MONGODB_DATABASE=galoy_snapshot \
//   MONGODB_ADDRESS=127.0.0.1:27017 MONGODB_AUTH_SOURCE=admin \
//   yarn tsnd --files -r tsconfig-paths/register --transpile-only \
//     src/debug/verify-high-balance-fee.ts

const PERIOD = "2026-04" // arbitrary past month for the simulated fee period

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

const reset = async () => {
  await HighBalanceNotice.deleteMany({})
  await DailyBalanceSnapshot.deleteMany({})
}

// Independently compute expected fees direct from current ledger balances.
const expectedFromLedger = async () => {
  const users = await User.find({})
  const rows: Array<{ phone: string; username?: string; balance: number; fee: number }> = []
  for (const u of users) {
    const b = await getAccountBalance(u.accountPath, { currency: "BTC" })
    if (b <= HIGH_BALANCE_THRESHOLD_SATS) continue
    const excess = b - HIGH_BALANCE_THRESHOLD_SATS
    const fee = Math.floor(excess * HIGH_BALANCE_FEE_RATE_MONTHLY)
    rows.push({ phone: u.phone, username: u.username, balance: b, fee })
  }
  return rows.sort((a, b) => b.balance - a.balance)
}

const main = async () => {
  await connect()
  await reset()

  // ── 1. detect ─────────────────────────────────────────────────────────────
  const t0 = Date.now()
  const created = await detectHighBalances()
  console.log(`[detect] ${created} notices created in ${Date.now() - t0}ms`)

  const expected = await expectedFromLedger()
  const expectedCount = expected.length
  const expectedFeeSum = expected.reduce((s, r) => s + r.fee, 0)

  console.log("[expected from ledger]")
  console.table(expected)
  console.log(`expected count=${expectedCount}, expected fee sum=${expectedFeeSum} sats`)

  if (created !== expectedCount) {
    throw new Error(`MISMATCH: detected ${created}, expected ${expectedCount}`)
  }

  // ── 2. simulate 30-day grace passing + 30 daily snapshots inside PERIOD ──
  // Backdate notices so grace already ended, then write feeEligible=true snaps
  // for every day in PERIOD using current ledger balance (flat-balance month).
  await HighBalanceNotice.updateMany(
    {},
    {
      $set: {
        noticeSentAt: new Date("2026-02-01"),
        graceEndsAt: new Date("2026-03-03"),
        feeEligibleSince: new Date("2026-03-03"),
      },
    },
  )

  const [yy, mm] = PERIOD.split("-").map(Number)
  const dim = new Date(yy, mm, 0).getDate()
  const notices = await HighBalanceNotice.find({})
  for (const notice of notices) {
    const user = await User.findById(notice.userId)
    if (!user) continue
    const bal = await getAccountBalance(user.accountPath, { currency: "BTC" })
    for (let d = 1; d <= dim; d++) {
      const date = `${PERIOD}-${String(d).padStart(2, "0")}`
      await DailyBalanceSnapshot.updateOne(
        { userId: user._id, date },
        {
          $setOnInsert: { userId: user._id, date, balanceSats: bal, feeEligible: true },
        },
        { upsert: true },
      )
    }
  }
  console.log(`[simulate] ${notices.length} users × ${dim} daily snapshots written`)

  // ── 3. dry-run monthly fee ────────────────────────────────────────────────
  const results = await chargeMonthlyFees(PERIOD, { dryRun: true })
  console.log("[monthly dry-run results]")
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

  const totalCalc = results.reduce((s, r) => s + r.feeCalculated, 0)
  console.log(`[total fee calculated] ${totalCalc} sats`)
  console.log(`[expected]             ${expectedFeeSum} sats`)

  // ── 4. assert match ───────────────────────────────────────────────────────
  const okCount = results.length === expectedCount
  const okSum = totalCalc === expectedFeeSum

  // per-user comparison
  const calcByUser = new Map(results.map((r) => [String(r.userId), r.feeCalculated]))
  const perUserOK = expected.every((e) => {
    const expectedUser = expected.find((x) => x.phone === e.phone)!
    const id = String(notices.find((n) => String(n.userId))?._id ?? "")
    void id
    return expectedUser.fee >= 0
  })
  void perUserOK

  // simple per-user match via balance lookup
  let perUserMismatch = 0
  for (const e of expected) {
    const user = await User.findOne({ phone: e.phone })
    if (!user) continue
    const got = calcByUser.get(String(user._id))
    if (got !== e.fee) {
      console.log(`  MISMATCH ${e.phone}: expected ${e.fee}, got ${got}`)
      perUserMismatch++
    }
  }

  console.log("\n=== VERIFICATION ===")
  console.log(`users count match:    ${okCount ? "OK" : "FAIL"} (${results.length} vs ${expectedCount})`)
  console.log(`total fee sum match:  ${okSum ? "OK" : "FAIL"} (${totalCalc} vs ${expectedFeeSum})`)
  console.log(`per-user mismatches:  ${perUserMismatch}`)

  await mongoose.disconnect()
  if (!okCount || !okSum || perUserMismatch > 0) process.exit(1)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
