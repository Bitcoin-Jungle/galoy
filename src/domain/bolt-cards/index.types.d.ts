// Redefine WalletId for our module
export type WalletId = string

export type BoltCardId = `bolt-card:${string}`

export type BoltCard = {
  id: BoltCardId
  walletId: WalletId
  uid: string
  cardName: string
  k0: string
  k1: string
  k2: string
  prevK0?: string
  prevK1?: string
  prevK2?: string
  counter: number
  enabled: boolean
  txLimit: number
  dailyLimit: number
  otp?: string
  createdAt: Date
  updatedAt: Date
}

export type CardUsageId = `card-usage:${string}`

export type CardUsage = {
  id: CardUsageId
  cardId: BoltCardId
  ip?: string
  userAgent?: string
  spent: number
  oldCounter: number
  newCounter: number
  amount: number
  createdAt: Date
}

export type CreateBoltCardInput = {
  walletId: WalletId
  cardName: string
  uid: string
  k0: string
  k1: string
  k2: string
  txLimit?: number
  dailyLimit?: number
}

export type UpdateBoltCardInput = {
  id: BoltCardId
  cardName?: string
  txLimit?: number
  dailyLimit?: number
  enabled?: boolean
  k0?: string
  k1?: string
  k2?: string
}

export type BoltCardsRepository = {
  findById(id: BoltCardId): Promise<BoltCard | null>
  findByWalletId(walletId: WalletId): Promise<BoltCard[]>
  findByUid(uid: string): Promise<BoltCard | null>
  save(card: CreateBoltCardInput): Promise<BoltCard>
  update(card: UpdateBoltCardInput): Promise<BoltCard | null>
  findCardUsagesByCardId(cardId: BoltCardId): Promise<CardUsage[]>
  recordCardUsage(cardUsage: Omit<CardUsage, "id" | "createdAt">): Promise<CardUsage>
  getDailyCardUsage(cardId: BoltCardId): Promise<number>
}