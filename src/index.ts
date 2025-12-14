// export const program = Effect.gen(function* () {
//   yield* Effect.log("Running...");
//   const yamcs = yield* YamcsSocket;
//
//   const stream = yield* yamcs
//     .subscribePackets({
//       instance: "mqtt-packets",
//       processor: "realtime",
//     })
//     .pipe(
//       Stream.tap((a) => Effect.logInfo(a)),
//       Stream.runDrain,
//     );
// }).pipe(
//   Effect.provide(
//     Layer.merge(
//       YamcsSocket.Default.pipe(
//         Layer.provideMerge(
//           BunSocket.layerWebSocket("ws://localhost:8090/api/websocket"),
//         ),
//       ),
//       Logger.minimumLogLevel(LogLevel.Debug),
//     ),
//   ),
//   Effect.scoped,
// );
//
// BunRuntime.runMain(program);

export * from "./socket.ts";
