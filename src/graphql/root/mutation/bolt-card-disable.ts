import { GT } from "@graphql/index.types"
import { boltCardService } from "@services/index"
import { InvalidBoltCardError } from "@domain/bolt-cards/bolt-card"

const boltCardDisableMutation: GT.MutationResolvers["boltCardDisable"] = async (
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

    // Disable the card
    const updatedCard = await boltCardService.enableDisableCard(input.id as string, false)

    if (!updatedCard) {
      return {
        errors: [{ message: "Failed to disable card" }],
      }
    }

    // Get usages for the response
    const usages = await boltCardService.getCardUsage(updatedCard.id)

    // Return the disabled card
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

export default boltCardDisableMutation