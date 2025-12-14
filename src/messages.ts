import { Schema } from "effect";
import {
  Instance,
  NamedObjectId,
  ParameterSubscriptionValue,
  Processor,
  TmPacketData,
} from "./schemas";

const WebSocketCall = Schema.NonNegativeInt;

export namespace Server {
  export const ReplyData = Schema.Struct({
    replyTo: Schema.Number,
  });

  export const Reply = Schema.Struct({
    type: Schema.Literal("reply"),
    call: WebSocketCall,
    data: ReplyData,
  });

  // Type helper to avoid repetition
  function MessageFromData<
    Key extends string,
    Schema extends Schema.Schema<any, any, any>,
  >(key: Key, schema: Schema) {
    return Schema.Struct({
      type: Schema.Literal(key),
      call: WebSocketCall,
      seq: Schema.Number,
      data: schema,
    });
  }

  export const TimeData = Schema.Struct({
    value: Schema.DateFromString, // Parses ISO string to Date
  });
  export const Time = MessageFromData("time", TimeData);

  export const ParameterData = Schema.Struct({
    mapping: Schema.optional(
      Schema.Record({
        key: Schema.String,
        value: NamedObjectId,
      }),
    ),
    values: Schema.optional(Schema.Array(ParameterSubscriptionValue)),
  });
  export const Parameters = MessageFromData("parameters", ParameterData);

  export const Packets = MessageFromData("packets", TmPacketData);

  // Union of all messages
  export const Message = Schema.Union(Reply, Time, Packets, Parameters);
}

export namespace Client {
  export const Cancel = Schema.Struct({
    type: Schema.Literal("cancel"),
    options: Schema.Struct({ call: WebSocketCall }),
  });

  export const State = Schema.Struct({
    type: Schema.Literal("state"),
  });

  // Type helper to avoid repetition
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

  export const SubscribeParameterssRequest = Schema.Struct({
    instance: Instance,
    processor: Processor,
    id: Schema.Array(NamedObjectId),
  });
  export const Parameters = MessageFromRequest(
    "parameters",
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
    Parameters,
  );
}
