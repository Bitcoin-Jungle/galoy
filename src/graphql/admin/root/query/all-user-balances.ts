import { GT } from "@graphql/index"

import Phone from "@graphql/types/scalar/phone"
import Username from "@graphql/types/scalar/username"

import { User } from "@services/mongoose/schema"

import { baseLogger } from "@services/logger"

import { WalletFactory } from "@core/wallet-factory"

const logger = baseLogger.child({ module: "dailyBalanceNotification" })

const UserBalance = new GT.Object({
  name: "UserBalance",
  fields: () => ({
    phone: { type: GT.NonNull(Phone) },
    username: { type: Username },
    balance: { type: GT.Float },
    lastConnection: { type: GT.String },
  }),
})

const AllUserBalancesQuery = GT.Field({
  type: GT.NonNullList(UserBalance),
  args: { },
  resolve: async (parent) => {
    const users = await User.getActiveUsers({})
    const output = []

    for (const user of users) {
      const userWallet = await WalletFactory({ user, logger })
      const balance = await userWallet.getBalances()

      console.log({phone: user.phone, username: user.username, lastConnection: user.lastConnection, balance: balance.BTC})
      //@ts-ignore
      output.push({phone: user.phone, username: user.username, lastConnection: user.lastConnection, balance: balance.BTC})
    }

    return output
  },
})

export default AllUserBalancesQuery
