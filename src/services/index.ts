import { BoltCardService } from "./bolt-card"
import { BoltCardsRepositoryImpl } from "../repositories/bolt-cards-repository"
import { BoltCard as BoltCardModel, CardUsage as CardUsageModel } from "./mongoose/schema"

export * from "./ledger"
export * from "./lnd"
export * from "./mongoose"
export * from "./cache"
export * from "./bitcoind"
export * from "./ipfetcher"
export * from "./rate-limit"
export * from "./price"
export * from "./lock"
export * from "./notifications"
export * from "./bolt-card"

export const boltCardService = new BoltCardService(
  BoltCardsRepositoryImpl(BoltCardModel, CardUsageModel)
)