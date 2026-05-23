import { GT } from "@graphql/index"
import { UserInputError } from "apollo-server-errors"
import { checkedToLightningAddress } from "@domain/users"

const LightningAddress = new GT.Scalar({
  name: "LightningAddress",
  description: "A lightning address in local@domain format.",
  parseValue(value) {
    return validLightningAddressValue(value)
  },
  parseLiteral(ast) {
    if (ast.kind === GT.Kind.STRING) {
      return validLightningAddressValue(ast.value)
    }
    return new UserInputError("Invalid type for LightningAddress")
  },
})

function validLightningAddressValue(value) {
  const lightningAddress = checkedToLightningAddress(value)
  if (lightningAddress instanceof Error) {
    return new UserInputError("Invalid value for LightningAddress")
  }
  return lightningAddress
}

export default LightningAddress
