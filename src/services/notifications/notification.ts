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

// FCM caps sendMulticast at 500 tokens per request.
const FCM_MULTICAST_BATCH_SIZE = 500

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

  for (let i = 0; i < cleaned.length; i += FCM_MULTICAST_BATCH_SIZE) {
    const batch = cleaned.slice(i, i + FCM_MULTICAST_BATCH_SIZE)
    try {
      const response = await admin.messaging().sendMulticast({
        tokens: batch,
        notification,
        ...(messageData ? { data: messageData } : {}),
      })
      successCount += response.successCount
      failureCount += response.failureCount

      if (response.failureCount > 0) {
        const failedTokens = response.responses
          .map((r, idx) => (r.success ? null : { token: batch[idx], error: r.error?.message }))
          .filter((x) => x !== null)
        logger.warn({ failedTokens, title }, "bulk notification: some tokens failed")
      }
    } catch (err) {
      failureCount += batch.length
      logger.error({ err, title, batchSize: batch.length }, "bulk notification batch failed")
    }
  }

  return { successCount, failureCount }
}
