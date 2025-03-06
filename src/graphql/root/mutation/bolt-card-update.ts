import { GT } from "@graphql/index.types"
import { boltCardService } from "@services/index"
import { UpdateBoltCardInput } from "@domain/bolt-cards/index.types"
import { InvalidBoltCardError } from "@domain/bolt-cards/bolt-card"

const boltCardUpdateMutation: GT.MutationResolvers["boltCardUpdate"] = async (
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
    // Get the card to ensure it belongs to the user
    const card = await boltCardService.findCardById(input.id as string)
    
    if (!card) {
      return {
        errors: [{ message: "Card not found" }],
      }
    }
    
    // Validate wallet belongs to user
    const walletIds = user.defaultAccount.wallets.map((wallet) => wallet.id)
    if (!walletIds.includes(card.walletId)) {
      return {
        errors: [{ message: "Card does not belong to user" }],
      }
    }

    // Prepare input for domain layer
    const updateInput: UpdateBoltCardInput = {
      id: input.id as string,
      cardName: input.cardName,
      enabled: input.enabled,
      txLimit: input.limits?.tx,
      dailyLimit: input.limits?.daily,
    }

    // Update the card
    const updatedCard = await boltCardService.updateCard(updateInput)

    if (!updatedCard) {
      return {
        errors: [{ message: "Failed to update card" }],
      }
    }

    // Get usages for the response
    const usages = await boltCardService.getCardUsage(updatedCard.id)

    // Return the updated card
    return {
      errors: [],
      boltCard: {
        id: updatedCard.id,
        walletId: updatedCard.walletId,
        cardName: updatedCard.cardName,
        uid: updatedCard.uid,
        enabled: updatedCard.enabled,
        txLimit: updatedCard.txLimit,
        dailyLimit: updatedCard.dailyLimit,
        createdAt: updatedCard.createdAt,
        updatedAt: updatedCard.updatedAt,
        lastUsedAt: usages.length > 0 ? usages[0].createdAt : null,
        usages: usages.map((usage) => ({
          id: usage.id,
          amount: usage.amount,
          oldCounter: usage.oldCounter,
          newCounter: usage.newCounter,
          createdAt: usage.createdAt,
          ip: usage.ip,
          userAgent: usage.userAgent,
        })),
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

export default boltCardUpdateMutation