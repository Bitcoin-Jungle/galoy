import { GT } from "@graphql/index"

const BoltCardLimitsInput = new GT.Input({
  name: "BoltCardLimitsInput",
  fields: () => ({
    tx: { type: GT.Int },
    daily: { type: GT.Int },
  }),
})

export default BoltCardLimitsInput 