import { GT } from "@graphql/index"
import SatAmount from "@graphql/types/scalar/sat-amount"
import SuccessPayload from "@graphql/types/payload/success-payload"
import { ledger } from "@services/mongodb"
import { UserWallet } from "@core/user-wallet"

const AddColdStoragePaymentInput = new GT.Input({
  name: "AddColdStoragePaymentInput",
  fields: () => ({
    description: {
      type: GT.String,
    },
    amount: {
      type: GT.NonNull(SatAmount),
    },
    fee: {
      type: GT.NonNull(SatAmount),
    },
    hash: {
      type: GT.String,
    },
  }),
})

const AddColdStoragePaymentMutation = GT.Field({
  type: GT.NonNull(SuccessPayload),
  args: {
    input: { type: GT.NonNull(AddColdStoragePaymentInput) },
  },
  resolve: async (_, args) => {
    const { description, amount, fee, hash } = args.input

    for (const input of [description, amount, fee, hash]) {
      if (input instanceof Error) {
        return { errors: [{ message: input.message }] }
      }
    }

    const paymentObj = {
      description,
      amount,
      fee,
      metadata: {
        hash: hash,
        ...UserWallet.getCurrencyEquivalent({ sats: amount, fee }),
      },
    }
    
    const result = await ledger.addColdStoragePayment(paymentObj)
    
    return { errors: [], success: true }
  },
})

export default AddColdStoragePaymentMutation
