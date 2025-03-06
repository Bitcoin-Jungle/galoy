import {
  BoltCard,
  BoltCardId,
  BoltCardsRepository,
  CardUsage,
  CardUsageId,
  CreateBoltCardInput,
  UpdateBoltCardInput,
  WalletId
} from "../../domain/bolt-cards/index.types"
import {
  validateCardTransaction,
  createCardUsage,
  BoltCardDisabledError,
  BoltCardLimitExceededError,
  InvalidBoltCardError,
} from "../../domain/bolt-cards/bolt-card"

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
    const card = await this.boltCardsRepository.findById(cardId)
    if (!card) {
      throw new InvalidBoltCardError(`Card with ID ${cardId} not found`)
    }

    if (newCounter <= card.counter) {
      throw new InvalidBoltCardError(
        `New counter value must be greater than current counter (${card.counter})`,
      )
    }

    return this.boltCardsRepository.update({
      id: cardId,
      counter: newCounter,
    } as any) // Using 'any' here as counter isn't in UpdateBoltCardInput
  }
}