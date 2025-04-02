import { getTwilioConfig } from "@config/app"
import { UnknownPhoneProviderServiceError } from "@domain/phone-provider"
import { baseLogger } from "@services/logger"
import twilio from "twilio"

export const TwilioClient = (): IPhoneProviderService => {
  const client = twilio(getTwilioConfig().apiKey, getTwilioConfig().apiSecret, {
    accountSid: getTwilioConfig().accountSid,
  })

  const sendText = async ({ body, to, whatsapp, logger }: SendTextArguments) => {
    const twilioPhoneNumber = getTwilioConfig().twilioPhoneNumber
    const twilioWhatsappContentSid = getTwilioConfig().twilioWhatsappContentSid

    const sendObj: any = {
      to,
      from: twilioPhoneNumber,
    }

    if (whatsapp) {
      sendObj.to = `whatsapp:${to}`
      sendObj.contentSid = twilioWhatsappContentSid,
      sendObj.contentVariables = JSON.stringify({
        1: body.split(" ")[0],
      })
    } else {
      sendObj.body = body
    }

    try {
      await client.messages.create(sendObj)
    } catch (err) {
      logger.error({ err }, "impossible to send text")
      return new UnknownPhoneProviderServiceError(err)
    }

    logger.info({ to }, "sent text successfully")
    return true
  }

  const getCarrier = async (phone: PhoneNumber) => {
    try {
      const result = await client.lookups.v1.phoneNumbers(phone).fetch({ type: ["carrier"] })
      baseLogger.info({ result }, "result carrier info")

      // TODO: migration to save the converted value to mongoose instead
      // of the one returned from twilio
      // const mappedValue = {
      //   carrier: {
      //     errorCode: result.carrier?.error_code,
      //     mobileCountryCode: result.carrier?.mobile_country_code,
      //     mobileNetworkCode: result.carrier?.mobile_network_code,
      //     name: result.carrier?.name,
      //     type: result.carrier?.type,
      //   },
      //   countryCode: result.countryCode,
      // }

      const phoneMetadata: PhoneMetadata = {
        carrier: {
          error_code: result.carrier.error_code?.toString() || "",
          mobile_country_code: result.carrier.mobile_country_code?.toString() || "",
          mobile_network_code: result.carrier.mobile_network_code?.toString() || "",
          name: result.carrier.name?.toString() || "",
          type: (result.carrier.type?.toString() || "mobile") as CarrierType,
        },
        countryCode: result.countryCode,
      }

      return phoneMetadata
    } catch (err) {
      return new UnknownPhoneProviderServiceError(err)
    }
  }

  return { getCarrier, sendText }
}
