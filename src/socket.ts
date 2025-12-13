import { Socket } from "@effect/platform";
import { Cause, Effect, Mailbox, pipe, Schema, Scope, Stream } from "effect";
import { Client, Server } from "./schemas";

export class YamcsSocket extends Effect.Service<YamcsSocket>()(
  "yamcs-effect/socket/YamcsSocket",
  {
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

            const envelope = yield* pipe(
              text,
              Schema.decodeUnknown(Schema.parseJson(Server.Message)),
              Effect.tapErrorCause((cause) =>
                Effect.logWarning(
                  `Failed to decode message: ${Cause.pretty(cause)}`,
                ),
              ),
              Effect.orElse(() =>
                Effect.fail(new Error("Invalid message format")),
              ),
            );

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
                yield* mailbox.offer(decoded.value);
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

      // Public API
      const subscribeTime = (
        options: typeof Client.SubscribeTimeRequest.Type,
      ): Stream.Stream<typeof Server.TimeData.Type, Error, Scope.Scope> => {
        return Stream.unwrapScoped(
          Effect.gen(function* () {
            const requestId = requestIdCounter++;
            const mailbox = yield* Mailbox.make<
              typeof Server.TimeData.Type,
              Error
            >();

            // Register as pending
            pendingRequests.set(requestId, { mailbox, type: "time" });

            const message = JSON.stringify({
              type: "time",
              id: requestId,
              options,
            });

            yield* Effect.logDebug(
              `Subscribing to time: request id ${requestId}`,
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

      return { subscribeTime } as const;
    }),
  },
) {}
