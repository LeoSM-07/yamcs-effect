import { Schema } from "effect";

const WebSocketCall = Schema.NonNegativeInt;

const Processor = Schema.String;
const Instance = Schema.String;

export namespace Server {
  export const ReplyData = Schema.Struct({
    "@type": Schema.Literal("/yamcs.api.Reply"),
    replyTo: Schema.Number,
  });

  export const Reply = Schema.Struct({
    type: Schema.Literal("reply"),
    call: Schema.Number,
    data: ReplyData,
  });

  export const TimeData = Schema.Struct({
    "@type": Schema.Literal("/google.protobuf.Timestamp"),
    value: Schema.DateFromString, // Parses ISO string to Date
  });

  export const Time = Schema.Struct({
    type: Schema.Literal("time"),
    call: Schema.Number,
    seq: Schema.Number,
    data: TimeData,
  });
  // Union of all messages
  export const Message = Schema.Union(Reply, Time);
}

export namespace Client {
  export const Cancel = Schema.Struct({
    type: Schema.Literal("cancel"),
    options: Schema.Struct({ call: WebSocketCall }),
  });

  /**
   * In response to this message, Yamcs will dump a snapshot of the active calls
   * on the current connection. This is intended for debugging reasons.
   */
  export const State = Schema.Struct({
    type: Schema.Literal("state"),
  });

  function MessageFromRequest<
    Key extends string,
    Schema extends Schema.Schema<any, any, any>,
  >(key: Key, schema: Schema) {
    return Schema.Struct({
      type: Schema.Literal(key),
      options: schema,
    });
  }

  export const SubscribePacketsRequest = Schema.Union(
    Schema.Struct({
      instance: Instance,
      stream: Schema.String,
    }),
    Schema.Struct({
      instance: Instance,
      processor: Processor,
    }),
  );
  export const Packets = MessageFromRequest("packets", SubscribePacketsRequest);

  export const SubscribeContainersRequest = Schema.Struct({
    instance: Instance,
    processor: Processor,
    names: Schema.Array(Schema.String),
  });
  export const Containers = MessageFromRequest(
    "containers",
    SubscribeContainersRequest,
  );

  export const SubscribeTimeRequest = Schema.Struct({
    instance: Instance,
    processor: Processor,
  });
  export const Time = MessageFromRequest("time", SubscribeTimeRequest);

  export const SubscribeLinksRequest = Schema.Struct({
    instance: Instance,
  });
  export const Links = MessageFromRequest("links", SubscribeLinksRequest);

  export const SubscribeStreamRequest = Schema.Struct({
    instance: Instance,
    stream: Schema.String,
  });
  export const Stream = MessageFromRequest("stream", SubscribeStreamRequest);

  export const SubscribeAlarmsRequest = Schema.Struct({
    instance: Instance,
    processor: Processor,
    includePending: Schema.Boolean,
  });
  export const Alarms = MessageFromRequest("alarms", SubscribeAlarmsRequest);

  export const SubscribeEventsRequest = Schema.Struct({
    instance: Instance,
  });
  export const Events = MessageFromRequest("events", SubscribeEventsRequest);

  export const SubscribeCommandsRequest = Schema.Struct({
    instance: Instance,
    processor: Processor,
    ignorePastCommands: Schema.Boolean,
  });
  export const Commands = MessageFromRequest(
    "commands",
    SubscribeCommandsRequest,
  );

  export const Messages = Schema.Union(
    Cancel,
    State,
    Packets,
    Containers,
    Time,
    Links,
    Stream,
    Alarms,
    Events,
    Commands,
  );
}
