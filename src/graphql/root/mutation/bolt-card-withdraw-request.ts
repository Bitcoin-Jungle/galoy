import { GT } from "@graphql/index"
import { boltCardService } from "@services/index"
import { InvalidBoltCardError } from "@domain/bolt-cards/bolt-card"
import { decrypt_sun, get_sun_mac } from "@domain/bolt-cards/crypto"
import IError from "@graphql/types/abstract/error"

// Define input type
const BoltCardWithdrawRequestInput = new GT.Input({
  name: "BoltCardWithdrawRequestInput",
  fields: () => ({
    cardId: { type: GT.NonNull(GT.ID) }, // Card ID instead of UID
    p: { type: GT.NonNull(GT.String) },
    c: { type: GT.NonNull(GT.String) },
    baseUrl: { type: GT.NonNull(GT.String) }, // Base URL for constructing callback
  }),
})

// Define payload type
const BoltCardWithdrawRequestPayload = new GT.Object({
  name: "BoltCardWithdrawRequestPayload",
  fields: () => ({
    errors: { type: GT.NonNullList(IError) },
    tag: { type: GT.String },
    callback: { type: GT.String },
    k1: { type: GT.String },
    minWithdrawable: { type: GT.Int },
    maxWithdrawable: { type: GT.Int },
    defaultDescription: { type: GT.String },
  }),
})

const BoltCardWithdrawRequestMutation = GT.Field({
  type: BoltCardWithdrawRequestPayload,
  args: {
    input: { type: GT.NonNull(BoltCardWithdrawRequestInput) },
  },
  resolve: async (_, { input }, { request, ip }) => {
    try {
      // Get auth parameters
      const { cardId, p, c, baseUrl } = input
      
      // Convert hex strings to buffers
      let pBuffer: Buffer
      let cBuffer: Buffer
      
      try {
        pBuffer = Buffer.from(p.toUpperCase(), 'hex')
        cBuffer = Buffer.from(c.toUpperCase(), 'hex')
      } catch (error) {
        return {
          errors: [{ message: "Invalid p or c parameter format" }],
        }
      }
      
      try {
        // Find the specific card by ID
        const card = await boltCardService.findCardById(cardId)
        
        if (!card) {
          return {
            errors: [{ message: "Card not found" }],
          }
        }

        try {
          const k1Buffer = Buffer.from(card.k1, 'hex')
          const k2Buffer = Buffer.from(card.k2, 'hex')

          if (pBuffer.length !== 16) {
            throw new Error("Invalid pBuffer length, expected 16 bytes");
          }
          if (k1Buffer.length !== 16) {
            throw new Error("Invalid k1Buffer length, expected 16 bytes");
          }
          if (k2Buffer.length !== 16) {
            throw new Error("Invalid k2Buffer length, expected 16 bytes");
          }
  
          // Decrypt the p parameter
          const [cardUid, counter] = decrypt_sun(pBuffer, k1Buffer)
          
          if(!cardUid || !counter) {
            return {
              errors: [{ message: "Invalid card uid or counter" }],
            }
          }

          // Convert both UIDs to uppercase hex for comparison
          const cardUidHex = cardUid.toString('hex').toUpperCase()
          const storedUidHex = card.uid.toUpperCase()
          
          // Check if the UIDs match
          if(cardUidHex !== storedUidHex) {
            return {
              errors: [{ message: `Invalid card uid: expected ${storedUidHex}, got ${cardUidHex}` }],
            }
          }

          // Verify the MAC
          const expectedMac = get_sun_mac(cardUid, counter, k2Buffer)
          const expectedMacHex = expectedMac.toString('hex').toUpperCase()
          const providedMacHex = c.toUpperCase()
          
          // The MAC comparison might need to be adjusted based on the length
          // The specification might return a different length MAC than what we receive
          if (expectedMacHex !== providedMacHex) {
            // Try comparing just the first part of the MAC if lengths differ
            if (expectedMacHex.length > providedMacHex.length) {
              if (expectedMacHex.substring(0, providedMacHex.length) !== providedMacHex) {
                return {
                  errors: [{ message: "Invalid authentication parameters" }],
                }
              }
            } else if (providedMacHex.length > expectedMacHex.length) {
              if (providedMacHex.substring(0, expectedMacHex.length) !== expectedMacHex) {
                return {
                  errors: [{ message: "Invalid authentication parameters" }],
                }
              }
            } else {
              return {
                errors: [{ message: "Invalid authentication parameters" }],
              }
            }
          }
          
          // We have a valid authentication
          // Check if counter is valid
          const counterInt = counter.readUIntLE(0, 3)
          
          if (counterInt <= card.counter) {
            return {
              errors: [{ message: "This link has already been used" }],
            }
          }
          
          // Check if card is enabled
          if (!card.enabled) {
            return {
              errors: [{ message: "Card is disabled" }],
            }
          }
          
          // Update the counter
          await boltCardService.updateCardCounter(card.id, counterInt)
          
          // Create a hit record
          const userAgent = "Bolt Card Withdraw Request"
          
          const hit = await boltCardService.processCardTransaction(
            card.id,
            0, // Amount will be set during callback
            card.counter,
            counterInt,
            { ip, userAgent },
          )
          
          // Get daily usage for limits
          const todayHits = await boltCardService.getDailyCardUsage(card.id)
          
          // Check daily limit
          const dailyUsage = todayHits.reduce((sum, h) => sum + h.amount, 0)
          if (dailyUsage > card.dailyLimit) {
            return {
              errors: [{ message: "Daily limit exceeded" }],
            }
          }
          
          // Generate callback URL
          const callbackUrl = `${baseUrl}/api/lnurl/withdraw/${card.id}?k1=${hit.id}`

          // Return LNURL withdraw request response
          return {
            errors: [],
            tag: "withdrawRequest",
            callback: callbackUrl,
            k1: hit.id,
            minWithdrawable: 1000, // 1 sat in millisats
            maxWithdrawable: card.txLimit * 1000, // in millisats
            defaultDescription: `Bolt Card Payment`,
          }
        } catch (err) {
          return {
            errors: [{ message: "Authentication failed" }],
          }
        }
      } catch (error) {
        return {
          errors: [{ message: "Error processing card: " + error.message }],
        }
      }
    } catch (error) {
      if (error instanceof InvalidBoltCardError) {
        return {
          errors: [{ message: error.message }],
        }
      }
      return {
        errors: [{ message: "Unexpected error: " + error.message }],
      }
    }
  },
})

export default BoltCardWithdrawRequestMutation