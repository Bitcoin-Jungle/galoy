export const UserLanguage = {
  DEFAULT: "",
  EN_US: "en",
  ES_SV: "es",
} as const

import { InvalidLightningAddress, InvalidUsername } from "@domain/errors"

export const UsernameRegex = /(?!^(1|3|bc1|lnbc1))^[0-9a-z_]{3,50}$/i
export const LightningAddressRegex =
  /^(?=.{3,320}$)(?=.{1,64}@)[0-9a-z.!#$%&'*+/=?^_`{|}~-]+@(?:[0-9a-z](?:[0-9a-z-]{0,61}[0-9a-z])?\.)+[a-z]{2,63}$/i

export const checkedToUsername = (username: string): Username | ValidationError => {
  if (!username.match(UsernameRegex)) {
    return new InvalidUsername(username)
  }
  return username as Username
}

export const checkedToLightningAddress = (
  lightningAddress: string,
): LightningAddress | ValidationError => {
  if (!lightningAddress.match(LightningAddressRegex)) {
    return new InvalidLightningAddress(lightningAddress)
  }
  return lightningAddress.toLowerCase() as LightningAddress
}
