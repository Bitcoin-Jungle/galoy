import { GT } from "@graphql/index"

import { USER_PRICE_UPDATE_EVENT, walletUpdateEvent } from "@config/app"
import pubsub from "@services/pubsub"
import { getCurrentPrice } from "@app/prices"
import IError from "@graphql/types/abstract/error"
import Price from "@graphql/types/object/price"
import PaymentHash from "@graphql/types/scalar/payment-hash"
import InvoicePaymentStatus from "@graphql/types/scalar/invoice-payment-status"
import SatAmount from "@graphql/types/scalar/sat-amount"
import OnChainTxHash from "@graphql/types/scalar/onchain-tx-hash"
import TxNotificationType from "@graphql/types/scalar/tx-notification-type"
import GraphQLUser from "@graphql/types/object/graphql-user"

const IntraLedgerUpdate = new GT.Object({
  name: "IntraLedgerUpdate",
  fields: () => ({
    txNotificationType: { type: GT.NonNull(TxNotificationType) },
    amount: { type: GT.NonNull(SatAmount) },
    usdPerSat: { type: GT.NonNull(GT.Float) },
  }),
})

const LnUpdate = new GT.Object({
  name: "LnUpdate",
  fields: () => ({
    paymentHash: { type: GT.NonNull(PaymentHash) },
    status: { type: GT.NonNull(InvoicePaymentStatus) },
  }),
})

const OnChainUpdate = new GT.Object({
  name: "OnChainUpdate",
  fields: () => ({
    txNotificationType: { type: GT.NonNull(TxNotificationType) },
    txHash: { type: GT.NonNull(OnChainTxHash) },
    amount: { type: GT.NonNull(SatAmount) },
    usdPerSat: { type: GT.NonNull(GT.Float) },
  }),
})

const UserUpdate = new GT.Union({
  name: "UserUpdate",
  types: [Price, LnUpdate, OnChainUpdate, IntraLedgerUpdate],
  resolveType: (obj) => obj.resolveType,
})

const MyUpdatesPayload = new GT.Object({
  name: "MyUpdatesPayload",
  fields: () => ({
    errors: { type: GT.NonNullList(IError) },
    update: { type: UserUpdate },
    me: { type: GraphQLUser },
  }),
})

const userPayload = (domainUser) => (updateData) => ({
  errors: [],
  me: domainUser,
  update: updateData,
})

const MeSubscription = {
  type: GT.NonNull(MyUpdatesPayload),
  resolve: (source, args, ctx) => {
    if (!ctx.uid) {
      throw new Error("Not Authenticated")
    }

    if (source.errors) {
      return { errors: source.errors }
    }

    const myPayload = userPayload(ctx.domainUser)

    if (source.price) {
      return myPayload({
        resolveType: "Price",
        base: Math.round(source.price.satUsdCentPrice * 10 ** 12),
        offset: 12,
        currencyUnit: "USDCENT",
        formattedAmount: source.price.satUsdCentPrice.toString(),
      })
    }

    if (source.invoice) {
      return myPayload({ resolveType: "LnUpdate", ...source.invoice })
    }

    if (source.transaction) {
      return myPayload({ resolveType: "OnChainUpdate", ...source.transaction })
    }

    if (source.intraLedger) {
      return myPayload({ resolveType: "IntraLedgerUpdate", ...source.invoice })
    }
  },

  subscribe: async (source, args, ctx) => {
    if (!ctx.uid) {
      throw new Error("Not Authenticated")
    }

    const satUsdPrice = await getCurrentPrice()
    if (!(satUsdPrice instanceof Error)) {
      pubsub.publishImmediate(USER_PRICE_UPDATE_EVENT, {
        price: { satUsdCentPrice: 100 * satUsdPrice },
      })
    }

    return pubsub.asyncIterator([USER_PRICE_UPDATE_EVENT, walletUpdateEvent(ctx.uid)])
  },
}

export default MeSubscription
