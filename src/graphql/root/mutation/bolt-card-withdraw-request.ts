import { GT } from "@graphql/index.types"
import { boltCardService } from "@services/index"
import { InvalidBoltCardError } from "@domain/bolt-cards/bolt-card"

// This is a stub implementation - the full withdrawal feature would be implemented later
const boltCardWithdrawRequestMutation: GT.MutationResolvers["boltCardWithdrawRequest"] = async (
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

    // In a real implementation, this would initiate a withdrawal process
    // For now, we just return a mock status
    return {
      errors: [],
      status: "PENDING",
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

export default boltCardWithdrawRequestMutation