import { GT } from "@graphql/index"

import UserUpdateEmailPayload from "@graphql/types/payload/user-update-email"

const UserUpdateEmailInput = new GT.Input({
  name: "UserUpdateEmailInput",
  fields: () => ({
    email: { type: GT.String },
  }),
})

const UserUpdateEmailMutation = GT.Field({
  type: GT.NonNull(UserUpdateEmailPayload),
  args: {
    input: { type: GT.NonNull(UserUpdateEmailInput) },
  },
  resolve: async (_, args, { wallet }) => {
    const { email } = args.input

    // Allow setting email to null to remove it
    const result = await wallet.updateEmail({ email })

    if (result instanceof Error) {
      return { errors: [{ message: result.message }] }
    }

    return {
      errors: [],
      user: result,
    }
  },
})

export default UserUpdateEmailMutation 