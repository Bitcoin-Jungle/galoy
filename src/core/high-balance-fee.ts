import { MainBook } from "@services/ledger/books"
import { bankOwnerAccountPath } from "@services/ledger/accounts"
import { getAccountBalance } from "@services/ledger/query"
import {
  User,
  HighBalanceNotice,
  DailyBalanceSnapshot,
  CustodyFeeCharge,
} from "@services/mongoose/schema"
import { baseLogger } from "@services/logger"

export const HIGH_BALANCE_THRESHOLD_SATS = 20_000_000 // 0.2 BTC
export const HIGH_BALANCE_FEE_RATE_MONTHLY = 0.001 // 0.1%
export const HIGH_BALANCE_GRACE_DAYS = 30

const logger = baseLogger.child({ module: "highBalanceFee" })

const todayUTC = (now = new Date()): string => now.toISOString().slice(0, 10)

const daysInMonth = (period: string): number => {
  const [y, m] = period.split("-").map(Number)
  return new Date(y, m, 0).getDate()
}

const monthBounds = (period: string): { start: string; end: string } => {
  const [y, m] = period.split("-").map(Number)
  const startStr = `${period}-01`
  const endDay = new Date(y, m, 0).getDate()
  const endStr = `${period}-${String(endDay).padStart(2, "0")}`
  return { start: startStr, end: endStr }
}

// 1. Open a notice for any user above threshold without one currently active.
//    Returns count of new notices.
export const detectHighBalances = async (now = new Date()): Promise<number> => {
  const users = await User.find({})
  let created = 0

  for (const user of users) {
    const balance = await getAccountBalance(user.accountPath, { currency: "BTC" })
    if (balance <= HIGH_BALANCE_THRESHOLD_SATS) continue

    const active = await HighBalanceNotice.findOne({
      userId: user._id,
      resolvedAt: null,
    })
    if (active) continue

    const graceEnds = new Date(now.getTime() + HIGH_BALANCE_GRACE_DAYS * 86400_000)
    await HighBalanceNotice.create({
      userId: user._id,
      thresholdSats: HIGH_BALANCE_THRESHOLD_SATS,
      rateMonthly: HIGH_BALANCE_FEE_RATE_MONTHLY,
      noticeSentAt: now,
      graceEndsAt: graceEnds,
    })
    created++
    logger.info(
      { userId: user._id, phone: user.phone, balance },
      "high-balance notice opened",
    )
  }
  return created
}

// 2. For each active notice, write today's snapshot. Resolve if dropped below.
//    Mark fee-eligible if grace ended while still above threshold.
export const snapshotActiveNotices = async (
  now = new Date(),
): Promise<{ snapshotted: number; resolved: number; newlyEligible: number }> => {
  const notices = await HighBalanceNotice.find({ resolvedAt: null })
  const date = todayUTC(now)
  let snapshotted = 0
  let resolved = 0
  let newlyEligible = 0

  for (const notice of notices) {
    const user = await User.findById(notice.userId)
    if (!user) continue
    const balance = await getAccountBalance(user.accountPath, { currency: "BTC" })

    // Below threshold = nudge succeeded. Resolve immediately, no fee continues.
    if (balance <= notice.thresholdSats) {
      notice.resolvedAt = now
      await notice.save()
      resolved++
      logger.info({ userId: user._id, balance }, "high-balance notice resolved")
      continue
    }

    // Grace ended and still above → flag as fee-eligible (one-time).
    if (!notice.feeEligibleSince && now >= notice.graceEndsAt) {
      notice.feeEligibleSince = now
      await notice.save()
      newlyEligible++
    }

    await DailyBalanceSnapshot.updateOne(
      { userId: user._id, date },
      {
        $setOnInsert: {
          userId: user._id,
          date,
          balanceSats: balance,
          feeEligible: !!notice.feeEligibleSince,
        },
      },
      { upsert: true },
    )
    snapshotted++
  }
  return { snapshotted, resolved, newlyEligible }
}

// 3. Charge monthly fee for `period` (YYYY-MM). Posts to ledger unless dryRun.
export const chargeMonthlyFees = async (
  period: string,
  { dryRun = false, now = new Date() }: { dryRun?: boolean; now?: Date } = {},
): Promise<
  Array<{
    userId: unknown
    phone?: string
    username?: string
    daysCounted: number
    avgExcessSats: number
    feeCalculated: number
    feeCharged: number
    skippedReason?: string
  }>
> => {
  const { start, end } = monthBounds(period)
  const dim = daysInMonth(period)
  const results: Array<{
    userId: unknown
    phone?: string
    username?: string
    daysCounted: number
    avgExcessSats: number
    feeCalculated: number
    feeCharged: number
    skippedReason?: string
  }> = []

  const notices = await HighBalanceNotice.find({
    feeEligibleSince: { $ne: null, $lte: new Date(`${end}T23:59:59Z`) },
  })

  for (const notice of notices) {
    const user = await User.findById(notice.userId)
    if (!user) continue

    const snaps = await DailyBalanceSnapshot.find({
      userId: notice.userId,
      date: { $gte: start, $lte: end },
      feeEligible: true,
    })

    if (snaps.length === 0) {
      results.push({
        userId: notice.userId,
        phone: user.phone,
        username: user.username,
        daysCounted: 0,
        avgExcessSats: 0,
        feeCalculated: 0,
        feeCharged: 0,
        skippedReason: "no eligible snapshots",
      })
      continue
    }

    const sumExcess = snaps.reduce(
      (s, x) => s + Math.max(0, x.balanceSats - notice.thresholdSats),
      0,
    )
    const avgExcess = sumExcess / dim
    const feeCalc = Math.floor(avgExcess * notice.rateMonthly)

    if (feeCalc === 0) {
      results.push({
        userId: notice.userId,
        phone: user.phone,
        username: user.username,
        daysCounted: snaps.length,
        avgExcessSats: Math.round(avgExcess),
        feeCalculated: 0,
        feeCharged: 0,
        skippedReason: "fee floors to 0",
      })
      continue
    }

    const currentBal = await getAccountBalance(user.accountPath, { currency: "BTC" })
    const feeCharged = Math.min(feeCalc, Math.max(0, currentBal))

    if (dryRun || feeCharged === 0) {
      results.push({
        userId: notice.userId,
        phone: user.phone,
        username: user.username,
        daysCounted: snaps.length,
        avgExcessSats: Math.round(avgExcess),
        feeCalculated: feeCalc,
        feeCharged,
        skippedReason:
          feeCharged === 0 ? "current balance zero" : dryRun ? "dry run" : undefined,
      })
      continue
    }

    const bankOwnerPath = await bankOwnerAccountPath()
    const meta = {
      currency: "BTC" as const,
      type: "custody_fee",
      period,
      thresholdSats: notice.thresholdSats,
      rate: notice.rateMonthly,
      avgExcessSats: Math.round(avgExcess),
      daysCounted: snaps.length,
      feeCalculated: feeCalc,
      feeCharged,
      pending: false,
    }
    const entry = await MainBook.entry(`high-balance maintenance fee ${period}`)
      .debit(user.accountPath, feeCharged, meta)
      .credit(bankOwnerPath, feeCharged, meta)
      .commit()

    await CustodyFeeCharge.create({
      userId: notice.userId,
      period,
      thresholdSats: notice.thresholdSats,
      rateMonthly: notice.rateMonthly,
      daysCounted: snaps.length,
      avgExcessSats: Math.round(avgExcess),
      feeCalculated: feeCalc,
      feeCharged,
      ledgerEntryId: entry._id,
      chargedAt: now,
    })

    results.push({
      userId: notice.userId,
      phone: user.phone,
      username: user.username,
      daysCounted: snaps.length,
      avgExcessSats: Math.round(avgExcess),
      feeCalculated: feeCalc,
      feeCharged,
    })
  }

  return results
}
