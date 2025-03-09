import { updateEmail } from "@app/users/update-email"
import { EmailAlreadyExistsError, ValidationError } from "@domain/errors"
import { UsersRepository } from "@services/mongoose"

jest.mock("@services/mongoose", () => ({
  UsersRepository: jest.fn(),
}))

describe("updateEmail", () => {
  const userId = "user123" as UserId
  const validEmail = "test@example.com" as Email
  const mockUser = {
    id: userId,
    phone: "+14155552671" as PhoneNumber,
    language: "en",
    contacts: [],
    deviceTokens: [],
    twoFA: {},
    email: null,
  }
  
  const mockUpdatedUser = {
    ...mockUser,
    email: validEmail,
  }
  
  const mockUsersRepo = {
    findById: jest.fn(),
    update: jest.fn(),
  }
  
  beforeEach(() => {
    jest.clearAllMocks()
    ;(UsersRepository as jest.Mock).mockReturnValue(mockUsersRepo)
  })
  
  it("updates a user's email when it's not previously set", async () => {
    mockUsersRepo.findById.mockResolvedValueOnce(mockUser)
    mockUsersRepo.update.mockResolvedValueOnce(mockUpdatedUser)
    
    const result = await updateEmail({ userId, email: validEmail })
    
    expect(mockUsersRepo.findById).toHaveBeenCalledWith(userId)
    expect(mockUsersRepo.update).toHaveBeenCalledWith({
      ...mockUser,
      email: validEmail,
    })
    expect(result).toEqual(mockUpdatedUser)
  })
  
  it("returns ValidationError when user already has an email set", async () => {
    const userWithEmail = {
      ...mockUser,
      email: "existing@example.com" as Email,
    }
    
    mockUsersRepo.findById.mockResolvedValueOnce(userWithEmail)
    
    const result = await updateEmail({ userId, email: validEmail })
    
    expect(mockUsersRepo.findById).toHaveBeenCalledWith(userId)
    expect(mockUsersRepo.update).not.toHaveBeenCalled()
    expect(result).toHaveProperty('message', 'Email can only be set once')
  })
  
  it("returns ValidationError for invalid email format", async () => {
    mockUsersRepo.findById.mockResolvedValueOnce(mockUser)
    
    const invalidEmail = "invalid-email-format"
    const result = await updateEmail({ userId, email: invalidEmail })
    
    expect(mockUsersRepo.findById).toHaveBeenCalledWith(userId)
    expect(mockUsersRepo.update).not.toHaveBeenCalled()
    expect(result).toHaveProperty('message', 'Invalid email format')
  })
  
  it("accepts valid email formats", async () => {
    mockUsersRepo.findById.mockResolvedValueOnce(mockUser)
    mockUsersRepo.update.mockResolvedValueOnce(mockUpdatedUser)
    
    const result = await updateEmail({ userId, email: validEmail })
    
    expect(mockUsersRepo.findById).toHaveBeenCalledWith(userId)
    expect(mockUsersRepo.update).toHaveBeenCalledWith({
      ...mockUser,
      email: validEmail,
    })
    expect(result).toEqual(mockUpdatedUser)
  })
  
  it("passes through errors from repository", async () => {
    const error = new Error("Test error")
    mockUsersRepo.findById.mockResolvedValueOnce(error)
    
    const result = await updateEmail({ userId, email: validEmail })
    
    expect(mockUsersRepo.findById).toHaveBeenCalledWith(userId)
    expect(result).toHaveProperty('message', 'Test error')
  })
}) 