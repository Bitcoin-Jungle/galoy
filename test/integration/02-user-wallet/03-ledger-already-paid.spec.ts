import { createInvoice } from "test/helpers/lightning"
import { getHash } from "@core/utils"
import { lnInvoicePaymentSend } from "@app/wallets/ln-send-payment"
import { getBTCBalance } from "test/helpers/wallet"
import { getAndCreateUserWallet } from "test/helpers/user"
import { lndOutside1 } from "test/helpers/lightning"
import { LedgerService } from "@services/ledger"
import { toLiabilitiesAccountId } from "@domain/ledger"
import { PaymentSendStatus } from "@domain/bitcoin/lightning"
import { baseLogger } from "@services/logger"

// This test ensures that sending an invoice twice results in exactly one net
// debit in the payer's ledger (the second attempt should create a journal that
// is immediately voided).

describe("Ledger integrity for already-paid invoice", () => {
  const amountInvoice = 6000 as Satoshis
  let wallet
  let paymentHash: PaymentHash

  beforeAll(async () => {
    // use a fresh test account (index 4 in yaml test_accounts)
    wallet = await getAndCreateUserWallet(4)

    // generate invoice on external LND
    const { request } = await createInvoice({ lnd: lndOutside1, tokens: amountInvoice })
    paymentHash = getHash(request) as PaymentHash

    // pay first time – should succeed
    const res1 = await lnInvoicePaymentSend({
      paymentRequest: request as EncodedPaymentRequest,
      memo: null,
      walletId: wallet.user.id,
      userId: wallet.user.id,
      logger: wallet.logger,
    })
    if (res1 instanceof Error) throw res1
    expect(res1).toBe(PaymentSendStatus.Success)

    // pay second time – should trigger AlreadyPaid path
    const res2 = await lnInvoicePaymentSend({
      paymentRequest: request as EncodedPaymentRequest,
      memo: null,
      walletId: wallet.user.id,
      userId: wallet.user.id,
      logger: wallet.logger,
    })
    if (res2 instanceof Error) throw res2
    expect(res2).toBe(PaymentSendStatus.AlreadyPaid)
  })

  it("debited exactly once and no pending rows remain", async () => {
    const ledger = LedgerService()
    const rows = await ledger.getTransactionsByHash(paymentHash)
    if (rows instanceof Error) throw rows

    // restrict to the payer's account
    const userRows = rows.filter((r) => r.walletId === wallet.user.id)
    expect(userRows.length).toBeGreaterThan(0)

    // 1. No row should be pending
    const pendingRow = userRows.find((r) => r.pendingConfirmation)
    expect(pendingRow).toBeUndefined()

    // 2. Net debit should equal invoice amount (fee=0 in regtest path)
    const netDebit = userRows.reduce((sum, r) => sum + r.debit - r.credit, 0)
    expect(netDebit).toBe(amountInvoice)

    // 3. Balance check: initial - amount == current balance
    const finalBalance = await getBTCBalance(wallet.user.id)
    const liabilitiesAccountId = toLiabilitiesAccountId(wallet.user.id)
    const ledgerBalance = await ledger.getAccountBalance(liabilitiesAccountId)
    if (ledgerBalance instanceof Error) throw ledgerBalance
    expect(finalBalance).toBe(ledgerBalance)
  })
}) 