import { addContact } from "@app/users/add-contact"
import { addNewContact } from "@app/users/add-new-contact"
import { deleteContact } from "@app/users/delete-contact"
import { updateContactAlias } from "@app/users/update-contact-alias"
import { UsersRepository } from "@services/mongoose"

jest.mock("@services/mongoose", () => ({
  UsersRepository: jest.fn(),
}))

describe("contacts", () => {
  const userId = "user123" as UserId
  const contactUsername = "alice" as Username
  const lightningAddress = "bob@strike.me"

  const mockUsersRepo = {
    findById: jest.fn(),
    findByUsername: jest.fn(),
    update: jest.fn(),
  }

  const baseUser = (): User =>
    ({
      id: userId,
      username: "lee" as Username,
      walletPublicId: "wallet-public-id" as WalletPublicId,
      phone: "+14155552671" as PhoneNumber,
      language: "en",
      contacts: [],
      quizQuestions: [],
      defaultAccountId: "account-id" as AccountId,
      deviceTokens: [],
      twoFA: { threshold: 0 },
      email: null,
      phoneMetadata: null,
      createdAt: new Date(),
    } as unknown as User)

  beforeEach(() => {
    jest.clearAllMocks()
    ;(UsersRepository as jest.Mock).mockReturnValue(mockUsersRepo)
  })

  it("keeps existing auto-created username contact behavior", async () => {
    const user = baseUser()
    mockUsersRepo.findByUsername.mockResolvedValue({
      id: "alice-id",
      username: contactUsername,
    })
    mockUsersRepo.findById.mockResolvedValue(user)
    mockUsersRepo.update.mockResolvedValue(user)

    const result = await addNewContact({ userId, contactUsername })

    expect(mockUsersRepo.findByUsername).toHaveBeenCalledWith(contactUsername)
    expect(mockUsersRepo.update).toHaveBeenCalledWith({
      ...user,
      contacts: [
        {
          id: contactUsername,
          username: contactUsername,
          alias: "",
          transactionsCount: 1,
        },
      ],
    })
    expect(result).toBe(user)
  })

  it("increments an existing auto-created username contact", async () => {
    const user = {
      ...baseUser(),
      contacts: [
        {
          id: contactUsername as unknown as ContactId,
          username: contactUsername,
          alias: "" as ContactAlias,
          transactionsCount: 1,
        },
      ],
    }
    mockUsersRepo.findByUsername.mockResolvedValue({
      id: "alice-id",
      username: contactUsername,
    })
    mockUsersRepo.findById.mockResolvedValue(user)
    mockUsersRepo.update.mockResolvedValue(user)

    await addNewContact({ userId, contactUsername })

    expect(user.contacts[0].transactionsCount).toBe(2)
    expect(mockUsersRepo.update).toHaveBeenCalledWith(user)
  })

  it("adds a manual lightning address contact with normalized identity", async () => {
    const user = baseUser()
    mockUsersRepo.findById.mockResolvedValue(user)
    mockUsersRepo.update.mockResolvedValue(user)

    const result = await addContact({
      userId,
      lightningAddress: "Bob@Strike.Me",
      alias: "Bob's Strike",
    })

    expect(mockUsersRepo.findByUsername).not.toHaveBeenCalled()
    expect(mockUsersRepo.update).toHaveBeenCalledWith(user)
    expect(result).toEqual({
      id: lightningAddress,
      username: undefined,
      lightningAddress,
      alias: "Bob's Strike",
      transactionsCount: 0,
    })
  })

  it("adds a manual username contact with canonical username", async () => {
    const user = baseUser()
    mockUsersRepo.findByUsername.mockResolvedValue({
      id: "alice-id",
      username: contactUsername,
    })
    mockUsersRepo.findById.mockResolvedValue(user)
    mockUsersRepo.update.mockResolvedValue(user)

    const result = await addContact({
      userId,
      username: "ALICE" as Username,
      alias: "Alice",
    })

    expect(mockUsersRepo.update).toHaveBeenCalledWith(user)
    expect(result).toEqual({
      id: contactUsername,
      username: contactUsername,
      lightningAddress: undefined,
      alias: "Alice",
      transactionsCount: 0,
    })
  })

  it("rejects duplicate manual username contacts case-insensitively", async () => {
    const user = {
      ...baseUser(),
      contacts: [
        {
          id: contactUsername as unknown as ContactId,
          username: contactUsername,
          alias: "" as ContactAlias,
          transactionsCount: 0,
        },
      ],
    }
    mockUsersRepo.findByUsername.mockResolvedValue({
      id: "alice-id",
      username: contactUsername,
    })
    mockUsersRepo.findById.mockResolvedValue(user)

    const result = await addContact({
      userId,
      username: "ALICE" as Username,
    })

    expect(mockUsersRepo.update).not.toHaveBeenCalled()
    expect(result).toHaveProperty("message", "User already has contact ALICE")
  })

  it("rejects duplicate manual lightning address contacts case-insensitively", async () => {
    const user = {
      ...baseUser(),
      contacts: [
        {
          id: lightningAddress as ContactId,
          lightningAddress: lightningAddress as LightningAddress,
          alias: "Bob" as ContactAlias,
          transactionsCount: 0,
        },
      ],
    }
    mockUsersRepo.findById.mockResolvedValue(user)

    const result = await addContact({
      userId,
      lightningAddress: "BOB@STRIKE.ME",
    })

    expect(mockUsersRepo.update).not.toHaveBeenCalled()
    expect(result).toHaveProperty("message", "User already has contact BOB@STRIKE.ME")
  })

  it("rejects contacts with both username and lightning address", async () => {
    const result = await addContact({
      userId,
      username: contactUsername,
      lightningAddress,
    })

    expect(result).toHaveProperty("message", "Contact must have only one payment identity")
    expect(mockUsersRepo.findById).not.toHaveBeenCalled()
    expect(mockUsersRepo.update).not.toHaveBeenCalled()
  })

  it("rejects contacts without a username or lightning address", async () => {
    const result = await addContact({ userId })

    expect(result).toHaveProperty(
      "message",
      "Contact username or lightning address required",
    )
    expect(mockUsersRepo.findById).not.toHaveBeenCalled()
    expect(mockUsersRepo.update).not.toHaveBeenCalled()
  })

  it("rejects invalid lightning address contacts", async () => {
    const result = await addContact({
      userId,
      lightningAddress: "bob@.me",
    })

    expect(result).toHaveProperty("name", "InvalidLightningAddress")
    expect(mockUsersRepo.findById).not.toHaveBeenCalled()
    expect(mockUsersRepo.update).not.toHaveBeenCalled()
  })

  it("updates a lightning address contact alias", async () => {
    const user = {
      ...baseUser(),
      contacts: [
        {
          id: lightningAddress as ContactId,
          lightningAddress: lightningAddress as LightningAddress,
          alias: "" as ContactAlias,
          transactionsCount: 0,
        },
      ],
    }
    mockUsersRepo.findById.mockResolvedValue(user)
    mockUsersRepo.update.mockResolvedValue(user)

    const result = await updateContactAlias({
      userId,
      lightningAddress: "BOB@STRIKE.ME",
      alias: "Bob's Strike",
    })

    expect(result).toBe(user.contacts[0])
    expect(user.contacts[0].alias).toBe("Bob's Strike")
    expect(mockUsersRepo.update).toHaveBeenCalledWith(user)
  })

  it("updates a username contact alias case-insensitively", async () => {
    const user = {
      ...baseUser(),
      contacts: [
        {
          id: contactUsername as unknown as ContactId,
          username: contactUsername,
          alias: "" as ContactAlias,
          transactionsCount: 0,
        },
      ],
    }
    mockUsersRepo.findById.mockResolvedValue(user)
    mockUsersRepo.update.mockResolvedValue(user)

    const result = await updateContactAlias({
      userId,
      username: "ALICE",
      alias: "Alice",
    })

    expect(result).toBe(user.contacts[0])
    expect(user.contacts[0].alias).toBe("Alice")
    expect(mockUsersRepo.update).toHaveBeenCalledWith(user)
  })

  it("returns an error when updating a missing contact", async () => {
    mockUsersRepo.findById.mockResolvedValue(baseUser())

    const result = await updateContactAlias({
      userId,
      lightningAddress,
      alias: "Bob",
    })

    expect(result).toHaveProperty("message", `User doesn't have contact ${lightningAddress}`)
    expect(mockUsersRepo.update).not.toHaveBeenCalled()
  })

  it("deletes the requested lightning address contact", async () => {
    const user = {
      ...baseUser(),
      contacts: [
        {
          id: contactUsername as unknown as ContactId,
          username: contactUsername,
          alias: "" as ContactAlias,
          transactionsCount: 3,
        },
        {
          id: lightningAddress as ContactId,
          lightningAddress: lightningAddress as LightningAddress,
          alias: "Bob" as ContactAlias,
          transactionsCount: 0,
        },
      ],
    }
    mockUsersRepo.findById.mockResolvedValue(user)
    mockUsersRepo.update.mockResolvedValue(user)

    const result = await deleteContact({
      userId,
      lightningAddress: "BOB@STRIKE.ME",
    })

    expect(result).toEqual({
      id: lightningAddress,
      lightningAddress,
      alias: "Bob",
      transactionsCount: 0,
    })
    expect(user.contacts).toEqual([
      {
        id: contactUsername,
        username: contactUsername,
        alias: "",
        transactionsCount: 3,
      },
    ])
    expect(mockUsersRepo.update).toHaveBeenCalledWith(user)
  })

  it("deletes a username contact case-insensitively", async () => {
    const user = {
      ...baseUser(),
      contacts: [
        {
          id: contactUsername as unknown as ContactId,
          username: contactUsername,
          alias: "" as ContactAlias,
          transactionsCount: 3,
        },
      ],
    }
    mockUsersRepo.findById.mockResolvedValue(user)
    mockUsersRepo.update.mockResolvedValue(user)

    const result = await deleteContact({
      userId,
      username: "ALICE" as Username,
    })

    expect(result).toEqual({
      id: contactUsername,
      username: contactUsername,
      alias: "",
      transactionsCount: 3,
    })
    expect(user.contacts).toEqual([])
    expect(mockUsersRepo.update).toHaveBeenCalledWith(user)
  })

  it("returns an error when deleting a missing contact", async () => {
    mockUsersRepo.findById.mockResolvedValue(baseUser())

    const result = await deleteContact({
      userId,
      lightningAddress,
    })

    expect(result).toHaveProperty("message", `User doesn't have contact ${lightningAddress}`)
    expect(mockUsersRepo.update).not.toHaveBeenCalled()
  })
})
