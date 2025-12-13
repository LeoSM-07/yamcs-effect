import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { YamcsSocket } from "../src/socket";

const example = Effect.gen(function* () {
  const yamcs = yield* YamcsSocket;

  const stream = yamcs.subscribe("time", {
    /* arguments here */
  });
  // now i get back the stream of time items
  return stream;
});

const example2 = Effect.gen(function* () {
  const yamcs = yield* YamcsSocket;

  const stream = yamcs.subscribe("parameters", {
    /* arguments here */
  });
  // now i get back the stream of parameter items
  return stream;
});

// NOTE THAT BOTH OF THE EXAMPLES USE THE SAME WEBSOCKET CONNECTION
// once these example and example2 are out of scope, the connection is terminated.

describe("WebSocket", () => {
  // Sync test - regular function
  it("creates instances", () => {
    const result = 1 + 1;
    expect(result).toBe(2);
  });

  // Effect test - returns Effect
  it.effect("adds numbers", () =>
    Effect.gen(function* () {
      const result = yield* Effect.succeed(1 + 1);
      expect(result).toBe(2);
    }),
  );
});
