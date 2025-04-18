import dotenv from "dotenv"
import { applyMiddleware } from "graphql-middleware"
import { and, shield } from "graphql-shield"

import { baseLogger } from "@services/logger"
import { setupMongoConnection } from "@services/mongodb"

import { gqlAdminSchema } from "../graphql"
import { startApolloServer, isAuthenticated, isEditor } from "./graphql-server"

dotenv.config()

const graphqlLogger = baseLogger.child({ module: "graphql" })

export async function startApolloServerForAdminSchema() {
  const permissions = shield(
    {
      Query: {
        allLevels: and(isAuthenticated, isEditor),
        userDetailsByPhone: and(isAuthenticated, isEditor),
        userDetailsByUsername: and(isAuthenticated, isEditor),
        transactionById: and(isAuthenticated, isEditor),
        transactionsByHash: and(isAuthenticated, isEditor),
        lightningInvoice: and(isAuthenticated, isEditor),
        lightningPayment: and(isAuthenticated, isEditor),
      },
      Mutation: {
        userUpdateStatus: and(isAuthenticated, isEditor),
        userUpdateLevel: and(isAuthenticated, isEditor),
        businessUpdateMapInfo: and(isAuthenticated, isEditor),
      },
    },
    { allowExternalErrors: true },
  )

  const schema = applyMiddleware(gqlAdminSchema, permissions)
  return startApolloServer({ schema, port: 4001 })
}

if (require.main === module) {
  setupMongoConnection()
    .then(async () => {
      await startApolloServerForAdminSchema()
    })
    .catch((err) => graphqlLogger.error(err, "server error"))
}
