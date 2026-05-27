import fs from "fs"
import mongoose from "mongoose"

import { User } from "@services/mongoose/schema"
import { getAccountBalance } from "@services/ledger/query"

// Run with:
//   MONGODB_USER=root MONGODB_PASSWORD=password MONGODB_DATABASE=galoy_snapshot \
//   yarn tsnd --files -r tsconfig-paths/register --transpile-only \
//     src/debug/dump-balances.ts
//
// Skips setupMongoConnection() (which calls syncIndexes on huge collections)
// and connects directly. Writes CSV row-by-row so partial results survive.

const OUT = process.env.OUT ?? "/home/lee/Downloads/user-balances.csv"

const csvEscape = (v: unknown): string => {
  if (v === null || v === undefined) return ""
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const main = async () => {
  const user = process.env.MONGODB_USER ?? "root"
  const password = process.env.MONGODB_PASSWORD ?? "password"
  const address = process.env.MONGODB_ADDRESS ?? "127.0.0.1:27017"
  const db = process.env.MONGODB_DATABASE ?? "galoy_snapshot"
  const authSource = process.env.MONGODB_AUTH_SOURCE ?? "admin"

  const uri = `mongodb://${user}:${password}@${address}/${db}?authSource=${authSource}`
  console.log(`[connect] ${address}/${db} as ${user}`)
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useCreateIndex: false,
    useFindAndModify: false,
  })

  const total = await User.countDocuments({})
  console.log(`[users] ${total} -> ${OUT}`)

  const out = fs.createWriteStream(OUT)
  out.write("phone,username,lastConnection,balanceBTC\n")

  const start = Date.now()
  let n = 0
  let nonzero = 0
  let errors = 0

  for await (const u of User.find({}).cursor()) {
    n++
    let balance = 0
    try {
      balance = await getAccountBalance(u.accountPath, { currency: "BTC" })
    } catch (err) {
      errors++
      console.error(`[err] ${u._id}: ${(err as Error).message}`)
    }
    if (balance > 0) nonzero++

    const row = [
      csvEscape(u.phone ?? ""),
      csvEscape(u.username ?? ""),
      csvEscape(u.lastConnection ? new Date(u.lastConnection).toISOString() : ""),
      csvEscape(balance),
    ].join(",")
    out.write(row + "\n")

    if (n % 100 === 0 || n === total) {
      const elapsed = (Date.now() - start) / 1000
      const rate = n / elapsed
      const eta = (total - n) / rate
      console.log(
        `[progress] ${n}/${total} (${((n / total) * 100).toFixed(1)}%) ` +
          `nonzero=${nonzero} err=${errors} ` +
          `rate=${rate.toFixed(1)}/s eta=${eta.toFixed(0)}s`,
      )
    }
  }

  await new Promise<void>((resolve) => out.end(resolve))
  console.log(`[done] wrote ${n} rows, ${nonzero} nonzero, ${errors} errors to ${OUT}`)
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
