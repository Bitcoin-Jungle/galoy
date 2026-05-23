import dedent from "dedent"
import { GT } from "@graphql/index"

import { connectionArgs, connectionFromArray } from "graphql-relay"
import { TransactionConnection } from "./transaction"
import * as Wallets from "@app/wallets"

import ContactAlias from "../scalar/contact-alias"
import * as Accounts from "@app/accounts"
import Username from "../scalar/username"
import LightningAddress from "../scalar/lightning-address"
import { checkedToUsername } from "@domain/users"

const UserContact = new GT.Object({
  name: "UserContact",
  fields: () => ({
    id: { type: GT.NonNull(GT.ID) },
    username: {
      type: Username,
      description: "Galoy username for internal contacts.",
    },
    lightningAddress: {
      type: LightningAddress,
      description: "Lightning address for external contacts.",
    },
    alias: {
      type: ContactAlias,
      description: dedent`Alias the user can set for this contact.
        Only the user can see the alias attached to their contact.`,
    },
    transactionsCount: {
      type: GT.NonNull(GT.Int),
    },
    transactions: {
      type: TransactionConnection,
      args: connectionArgs,
      resolve: async (source, args, { domainUser }) => {
        if (!source.username) {
          return connectionFromArray([], args)
        }

        const contactUsername = checkedToUsername(source.username)

        if (contactUsername instanceof Error) {
          throw contactUsername
        }

        // TODO: figure out what to do here when we have multiple accounts
        const account = await Accounts.getAccount(domainUser.defaultAccountId)

        if (account instanceof Error) {
          throw account
        }

        const transactions = await Wallets.getAccountTransactionsForContact({
          account,
          contactUsername,
        })

        if (transactions instanceof Error) {
          throw transactions
        }

        return connectionFromArray(transactions, args)
      },
      description: "Paginated list of transactions sent to/from this contact.",
    },
  }),
})

export default UserContact
