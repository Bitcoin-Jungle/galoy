import { GT } from "@graphql/index"

import IError from "../abstract/error"
import UserContact from "../object/wallet-contact"

const UserContactAddPayload = new GT.Object({
  name: "UserContactAddPayload",
  fields: () => ({
    errors: {
      type: GT.NonNullList(IError),
    },
    contact: {
      type: UserContact,
    },
  }),
})

export default UserContactAddPayload
