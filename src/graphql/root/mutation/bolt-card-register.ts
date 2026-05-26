import { GT } from "@graphql/index"
import { boltCardService } from "@services/index"
import { CreateBoltCardInput } from "@domain/bolt-cards/index.types"
import { InvalidBoltCardError } from "@domain/bolt-cards/bolt-card"
import BoltCardType from "@graphql/types/object/bolt-card"
import IError from "@graphql/types/abstract/error"
import BoltCardLimitsInput from "@graphql/types/input/bolt-card-limits-input"
import { create } from "lodash"

// Define input types
const BoltCardRegisterInput = new GT.Input({
  name: "BoltCardRegisterInput",
  fields: () => ({
    cardName: { type: GT.NonNull(GT.String) },
    uid: { type: GT.NonNull(GT.String) },
    k0: { type: GT.NonNull(GT.String) },
    k1: { type: GT.NonNull(GT.String) },
    k2: { type: GT.NonNull(GT.String) },
    k3: { type: GT.NonNull(GT.String) },
    k4: { type: GT.NonNull(GT.String) },
    limits: { type: BoltCardLimitsInput },
  }),
})

// Define payload type
const BoltCardRegisterPayload = new GT.Object({
  name: "BoltCardRegisterPayload",
  fields: () => ({
    errors: { type: GT.NonNullList(IError) },
    boltCard: { type: BoltCardType },
  }),
})

const BoltCardRegisterMutation = GT.Field({
  type: BoltCardRegisterPayload,
  args: {
    input: { type: GT.NonNull(BoltCardRegisterInput) },
  },
  resolve: async (_, { input }, { domainUser }) => {
    if (!domainUser) {
      return {
        errors: [{ message: "Not authenticated" }],
      }
    }

    try {
      // Use the user's default wallet
      const walletId = domainUser.walletPublicId

      // Prepare input for domain layer
      const createInput: CreateBoltCardInput = {
        walletId,
        cardName: input.cardName,
        uid: input.uid,
        k0: input.k0,
        k1: input.k1,
        k2: input.k2,
        k3: input.k3,
        k4: input.k4,
        txLimit: input.limits?.tx,
        dailyLimit: input.limits?.daily,
      }

      if(createInput.uid.length !== 14) {
        return {
          errors: [{ message: "Invalid UID" }],
        }
      }

      if(createInput.k0.length !== 32) {
        return {
          errors: [{ message: "Invalid k0" }],
        }
      }

      if(createInput.k1.length !== 32) {
        return {
          errors: [{ message: "Invalid k1" }],
        }
      }

      if(createInput.k2.length !== 32) {
        return {
          errors: [{ message: "Invalid k2" }],
        }
      }

      if(createInput.k3.length !== 32) {
        return {
          errors: [{ message: "Invalid k3" }],
        }
      }

      if(createInput.k4.length !== 32) {
        return {
          errors: [{ message: "Invalid k4" }],
        }
      }

      if(!createInput.cardName) {
        return {
          errors: [{ message: "Card name is required" }],
        }
      }
      
      if(!createInput.txLimit || isNaN(createInput.txLimit)) {
        return {
          errors: [{ message: "Invalid tx limit" }],
        }
      }

      if(!createInput.dailyLimit || isNaN(createInput.dailyLimit)) {
        return {
          errors: [{ message: "Invalid daily limit" }],
        }
      }
      
      // Create the card
      const card = await boltCardService.createCard(createInput)

      // Return the created card
      return {
        errors: [],
        boltCard: {
          id: card.id,
          walletId: card.walletId,
          cardName: card.cardName,
          uid: card.uid,
          enabled: card.enabled,
          txLimit: card.txLimit,
          dailyLimit: card.dailyLimit,
          createdAt: card.createdAt,
          updatedAt: card.updatedAt,
          usages: [],
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

export default BoltCardRegisterMutation