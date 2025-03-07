import { GT } from "@graphql/index"

import Timestamp from "../scalar/timestamp"
import WalletId from "../scalar/wallet-id"

const CardUsage = new GT.Object({
  name: "CardUsage",
  fields: () => ({
    id: { type: GT.NonNullID },
    amount: { type: GT.NonNull(GT.Int) },
    oldCounter: { type: GT.NonNull(GT.Int) },
    newCounter: { type: GT.NonNull(GT.Int) },
    createdAt: { type: GT.NonNull(Timestamp) },
    ip: { type: GT.String },
    userAgent: { type: GT.String },
  }),
})

const BoltCard = new GT.Object({
  name: "BoltCard",
  fields: () => ({
    id: { type: GT.NonNullID },
    walletId: { type: GT.NonNull(WalletId) },
    cardName: { type: GT.NonNull(GT.String) },
    uid: { type: GT.NonNull(GT.String) },
    enabled: { type: GT.NonNull(GT.Boolean) },
    txLimit: { type: GT.NonNull(GT.Int) },
    dailyLimit: { type: GT.NonNull(GT.Int) },
    createdAt: { type: GT.NonNull(Timestamp) },
    updatedAt: { type: GT.NonNull(Timestamp) },
    lastUsedAt: { type: Timestamp },
    usages: { type: GT.NonNullList(CardUsage) },
  }),
})

export default BoltCard 