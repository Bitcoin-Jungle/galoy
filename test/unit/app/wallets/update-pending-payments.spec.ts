import { updatePendingPayments } from "@app/wallets/update-pending-payments"
import { PaymentStatus } from "@domain/bitcoin/lightning"

// Mock services -------------------------------------------------------------

const mockSettlePending = jest.fn()
const mockVoidJournal = jest.fn()
const mockIsLnTxRecorded = jest.fn()
const mockListPendingPayments = jest.fn()
const mockGetPendingPaymentsCount = jest.fn()
const mockAddFeeReimbursement = jest.fn()

jest.mock("@services/ledger", () => {
  return {
    LedgerService: () => ({
      settlePendingLnPayments: mockSettlePending,
      voidLedgerTransactionsForJournal: mockVoidJournal,
      isLnTxRecorded: mockIsLnTxRecorded,
      listPendingPayments: mockListPendingPayments,
      getPendingPaymentsCount: mockGetPendingPaymentsCount,
      addLnFeeReimbursementReceive: mockAddFeeReimbursement,
    }),
  }
})

const mockLookupPayment = jest.fn()

jest.mock("@services/lnd", () => {
  return {
    LndService: () => ({
      lookupPayment: mockLookupPayment,
    }),
  }
})

// Lock service just runs the callback immediately
jest.mock("@services/lock", () => {
  return {
    LockService: () => ({
      lockPaymentHash: async ({}, cb) => cb(),
    }),
  }
})

// Helper --------------------------------------------------------------------
const basePaymentTx = {
  paymentHash: "hash" as PaymentHash,
  pubkey: "pubkey" as Pubkey,
  journalId: "journalId" as LedgerJournalId,
  fee: 3 as Satoshis,
  feeKnownInAdvance: true,
} as unknown as LedgerTransaction

const fiveMinutesMs = 5 * 60 * 1000

describe("updatePendingPayments grace-period logic", () => {
  const walletId = "walletId" as WalletId
  const logger = {
    child: () => logger,
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as Logger

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetPendingPaymentsCount.mockResolvedValue(1)
    mockListPendingPayments.mockResolvedValue([basePaymentTx])
    mockIsLnTxRecorded.mockResolvedValue(false)
  })

  it("does NOT void when payment is Failed but within grace period", async () => {
    mockLookupPayment.mockResolvedValue({
      status: PaymentStatus.Failed,
      roundedUpFee: 0 as Satoshis,
      createdAt: new Date(Date.now() - fiveMinutesMs + 30000), // 30s before grace ends
    })

    await updatePendingPayments({ walletId, logger })

    expect(mockVoidJournal).not.toHaveBeenCalled()
    expect(mockSettlePending).not.toHaveBeenCalled()
  })

  it("voids when payment is Failed and past grace period", async () => {
    mockLookupPayment.mockResolvedValue({
      status: PaymentStatus.Failed,
      roundedUpFee: 0 as Satoshis,
      createdAt: new Date(Date.now() - fiveMinutesMs - 1000), // past grace
    })

    await updatePendingPayments({ walletId, logger })

    expect(mockSettlePending).toHaveBeenCalledTimes(1)
    expect(mockVoidJournal).toHaveBeenCalledTimes(1)
  })

  it("settles when payment is Settled", async () => {
    mockLookupPayment.mockResolvedValue({
      status: PaymentStatus.Settled,
      roundedUpFee: 0 as Satoshis,
      createdAt: new Date(),
    })

    await updatePendingPayments({ walletId, logger })

    expect(mockSettlePending).toHaveBeenCalledTimes(1)
    expect(mockVoidJournal).not.toHaveBeenCalled()
  })
}) 