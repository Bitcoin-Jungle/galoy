import mongoose from "mongoose"
import { BoltCardsRepositoryImpl } from "../../../src/repositories/bolt-cards-repository"
import { CreateBoltCardInput, UpdateBoltCardInput, WalletId } from "../../../src/domain/bolt-cards/index.types"

describe("BoltCardsRepository", () => {
  // Mock mongoose models with chained methods
  const mockLean = jest.fn()
  const mockFindOne = jest.fn(() => ({ lean: mockLean }))
  const mockFind = jest.fn(() => ({ lean: mockLean }))
  
  const mockBoltCardModel = {
    findOne: mockFindOne,
    find: mockFind,
    create: jest.fn(),
    findOneAndUpdate: jest.fn(() => ({ lean: mockLean })),
  }
  
  const mockCardUsageModel = {
    find: jest.fn(() => ({ lean: mockLean })),
    create: jest.fn(),
    aggregate: jest.fn(),
  }

  // Create repository with mocked models
  const repository = BoltCardsRepositoryImpl(
    mockBoltCardModel as unknown as mongoose.Model<any>,
    mockCardUsageModel as unknown as mongoose.Model<any>,
  )

  beforeEach(() => {
    jest.clearAllMocks()
  })

  const validCard = {
    _id: "bolt-card:123",
    walletId: "wallet:123" as WalletId,
    uid: "11223344556677",
    cardName: "Test Card",
    k0: "0123456789abcdef0123456789abcdef",
    k1: "0123456789abcdef0123456789abcdef",
    k2: "0123456789abcdef0123456789abcdef",
    counter: 0,
    enabled: true,
    txLimit: 100000,
    dailyLimit: 500000,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  describe("findById", () => {
    it("retrieves a card by id", async () => {
      mockLean.mockResolvedValue(validCard)
      
      const result = await repository.findById("bolt-card:123")
      
      expect(mockFindOne).toHaveBeenCalledWith({ _id: "bolt-card:123" })
      expect(mockLean).toHaveBeenCalled()
      expect(result).not.toBeNull()
      expect(result?.id).toBe(validCard._id)
      expect(result?.walletId).toBe(validCard.walletId)
    })
    
    it("returns null if no card is found", async () => {
      mockLean.mockResolvedValue(null)
      
      const result = await repository.findById("bolt-card:123")
      
      expect(mockFindOne).toHaveBeenCalledWith({ _id: "bolt-card:123" })
      expect(mockLean).toHaveBeenCalled()
      expect(result).toBeNull()
    })
  })

  describe("findByWalletId", () => {
    it("retrieves cards by wallet id", async () => {
      mockLean.mockResolvedValue([validCard])
      
      const result = await repository.findByWalletId("wallet:123" as WalletId)
      
      expect(mockFind).toHaveBeenCalledWith({ walletId: "wallet:123" as WalletId })
      expect(mockLean).toHaveBeenCalled()
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(validCard._id)
    })
  })

  describe("save", () => {
    it("creates a new card", async () => {
      // First call should be to findByUid which should return null
      mockLean.mockResolvedValueOnce(null) 
      
      // Setup mock for create
      mockBoltCardModel.create.mockImplementation((data) => ({
        ...data,
        toObject: () => data,
      }))
      
      const input: CreateBoltCardInput = {
        walletId: "wallet:123" as WalletId,
        cardName: "New Card",
        uid: "11223344556677",
        k0: "0123456789abcdef0123456789abcdef",
        k1: "0123456789abcdef0123456789abcdef",
        k2: "0123456789abcdef0123456789abcdef",
      }
      
      const result = await repository.save(input)
      
      expect(mockFindOne).toHaveBeenCalledWith({ uid: input.uid })
      expect(mockLean).toHaveBeenCalled()
      expect(mockBoltCardModel.create).toHaveBeenCalled()
      expect(result.walletId).toBe(input.walletId)
      expect(result.cardName).toBe(input.cardName)
      expect(result.uid).toBe(input.uid)
    })
  })

  describe("update", () => {
    it("updates an existing card", async () => {
      // findById first
      mockLean.mockResolvedValueOnce(validCard)
      
      // Then findOneAndUpdate
      mockLean.mockResolvedValueOnce({
        ...validCard,
        cardName: "Updated Card Name",
      })
      
      const input: UpdateBoltCardInput = {
        id: "bolt-card:123",
        cardName: "Updated Card Name",
      }
      
      const result = await repository.update(input)
      
      expect(mockFindOne).toHaveBeenCalledWith({ _id: input.id })
      expect(mockBoltCardModel.findOneAndUpdate).toHaveBeenCalled()
      expect(result?.cardName).toBe("Updated Card Name")
    })
    
    it("returns null if card not found", async () => {
      mockLean.mockResolvedValueOnce(null)
      
      const input: UpdateBoltCardInput = {
        id: "bolt-card:123",
        cardName: "Updated Card Name",
      }
      
      const result = await repository.update(input)
      
      expect(mockFindOne).toHaveBeenCalledWith({ _id: input.id })
      expect(result).toBeNull()
    })
  })

  describe("getDailyCardUsage", () => {
    it("calculates daily card usage", async () => {
      mockCardUsageModel.aggregate.mockResolvedValue([{ total: 250000 }])
      
      const result = await repository.getDailyCardUsage("bolt-card:123")
      
      expect(mockCardUsageModel.aggregate).toHaveBeenCalled()
      expect(result).toBe(250000)
    })
    
    it("returns 0 if no usage found", async () => {
      mockCardUsageModel.aggregate.mockResolvedValue([])
      
      const result = await repository.getDailyCardUsage("bolt-card:123")
      
      expect(result).toBe(0)
    })
  })
})