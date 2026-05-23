import { onboardingEarn } from "@config/app"
import { UserStatus } from "@core/user"
import { toSats } from "@domain/bitcoin"
import {
  CouldNotFindUserFromIdError,
  CouldNotFindUserFromPhoneError,
  CouldNotFindUserFromUsernameError,
  CouldNotFindUserFromWalletIdError,
  RepositoryError,
  UnknownRepositoryError,
} from "@domain/errors"
import { User } from "@services/mongoose/schema"

export const caseInsensitiveRegex = (input: string) => {
  return new RegExp(`^${input}$`, "i")
}

export const UsersRepository = (): IUsersRepository => {
  const findById = async (userId: UserId): Promise<User | RepositoryError> => {
    try {
      const result = await User.findOne(
        { _id: userId },
        { lastIPs: 0, lastConnection: 0 },
      )
      if (!result) {
        return new CouldNotFindUserFromIdError(userId)
      }

      return userFromRaw(result)
    } catch (err) {
      return new UnknownRepositoryError(err)
    }
  }

  const findByUsername = async (username: Username): Promise<User | RepositoryError> => {
    try {
      const result = await User.findOne(
        { username: caseInsensitiveRegex(username), status: UserStatus.Active },

        { lastIPs: 0, lastConnection: 0 },
      )
      if (!result) {
        return new CouldNotFindUserFromUsernameError(username)
      }

      return userFromRaw(result)
    } catch (err) {
      return new UnknownRepositoryError(err)
    }
  }

  const findByPhone = async (phone: PhoneNumber): Promise<User | RepositoryError> => {
    try {
      const result = await User.findOne({ phone })
      if (!result) {
        return new CouldNotFindUserFromPhoneError(phone)
      }

      return userFromRaw(result)
    } catch (err) {
      return new UnknownRepositoryError(err)
    }
  }

  const persistNew = async ({
    phone,
    phoneMetadata,
  }: NewUserInfo): Promise<User | RepositoryError> => {
    try {
      const user = new User()
      user.phone = phone
      user.twilio = phoneMetadata
      await user.save()
      return userFromRaw(user)
    } catch (err) {
      return new UnknownRepositoryError(err)
    }
  }

  const findByWalletPublicId = async (
    walletPublicId: WalletPublicId,
  ): Promise<User | RepositoryError> => {
    try {
      const result = await User.findOne(
        { walletPublicId },
        { lastIPs: 0, lastConnection: 0 },
      )
      if (!result) {
        return new CouldNotFindUserFromWalletIdError(walletPublicId)
      }

      return userFromRaw(result)
    } catch (err) {
      return new UnknownRepositoryError(err)
    }
  }

  const update = async ({
    id,
    phone,
    language,
    contacts,
    deviceTokens,
    twoFA,
    email,
  }: User): Promise<User | RepositoryError> => {
    try {
      const data = {
        phone,
        language,
        contacts: contacts.map(
          ({
            id,
            username,
            lightningAddress,
            alias,
            transactionsCount,
          }: UserContact) => ({
            id: username || id,
            lightningAddress,
            name: alias,
            transactionsCount,
          }),
        ),
        deviceToken: deviceTokens,
        twoFA,
        email,
      }
      const result = await User.findOneAndUpdate({ _id: id }, data)
      if (!result) {
        return new RepositoryError("Couldn't update user")
      }
      return userFromRaw(result)
    } catch (err) {
      return new UnknownRepositoryError(err)
    }
  }

  return {
    findById,
    findByUsername,
    findByPhone,
    persistNew,
    findByWalletPublicId,
    update,
  }
}

const userFromRaw = (result: UserType): User => ({
  id: result.id as UserId,
  username: result.username as Username,
  walletPublicId: result.walletPublicId as WalletPublicId,
  phone: result.phone as PhoneNumber,
  language: result.language as UserLanguage,
  twoFA: result.twoFA as TwoFAForUser,
  email: result.email as Email,
  contacts: result.contacts.reduce(
    (res: UserContact[], contact: ContactObjectForUser): UserContact[] => {
      const contactId = contact.lightningAddress || contact.id
      if (contactId) {
        res.push({
          id: contactId as ContactId,
          username: contact.lightningAddress ? undefined : (contact.id as Username),
          lightningAddress: contact.lightningAddress as LightningAddress | undefined,
          alias: (contact.name || contactId) as ContactAlias,
          transactionsCount: contact.transactionsCount,
        })
      }
      return res
    },
    [],
  ),
  quizQuestions:
    result.earn?.map(
      (questionId: string): UserQuizQuestion => ({
        question: {
          id: questionId as QuizQuestionId,
          earnAmount: toSats(onboardingEarn[questionId]),
        },
        completed: true,
      }),
    ) || [],
  defaultAccountId: result.id as AccountId,
  deviceTokens: (result.deviceToken || []) as DeviceToken[],
  createdAt: new Date(result.created_at),
  phoneMetadata: result.twilio as PhoneMetadata,
})
