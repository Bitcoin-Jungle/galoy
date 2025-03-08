import { GT } from "@graphql/index"
import { boltCardService } from "@services/index"
import { UpdateBoltCardInput } from "@domain/bolt-cards/index.types"
import { InvalidBoltCardError } from "@domain/bolt-cards/bolt-card"
import BoltCardType from "@graphql/types/object/bolt-card"
import IError from "@graphql/types/abstract/error"
import BoltCardLimitsInput from "@graphql/types/input/bolt-card-limits-input"

// Define input types
const BoltCardUpdateInput = new GT.Input({
  name: "BoltCardUpdateInput",
  fields: () => ({
    id: { type: GT.NonNull(GT.ID) },
    cardName: { type: GT.String },
    enabled: { type: GT.Boolean },
    limits: { type: BoltCardLimitsInput },
  }),
})

// Define payload type
const BoltCardUpdatePayload = new GT.Object({
  name: "BoltCardUpdatePayload",
  fields: () => ({
    errors: { type: GT.NonNullList(IError) },
    boltCard: { type: BoltCardType },
  }),
})

const BoltCardUpdateMutation = GT.Field({
  type: BoltCardUpdatePayload,
  args: {
    input: { type: GT.NonNull(BoltCardUpdateInput) },
  },
  resolve: async (_, { input }, { domainUser }) => {
    if (!domainUser) {
      return {
        errors: [{ message: "Not authenticated" }],
      }
    }

    try {
      // Get the card to ensure it belongs to the user
      const card = await boltCardService.findCardById(input.id as `bolt-card:${string}`)
      
      if (!card) {
        return {
          errors: [{ message: "Card not found" }],
        }
      }
      
      // Validate card belongs to user's default wallet
      if (card.walletId !== domainUser.walletPublicId) {
        return {
          errors: [{ message: "Card does not belong to user" }],
        }
      }

      // Prepare input for domain layer
      const updateInput: UpdateBoltCardInput = {
        id: input.id as `bolt-card:${string}`,
        cardName: input.cardName,
        enabled: input.enabled,
        txLimit: input.limits?.tx,
        dailyLimit: input.limits?.daily,
      }

      if(!updateInput.txLimit) {
        updateInput.txLimit = undefined
      } 

      if(!updateInput.dailyLimit) {
        updateInput.dailyLimit = undefined
      }
      
      if(!updateInput.cardName) {
        return {
          errors: [{ message: "Card name is required" }],
        }
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
  },
})

export default BoltCardUpdateMutation