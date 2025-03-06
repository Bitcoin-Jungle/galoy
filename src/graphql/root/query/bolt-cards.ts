import { GT } from "@graphql/index.types"
import { boltCardService } from "@services/index"

const boltCardsQuery: GT.QueryResolvers["boltCards"] = async (_, __, { user }) => {
  if (!user) {
    throw new Error("User not authenticated")
  }

  try {
    // Get all wallets for the user
    const walletIds = user.defaultAccount.wallets.map((wallet) => wallet.id)
    
    // Get all cards for each wallet
    const allCardsPromises = walletIds.map((walletId) => 
      boltCardService.findCardsByWalletId(walletId)
    )
    
    const allCardsArrays = await Promise.all(allCardsPromises)
    
    // Flatten the array of arrays
    const allCards = allCardsArrays.flat()
    
    // Map from domain model to GraphQL type
    return Promise.all(allCards.map(async (card) => {
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
}

export default boltCardsQuery