import { GT } from "@graphql/index"
import { boltCardService } from "@services/index"
import BoltCardType from "@graphql/types/object/bolt-card"
import { BoltCard } from "@domain/bolt-cards/index.types"

const BoltCardsQuery = GT.Field({
  type: GT.NonNullList(BoltCardType),
  resolve: async (_, __, { domainUser }) => {
    if (!domainUser) {
      throw new Error("User not authenticated")
    }

    try {
      // Get cards for the user's default wallet
      const walletId = domainUser.walletPublicId
      const cards = await boltCardService.findCardsByWalletId(walletId)
      
      // Map from domain model to GraphQL type
      return Promise.all(cards.map(async (card) => {
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
      }))
    } catch (error) {
      throw error
    }
  },
})

export default BoltCardsQuery