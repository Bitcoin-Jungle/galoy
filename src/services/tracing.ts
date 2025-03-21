import {
  SemanticAttributes,
  SemanticResourceAttributes,
} from "@opentelemetry/semantic-conventions"
import type * as graphqlTypes from "graphql"
import { W3CTraceContextPropagator } from "@opentelemetry/core"
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node"
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http"
import { GraphQLInstrumentation } from "@opentelemetry/instrumentation-graphql"
import { MongoDBInstrumentation } from "@opentelemetry/instrumentation-mongodb"
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis"
import { GrpcInstrumentation } from "@opentelemetry/instrumentation-grpc"
import { registerInstrumentations } from "@opentelemetry/instrumentation"
import { SimpleSpanProcessor, Span as SdkSpan } from "@opentelemetry/sdk-trace-base"
import { JaegerExporter } from "@opentelemetry/exporter-jaeger"
import { Resource } from "@opentelemetry/resources"
import {
  trace,
  context,
  propagation,
  Span,
  SpanAttributes,
  SpanStatusCode,
} from "@opentelemetry/api"
import { tracingConfig } from "@config/app"

propagation.setGlobalPropagator(new W3CTraceContextPropagator())

// FYI this hook is executed BEFORE the `formatError` hook from apollo
// The data.errors field here may still change before being returned to the client
const gqlResponseHook = (span: Span, data: graphqlTypes.ExecutionResult) => {
  if (data.errors && data.errors.length > 0) {
    span.recordException({
      name: "graphql.execution.error",
      message: JSON.stringify(data.errors),
    })
    span.setStatus({
      code: SpanStatusCode.ERROR,
    })
    const firstErr = data.errors[0]
    if (firstErr.message != "") {
      span.setAttribute("graphql.error.message", firstErr.message)
    }
    span.setAttribute("graphql.error.type", firstErr.constructor.name)
    if (firstErr.path) {
      span.setAttribute("graphql.error.path", firstErr.path.join("."))
    }
    if (firstErr.extensions?.code) {
      span.setAttribute(`graphql.error.code`, firstErr.extensions.code)
    }
    if (firstErr.originalError) {
      span.setAttribute(
        `graphql.error.original.type`,
        firstErr.originalError.constructor.name,
      )
      if (firstErr.originalError.message != "") {
        span.setAttribute(
          `graphql.error.original.message`,
          firstErr.originalError.message,
        )
      }
    }
    data.errors.forEach((err, idx) => {
      if (err.message != "") {
        span.setAttribute(`graphql.error.${idx}.message`, err.message)
      }
      span.setAttribute(`graphql.error.${idx}.type`, err.constructor.name)
      if (err.path) {
        span.setAttribute(`graphql.error.${idx}.path`, err.path.join("."))
      }
      if (err.extensions?.code) {
        span.setAttribute(`graphql.error.${idx}.code`, err.extensions.code)
      }
      if (err.originalError) {
        span.setAttribute(
          `graphql.error.${idx}.original.type`,
          err.originalError.constructor.name,
        )
        if (err.originalError.message != "") {
          span.setAttribute(
            `graphql.error.${idx}.original.message`,
            err.originalError.message,
          )
        }
      }
    })
  }
}

registerInstrumentations({
  instrumentations: [
    new HttpInstrumentation({
      ignoreIncomingPaths: ["/healthz"],
    }),
    new GraphQLInstrumentation({
      mergeItems: true,
      allowValues: true,
      responseHook: gqlResponseHook,
    }),
    new MongoDBInstrumentation(),
    new GrpcInstrumentation(),
    new IORedisInstrumentation(),
  ],
})

const provider = new NodeTracerProvider({
  resource: Resource.default().merge(
    new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: tracingConfig.tracingServiceName,
    }),
  ),
})

class SpanProcessorWrapper extends SimpleSpanProcessor {
  onStart(span: SdkSpan) {
    const ctx = context.active()
    if (ctx) {
      const baggage = propagation.getBaggage(ctx)
      if (baggage) {
        baggage.getAllEntries().forEach(([key, entry]) => {
          span.setAttribute(key, entry.value)
        })
      }
    }
    super.onStart(span)
  }
}
provider.addSpanProcessor(
  new SpanProcessorWrapper(
    new JaegerExporter({
      host: tracingConfig.jaegerHost,
      port: tracingConfig.jaegerPort,
    }),
  ),
)

provider.register()

export const tracer = trace.getTracer(
  tracingConfig.tracingServiceName,
  process.env.COMMITHASH || "dev",
)
export const addAttributesToCurrentSpan = (attributes: SpanAttributes) => {
  const span = trace.getSpan(context.active())
  if (span) {
    for (const [key, value] of Object.entries(attributes)) {
      if (value) {
        span.setAttribute(key, value)
      }
    }
  }
}
export const asyncRunInSpan = <F extends () => ReturnType<F>>(
  spanName: string,
  attributes: SpanAttributes,
  fn: F,
) => {
  const ret = tracer.startActiveSpan(spanName, { attributes }, async (span) => {
    const ret = await Promise.resolve(fn())
    if ((ret as unknown) instanceof Error) {
      span.recordException(ret)
    }
    span.end()
    return ret
  })
  return ret
}

export const addAttributesToCurrentSpanAndPropagate = <F extends () => ReturnType<F>>(
  attributes: { [key: string]: string | undefined },
  fn: F,
) => {
  const ctx = context.active()
  let baggage = propagation.getBaggage(ctx) || propagation.createBaggage()
  const currentSpan = trace.getSpan(ctx)
  Object.entries(attributes).forEach(([key, value]) => {
    if (value) {
      baggage = baggage.setEntry(key, { value })
      if (currentSpan) {
        currentSpan.setAttribute(key, value)
      }
    }
  })
  return context.with(propagation.setBaggage(ctx, baggage), fn)
}

export { SemanticAttributes, SemanticResourceAttributes }

export const ENDUSER_ALIAS = "enduser.alias"
