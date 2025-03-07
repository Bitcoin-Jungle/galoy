import { GT } from "@graphql/index"
import { boltCardService } from "@services/index"
import { InvalidBoltCardError } from "@domain/bolt-cards/bolt-card"
import IError from "@graphql/types/abstract/error"

// Define input type
const BoltCardGenerateOtpInput = new GT.Input({
  name: "BoltCardGenerateOtpInput",
  fields: () => ({
    cardId: { type: GT.NonNull(GT.ID) },
  }),
})

// Define payload type
const BoltCardGenerateOtpPayload = new GT.Object({
  name: "BoltCardGenerateOtpPayload",
  fields: () => ({
    errors: { type: GT.NonNullList(IError) },
    otp: { type: GT.String },
  }),
})

const BoltCardGenerateOtpMutation = GT.Field({
  type: BoltCardGenerateOtpPayload,
  args: {
    input: { type: GT.NonNull(BoltCardGenerateOtpInput) },
  },
  resolve: async (_, { input }, { domainUser }) => {
    if (!domainUser) {
      return {
        errors: [{ message: "Not authenticated" }],
      }
    }

    try {
      const { cardId } = input
      
      // Get the card to ensure it belongs to the user
      const card = await boltCardService.findCardById(cardId as `bolt-card:${string}`)
      
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

      // Generate a new OTP for the card
      const otp = await boltCardService.generateCardOtp(card.id)
      
      if (!otp) {
        return {
          errors: [{ message: "Failed to generate OTP" }],
        }
      }

      return {
        errors: [],
        otp,
      }
    } catch (error) {
      if (error instanceof InvalidBoltCardError) {
        return {
          errors: [{ message: error.message }],
        }
      }
      return {
        errors: [{ message: `Unexpected error: ${error.message}` }],
      }
    }
  },
})

export default BoltCardGenerateOtpMutation 