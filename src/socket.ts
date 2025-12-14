import { Socket } from "@effect/platform";
import { Effect, Either, Mailbox, Option, pipe, Schema, Stream } from "effect";
import { Client, Server } from "./messages";
import type { NamedObjectId, ParameterSubscriptionValue } from "./schemas";

export class YamcsSocket extends Effect.Service<YamcsSocket>()(
  "yamcs-effect/socket/YamcsSocket",
  {
    accessors: true,
    scoped: Effect.gen(function* () {
      const socket = yield* Socket.Socket;

      // Track: requestId → { mailbox, type }
      const pendingRequests = new Map<
        number,
        {
          mailbox: Mailbox.Mailbox<any, Error>;
          type: string;
        }
      >();

      const activeSubscriptions = new Map<
        number,
        Mailbox.Mailbox<any, Error>
      >();

      let requestIdCounter = 1;
      const writer = yield* socket.writer;

      yield* socket
        .runRaw((data) =>
          Effect.gen(function* () {
            const text =
              typeof data === "string" ? data : new TextDecoder().decode(data);
            const envelopeResult = yield* pipe(
              text,
              Schema.decodeUnknown(Schema.parseJson(Server.Message)),
              Effect.either,
            );
            // If decode failed, log and return early
            if (Either.isLeft(envelopeResult)) {
              yield* Effect.logWarning(
                `Failed to decode message, skipping`,
                envelopeResult.left,
                text,
              );
              return; // Early return - skip this message
            }
            const envelope = envelopeResult.right;

            // Handle reply: move from pending → active
            if (envelope.type == "reply") {
              const pending = pendingRequests.get(envelope.data.replyTo);
              if (pending) {
                pendingRequests.delete(envelope.data.replyTo);
                activeSubscriptions.set(envelope.call, pending.mailbox);
                yield* Effect.logDebug(
                  `Subscription activated: request ${envelope.data.replyTo} → call ${envelope.call}`,
                );
              }
              return;
            }

            // Handle streaming data: route to active subscription
            if (envelope.call !== undefined) {
              const mailbox = activeSubscriptions.get(envelope.call);
              if (mailbox) {
                // Decode based on message type
                const decoded = envelope.data;
                yield* mailbox.offer(decoded);
              }
            }
          }),
        )
        .pipe(
          Effect.catchAllCause((cause) =>
            Effect.logError(`WebSocket handler error: ${cause}`),
          ),
          Effect.forkScoped,
        );

      // Cleanup finalizer
      yield* Effect.addFinalizer(() =>
        Effect.gen(function* () {
          yield* Effect.logDebug("Cleaning up YamcsSocket subscriptions");

          yield* Effect.forEach(
            [
              ...Array.from(pendingRequests.values()),
              ...Array.from(activeSubscriptions.values()).map((m) => ({
                mailbox: m,
                type: "",
              })),
            ],
            ({ mailbox }) => mailbox.end,
            { discard: true },
          );

          pendingRequests.clear();
          activeSubscriptions.clear();
        }),
      );

      // Generic subscription helper
      const createSubscription = <
        RequestOptions,
        ResponseData extends Schema.Schema.Any,
      >(
        type: string,
        options: RequestOptions,
        responseSchema: ResponseData,
      ): Stream.Stream<Schema.Schema.Type<ResponseData>, Error, never> => {
        return Stream.unwrapScoped(
          Effect.gen(function* () {
            const requestId = requestIdCounter++;
            const mailbox = yield* Mailbox.make<
              typeof responseSchema.Type,
              Error
            >();

            // Register as pending
            pendingRequests.set(requestId, { mailbox, type });

            const message = JSON.stringify({
              type,
              id: requestId,
              options,
            });

            yield* Effect.logDebug(
              `Subscribing to ${type}: request id ${requestId}`,
              message,
            );

            // Send subscription request
            yield* writer(message);

            // Cleanup on stream finalization
            yield* Effect.addFinalizer(() =>
              Effect.gen(function* () {
                // Find call ID for this mailbox
                for (const [call, mb] of activeSubscriptions) {
                  if (mb === mailbox) {
                    activeSubscriptions.delete(call);
                    yield* Effect.logDebug(
                      `Cancelling subscription: call ${call}`,
                    );

                    // Send cancel message
                    yield* writer(
                      JSON.stringify({
                        type: "cancel",
                        options: { call },
                      }),
                    ).pipe(
                      Effect.catchAllCause((cause) =>
                        Effect.logError(`WebSocket writer error: ${cause}`),
                      ),
                    );
                    break;
                  }
                }

                // Also check pending in case reply never came
                pendingRequests.delete(requestId);
              }),
            );

            return Stream.fromChannel(Mailbox.toChannel(mailbox));
          }),
        );
      };

      // Public API
      const subscribePackets = (
        options: typeof Client.SubscribePacketsRequest.Type,
      ) => createSubscription("packets", options, Server.Packets);

      const subscribeTime = (
        options: typeof Client.SubscribeTimeRequest.Type,
      ) => createSubscription("time", options, Server.TimeData);

      const subscribeParameters = (
        options: typeof Client.SubscribeParameterssRequest.Type,
      ) => {
        const subscription = createSubscription(
          "parameters",
          options,
          Server.ParameterData,
        );

        return subscription.pipe(
          Stream.mapAccum(
            // State: current mapping (if any)
            Option.none<Record<number, typeof NamedObjectId.Type>>(),
            (currentMapping, message) => {
              if (message.mapping !== undefined) {
                return [Option.some(message.mapping), Option.none()];
              }

              if (
                message.values !== undefined &&
                Option.isSome(currentMapping)
              ) {
                const transformed = transformValuesToMap(
                  message.values,
                  currentMapping.value,
                );

                return [currentMapping, Option.some(transformed)];
              }

              return [currentMapping, Option.none()];
            },
          ),
          Stream.filterMap((x) => x),
        );
      };

      return { subscribeTime, subscribePackets, subscribeParameters } as const;
    }),
  },
) {}

function transformValuesToMap(
  values: ReadonlyArray<typeof ParameterSubscriptionValue.Type>,
  mapping: Record<number, typeof NamedObjectId.Type>,
) {
  const result: Record<string, typeof ParameterSubscriptionValue.Type> = {};

  for (const value of values) {
    const nameInfo = mapping[value.numericId];
    if (nameInfo !== undefined) {
      result[nameInfo.name] = value;
    }
  }

  return result;
}
