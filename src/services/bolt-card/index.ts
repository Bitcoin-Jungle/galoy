import {
  BoltCard,
  BoltCardId,
  BoltCardsRepository,
  CardUsage,
  CardUsageId,
  CreateBoltCardInput,
  UpdateBoltCardInput,
  WalletId,
  UpdateCardUsageInput
} from "../../domain/bolt-cards/index.types"
import {
  validateCardTransaction,
  createCardUsage,
  createCardUsageId,
  BoltCardDisabledError,
  BoltCardLimitExceededError,
  InvalidBoltCardError,
} from "../../domain/bolt-cards/bolt-card"
import crypto from 'crypto'

// Pairing OTPs hand out the card keys, so they must be short-lived
export const BOLT_CARD_OTP_VALIDITY_MS = 15 * 60 * 1000

export class BoltCardService {
  constructor(private readonly boltCardsRepository: BoltCardsRepository) {}

  async findCardById(id: BoltCardId): Promise<BoltCard | null> {
    return this.boltCardsRepository.findById(id)
  }

  async findCardsByWalletId(walletId: string): Promise<BoltCard[]> {
    return this.boltCardsRepository.findByWalletId(walletId as WalletId)
  }

  async findCardByUid(uid: string): Promise<BoltCard | null> {
    return this.boltCardsRepository.findByUid(uid)
  }

  async createCard(input: CreateBoltCardInput): Promise<BoltCard> {
    return this.boltCardsRepository.save(input)
  }

  async updateCard(input: UpdateBoltCardInput): Promise<BoltCard | null> {
    return this.boltCardsRepository.update(input)
  }

  async enableDisableCard(id: BoltCardId, enabled: boolean): Promise<BoltCard | null> {
    return this.boltCardsRepository.update({ id, enabled })
  }

  async getCardUsage(cardId: BoltCardId): Promise<CardUsage[]> {
    return this.boltCardsRepository.findCardUsagesByCardId(cardId)
  }

  async processCardTransaction(
    cardId: BoltCardId,
    amount: number,
    oldCounter: number,
    newCounter: number,
    requestMetadata: { ip?: string; userAgent?: string } = {},
  ): Promise<CardUsage> {
    // Get the card
    const card = await this.boltCardsRepository.findById(cardId)
    if (!card) {
      throw new InvalidBoltCardError(`Card with ID ${cardId} not found`)
    }

    // Get daily usage
    const dailyUsage = await this.boltCardsRepository.getDailyCardUsage(cardId)

    // Validate the transaction
    validateCardTransaction(card, amount, dailyUsage)

    // Record usage
    const usage = createCardUsage(cardId, amount, oldCounter, newCounter, requestMetadata)
    return this.boltCardsRepository.recordCardUsage(usage)
  }

  async updateCardCounter(cardId: BoltCardId, newCounter: number): Promise<BoltCard | null> {
    // Atomic compare-and-set: returns null if the stored counter is already >= newCounter
    return this.boltCardsRepository.advanceCounter(cardId, newCounter)
  }

  // New methods for bolt card withdrawal functionality

  /**
   * Find a card usage record by its ID
   */
  async findCardUsageById(usageId: CardUsageId): Promise<CardUsage | null> {
    return this.boltCardsRepository.findCardUsageById(usageId)
  }

  /**
   * Get all card usage records for a card within the current day
   */
  async getDailyCardUsage(cardId: BoltCardId): Promise<CardUsage[]> {
    return this.boltCardsRepository.getDailyCardUsage(cardId)
  }

  /**
   * Mark a card usage record as spent with a specific amount
   */
  async spendCardUsage(usageId: CardUsageId, amount: number): Promise<CardUsage | null> {
    // Atomic: returns null if the usage was already spent
    return this.boltCardsRepository.markCardUsageSpent(usageId, amount)
  }

  /**
   * Reset a card usage record's spent status (used when a payment fails)
   */
  async unspendCardUsage(usageId: CardUsageId): Promise<CardUsage | null> {
    return this.boltCardsRepository.updateCardUsage(usageId, {
      spent: false,
      spentAt: null,
    })
  }

  /**
   * Validate and record a new card transaction
   */
  async validateAndRecordTransaction(
    card: BoltCard,
    amount: number,
    oldCounter: number,
    newCounter: number,
    ip?: string,
    userAgent?: string
  ): Promise<CardUsage> {
    // Get daily usage for this card
    const dailyUsage = await this.getDailyCardUsage(card.id)
    
    // Call the validation function with the daily usage array
    validateCardTransaction(card, amount, dailyUsage)
    
    // Create the usage record
    const usage = {
      cardId: card.id,
      amount,
      oldCounter,
      newCounter,
      spent: false,
      ip,
      userAgent,
    }
    
    // Record the usage and return the result
    return this.boltCardsRepository.recordCardUsage(usage)
  }

  /**
   * Generate a random OTP for a card and save it
   * @param cardId The ID of the card to generate an OTP for
   * @returns The generated OTP or null if the card doesn't exist
   */
  async generateCardOtp(cardId: BoltCardId): Promise<string | null> {
    const card = await this.boltCardsRepository.findById(cardId)
    if (!card) return null

    // Generate a random 16-byte OTP
    const otp = crypto.randomBytes(16).toString('hex')

    // Update the card with the new OTP (and the time it was issued, for expiry)
    const updated = await this.boltCardsRepository.setOtp(cardId, otp)

    return updated ? otp : null
  }

  /**
   * Find a card by its OTP
   * @param otp The OTP to look up
   * @returns The card if found, null otherwise
   */
  async findCardByOtp(otp: string): Promise<BoltCard | null> {
    return this.boltCardsRepository.findByOtp(otp)
  }

  /**
   * Atomically redeem an OTP: returns the card and clears the OTP, or null if
   * the OTP is unknown, already used, or older than BOLT_CARD_OTP_VALIDITY_MS
   */
  async consumeCardOtp(otp: string): Promise<BoltCard | null> {
    return this.boltCardsRepository.consumeOtp(otp, BOLT_CARD_OTP_VALIDITY_MS)
  }

  /**
   * Clear the OTP for a card after it's been used
   * @param cardId The ID of the card to clear the OTP for
   * @returns The updated card or null if the card doesn't exist
   */
  async clearCardOtp(cardId: BoltCardId): Promise<BoltCard | null> {
    return this.boltCardsRepository.update({
      id: cardId,
      otp: null,
    } as any) // Using 'any' as otp isn't in UpdateBoltCardInput
  }
}