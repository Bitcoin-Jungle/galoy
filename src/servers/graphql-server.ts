import { createServer } from "http"
import { execute, GraphQLError, subscribe } from "graphql"
import { ApolloError, ApolloServer } from "apollo-server-express"
import { SubscriptionServer } from "subscriptions-transport-ws"
import express from "express"
import expressJwt from "express-jwt"
import * as jwt from "jsonwebtoken"
import { rule } from "graphql-shield"
import mongoose from "mongoose"
import pino from "pino"
import PinoHttp from "pino-http"
import { v4 as uuidv4 } from "uuid"
import helmet from "helmet"

import { getApolloConfig, getGeetestConfig, JWT_SECRET } from "@config/app"
import * as Users from "@app/users"
import * as Accounts from "@app/accounts"

import { baseLogger } from "@services/logger"
import { redis } from "@services/redis"
import { User } from "@services/mongoose/schema"

import { isProd } from "@core/utils"
import { WalletFactory } from "@core/wallet-factory"
import { ApolloServerPluginUsageReporting } from "apollo-server-core"
import Geetest from "@services/geetest"
import expressApiKeyAuth from "./graphql-middlewares/api-key-auth"
import {
  SemanticAttributes,
  addAttributesToCurrentSpanAndPropagate,
  addAttributesToCurrentSpan,
  ENDUSER_ALIAS,
} from "@services/tracing"
import { UserStatus } from "@core/user"

const graphqlLogger = baseLogger.child({
  module: "graphql",
})

const apolloConfig = getApolloConfig()

export const isAuthenticated = rule({ cache: "contextual" })((parent, args, ctx) => {
  return ctx.uid !== null ? true : "NOT_AUTHENTICATED"
})

export const isApiKeyAuthenticated = rule({ cache: "contextual" })(
  (_parent, _args, ctx) => {
    return ctx.account !== null ? true : "NOT_APIKEY_AUTHENTICATED"
  },
)

export const isEditor = rule({ cache: "contextual" })((parent, args, ctx) => {
  return ctx.user.role === "editor" ? true : "NOT_AUTHORIZED"
})

const geeTestConfig = getGeetestConfig()
const geetest = Geetest(geeTestConfig)

const sessionContext = ({ token, ips, body, apiKey, apiSecret }) => {
  const userId = token?.uid ?? null
  let ip: string | undefined

  if (ips && Array.isArray(ips) && ips.length) {
    ip = ips[0]
  } else if (typeof ips === "string") {
    
    if(ips.indexOf(',') !== -1) {
      ips = ips.split(',')[0]
    }

    ip = ips
  }

  let wallet, user

  // TODO move from id: uuidv4() to a Jaeger standard
  const logger = graphqlLogger.child({ token, id: uuidv4(), body })

  let domainUser: User | null = null
  return addAttributesToCurrentSpanAndPropagate(
    {
      [SemanticAttributes.ENDUSER_ID]: userId,
      [SemanticAttributes.HTTP_CLIENT_IP]: ip,
    },
    async () => {
      if (userId) {
        const loggedInUser = await Users.getUserForLogin({ userId, ip, logger })
        if (loggedInUser instanceof Error)
          throw new ApolloError("Invalid user authentication", "INVALID_AUTHENTICATION", {
            reason: loggedInUser,
          })
        domainUser = loggedInUser
        user = await User.findOne({ _id: userId })
        wallet =
          !!user && user.status === "active"
            ? await WalletFactory({ user, logger })
            : null
      }

      let account: Account | null = null
      if (apiKey && apiSecret) {
        const loggedInAccount = await Accounts.getAccountByApiKey(apiKey, apiSecret)
        if (loggedInAccount instanceof Error)
          throw new ApolloError("Invalid API authentication", "INVALID_AUTHENTICATION", {
            reason: loggedInAccount,
          })
        account = loggedInAccount
      }

      addAttributesToCurrentSpan({ [ENDUSER_ALIAS]: domainUser?.username })

      if (user && user.status === UserStatus.Locked) {
        throw new ApolloError("Account is locked", "ACCOUNT_LOCKED")
      }

      return {
        logger,
        uid: userId,
        wallet,
        domainUser,
        user,
        geetest,
        account,
        ip,
      }
    },
  )
}

export const startApolloServer = async ({
  schema,
  port,
  startSubscriptionServer = false,
}): Promise<Record<string, unknown>> => {
  const app = express()

  const apolloPulgins = isProd
    ? [
        ApolloServerPluginUsageReporting({
          rewriteError(err) {
            graphqlLogger.error(err, "Error caught in rewriteError")
            return err
          },
        }),
      ]
    : []
  const apolloServer = new ApolloServer({
    schema,
    playground: apolloConfig.playground
      ? { settings: { "schema.polling.enable": false } }
      : false,
    introspection: apolloConfig.playground,
    plugins: apolloPulgins,
    context: async (context) => {
      // @ts-expect-error: TODO
      const token = context.req?.token ?? null

      // @ts-expect-error: TODO
      const apiKey = context.req?.apiKey ?? null
      // @ts-expect-error: TODO
      const apiSecret = context.req?.apiSecret ?? null

      const ips = context.req?.headers["x-real-ip"] || context.req?.headers['x-forwarded-for']
      const body = context.req?.body ?? null

      return sessionContext({ token, apiKey, apiSecret, ips, body })
    },
    formatError: (err) => {
      const log = err.extensions?.exception?.log

      // An err object needs to necessarily have the forwardToClient field to be forwarded
      // i.e. catch-all errors will not be forwarded
      if (log) {
        const errObj = { message: err.message, code: err.extensions?.code }

        // we are logging additional details but not sending those to the client
        // ex: fields that indicate whether a payment succeeded or not, or stacktraces, that are required
        // for metrics or debugging
        // the err.extensions.metadata field contains such fields
        log({ ...errObj, ...err.extensions?.metadata })
        if (err.extensions?.exception.forwardToClient) {
          return errObj
        }
      } else {
        graphqlLogger.error(err)
      }

      // GraphQL shield seems to have a bug around throwing a custom ApolloError
      // This is a workaround for now
      const isShieldError = [
        "NOT_AUTHENTICATED",
        "NOT_APIKEY_AUTHENTICATED",
        "NOT_AUTHORIZED",
      ].includes(err.message)

      const reportErrorToClient =
        ["GRAPHQL_PARSE_FAILED", "GRAPHQL_VALIDATION_FAILED", "BAD_USER_INPUT"].includes(
          err.extensions?.code,
        ) ||
        isShieldError ||
        err instanceof ApolloError ||
        err instanceof GraphQLError

      const reportedError = {
        message: err.message,
        locations: err.locations,
        path: err.path,
        code: isShieldError ? err.message : err.extensions?.code,
      }

      return reportErrorToClient
        ? reportedError
        : {
            message: `Error processing GraphQL request ${reportedError.code}`,
          }
    },
  })

  app.use(
    helmet({
      contentSecurityPolicy: apolloConfig.playground ? false : undefined,
    }),
  )

  app.use(
    PinoHttp({
      logger: graphqlLogger,
      wrapSerializers: false,

      // Define custom serializers
      serializers: {
        // TODO: sanitize
        err: pino.stdSerializers.err,
        req: pino.stdSerializers.req,
        res: (res) => ({
          // FIXME: kind of a hack. body should be in in req. but have not being able to do it.
          body: res.req.body,
          ...pino.stdSerializers.res(res),
        }),
      },
      autoLogging: {
        ignorePaths: ["/healthz"],
      },
    }),
  )

  app.use(
    expressJwt({
      secret: JWT_SECRET,
      algorithms: ["HS256"],
      credentialsRequired: false,
      requestProperty: "token",
    }),
  )

  app.use(expressApiKeyAuth)

  // Health check
  app.get("/healthz", async function (req, res) {
    const isMongoAlive = mongoose.connection.readyState === 1 ? true : false
    const isRedisAlive = (await redis.ping()) === "PONG"
    res.status(isMongoAlive && isRedisAlive ? 200 : 503).send()
  })

  apolloServer.applyMiddleware({ app })

  const httpServer = createServer(app)

  return new Promise((resolve, reject) => {
    httpServer.listen({ port }, () => {
      if (startSubscriptionServer) {
        new SubscriptionServer(
          {
            execute,
            subscribe,
            schema,
            async onConnect(connectionParams, webSocket, connectionContext) {
              const { request } = connectionContext

              let token: string | jwt.JwtPayload | null = null
              const authz =
                connectionParams.authorization || connectionParams.Authorization
              if (authz) {
                const rawToken = authz.slice(7)
                token = jwt.verify(rawToken, JWT_SECRET, { algorithms: ["HS256"] })
              }

              return sessionContext({
                token,
                ips: [request?.socket?.remoteAddress],

                // TODO: Resolve what's needed here
                apiKey: null,
                apiSecret: null,
                body: null,
              })
            },
          },
          {
            server: httpServer,
            path: apolloServer.graphqlPath,
          },
        )
      }

      console.log(
        `🚀 Server ready at http://localhost:${port}${apolloServer.graphqlPath}`,
      )
      resolve({ app, httpServer, apolloServer })
    })

    httpServer.on("error", (err) => {
      console.error(err)
      reject(err)
    })
  })
}
