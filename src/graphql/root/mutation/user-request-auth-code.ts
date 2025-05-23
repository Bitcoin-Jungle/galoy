import { GT } from "@graphql/index"

import Phone from "@graphql/types/scalar/phone"
import SuccessPayload from "@graphql/types/payload/success-payload"
import { requestPhoneCode } from "@app/users/request-phone-code"
import { mapError } from "@graphql/error-map"

const UserRequestAuthCodeInput = new GT.Input({
  name: "UserRequestAuthCodeInput",
  fields: () => ({
    phone: {
      type: GT.NonNull(Phone),
    },
    whatsapp: {
      type: GT.Boolean,
      defaultValue: false,
    },
  }),
})

const UserRequestAuthCodeMutation = GT.Field({
  type: GT.NonNull(SuccessPayload),
  args: {
    input: { type: GT.NonNull(UserRequestAuthCodeInput) },
  },
  resolve: async (_, args, { user, logger, ip }) => {
    if (user) {
      return { errors: [{ message: "Invalid request" }] } // TODO: confirm
    }

    const { phone, whatsapp } = args.input

    if (phone instanceof Error) {
      return { errors: [{ message: phone.message }] }
    }

    const status = await requestPhoneCode({ phone, whatsapp, logger, ip })

    if (status instanceof Error) {
      return { errors: [{ message: mapError(status) }] }
    }

    return { errors: [], success: status }
  },
})

export default UserRequestAuthCodeMutation
