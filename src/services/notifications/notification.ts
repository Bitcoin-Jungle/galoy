import * as admin from "firebase-admin"
import _ from "lodash"

// The key GOOGLE_APPLICATION_CREDENTIALS should be set in production
// This key defined the path of the config file that include the key
// more info at https://firebase.google.com/docs/admin/setup
// TODO: mock up the function for devnet
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  })
}

export const sendNotification = async ({
  title,
  user,
  body,
  data,
  logger,
}: INotification) => {
  // TODO: Figure out the unknown type here
  const message: Record<string, Record<string, unknown>> = {
    // only string can be sent to notifications
    data: {
      ..._.mapValues(data, (v) => String(v)),
      // title,
      // body,
    },

    // if we set notification, it will appears on both background and quit stage for iOS.
    // if we don't set notidications, this will appear for background but not quit stage
    // we may be able to use data only, but this should be implemented first:
    // https://rnfirebase.io/messaging/usage#background-application-state
    //
    notification: {
      title,
    },
  }

  if (body) {
    message["notification"]["body"] = body
  }

  if (!user.deviceToken || user.deviceToken.length === 0) {
    logger.info(
      { message, user },
      "skipping notification as no deviceToken has been registered",
    )
    return
  }

  if (user.deviceToken.length === 1 && user.deviceToken[0] === "test") {
    logger.info({ message, user }, "test token. skipping notification")
    return
  }

  logger.info({ message, user }, "sending notification")

  for (const token of user.deviceToken) {
    try {
      const response = await admin.messaging().send({
        token,
        ...message,
      })

      logger.info(
        { response, user, token, title, body, data },
        "notification was sent successfully"
      )
    } catch (err) {
      logger.info(
        { err, user, token, title, body, data },
        "impossible to send notification"
      )
    }
  }

  // FIXME: any as a workaround to https://github.com/Microsoft/TypeScript/issues/15300
}

// FCM's HTTP /batch endpoint is shut down, which broke sendMulticast/sendAll
// in firebase-admin <12. We fan out one-by-one via send() with a bounded
// in-flight count instead. Bump firebase-admin and switch back to multicast
// if/when that upgrade happens.
const FCM_SEND_CONCURRENCY = 50

export const sendBulkNotification = async ({
  tokens,
  title,
  body,
  data,
  logger,
}: {
  tokens: string[]
  title: string
  body?: string
  data?: Record<string, string | number | boolean>
  logger: Logger
}): Promise<{ successCount: number; failureCount: number }> => {
  const cleaned = tokens.filter((t) => t && t !== "test")
  if (cleaned.length === 0) {
    return { successCount: 0, failureCount: 0 }
  }

  const notification: { title: string; body?: string } = { title }
  if (body) notification.body = body

  const messageData = data ? _.mapValues(data, (v) => String(v)) : undefined

  let successCount = 0
  let failureCount = 0
  let cursor = 0

  const worker = async () => {
    while (cursor < cleaned.length) {
      const idx = cursor++
      const token = cleaned[idx]
      try {
        await admin.messaging().send({
          token,
          notification,
          ...(messageData ? { data: messageData } : {}),
        })
        successCount++
      } catch (err) {
        failureCount++
        logger.warn(
          { err: (err as Error).message, token, title },
          "bulk notification: token failed",
        )
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(FCM_SEND_CONCURRENCY, cleaned.length) }, () => worker()),
  )

  return { successCount, failureCount }
}
