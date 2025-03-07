import { GT } from "@graphql/index"
import { boltCardService } from "@services/index"
import { InvalidBoltCardError } from "@domain/bolt-cards/bolt-card"
import BoltCardType from "@graphql/types/object/bolt-card"
import { BoltCard, BoltCardId } from "@domain/bolt-cards/index.types"

const BoltCardQuery = GT.Field({
  type: BoltCardType,
  args: {
    id: { type: GT.NonNull(GT.ID) },
  },
  resolve: async (_, { id }, { domainUser }) => {
    if (!domainUser) {
      throw new Error("User not authenticated")
    }

    try {
      const card = await boltCardService.findCardById(id as `bolt-card:${string}`)
      
      if (!card) {
        throw new InvalidBoltCardError(`Card with ID ${id} not found`)
      }
      
      // Ensure the user can only access their own cards
      if (card.walletId !== domainUser.walletPublicId) {
        throw new Error("Unauthorized: Card does not belong to user")
      }
      
      // Map from domain model to GraphQL type
      const usages = await boltCardService.getCardUsage(card.id)
      
      return {
        id: card.id,
        walletId: card.walletId,
        cardName: card.cardName,
        uid: card.uid,
        enabled: card.enabled,
        txLimit: card.txLimit,
        dailyLimit: card.dailyLimit,
        createdAt: card.createdAt,
        updatedAt: card.updatedAt,
        // Get last usage time if any
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
      }
    } catch (error) {
      throw error
    }
  },
})

export default BoltCardQuery