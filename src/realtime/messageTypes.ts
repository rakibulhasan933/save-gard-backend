import { z } from "zod";

export const deviceStateSchema = z.enum([
  "IDLE",
  "UNPAIRED",
  "PAIRED_IDLE",
  "MONITORING_ACTIVE",
  "LIVE_SCREEN_ACTIVE",
  "LIVE_SCREEN_ENDING",
  "ERROR"
]);

export const qualitySchema = z.enum(["low", "medium", "high"]);
export const roleSchema = z.enum(["admin", "child"]);

export const appRuleSchema = z.object({
  id: z.string().uuid(),
  childId: z.string().uuid(),
  packageName: z.string(),
  label: z.string().nullable().optional(),
  isEnabled: z.boolean()
});

export const webRuleSchema = z.object({
  id: z.string().uuid(),
  childId: z.string().uuid(),
  domain: z.string(),
  category: z.string().nullable().optional(),
  isBlocked: z.boolean()
});

export const pingMessageSchema = z.object({
  type: z.literal("PING"),
  payload: z.object({}).default({})
});

export const pongMessageSchema = z.object({
  type: z.literal("PONG"),
  payload: z.object({}).default({})
});

export const statusUpdateMessageSchema = z.object({
  type: z.literal("STATUS_UPDATE"),
  payload: z.object({
    childId: z.string().uuid(),
    deviceUuid: z.string().min(1),
    state: deviceStateSchema,
    timestamp: z.string().datetime()
  })
});

export const updateBlockRulesMessageSchema = z.object({
  type: z.literal("UPDATE_BLOCK_RULES"),
  payload: z.object({
    childId: z.string().uuid(),
    appRules: z.array(appRuleSchema),
    webRules: z.array(webRuleSchema)
  })
});

export const liveScreenRequestMessageSchema = z.object({
  type: z.literal("LIVE_SCREEN_REQUEST"),
  payload: z.object({
    sessionId: z.string().uuid(),
    childId: z.string().uuid(),
    adminId: z.string().uuid(),
    quality: qualitySchema,
    maxDurationSec: z.number().int().positive()
  })
});

export const liveScreenAcceptedMessageSchema = z.object({
  type: z.literal("LIVE_SCREEN_ACCEPTED"),
  payload: z.object({
    sessionId: z.string().uuid(),
    childId: z.string().uuid()
  })
});

export const liveScreenRejectedMessageSchema = z.object({
  type: z.literal("LIVE_SCREEN_REJECTED"),
  payload: z.object({
    sessionId: z.string().uuid(),
    childId: z.string().uuid(),
    reason: z.string().min(1).max(255)
  })
});

export const liveScreenEndedMessageSchema = z.object({
  type: z.literal("LIVE_SCREEN_ENDED"),
  payload: z.object({
    sessionId: z.string().uuid(),
    childId: z.string().uuid(),
    reason: z.string().max(255).optional()
  })
});

export const webRtcOfferMessageSchema = z.object({
  type: z.literal("WEBRTC_OFFER"),
  payload: z.object({
    sessionId: z.string().uuid(),
    fromRole: roleSchema,
    sdp: z.string().min(1)
  })
});

export const webRtcAnswerMessageSchema = z.object({
  type: z.literal("WEBRTC_ANSWER"),
  payload: z.object({
    sessionId: z.string().uuid(),
    fromRole: roleSchema,
    sdp: z.string().min(1)
  })
});

export const webRtcIceCandidateMessageSchema = z.object({
  type: z.literal("WEBRTC_ICE_CANDIDATE"),
  payload: z.object({
    sessionId: z.string().uuid(),
    fromRole: roleSchema,
    candidate: z.unknown()
  })
});

export const clientMessageSchema = z.discriminatedUnion("type", [
  pingMessageSchema,
  pongMessageSchema,
  statusUpdateMessageSchema,
  liveScreenAcceptedMessageSchema,
  liveScreenRejectedMessageSchema,
  liveScreenEndedMessageSchema,
  webRtcOfferMessageSchema,
  webRtcAnswerMessageSchema,
  webRtcIceCandidateMessageSchema
]);

export const serverMessageSchema = z.discriminatedUnion("type", [
  pingMessageSchema,
  pongMessageSchema,
  statusUpdateMessageSchema,
  updateBlockRulesMessageSchema,
  liveScreenRequestMessageSchema,
  liveScreenAcceptedMessageSchema,
  liveScreenRejectedMessageSchema,
  liveScreenEndedMessageSchema,
  webRtcOfferMessageSchema,
  webRtcAnswerMessageSchema,
  webRtcIceCandidateMessageSchema
]);

export const authMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("AUTH_ADMIN"),
    payload: z.object({ token: z.string().min(1) })
  }),
  z.object({
    type: z.literal("AUTH_CHILD"),
    payload: z.object({
      token: z.string().min(1),
      deviceUuid: z.string().min(1)
    })
  })
]);

export type DeviceState = z.infer<typeof deviceStateSchema>;
export type Quality = z.infer<typeof qualitySchema>;
export type PeerRole = z.infer<typeof roleSchema>;
export type AppRule = z.infer<typeof appRuleSchema>;
export type WebRule = z.infer<typeof webRuleSchema>;
export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;
export type AuthMessage = z.infer<typeof authMessageSchema>;
export type StatusUpdateMessage = z.infer<typeof statusUpdateMessageSchema>;
export type UpdateBlockRulesMessage = z.infer<typeof updateBlockRulesMessageSchema>;
export type LiveScreenRequestMessage = z.infer<typeof liveScreenRequestMessageSchema>;
export type LiveScreenAcceptedMessage = z.infer<typeof liveScreenAcceptedMessageSchema>;
export type LiveScreenRejectedMessage = z.infer<typeof liveScreenRejectedMessageSchema>;
export type LiveScreenEndedMessage = z.infer<typeof liveScreenEndedMessageSchema>;
export type WebRtcOfferMessage = z.infer<typeof webRtcOfferMessageSchema>;
export type WebRtcAnswerMessage = z.infer<typeof webRtcAnswerMessageSchema>;
export type WebRtcIceCandidateMessage = z.infer<typeof webRtcIceCandidateMessageSchema>;
export type WebRtcSignalMessage =
  | WebRtcOfferMessage
  | WebRtcAnswerMessage
  | WebRtcIceCandidateMessage;
