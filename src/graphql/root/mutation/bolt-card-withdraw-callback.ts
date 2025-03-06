import { GT } from "@graphql/index.types"
import { boltCardService } from "@services/index"
import { InvalidBoltCardError } from "@domain/bolt-cards/bolt-card"

// This is a stub implementation - the full withdrawal feature would be implemented later
const boltCardWithdrawCallbackMutation: GT.MutationResolvers["boltCardWithdrawCallback"] = async (
  _,
  { input },
) => {
  try {
    // Get the card 
    const card = await boltCardService.findCardById(input.id as string)
    
    if (!card) {
      return {
        errors: [{ message: "Card not found" }],
      }
    }
    
    // In a real implementation, this would process a withdrawal callback
    // For now, we just return success
    return {
      errors: [],
      success: true,
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

export default boltCardWithdrawCallbackMutation