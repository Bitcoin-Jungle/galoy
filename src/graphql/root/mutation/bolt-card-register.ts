import { GT } from "@graphql/index.types"
import { boltCardService } from "@services/index"
import { CreateBoltCardInput } from "@domain/bolt-cards/index.types"
import { InvalidBoltCardError } from "@domain/bolt-cards/bolt-card"

const boltCardRegisterMutation: GT.MutationResolvers["boltCardRegister"] = async (
  _,
  { input },
  { user },
) => {
  if (!user) {
    return {
      errors: [{ message: "Not authenticated" }],
    }
  }

  try {
    // Validate wallet belongs to user
    const walletIds = user.defaultAccount.wallets.map((wallet) => wallet.id)
    if (!walletIds.includes(input.walletId)) {
      return {
        errors: [{ message: "Wallet does not belong to user" }],
      }
    }

    // Prepare input for domain layer
    const createInput: CreateBoltCardInput = {
      walletId: input.walletId,
      cardName: input.cardName,
      uid: input.uid,
      k0: input.k0,
      k1: input.k1,
      k2: input.k2,
      txLimit: input.limits?.tx,
      dailyLimit: input.limits?.daily,
    }

    // Create the card
    const card = await boltCardService.createCard(createInput)

    // Return the created card
    return {
      errors: [],
      boltCard: {
        id: card.id,
        walletId: card.walletId,
        cardName: card.cardName,
        uid: card.uid,
        enabled: card.enabled,
        txLimit: card.txLimit,
        dailyLimit: card.dailyLimit,
        createdAt: card.createdAt,
        updatedAt: card.updatedAt,
        usages: [],
      },
    }
  } catch (error) {
    if (error instanceof InvalidBoltCardError) {
      return {
        errors: [{ message: error.message }],
      }
    }
    throw error
  }
}

export default boltCardRegisterMutation