import {
  getGaloyInstanceName,
  getRequestPhoneCodePerIpLimits,
  getRequestPhoneCodePerPhoneLimits,
  getRequestPhoneCodePerPhoneMinIntervalLimits,
} from "@config/app"
import { randomIntFromInterval } from "@core/utils"
import { UnknownPhoneProviderServiceError } from "@domain/phone-provider"
import { RateLimitPrefix } from "@domain/rate-limit"
import { RateLimiterExceededError } from "@domain/rate-limit/errors"
import { PhoneCodesRepository } from "@services/mongoose/phone-code"
import { RedisRateLimitService } from "@services/rate-limit"
import { TwilioClient } from "@services/twilio"
import { isTestAccountPhone } from "."

export const requestPhoneCodeWithCaptcha = async ({
  phone,
  whatsapp,
  geetest,
  geetestChallenge,
  geetestValidate,
  geetestSeccode,
  logger,
  ip,
}: {
  phone: PhoneNumber
  whatsapp: boolean
  geetest: GeetestType
  geetestChallenge: string
  geetestValidate: string
  geetestSeccode: string
  logger: Logger
  ip: IpAddress
}): Promise<true | CaptchaError | UnknownPhoneProviderServiceError> => {
  logger.info({ phone, ip }, "RequestPhoneCodeGeetest called")

  const verifySuccess = await geetest.validate(
    geetestChallenge,
    geetestValidate,
    geetestSeccode,
  )
  if (verifySuccess instanceof Error) return verifySuccess

  return requestPhoneCode({
    phone,
    logger,
    whatsapp,
    ip,
  })
}

export const requestPhoneCode = async ({
  phone,
  whatsapp,
  logger,
  ip,
}: {
  phone: PhoneNumber
  whatsapp: boolean
  logger: Logger
  ip: IpAddress
}): Promise<true | UnknownPhoneProviderServiceError> => {
  logger.info({ phone, ip }, "RequestPhoneCode called")

  {
    const limitOk = await checkPhoneCodeAttemptPerIpLimits(ip)
    if (limitOk instanceof Error) return limitOk
  }

  {
    const limitOk = await checkPhoneCodeAttemptPerPhoneLimits(phone)
    if (limitOk instanceof Error) return limitOk
  }

  {
    const limitOk = await checkPhoneCodeAttemptPerPhoneMinIntervalLimits(phone)
    if (limitOk instanceof Error) return limitOk
  }

  if (isTestAccountPhone(phone)) {
    return true
  }

  const code = String(randomIntFromInterval(100000, 999999)) as PhoneCode
  const galoyInstanceName = getGaloyInstanceName()
  const body = `${code} is your verification code. For your security, do not share this code.`

  const result = await PhoneCodesRepository().persistNew({ phone, code })
  if (result instanceof Error) return result

  const sendTextArguments = { body, to: phone, whatsapp, logger }

  return TwilioClient().sendText(sendTextArguments)
}

const checkPhoneCodeAttemptPerIpLimits = async (
  ip: IpAddress,
): Promise<true | RateLimiterExceededError> => {
  const limiter = RedisRateLimitService({
    keyPrefix: RateLimitPrefix.requestPhoneCodeAttemptPerIp,
    limitOptions: getRequestPhoneCodePerIpLimits(),
  })
  return limiter.consume(ip)
}

const checkPhoneCodeAttemptPerPhoneLimits = async (
  phone: PhoneNumber,
): Promise<true | RateLimiterExceededError> => {
  const limiter = RedisRateLimitService({
    keyPrefix: RateLimitPrefix.requestPhoneCodeAttemptPerPhone,
    limitOptions: getRequestPhoneCodePerPhoneLimits(),
  })
  return limiter.consume(phone)
}

const checkPhoneCodeAttemptPerPhoneMinIntervalLimits = async (
  phone: PhoneNumber,
): Promise<true | RateLimiterExceededError> => {
  const limiter = RedisRateLimitService({
    keyPrefix: RateLimitPrefix.requestPhoneCodeAttemptPerPhoneMinInterval,
    limitOptions: getRequestPhoneCodePerPhoneMinIntervalLimits(),
  })
  return limiter.consume(phone)
}
