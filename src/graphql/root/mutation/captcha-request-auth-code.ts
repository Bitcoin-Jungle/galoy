import { GT } from "@graphql/index"

import Phone from "@graphql/types/scalar/phone"
import SuccessPayload from "@graphql/types/payload/success-payload"
import { requestPhoneCodeWithCaptcha } from "@app/users/request-phone-code"
import { mapError } from "@graphql/error-map"

const CaptchaRequestAuthCodeInput = new GT.Input({
  name: "CaptchaRequestAuthCodeInput",
  fields: () => ({
    phone: { type: GT.NonNull(Phone) },
    whatsapp: { type: GT.Boolean, defaultValue: false },
    challengeCode: { type: GT.NonNull(GT.String) },
    validationCode: { type: GT.NonNull(GT.String) },
    secCode: { type: GT.NonNull(GT.String) },
  }),
})

const CaptchaRequestAuthCodeMutation = GT.Field({
  type: GT.NonNull(SuccessPayload),
  args: {
    input: { type: GT.NonNull(CaptchaRequestAuthCodeInput) },
  },
  resolve: async (_, args, { logger, ip, geetest }) => {
    const {
      phone,
      whatsapp,
      challengeCode: geetestChallenge,
      validationCode: geetestValidate,
      secCode: geetestSeccode,
    } = args.input

    for (const input of [phone, geetestChallenge, geetestValidate, geetestSeccode, whatsapp]) {
      if (input instanceof Error) {
        return { errors: [{ message: input.message }] }
      }
    }

    const result = await requestPhoneCodeWithCaptcha({
      phone,
      whatsapp,
      geetest,
      geetestChallenge,
      geetestValidate,
      geetestSeccode,
      logger,
      ip,
    })

    if (result instanceof Error) {
      const appErr = mapError(result)

      return {
        errors: [{ message: appErr.message }],
        success: false,
      }
    }

    return {
      errors: [],
      success: true,
    }
  },
})

export default CaptchaRequestAuthCodeMutation
