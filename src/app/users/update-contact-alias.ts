import { UsersRepository } from "@services/mongoose"
import { ValidationError } from "@domain/errors"
import { checkedToLightningAddress } from "@domain/users"

export const updateContactAlias = async ({
  userId,
  username,
  lightningAddress,
  alias,
}: {
  userId: UserId
  username?: string
  lightningAddress?: string
  alias: string
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

  const repo = UsersRepository()
  const user = await repo.findById(userId)
  if (user instanceof Error) {
    return user
  }

  const contact = user.contacts.find((contact) =>
    username
      ? contact.username?.toLocaleLowerCase() === username.toLocaleLowerCase()
      : contact.lightningAddress === normalizedLightningAddress,
  )
  if (!contact) {
    return new ValidationError(
      `User doesn't have contact ${username || lightningAddress}`,
    )
  }
  contact.alias = alias as ContactAlias

  const result = await repo.update(user)
  if (result instanceof Error) {
    return result
  }

  return contact
}
