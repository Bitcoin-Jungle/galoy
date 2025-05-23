type PriceServiceError = import("./errors").PriceServiceError

type PriceRange =
  typeof import("./index").PriceRange[keyof typeof import("./index").PriceRange]
type PriceInterval =
  typeof import("./index").PriceInterval[keyof typeof import("./index").PriceInterval]

type Tick = {
  readonly date: Date
  readonly price: UsdPerSat
}

type ListHistoryArgs = {
  range: PriceRange
  interval: PriceInterval
}

interface IPriceService {
  getRealTimePrice(): Promise<UsdPerSat | PriceServiceError>
  listHistory(args: ListHistoryArgs): Promise<Tick[] | PriceServiceError>
}
