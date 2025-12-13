import { BunRuntime, BunSocket } from "@effect/platform-bun";
import { Effect, Layer, Logger, LogLevel, Stream } from "effect";
import { YamcsSocket } from "./socket";

const program = Effect.gen(function* () {
  yield* Effect.log("Running...");
  const yamcs = yield* YamcsSocket;

  const stream = yield* yamcs
    .subscribeTime({
      instance: "mqtt-packets",
      processor: "realtime",
    })
    .pipe(Stream.tap(Effect.logInfo), Stream.runDrain);
}).pipe(
  Effect.provide(
    Layer.merge(
      YamcsSocket.Default.pipe(
        Layer.provideMerge(
          BunSocket.layerWebSocket("ws://localhost:8090/api/websocket"),
        ),
      ),
      Logger.minimumLogLevel(LogLevel.Info),
    ),
  ),
  Effect.scoped,
);

BunRuntime.runMain(program);

