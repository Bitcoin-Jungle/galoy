import {
  BoltCard,
  BoltCardId,
  CardUsage,
  CardUsageId,
  CreateBoltCardInput,
  UpdateBoltCardInput,
  WalletId
} from "./index.types"

export const ZERO_KEY = "00000000000000000000000000000000"
export const DEFAULT_TX_LIMIT = 100000 // in sats
export const DEFAULT_DAILY_LIMIT = 500000 // in sats

export const boltCardIdRegex = /^bolt-card:[a-zA-Z0-9]+$/

export class InvalidBoltCardError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InvalidBoltCardError"
  }
}

export class BoltCardLimitExceededError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BoltCardLimitExceededError"
  }
}

export class BoltCardDisabledError extends Error {
  constructor() {
    super("Bolt card is disabled")
    this.name = "BoltCardDisabledError"
  }
}

export class CardAlreadyExistsError extends Error {
  constructor(uid: string) {
    super(`Card with UID ${uid} already exists`)
    this.name = "CardAlreadyExistsError"
  }
}

// Simple ID generators using timestamps and random strings
export const createBoltCardId = (): BoltCardId => {
  const timestamp = Date.now().toString(36)
  const randomStr = Math.random().toString(36).substring(2, 10)
  return `bolt-card:${timestamp}${randomStr}` as BoltCardId
}

export const createCardUsageId = (): CardUsageId => {
  const timestamp = Date.now().toString(36)
  const randomStr = Math.random().toString(36).substring(2, 10)
  return `card-usage:${timestamp}${randomStr}` as CardUsageId
}

export const validateCardInput = (input: CreateBoltCardInput): CreateBoltCardInput => {
  const { walletId, cardName, uid, k0, k1, k2 } = input
  
  if (!walletId) {
    throw new InvalidBoltCardError("Wallet ID is required")
  }
  
  if (!cardName) {
    throw new InvalidBoltCardError("Card name is required")
  }
  
  if (!uid) {
    throw new InvalidBoltCardError("Card UID is required")
  }
  
  // Validate key format (hex strings of correct length)
  const keyRegex = /^[0-9a-fA-F]{32}$/
  if (!keyRegex.test(k0)) {
    throw new InvalidBoltCardError("Invalid k0 key format")
  }
  
  if (!keyRegex.test(k1)) {
    throw new InvalidBoltCardError("Invalid k1 key format")
  }
  
  if (!keyRegex.test(k2)) {
    throw new InvalidBoltCardError("Invalid k2 key format")
  }
  
  const txLimit = input.txLimit || DEFAULT_TX_LIMIT
  const dailyLimit = input.dailyLimit || DEFAULT_DAILY_LIMIT
  
  if (txLimit <= 0) {
    throw new InvalidBoltCardError("Transaction limit must be greater than 0")
  }
  
  if (dailyLimit <= 0) {
    throw new InvalidBoltCardError("Daily limit must be greater than 0")
  }
  
  if (txLimit > dailyLimit) {
    throw new InvalidBoltCardError("Transaction limit cannot be greater than daily limit")
  }
  
  return {
    ...input,
    txLimit,
    dailyLimit,
  }
}

export const validateCardUpdateInput = (input: UpdateBoltCardInput): UpdateBoltCardInput => {
  const { id, cardName, txLimit, dailyLimit, k0, k1, k2 } = input
  
  if (!id) {
    throw new InvalidBoltCardError("Card ID is required")
  }
  
  if (!boltCardIdRegex.test(id)) {
    throw new InvalidBoltCardError("Invalid card ID format")
  }
  
  // Validate optional keys if provided
  const keyRegex = /^[0-9a-fA-F]{32}$/
  if (k0 && !keyRegex.test(k0)) {
    throw new InvalidBoltCardError("Invalid k0 key format")
  }
  
  if (k1 && !keyRegex.test(k1)) {
    throw new InvalidBoltCardError("Invalid k1 key format")
  }
  
  if (k2 && !keyRegex.test(k2)) {
    throw new InvalidBoltCardError("Invalid k2 key format")
  }
  
  if (txLimit !== undefined && txLimit <= 0) {
    throw new InvalidBoltCardError("Transaction limit must be greater than 0")
  }
  
  if (dailyLimit !== undefined && dailyLimit <= 0) {
    throw new InvalidBoltCardError("Daily limit must be greater than 0")
  }
  
  if (txLimit !== undefined && dailyLimit !== undefined && txLimit > dailyLimit) {
    throw new InvalidBoltCardError("Transaction limit cannot be greater than daily limit")
  }
  
  return input
}

export const createBoltCard = (
  input: CreateBoltCardInput,
  existingCard?: BoltCard | null,
): BoltCard => {
  validateCardInput(input)
  
  // Check if card with same UID already exists
  if (existingCard) {
    throw new CardAlreadyExistsError(input.uid)
  }
  
  const now = new Date()
  
  return {
    id: createBoltCardId(),
    walletId: input.walletId,
    cardName: input.cardName,
    uid: input.uid,
    k0: input.k0,
    k1: input.k1,
    k2: input.k2,
    counter: 0,
    enabled: true,
    txLimit: input.txLimit || DEFAULT_TX_LIMIT,
    dailyLimit: input.dailyLimit || DEFAULT_DAILY_LIMIT,
    createdAt: now,
    updatedAt: now,
  }
}

export const updateBoltCard = (card: BoltCard, input: UpdateBoltCardInput): BoltCard => {
  validateCardUpdateInput(input)
  
  const { cardName, txLimit, dailyLimit, enabled, k0, k1, k2 } = input
  
  // Backup previous keys if new keys are provided
  const prevK0 = k0 ? card.k0 : card.prevK0
  const prevK1 = k1 ? card.k1 : card.prevK1
  const prevK2 = k2 ? card.k2 : card.prevK2
  
  return {
    ...card,
    cardName: cardName !== undefined ? cardName : card.cardName,
    txLimit: txLimit !== undefined ? txLimit : card.txLimit,
    dailyLimit: dailyLimit !== undefined ? dailyLimit : card.dailyLimit,
    enabled: enabled !== undefined ? enabled : card.enabled,
    k0: k0 || card.k0,
    k1: k1 || card.k1,
    k2: k2 || card.k2,
    prevK0,
    prevK1,
    prevK2,
    updatedAt: new Date(),
  }
}

export const validateCardTransaction = (
  card: BoltCard,
  amount: number,
  dailyUsage: number,
): void => {
  if (!card.enabled) {
    throw new BoltCardDisabledError()
  }
  
  if (amount > card.txLimit) {
    throw new BoltCardLimitExceededError(
      `Transaction amount (${amount}) exceeds card limit (${card.txLimit})`,
    )
  }
  
  const newDailyTotal = dailyUsage + amount
  if (newDailyTotal > card.dailyLimit) {
    throw new BoltCardLimitExceededError(
      `Daily limit (${card.dailyLimit}) would be exceeded: ${dailyUsage} used + ${amount} requested = ${newDailyTotal}`,
    )
  }
}

export const createCardUsage = (
  cardId: BoltCardId,
  amount: number,
  oldCounter: number,
  newCounter: number,
  metadata: { ip?: string; userAgent?: string } = {},
): Omit<CardUsage, "id" | "createdAt"> => {
  return {
    cardId,
    spent: amount,
    oldCounter,
    newCounter,
    amount,
    ip: metadata.ip,
    userAgent: metadata.userAgent,
  }
}