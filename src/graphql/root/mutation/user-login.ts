import { GT } from "@graphql/index"
import OneTimeAuthCode from "@graphql/types/scalar/one-time-auth-code"

import Phone from "@graphql/types/scalar/phone"
import AuthTokenPayload from "@graphql/types/payload/auth-token"
import { login } from "@app/users/login"
import { mapError } from "@graphql/error-map"

const UserLoginInput = new GT.Input({
  name: "UserLoginInput",
  fields: () => ({
    phone: {
      type: GT.NonNull(Phone),
    },
    code: {
      type: GT.NonNull(OneTimeAuthCode),
    },
  }),
})

const UserLoginMutation = GT.Field({
  type: GT.NonNull(AuthTokenPayload),
  args: {
    input: { type: GT.NonNull(UserLoginInput) },
  },
  resolve: async (_, args, { user, logger, ip }) => {
    if (user) {
      return { errors: [{ message: "Invalid request" }] } // TODO: confirm
    }

    const { phone, code } = args.input

    for (const input of [phone, code]) {
      if (input instanceof Error) {
        return { errors: [{ message: input.message }] }
      }
    }

    const authToken = await login({ phone, code, logger, ip })

    if (authToken instanceof Error) {
      const appErr = mapError(authToken)
      return { errors: [{ message: appErr.message }] }
    }

    return { errors: [], authToken }
  },
})

export default UserLoginMutation
