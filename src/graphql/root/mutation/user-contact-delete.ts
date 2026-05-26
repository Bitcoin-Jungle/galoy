import { GT } from "@graphql/index"
import Username from "@graphql/types/scalar/username"
import LightningAddress from "@graphql/types/scalar/lightning-address"

import * as Users from "@app/users"
import UserContactDeletePayload from "@graphql/types/payload/user-contact-delete"

const UserContactDeleteInput = new GT.Input({
  name: "UserContactDeleteInput",
  fields: () => ({
    username: { type: Username },
    lightningAddress: { type: LightningAddress },
  }),
})

const UserContactDeleteMutation = GT.Field({
  type: GT.NonNull(UserContactDeletePayload),
  args: {
    input: { type: GT.NonNull(UserContactDeleteInput) },
  },
  resolve: async (_, args, { uid }) => {
    const { username, lightningAddress } = args.input

    for (const input of [username, lightningAddress]) {
      if (input instanceof Error) {
        return { errors: [{ message: input.message }] }
      }
    }

    const contact = await Users.deleteContact({
      userId: uid as UserId,
      username,
      lightningAddress,
    })

    if (contact instanceof Error) {
      return { errors: [{ message: contact.message }] }
    }

    return {
      errors: [],
      contact,
    }
  },
})

export default UserContactDeleteMutation
