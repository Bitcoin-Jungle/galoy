import { 
  createBoltCard, 
  updateBoltCard, 
  validateCardTransaction,
  InvalidBoltCardError,
  BoltCardLimitExceededError,
  BoltCardDisabledError,
  validateCardInput,
  validateCardUpdateInput,
  DEFAULT_TX_LIMIT,
  DEFAULT_DAILY_LIMIT
} from "../../../../src/domain/bolt-cards/bolt-card"
import { BoltCard, WalletId } from "../../../../src/domain/bolt-cards/index.types"

describe("Bolt Card", () => {
  const validInput = {
    walletId: "wallet123" as WalletId,
    cardName: "My Test Card",
    uid: "11223344556677",
    k0: "0123456789abcdef0123456789abcdef",
    k1: "0123456789abcdef0123456789abcdef",
    k2: "0123456789abcdef0123456789abcdef",
  }
  
  describe("createBoltCard", () => {
    it("creates a new bolt card with default limits", () => {
      const card = createBoltCard(validInput)
      
      expect(card.walletId).toBe(validInput.walletId)
      expect(card.cardName).toBe(validInput.cardName)
      expect(card.uid).toBe(validInput.uid)
      expect(card.k0).toBe(validInput.k0)
      expect(card.k1).toBe(validInput.k1)
      expect(card.k2).toBe(validInput.k2)
      expect(card.counter).toBe(0)
      expect(card.enabled).toBe(true)
      expect(card.txLimit).toBe(DEFAULT_TX_LIMIT)
      expect(card.dailyLimit).toBe(DEFAULT_DAILY_LIMIT)
      expect(card.id).toMatch(/^bolt-card:/)
      expect(card.createdAt).toBeInstanceOf(Date)
      expect(card.updatedAt).toBeInstanceOf(Date)
    })
    
    it("creates a new bolt card with custom limits", () => {
      const customInput = {
        ...validInput,
        txLimit: 50000,
        dailyLimit: 250000,
      }
      
      const card = createBoltCard(customInput)
      
      expect(card.txLimit).toBe(customInput.txLimit)
      expect(card.dailyLimit).toBe(customInput.dailyLimit)
    })
    
    it("throws an error if an existing card with the same UID is provided", () => {
      const existingCard = createBoltCard(validInput)
      
      expect(() => {
        createBoltCard(validInput, existingCard)
      }).toThrow(`Card with UID ${validInput.uid} already exists`)
    })
  })
  
  describe("updateBoltCard", () => {
    it("updates a bolt card's properties", () => {
      const card = createBoltCard(validInput)
      const updateInput = {
        id: card.id,
        cardName: "Updated Card Name",
        txLimit: 75000,
        dailyLimit: 300000,
      }
      
      // Add a small delay to ensure the timestamps are different
      const originalDate = card.updatedAt
      
      // Mock Date.now for the updateBoltCard function
      const realDateNow = Date.now
      const mockNow = realDateNow() + 1000 // 1 second in the future
      global.Date.now = jest.fn(() => mockNow)
      
      const updatedCard = updateBoltCard(card, updateInput)
      
      // Restore the original Date.now
      global.Date.now = realDateNow
      
      expect(updatedCard.id).toBe(card.id)
      expect(updatedCard.cardName).toBe(updateInput.cardName)
      expect(updatedCard.txLimit).toBe(updateInput.txLimit)
      expect(updatedCard.dailyLimit).toBe(updateInput.dailyLimit)
      expect(updatedCard.enabled).toBe(true) // unchanged
      expect(updatedCard.updatedAt).not.toBe(originalDate)
    })
    
    it("can enable/disable a card", () => {
      const card = createBoltCard(validInput)
      const updateInput = {
        id: card.id,
        enabled: false,
      }
      
      const updatedCard = updateBoltCard(card, updateInput)
      
      expect(updatedCard.enabled).toBe(false)
    })
    
    it("backs up previous keys when updating keys", () => {
      const card = createBoltCard(validInput)
      const newKeys = {
        id: card.id,
        k0: "fedcba9876543210fedcba9876543210",
        k1: "fedcba9876543210fedcba9876543210",
        k2: "fedcba9876543210fedcba9876543210",
      }
      
      const updatedCard = updateBoltCard(card, newKeys)
      
      expect(updatedCard.k0).toBe(newKeys.k0)
      expect(updatedCard.k1).toBe(newKeys.k1)
      expect(updatedCard.k2).toBe(newKeys.k2)
      expect(updatedCard.prevK0).toBe(card.k0)
      expect(updatedCard.prevK1).toBe(card.k1)
      expect(updatedCard.prevK2).toBe(card.k2)
    })
  })
  
  describe("validateCardTransaction", () => {
    it("validates a transaction within limits", () => {
      const card = createBoltCard({
        ...validInput,
        txLimit: 100000,
        dailyLimit: 300000,
      })
      
      // Should not throw
      expect(() => {
        validateCardTransaction(card, 50000, 100000)
      }).not.toThrow()
    })
    
    it("throws if card is disabled", () => {
      const card = createBoltCard(validInput)
      const disabledCard = updateBoltCard(card, { id: card.id, enabled: false })
      
      expect(() => {
        validateCardTransaction(disabledCard, 10000, 0)
      }).toThrow(BoltCardDisabledError)
    })
    
    it("throws if transaction amount exceeds tx limit", () => {
      const card = createBoltCard({
        ...validInput,
        txLimit: 100000,
      })
      
      expect(() => {
        validateCardTransaction(card, 150000, 0)
      }).toThrow(BoltCardLimitExceededError)
      expect(() => {
        validateCardTransaction(card, 150000, 0)
      }).toThrow(/exceeds card limit/)
    })
    
    it("throws if daily limit would be exceeded", () => {
      const card = createBoltCard({
        ...validInput,
        txLimit: 100000,
        dailyLimit: 200000,
      })
      
      const dailyUsage = 150000
      
      expect(() => {
        validateCardTransaction(card, 75000, dailyUsage)
      }).toThrow(BoltCardLimitExceededError)
      expect(() => {
        validateCardTransaction(card, 75000, dailyUsage)
      }).toThrow(/Daily limit.*would be exceeded/)
    })
  })
  
  describe("validateCardInput", () => {
    it("validates correct input", () => {
      const result = validateCardInput(validInput)
      expect(result).toEqual({
        ...validInput,
        txLimit: DEFAULT_TX_LIMIT,
        dailyLimit: DEFAULT_DAILY_LIMIT,
      })
    })
    
    it("throws on invalid key format", () => {
      const invalidInput = {
        ...validInput,
        k0: "invalid-key", // Not hex
      }
      
      expect(() => {
        validateCardInput(invalidInput)
      }).toThrow(InvalidBoltCardError)
      expect(() => {
        validateCardInput(invalidInput)
      }).toThrow(/Invalid k0 key format/)
    })
    
    it("throws when txLimit > dailyLimit", () => {
      const invalidInput = {
        ...validInput,
        txLimit: 300000,
        dailyLimit: 200000,
      }
      
      expect(() => {
        validateCardInput(invalidInput)
      }).toThrow(InvalidBoltCardError)
      expect(() => {
        validateCardInput(invalidInput)
      }).toThrow(/Transaction limit cannot be greater than daily limit/)
    })
  })
})