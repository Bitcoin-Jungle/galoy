import { UsersRepository } from "@services/mongoose"
import { ValidationError } from "@domain/errors"
import { checkedToLightningAddress } from "@domain/users"

export const addContact = async ({
  userId,
  username,
  lightningAddress,
  alias,
}: {
  userId: UserId
  username?: Username
  lightningAddress?: string
  alias?: string
}): Promise<UserContact | ApplicationError> => {
  if (!username && !lightningAddress) {
    return new ValidationError("Contact username or lightning address required")
  }

  if (username && lightningAddress) {
    return new ValidationError("Contact must have only one payment identity")
  }

  const normalizedLightningAddress = lightningAddress
    ? checkedToLightningAddress(lightningAddress)
    : undefined
  if (normalizedLightningAddress instanceof Error) {
    return normalizedLightningAddress
  }

  const usersRepo = UsersRepository()

  let contactUsername = username
  if (username) {
    const contactUser = await usersRepo.findByUsername(username)
    if (contactUser instanceof Error) return contactUser
    contactUsername = contactUser.username
  }

  const user = await usersRepo.findById(userId)
  if (user instanceof Error) return user

  const existingContact = user.contacts.find((contact) =>
    contactUsername
      ? contact.username?.toLocaleLowerCase() === contactUsername.toLocaleLowerCase()
      : contact.lightningAddress === normalizedLightningAddress,
  )
  if (existingContact) {
    return new ValidationError(`User already has contact ${username || lightningAddress}`)
  }

  const contactId = (contactUsername || normalizedLightningAddress) as unknown as ContactId
  const contact = {
    id: contactId,
    username: contactUsername,
    lightningAddress: normalizedLightningAddress,
    alias: (alias || "") as ContactAlias,
    transactionsCount: 0,
  }

  user.contacts.push(contact)

  const updateResult = await usersRepo.update(user)
  if (updateResult instanceof Error) return updateResult

  return contact
}
