import { getGenericLimits, MS_PER_HOUR } from "@config/app"
import { generateTokenHelper, getAndCreateUserWallet } from "test/helpers"
import { updateUserAccountStatus, usernameExists } from "@core/user"

let userWallet0, userWallet1, userWallet2
const username = "user0"

describe("UserWallet", () => {
  beforeAll(async () => {
    userWallet0 = await getAndCreateUserWallet(0)
    userWallet1 = await getAndCreateUserWallet(1)
    userWallet2 = await getAndCreateUserWallet(2)
    // load funder wallet before use it
    await getAndCreateUserWallet(4)
  })

  it("has a role if it was configured", async () => {
    const dealer = await getAndCreateUserWallet(6)
    expect(dealer.user.role).toBe("dealer")
  })

  it("has currencies if they were configured", async () => {
    const user5 = await getAndCreateUserWallet(5)
    expect(user5.user.currencies[0]).toMatchObject({ id: "USD", ratio: 1 })
  })

  it("has a title if it was configured", () => {
    expect(userWallet2.user.title).toBeTruthy()
  })

  it("does not allow withdraw if the user is new", () => {
    expect(userWallet2.user.oldEnoughForWithdrawal).toBeFalsy()

    // in 6 days:
    const genericLimits = getGenericLimits()
    const date =
      Date.now() + genericLimits.oldEnoughForWithdrawalMicroseconds - MS_PER_HOUR

    jest.spyOn(global.Date, "now").mockImplementationOnce(() => new Date(date).valueOf())

    expect(userWallet2.user.oldEnoughForWithdrawal).toBeFalsy()
  })

  it("allows withdraw if user is old enough", () => {
    expect(userWallet2.user.oldEnoughForWithdrawal).toBeFalsy()

    // TODO make this configurable
    // in 8 days:
    const genericLimits = getGenericLimits()
    const date =
      Date.now() + genericLimits.oldEnoughForWithdrawalMicroseconds + MS_PER_HOUR

    jest.spyOn(global.Date, "now").mockImplementationOnce(() => new Date(date).valueOf())

    expect(userWallet2.user.oldEnoughForWithdrawal).toBeTruthy()
  })

  describe("setUsername", () => {
    it("does not set username if length is less than 3", async () => {
      await expect(userWallet0.setUsername({ username: "ab" })).rejects.toThrow()
    })

    it("does not set username if contains invalid characters", async () => {
      await expect(userWallet0.setUsername({ username: "ab+/" })).rejects.toThrow()
    })

    it("does not allow non english characters", async () => {
      await expect(userWallet0.setUsername({ username: "ñ_user1" })).rejects.toThrow()
    })

    it("does not set username starting with 1, 3, bc1, lnbc1", async () => {
      await expect(userWallet0.setUsername({ username: "1ab" })).rejects.toThrow()
      await expect(userWallet0.setUsername({ username: "3basd" })).rejects.toThrow()
      await expect(userWallet0.setUsername({ username: "bc1ba" })).rejects.toThrow()
      await expect(userWallet0.setUsername({ username: "lnbc1qwe1" })).rejects.toThrow()
    })

    it("allows set username", async () => {
      let result = await userWallet0.setUsername({ username: "user0" })
      expect(!!result).toBeTruthy()
      result = await userWallet1.setUsername({ username: "user1" })
      expect(!!result).toBeTruthy()
      result = await userWallet2.setUsername({ username: "lily" })
      expect(!!result).toBeTruthy()
    })

    it("does not allow set username if already taken", async () => {
      await getAndCreateUserWallet(2)
      await expect(userWallet2.setUsername({ username })).rejects.toThrow()
    })

    it("does not allow set username with only case difference", async () => {
      await expect(userWallet2.setUsername({ username: "User1" })).rejects.toThrow()
    })

    it("does not allow re-setting username", async () => {
      await expect(userWallet0.setUsername({ username: "abc" })).rejects.toThrow()
    })
  })

  describe("usernameExists", () => {
    it("return true if username already exists", async () => {
      const result = await usernameExists({ username })
      expect(result).toBe(true)
    })

    it("return true for other capitalization", async () => {
      const result = await usernameExists({ username: username.toLocaleUpperCase() })
      expect(result).toBe(true)
    })

    it("return false if username does not exist", async () => {
      const result = await usernameExists({ username: "user" })
      expect(result).toBe(false)
    })
  })

  describe("getStringCsv", () => {
    const csvHeader =
      "voided,approved,_id,accounts,credit,debit,_journal,book,unix,date,datetime,currency,username,type,hash,txid,fee,feeUsd,sats,usd,memo,memoPayer,meta,pending"
    it("exports to csv", async () => {
      const base64Data = await userWallet0.getStringCsv()
      expect(typeof base64Data).toBe("string")
      const data = Buffer.from(base64Data, "base64")
      expect(data.includes(csvHeader)).toBeTruthy()
    })
  })

  describe("updateUserAccountStatus", () => {
    it("sets account status for given user id", async () => {
      let user = await updateUserAccountStatus({
        uid: userWallet2.user._id,
        status: "locked",
      })
      if (user instanceof Error) {
        throw user
      }
      expect(user.status).toBe("locked")
      user = await updateUserAccountStatus({ uid: user._id, status: "active" })
      if (user instanceof Error) {
        throw user
      }
      expect(user.status).toBe("active")
    })
  })

  describe("save2fa", () => {
    it("saves 2fa for user0", async () => {
      const { secret } = userWallet0.generate2fa()
      const token = generateTokenHelper({ secret })
      await userWallet0.save2fa({ secret, token })
      userWallet0 = await getAndCreateUserWallet(0)
      expect(userWallet0.user.twoFAEnabled).toBe(true)
      expect(userWallet0.user.twoFA.secret).toBe(secret)
    })
  })

  describe("delete2fa", () => {
    it("delete 2fa for user0", async () => {
      const token = generateTokenHelper({ secret: userWallet0.user.twoFA.secret })
      const result = await userWallet0.delete2fa({ token })
      expect(result).toBeTruthy()
      userWallet0 = await getAndCreateUserWallet(0)
      expect(userWallet0.user.twoFAEnabled).toBeFalsy()
    })
  })
})
