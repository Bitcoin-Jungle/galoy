import { GT } from "@graphql/index"

import GraphQLUser from "../object/graphql-user"
import IError from "../abstract/error"

const UserUpdateEmailPayload = new GT.Object({
  name: "UserUpdateEmailPayload",
  fields: () => ({
    errors: {
      type: GT.NonNullList(IError),
    },
    user: {
      type: GraphQLUser,
    },
  }),
})

export default UserUpdateEmailPayload 