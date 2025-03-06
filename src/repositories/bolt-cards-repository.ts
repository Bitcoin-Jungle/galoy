import { Model } from "mongoose"
import { 
  BoltCard, 
  BoltCardId, 
  CardUsage, 
  CardUsageId, 
  CreateBoltCardInput, 
  UpdateBoltCardInput, 
  BoltCardsRepository,
  WalletId
} from "../domain/bolt-cards/index.types"
import { 
  createBoltCard, 
  createBoltCardId, 
  createCardUsageId,
  updateBoltCard
} from "../domain/bolt-cards/bolt-card"

const toBoltCard = (document: Record<string, unknown>): BoltCard => {
  const {
    _id,
    walletId,
    uid,
    cardName,
    k0,
    k1,
    k2,
    prevK0,
    prevK1,
    prevK2,
    counter,
    enabled,
    txLimit,
    dailyLimit,
    otp,
    createdAt,
    updatedAt,
  } = document

  return {
    id: _id as BoltCardId,
    walletId: walletId as WalletId,
    uid: uid as string,
    cardName: cardName as string,
    k0: k0 as string,
    k1: k1 as string,
    k2: k2 as string,
    prevK0: prevK0 as string | undefined,
    prevK1: prevK1 as string | undefined,
    prevK2: prevK2 as string | undefined,
    counter: counter as number,
    enabled: enabled as boolean,
    txLimit: txLimit as number,
    dailyLimit: dailyLimit as number,
    otp: otp as string | undefined,
    createdAt: createdAt as Date,
    updatedAt: updatedAt as Date,
  }
}

const toCardUsage = (document: Record<string, unknown>): CardUsage => {
  const {
    _id,
    cardId,
    ip,
    userAgent,
    spent,
    oldCounter,
    newCounter,
    amount,
    createdAt,
  } = document

  return {
    id: _id as CardUsageId,
    cardId: cardId as BoltCardId,
    ip: ip as string | undefined,
    userAgent: userAgent as string | undefined,
    spent: spent as number,
    oldCounter: oldCounter as number,
    newCounter: newCounter as number,
    amount: amount as number,
    createdAt: createdAt as Date,
  }
}

export const BoltCardsRepositoryImpl = (
  boltCardModel: Model<any>,
  cardUsageModel: Model<any>,
): BoltCardsRepository => {
  const findById = async (id: BoltCardId): Promise<BoltCard | null> => {
    const document = await boltCardModel.findOne({ _id: id }).lean()
    if (!document) return null
    return toBoltCard(document)
  }

  const findByWalletId = async (walletId: WalletId): Promise<BoltCard[]> => {
    const documents = await boltCardModel.find({ walletId }).lean()
    return documents.map(toBoltCard)
  }

  const findByUid = async (uid: string): Promise<BoltCard | null> => {
    const document = await boltCardModel.findOne({ uid }).lean()
    if (!document) return null
    return toBoltCard(document)
  }

  const save = async (card: CreateBoltCardInput): Promise<BoltCard> => {
    // Check if card with same UID already exists
    const existingCard = await findByUid(card.uid)
    
    // Create domain entity
    const newCard = createBoltCard(card, existingCard)
    
    // Save to database
    const document = await boltCardModel.create({
      _id: newCard.id,
      walletId: newCard.walletId,
      uid: newCard.uid,
      cardName: newCard.cardName,
      k0: newCard.k0,
      k1: newCard.k1,
      k2: newCard.k2,
      counter: newCard.counter,
      enabled: newCard.enabled,
      txLimit: newCard.txLimit,
      dailyLimit: newCard.dailyLimit,
      createdAt: newCard.createdAt,
      updatedAt: newCard.updatedAt,
    })

    return toBoltCard(document.toObject())
  }

  const update = async (input: UpdateBoltCardInput): Promise<BoltCard | null> => {
    const { id, ...updateData } = input
    
    // Find existing card
    const existingCard = await findById(id)
    if (!existingCard) return null
    
    // Update the card in the domain layer
    const updatedCard = updateBoltCard(existingCard, input)
    
    // Update in database
    const document = await boltCardModel.findOneAndUpdate(
      { _id: id },
      {
        cardName: updatedCard.cardName,
        k0: updatedCard.k0,
        k1: updatedCard.k1,
        k2: updatedCard.k2,
        prevK0: updatedCard.prevK0,
        prevK1: updatedCard.prevK1,
        prevK2: updatedCard.prevK2,
        txLimit: updatedCard.txLimit,
        dailyLimit: updatedCard.dailyLimit,
        enabled: updatedCard.enabled,
        updatedAt: updatedCard.updatedAt,
      },
      { new: true }
    ).lean()

    if (!document) return null
    return toBoltCard(document)
  }

  const findCardUsagesByCardId = async (cardId: BoltCardId): Promise<CardUsage[]> => {
    const documents = await cardUsageModel.find({ cardId }).lean()
    return documents.map(toCardUsage)
  }

  const recordCardUsage = async (cardUsage: Omit<CardUsage, "id" | "createdAt">): Promise<CardUsage> => {
    // Create ID for the usage record
    const id = createCardUsageId()
    const createdAt = new Date()
    
    // Store in database
    const document = await cardUsageModel.create({
      _id: id,
      cardId: cardUsage.cardId,
      ip: cardUsage.ip,
      userAgent: cardUsage.userAgent,
      spent: cardUsage.spent,
      oldCounter: cardUsage.oldCounter,
      newCounter: cardUsage.newCounter,
      amount: cardUsage.amount,
      createdAt,
    })

    return toCardUsage(document.toObject())
  }

  const getDailyCardUsage = async (cardId: BoltCardId): Promise<number> => {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    
    const result = await cardUsageModel.aggregate([
      {
        $match: {
          cardId,
          createdAt: { $gte: startOfDay },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$spent" },
        },
      },
    ])

    return result.length > 0 ? result[0].total : 0
  }

  return {
    findById,
    findByWalletId,
    findByUid,
    save,
    update,
    findCardUsagesByCardId,
    recordCardUsage,
    getDailyCardUsage,
  }
}