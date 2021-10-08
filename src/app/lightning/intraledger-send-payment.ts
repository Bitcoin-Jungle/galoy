import { addNewContact } from "@app/users/add-new-contact"
import { getBalanceForWallet } from "@app/wallets"
import { checkAndVerifyTwoFA, getLimitsChecker } from "@core/accounts/helpers"
import { toSats } from "@domain/bitcoin"
import { PaymentSendStatus } from "@domain/bitcoin/lightning"
import {
  CouldNotFindError,
  InsufficientBalanceError,
  InvalidSatoshiAmount,
  NoUserForUsernameError,
  NoWalletExistsForUserError,
  SelfPaymentError,
} from "@domain/errors"
import { toLiabilitiesAccountId } from "@domain/ledger"
import { TwoFAError, TwoFANewCodeNeededError } from "@domain/twoFA"
import { LedgerService } from "@services/ledger"
import { LockService } from "@services/lock"
import {
  AccountsRepository,
  UsersRepository,
  WalletsRepository,
} from "@services/mongoose"
import { PriceService } from "@services/price"

export const intraledgerPaymentSend = async (
  args: IntraLedgerPaymentSendArgs,
): Promise<PaymentSendStatus | ApplicationError> =>
  intraledgerPaymentSendWithTwoFA({
    twoFAToken: null,
    ...args,
  })

export const intraledgerPaymentSendWithTwoFA = async ({
  recipientUsername,
  amount,
  memo,
  walletId,
  userId,
  twoFAToken,
  logger,
}: IntraLedgerPaymentSendWithTwoFAArgs): Promise<
  PaymentSendStatus | ApplicationError
> => {
  if (!amount) {
    const error = "Amount missing"
    return new InvalidSatoshiAmount(error)
  }
  if (amount <= 0) {
    const error = "Amount cannot be negative or zero"
    return new InvalidSatoshiAmount(error)
  }

  return intraledgerSendPayment({
    walletId,
    userId,
    recipientUsername,
    paymentAmount: amount,
    memo: memo || "",
    twoFAToken,
    logger,
  })
}

const intraledgerSendPayment = async ({
  walletId,
  userId,
  recipientUsername,
  paymentAmount,
  memo,
  twoFAToken,
  logger,
}: {
  walletId: WalletId
  userId: UserId
  recipientUsername: Username
  paymentAmount: Satoshis
  memo: string
  twoFAToken: TwoFAToken | null
  logger: Logger
}): Promise<PaymentSendStatus | ApplicationError> => {
  const limitsChecker = await getLimitsChecker(walletId)
  if (limitsChecker instanceof Error) return limitsChecker

  const user = await UsersRepository().findById(userId)
  if (user instanceof Error) return user
  const { twoFA } = user

  const twoFACheck = twoFA?.secret
    ? await checkAndVerifyTwoFA({
        amount: paymentAmount,
        twoFAToken: twoFAToken ? (twoFAToken as TwoFAToken) : null,
        twoFASecret: twoFA.secret,
        limitsChecker: limitsChecker,
      })
    : true
  if (twoFACheck instanceof TwoFANewCodeNeededError)
    return new TwoFAError("Need a 2FA code to proceed with the payment")
  if (twoFACheck instanceof Error) return twoFACheck

  const paymentSendStatus = await executePaymentViaIntraledger({
    userId,
    recipientUsername,
    paymentAmount,
    memo,
    walletId,
    username: user.username,
    limitsChecker,
    logger,
  })

  const addContactToPayerResult = await addNewContact({
    userId,
    contactUsername: recipientUsername,
  })
  if (addContactToPayerResult instanceof Error) return addContactToPayerResult

  return paymentSendStatus
}

const executePaymentViaIntraledger = async ({
  userId,
  recipientUsername,
  paymentAmount,
  memo,
  walletId,
  username,
  limitsChecker,
  logger,
}: {
  userId: UserId
  recipientUsername: Username
  paymentAmount: Satoshis
  memo: string
  walletId: WalletId
  username: Username
  limitsChecker: LimitsChecker
  logger: Logger
}): Promise<PaymentSendStatus | ApplicationError> => {
  const intraledgerLimitCheck = limitsChecker.checkIntraledger({
    amount: paymentAmount,
  })
  if (intraledgerLimitCheck instanceof Error) return intraledgerLimitCheck

  const recipientUser = await UsersRepository().findByUsername(recipientUsername)
  if (recipientUser instanceof CouldNotFindError)
    return new NoUserForUsernameError(recipientUsername)
  if (recipientUser instanceof Error) return recipientUser
  if (recipientUser.id === userId) return new SelfPaymentError()

  const recipientAccount = await AccountsRepository().findById(
    recipientUser.defaultAccountId,
  )
  if (recipientAccount instanceof Error) return recipientAccount
  if (!(recipientAccount.walletIds && recipientAccount.walletIds.length > 0)) {
    return new NoWalletExistsForUserError(recipientUsername)
  }
  const recipientWalletId = recipientAccount.walletIds[0]

  const payerWallet = await WalletsRepository().findById(walletId)
  if (payerWallet instanceof CouldNotFindError) return payerWallet
  if (payerWallet instanceof Error) return payerWallet
  const recipientWallet = await WalletsRepository().findById(recipientWalletId)
  if (recipientWallet instanceof CouldNotFindError) return recipientWallet
  if (recipientWallet instanceof Error) return recipientWallet

  const price = await PriceService().getCurrentPrice()
  if (price instanceof Error) return price
  const lnFee = toSats(0)
  const sats = toSats(paymentAmount + lnFee)
  const usd = sats * price
  const usdFee = lnFee * price

  return LockService().lockWalletId({ walletId, logger }, async (lock) => {
    const balance = await getBalanceForWallet({ walletId, logger })
    if (balance instanceof Error) return balance
    if (balance < sats) {
      return new InsufficientBalanceError(
        `Payment amount '${sats}' exceeds balance '${balance}'`,
      )
    }

    const liabilitiesAccountId = toLiabilitiesAccountId(walletId)
    const journal = await LockService().extendLock({ logger, lock }, async () =>
      LedgerService().addUsernameIntraledgerTxSend({
        liabilitiesAccountId,
        description: "",
        sats,
        fee: lnFee,
        usd,
        usdFee,
        recipientLiabilitiesAccountId: toLiabilitiesAccountId(recipientWalletId),
        payerUsername: username,
        recipientUsername,
        payerWalletPublicId: payerWallet.publicId,
        recipientWalletPublicId: recipientWallet.publicId,
        memoPayer: memo,
      }),
    )
    if (journal instanceof Error) return journal

    return PaymentSendStatus.Success
  })
}
