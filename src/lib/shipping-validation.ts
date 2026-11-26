import { z } from "zod";
export const shippingAddress = z.object({
  name: z.string().trim().min(1).max(200),
  street1: z.string().trim().min(1).max(200),
  street2: z.string().max(200).optional(),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(100),
  zip: z.string().trim().min(1).max(30),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .default("US"),
  phone: z.string().max(40).optional(),
  email: z.string().email().optional(),
});
export const parcelSchema = z.object({
  length: z.number().finite().positive().max(500),
  width: z.number().finite().positive().max(500),
  height: z.number().finite().positive().max(500),
  weight: z.number().finite().positive().max(24000),
});
