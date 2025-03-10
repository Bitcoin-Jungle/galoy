import { User } from "@services/mongoose/schema"
import { getAndCreateUserWallet } from "test/helpers"

describe("schema", () => {
  describe("User", () => {
    describe("getActiveUsers", () => {
      it("returns active users according to volume", async () => {
        await getAndCreateUserWallet(8)

        let spy = jest
          .spyOn(User, "getVolume")
          .mockImplementation(() => ({ outgoingSats: 50000, incomingSats: 100000 }))

        const activeUsers = await User.getActiveUsers()
        spy.mockClear()

        const accountIds = activeUsers.map((user) => user._id)
        const userWallet0AccountId = (await getAndCreateUserWallet(0)).user._id
        const funderWalletAccountId = (await User.findOne({ role: "funder" }))._id

        // userWallets used in the tests
        expect(accountIds).toEqual(
          expect.arrayContaining([userWallet0AccountId, funderWalletAccountId]),
        )

        spy = jest
          .spyOn(User, "getVolume")
          .mockImplementation(() => ({ outgoingSats: 0, incomingSats: 0 }))
        const finalNumActiveUsers = (await User.getActiveUsers()).length
        spy.mockClear()

        expect(finalNumActiveUsers).toBe(0)
      })
    })
  })
})
