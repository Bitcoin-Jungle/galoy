import { GT } from "@graphql/index"

import IError from "../abstract/error"
import UserContact from "../object/wallet-contact"

const UserContactDeletePayload = new GT.Object({
  name: "UserContactDeletePayload",
  fields: () => ({
    errors: {
      type: GT.NonNullList(IError),
    },
    contact: {
      type: UserContact,
    },
  }),
})

export default UserContactDeletePayload
