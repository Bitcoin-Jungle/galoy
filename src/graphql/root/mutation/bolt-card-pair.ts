import { GT } from "@graphql/index"
import { boltCardService } from "@services/index"
import { InvalidBoltCardError } from "@domain/bolt-cards/bolt-card"
import IError from "@graphql/types/abstract/error"

// Define input type
const BoltCardPairInput = new GT.Input({
  name: "BoltCardPairInput",
  fields: () => ({
    otp: { type: GT.NonNull(GT.String) },
    baseUrl: { type: GT.NonNull(GT.String) }, // Base URL for constructing lnurlw
  }),
})

// Define response type
const BoltCardPairPayload = new GT.Object({
  name: "BoltCardPairPayload",
  fields: () => ({
    errors: { type: GT.NonNullList(IError) },
    cardName: { type: GT.String },
    k0: { type: GT.String },
    k1: { type: GT.String },
    k2: { type: GT.String },
    k3: { type: GT.String },
    k4: { type: GT.String },
    lnurlwBase: { type: GT.String },
    protocolName: { type: GT.String },
    protocolVersion: { type: GT.String },
  }),
})

const BoltCardPairMutation = GT.Field({
  type: BoltCardPairPayload,
  args: {
    input: { type: GT.NonNull(BoltCardPairInput) },
  },
  resolve: async (_, { input }, { request }) => {
    try {
      const { otp, baseUrl } = input
      
      // Find the card by OTP
      const card = await boltCardService.findCardByOtp(otp)
      
      if (!card) {
        return {
          errors: [{ message: "Invalid OTP or card not found" }],
        }
      }
      
      // Clear the OTP to ensure one-time use
      const updatedCard = await boltCardService.clearCardOtp(card.id)
      
      if (!updatedCard) {
        return {
          errors: [{ message: "Failed to clear OTP" }],
        }
      }
      
      // Construct the lnurlw base URL
      const lnurlwBase = `lnurlw://${new URL(baseUrl).host}/api/lnurl/withdraw/${card.id}`
      
      // Return the card information
      return {
        errors: [],
        cardName: card.cardName,
        k0: card.k0,
        k1: card.k1,
        k2: card.k2,
        k3: card.k3,
        k4: card.k4,
        lnurlwBase: lnurlwBase,
        protocolName: "bolt_card_response",
        protocolVersion: "1",
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

export default BoltCardPairMutation 