// Redefine WalletId for our module
export type WalletId = `${string}`

export type BoltCardId = `bolt-card:${string}`

export type BoltCard = {
  id: BoltCardId
  walletId: WalletId
  uid: string
  cardName: string
  k0: string
  k1: string
  k2: string
  k3: string
  k4: string
  prevK0?: string
  prevK1?: string
  prevK2?: string
  prevK3?: string
  prevK4?: string
  counter: number
  enabled: boolean
  txLimit: number
  dailyLimit: number
  otp?: string
  createdAt: Date
  updatedAt: Date
}

export type CardUsageId = `bolt-card-usage:${string}`

export type CardUsage = {
  id: CardUsageId
  cardId: BoltCardId
  amount: number
  oldCounter: number
  newCounter: number
  spent?: boolean
  spentAt?: Date | null
  ip?: string
  userAgent?: string
  createdAt: Date
}

export type CreateBoltCardInput = {
  walletId: WalletId
  uid: string
  cardName: string
  k0: string
  k1: string
  k2: string
  k3: string
  k4: string
  txLimit?: number
  dailyLimit?: number
}

export type UpdateBoltCardInput = {
  id: BoltCardId
  cardName?: string
  k0?: string
  k1?: string
  k2?: string
  k3?: string
  k4?: string
  otp?: string
  enabled?: boolean
  txLimit?: number
  dailyLimit?: number
}

export type UpdateCardUsageInput = {
  amount?: number
  spent?: boolean
  spentAt?: Date | null
}

export interface BoltCardsRepository {
  findById(id: BoltCardId): Promise<BoltCard | null>
  findByWalletId(walletId: WalletId): Promise<BoltCard[]>
  findByUid(uid: string): Promise<BoltCard | null>
  findByOtp(otp: string): Promise<BoltCard | null>
  save(input: CreateBoltCardInput): Promise<BoltCard>
  update(input: UpdateBoltCardInput): Promise<BoltCard | null>
  
  findCardUsagesByCardId(cardId: BoltCardId): Promise<CardUsage[]>
  findCardUsageById(id: CardUsageId): Promise<CardUsage | null>
  getDailyCardUsage(cardId: BoltCardId): Promise<CardUsage[]>
  recordCardUsage(usage: Omit<CardUsage, "id" | "createdAt">): Promise<CardUsage>
  updateCardUsage(id: CardUsageId, input: UpdateCardUsageInput): Promise<CardUsage | null>
}