import { checkedToLightningAddress } from "@domain/users"
import { InvalidLightningAddress } from "@domain/errors"

describe("lightning-address-check", () => {
  it("Passes a plain address", () => {
    expect(checkedToLightningAddress("bob@strike.me")).toEqual("bob@strike.me")
  })

  it("Lowercases the address", () => {
    expect(checkedToLightningAddress("Bob@Strike.ME")).toEqual("bob@strike.me")
  })

  it("Passes allowed special chars in local part", () => {
    expect(checkedToLightningAddress("a.b+c_d-e@strike.me")).toEqual(
      "a.b+c_d-e@strike.me",
    )
  })

  it("Fails an empty domain label", () => {
    expect(checkedToLightningAddress("bob@.me")).toBeInstanceOf(InvalidLightningAddress)
  })

  it("Fails when @ is missing", () => {
    expect(checkedToLightningAddress("bobstrike.me")).toBeInstanceOf(
      InvalidLightningAddress,
    )
  })

  it("Fails an empty local part", () => {
    expect(checkedToLightningAddress("@strike.me")).toBeInstanceOf(
      InvalidLightningAddress,
    )
  })

  it("Fails when there's whitespace", () => {
    expect(checkedToLightningAddress("bob @strike.me")).toBeInstanceOf(
      InvalidLightningAddress,
    )
  })

  it("Fails a TLD shorter than 2 chars", () => {
    expect(checkedToLightningAddress("bob@strike.m")).toBeInstanceOf(
      InvalidLightningAddress,
    )
  })

  it("Fails a local part longer than 64 chars", () => {
    const local = "a".repeat(65)
    expect(checkedToLightningAddress(`${local}@strike.me`)).toBeInstanceOf(
      InvalidLightningAddress,
    )
  })

  it("Fails the empty string", () => {
    expect(checkedToLightningAddress("")).toBeInstanceOf(InvalidLightningAddress)
  })
})
