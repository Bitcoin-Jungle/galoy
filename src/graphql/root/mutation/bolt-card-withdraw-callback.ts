import { GT } from "@graphql/index"
import { boltCardService } from "@services/index"
import { InvalidBoltCardError } from "@domain/bolt-cards/bolt-card"
import IError from "@graphql/types/abstract/error"
import { lnInvoicePaymentSend } from "@app/wallets"
import { decodeInvoice } from "@domain/bitcoin/lightning"
import { baseLogger } from "@services/logger"
import { UsersRepository } from "@services/mongoose/users"
import { WalletsRepository } from "@services/mongoose/wallets"

// Define input type
const BoltCardWithdrawCallbackInput = new GT.Input({
  name: "BoltCardWithdrawCallbackInput",
  fields: () => ({
    k1: { type: GT.NonNull(GT.String) },
    pr: { type: GT.NonNull(GT.String) },
  }),
})

// Define payload type
const BoltCardWithdrawCallbackPayload = new GT.Object({
  name: "BoltCardWithdrawCallbackPayload",
  fields: () => ({
    errors: { type: GT.NonNullList(IError) },
    status: { type: GT.String },
  }),
})

const BoltCardWithdrawCallbackMutation = GT.Field({
  type: BoltCardWithdrawCallbackPayload,
  args: {
    input: { type: GT.NonNull(BoltCardWithdrawCallbackInput) },
  },
  resolve: async (_, { input }) => {
    try {
      const { k1, pr } = input
      
      // Find the card usage (hit) by k1 parameter
      const hit = await boltCardService.findCardUsageById(k1 as `bolt-card-usage:${string}`)
      
      if (!hit) {
        return {
          errors: [{ message: "Record not found for this charge (invalid k1)" }],
        }
      }
      
      // Check if the hit has already been spent
      if (hit.spent) {
        return {
          errors: [{ message: "Payment already claimed" }],
        }
      }
      
      // Get the card associated with this hit
      const card = await boltCardService.findCardById(hit.cardId)
      
      if (!card) {
        return {
          errors: [{ message: "Card not found" }],
        }
      }
      
      // Check if card is still enabled
      if (!card.enabled) {
        return {
          errors: [{ message: "Card is disabled" }],
        }
      }
      
      // Check the payment request format
      let invoice
      try {
        invoice = await decodeInvoice(pr)
      } catch (error) {
        return {
          errors: [{ message: "Failed to decode payment request" }],
        }
      }
      
      // Check amount is within limits
      const satAmount = invoice.amount || 0
      if (satAmount > card.txLimit) {
        return {
          errors: [{ message: `Amount exceeds card transaction limit of ${card.txLimit} sats` }],
        }
      }
      
      // Check daily limit
      const dailyUsage = await boltCardService.getDailyCardUsage(card.id)
      const totalSpent = dailyUsage.reduce((sum, usage) => sum + usage.amount, 0)
      
      if (totalSpent + satAmount > card.dailyLimit) {
        return {
          errors: [{ message: `Amount would exceed daily limit of ${card.dailyLimit} sats` }],
        }
      }
      
      // Mark the hit as spent with the correct amount
      await boltCardService.spendCardUsage(hit.id, satAmount)
      
      try {
        // Find the user associated with this wallet
        const usersRepo = UsersRepository()
        
        // The card.walletId is already the wallet public ID
        const user = await usersRepo.findByWalletPublicId(card.walletId as any)
        
        if (user instanceof Error) {
          return {
            errors: [{ message: `Failed to find user for wallet: ${user.message}` }],
          }
        }
        
        // Get the wallet to get the internal wallet ID
        const walletsRepo = WalletsRepository()
        const wallet = await walletsRepo.findByPublicId(card.walletId as any)
        
        if (wallet instanceof Error) {
          return {
            errors: [{ message: `Failed to find wallet: ${wallet.message}` }],
          }
        }
        
        // Pay the invoice using the existing ln-send-payment functionality
        const paymentResult = await lnInvoicePaymentSend({
          paymentRequest: pr,
          memo: "Bolt Card withdrawal",
          walletId: wallet.id, // Internal wallet ID
          userId: user.id, // User ID
          logger: baseLogger,
        })
        
        if (paymentResult instanceof Error) {
          throw paymentResult
        }
        
        return {
          errors: [],
          status: "OK",
        }
      } catch (error) {
        // Payment failed, reset the "spent" flag
        await boltCardService.unspendCardUsage(hit.id)
        
        return {
          errors: [{ message: `Payment failed - ${error.message}` }],
        }
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

export default BoltCardWithdrawCallbackMutation