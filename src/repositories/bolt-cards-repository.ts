import { Model } from "mongoose"
import type { 
  BoltCard, 
  BoltCardId, 
  CardUsage, 
  CardUsageId, 
  CreateBoltCardInput, 
  UpdateBoltCardInput, 
  UpdateCardUsageInput,
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
    k3,
    k4,
    prevK0,
    prevK1,
    prevK2,
    prevK3,
    prevK4,
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
    k3: k3 as string,
    k4: k4 as string,
    prevK0: prevK0 as string | undefined,
    prevK1: prevK1 as string | undefined,
    prevK2: prevK2 as string | undefined,
    prevK3: prevK3 as string | undefined,
    prevK4: prevK4 as string | undefined,
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
    amount,
    oldCounter,
    newCounter,
    spent,
    spentAt,
    ip,
    userAgent,
    createdAt,
  } = document

  return {
    id: _id as CardUsageId,
    cardId: cardId as BoltCardId,
    amount: amount as number,
    oldCounter: oldCounter as number,
    newCounter: newCounter as number,
    spent: spent as boolean,
    spentAt: spentAt as Date | null | undefined,
    ip: ip as string | undefined,
    userAgent: userAgent as string | undefined,
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

  const findByOtp = async (otp: string): Promise<BoltCard | null> => {
    const document = await boltCardModel.findOne({ otp }).lean()
    if (!document) return null
    return toBoltCard(document)
  }

  const save = async (input: CreateBoltCardInput): Promise<BoltCard> => {
    // Check if card with same UID already exists
    const existingCard = await findByUid(input.uid)
    
    // Create domain entity
    const newCard = createBoltCard(input, existingCard)
    
    // Save to database
    const document = await boltCardModel.create({
      _id: newCard.id,
      walletId: newCard.walletId,
      uid: newCard.uid,
      cardName: newCard.cardName,
      k0: newCard.k0,
      k1: newCard.k1,
      k2: newCard.k2,
      k3: newCard.k3,
      k4: newCard.k4,
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
        k3: updatedCard.k3,
        k4: updatedCard.k4,
        prevK0: updatedCard.prevK0,
        prevK1: updatedCard.prevK1,
        prevK2: updatedCard.prevK2,
        prevK3: updatedCard.prevK3,
        prevK4: updatedCard.prevK4,
        txLimit: updatedCard.txLimit,
        dailyLimit: updatedCard.dailyLimit,
        enabled: updatedCard.enabled,
        otp: updatedCard.otp,
        updatedAt: updatedCard.updatedAt,
      },
      { new: true }
    ).lean()

    if (!document) return null
    return toBoltCard(document)
  }

  const findCardUsagesByCardId = async (cardId: BoltCardId): Promise<CardUsage[]> => {
    const documents = await cardUsageModel.find({ cardId }).sort({ createdAt: -1 }).lean()
    return documents.map(toCardUsage)
  }

  const findCardUsageById = async (id: CardUsageId): Promise<CardUsage | null> => {
    const document = await cardUsageModel.findOne({ _id: id }).lean()
    if (!document) return null
    return toCardUsage(document)
  }

  const recordCardUsage = async (usage: Omit<CardUsage, "id" | "createdAt">): Promise<CardUsage> => {
    // Create ID for the usage record
    const id = createCardUsageId()
    const createdAt = new Date()
    
    // Store in database
    const document = await cardUsageModel.create({
      _id: id,
      cardId: usage.cardId,
      amount: usage.amount,
      oldCounter: usage.oldCounter,
      newCounter: usage.newCounter,
      spent: usage.spent || false,
      spentAt: usage.spentAt,
      ip: usage.ip,
      userAgent: usage.userAgent,
      createdAt,
    })

    return toCardUsage(document.toObject())
  }

  const getDailyCardUsage = async (cardId: BoltCardId): Promise<CardUsage[]> => {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    
    const documents = await cardUsageModel.find({
      cardId,
      createdAt: { $gte: startOfDay },
      spent: true
    }).lean()
    
    return documents.map(toCardUsage)
  }

  const updateCardUsage = async (id: CardUsageId, input: UpdateCardUsageInput): Promise<CardUsage | null> => {
    const document = await cardUsageModel.findOneAndUpdate(
      { _id: id },
      { 
        ...input,
        updatedAt: new Date()
      },
      { new: true }
    ).lean()
    
    if (!document) return null
    return toCardUsage(document)
  }

  return {
    findById,
    findByWalletId,
    findByUid,
    findByOtp,
    save,
    update,
    findCardUsagesByCardId,
    findCardUsageById,
    getDailyCardUsage,
    recordCardUsage,
    updateCardUsage,
  }
}