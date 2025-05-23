import { GT } from "@graphql/index"

import MeQuery from "@graphql/root/query/me"
import GlobalsQuery from "@graphql/root/query/globals"
import UsernameAvailableQuery from "@graphql/root/query/username-available"
import UserDefaultWalletIdQuery from "@graphql/root/query/user-default-wallet-id"
import BusinessMapMarkersQuery from "@graphql/root/query/business-map-markers"
import MobileVersionsQuery from "@graphql/root/query/mobile-versions"
import QuizQuestionsQuery from "@graphql/root/query/quiz-questions"
import BtcPriceListQuery from "@graphql/root/query/btc-price-list"
import OnChainTxFeeQuery from "@graphql/root/query/on-chain-tx-fee-query"
import AccountApiKeysQuery from "@graphql/root/query/account-api-keys"
import BoltCardQuery from "@graphql/root/query/bolt-card"
import BoltCardsQuery from "@graphql/root/query/bolt-cards"

const QueryType = new GT.Object({
  name: "Query",
  fields: () => ({
    globals: GlobalsQuery,
    me: MeQuery,
    usernameAvailable: UsernameAvailableQuery,
    userDefaultWalletId: UserDefaultWalletIdQuery,
    businessMapMarkers: BusinessMapMarkersQuery,
    mobileVersions: MobileVersionsQuery,
    quizQuestions: QuizQuestionsQuery,
    btcPriceList: BtcPriceListQuery,
    onChainTxFee: OnChainTxFeeQuery,
    accountApiKeys: AccountApiKeysQuery,
    boltCard: BoltCardQuery,
    boltCards: BoltCardsQuery,
  }),
})

export default QueryType
