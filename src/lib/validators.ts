import { z } from "zod";

export const emailPasswordSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(128)
});

export const createChildSchema = z.object({
  displayName: z.string().min(1).max(120)
});

export const updateChildSchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  status: z.enum(["unpaired", "paired", "disabled"]).optional()
});

export const createAppRuleSchema = z.object({
  packageName: z.string().min(1).max(255),
  label: z.string().min(1).max(120).optional(),
  isEnabled: z.boolean()
});

export const updateAppRuleSchema = z.object({
  label: z.string().min(1).max(120).nullable().optional(),
  isEnabled: z.boolean().optional()
});

export const createWebRuleSchema = z.object({
  domain: z.string().min(1).max(255),
  category: z.string().min(1).max(80).optional(),
  isBlocked: z.boolean()
});

export const updateWebRuleSchema = z.object({
  category: z.string().min(1).max(80).nullable().optional(),
  isBlocked: z.boolean().optional()
});

export const endLiveScreenSchema = z.object({
  reason: z.string().max(255).optional()
});

export const failLiveScreenSchema = z.object({
  reason: z.string().min(1).max(255)
});
