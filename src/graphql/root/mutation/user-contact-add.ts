import { GT } from "@graphql/index"
import Username from "@graphql/types/scalar/username"
import ContactAlias from "@graphql/types/scalar/contact-alias"
import LightningAddress from "@graphql/types/scalar/lightning-address"

import * as Users from "@app/users"
import UserContactAddPayload from "@graphql/types/payload/user-contact-add"

const UserContactAddInput = new GT.Input({
  name: "UserContactAddInput",
  fields: () => ({
    username: { type: Username },
    lightningAddress: { type: LightningAddress },
    alias: { type: ContactAlias },
  }),
})

const UserContactAddMutation = GT.Field({
  type: GT.NonNull(UserContactAddPayload),
  args: {
    input: { type: GT.NonNull(UserContactAddInput) },
  },
  resolve: async (_, args, { uid }) => {
    const { username, lightningAddress, alias } = args.input

    for (const input of [username, lightningAddress, alias]) {
      if (input instanceof Error) {
        return { errors: [{ message: input.message }] }
      }
    }

    const contact = await Users.addContact({
      userId: uid as UserId,
      username,
      lightningAddress,
      alias,
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

export default UserContactAddMutation
