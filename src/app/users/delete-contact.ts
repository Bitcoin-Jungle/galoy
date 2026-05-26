import { UsersRepository } from "@services/mongoose"
import { ValidationError } from "@domain/errors"
import { checkedToLightningAddress } from "@domain/users"

export const deleteContact = async ({
  userId,
  username,
  lightningAddress,
}: {
  userId: UserId
  username?: Username
  lightningAddress?: string
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
  const user = await usersRepo.findById(userId)
  if (user instanceof Error) return user

  const contactIndex = user.contacts.findIndex((contact) =>
    username
      ? contact.username?.toLocaleLowerCase() === username.toLocaleLowerCase()
      : contact.lightningAddress === normalizedLightningAddress,
  )
  if (contactIndex < 0) {
    return new ValidationError(
      `User doesn't have contact ${username || lightningAddress}`,
    )
  }

  const [contact] = user.contacts.splice(contactIndex, 1)

  const updateResult = await usersRepo.update(user)
  if (updateResult instanceof Error) return updateResult

  return contact
}
