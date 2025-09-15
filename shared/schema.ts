import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, decimal, integer, timestamp, jsonb, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// WebSocket message types
export const wsMessageSchema = z.discriminatedUnion("type", [
  // Negotiation messages
  z.object({ type: z.literal("join_negotiation"), negotiationId: z.string() }),
  z.object({ type: z.literal("leave_negotiation"), negotiationId: z.string() }),
  z.object({ type: z.literal("negotiation_message"), negotiationId: z.string(), content: z.string().min(1).max(1000) }),
  z.object({ type: z.literal("negotiation_offer"), negotiationId: z.string(), amount: z.number().positive(), message: z.string().optional() }),
  z.object({ type: z.literal("negotiation_counter"), negotiationId: z.string(), amount: z.number().positive(), message: z.string().optional() }),
  z.object({ type: z.literal("negotiation_accept"), negotiationId: z.string() }),
  z.object({ type: z.literal("negotiation_reject"), negotiationId: z.string(), message: z.string().optional() }),
  z.object({ type: z.literal("negotiation_status"), negotiationId: z.string(), status: z.enum(["active", "completed", "cancelled"]) }),
  
  // Presence messages
  z.object({ type: z.literal("presence_update"), userId: z.string(), isOnline: z.boolean() }),
  z.object({ type: z.literal("request_presence"), userIds: z.array(z.string()).optional() }),
]);

export type WSMessage = z.infer<typeof wsMessageSchema>;

// WebSocket broadcast message format
export const wsBroadcastSchema = z.discriminatedUnion("type", [
  // Negotiation updates
  z.object({
    type: z.literal("negotiation_update"),
    negotiationId: z.string(),
    message: z.object({
      id: z.string(),
      senderId: z.string(),
      senderName: z.string(),
      messageType: z.enum(["chat", "offer", "counter", "accept", "reject", "status"]),
      content: z.string().optional(),
      amount: z.number().optional(),
      createdAt: z.string(),
    }),
  }),
  
  // Presence updates
  z.object({
    type: z.literal("presence_update"),
    userId: z.string(),
    username: z.string(),
    isOnline: z.boolean(),
    lastSeen: z.string(),
  }),
  
  // Negotiation status updates
  z.object({
    type: z.literal("negotiation_status_update"),
    negotiationId: z.string(),
    status: z.enum(["active", "completed", "cancelled"]),
    changedBy: z.string(),
    changedByName: z.string(),
    timestamp: z.string(),
    context: z.string().optional(),
  }),
  
  // Error messages
  z.object({
    type: z.literal("error"),
    data: z.object({
      message: z.string(),
      negotiationId: z.string().optional(),
      code: z.string().optional(),
    }),
  }),
]);

export type WSBroadcastMessage = z.infer<typeof wsBroadcastSchema>;

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").unique(),
  hashedPassword: text("hashed_password"),
  email: text("email"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  walletBalance: decimal("wallet_balance", { precision: 10, scale: 2 }).default("0.00"),
  rating: decimal("rating", { precision: 3, scale: 2 }).default("0.00"),
  totalTransactions: integer("total_transactions").default(0),
  location: text("location"),
  coordinates: jsonb("coordinates").$type<{ lat: number; lng: number }>(),
  isOnline: boolean("is_online").default(false),
  lastSeen: timestamp("last_seen").defaultNow(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Products table
export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sellerId: varchar("seller_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  suggestedPrice: decimal("suggested_price", { precision: 10, scale: 2 }),
  category: text("category").notNull(),
  condition: text("condition").notNull(), // new, used, refurbished
  images: text("images").array().default([]),
  features: jsonb("features").$type<Record<string, any>>().default({}),
  location: text("location"),
  coordinates: jsonb("coordinates").$type<{ lat: number; lng: number }>(),
  status: text("status").default("available"), // available, sold, negotiating, reserved
  isRealEstate: boolean("is_real_estate").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Negotiations/Chats table
export const negotiations = pgTable("negotiations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").notNull().references(() => products.id),
  buyerId: varchar("buyer_id").notNull().references(() => users.id),
  sellerId: varchar("seller_id").notNull().references(() => users.id),
  status: text("status").default("active"), // active, accepted, rejected, completed
  currentOffer: decimal("current_offer", { precision: 10, scale: 2 }),
  paymentStatus: varchar("payment_status", { length: 50 }).default("unpaid"), // unpaid, paid, refunded
  messages: jsonb("messages").$type<Array<{
    id: string;
    senderId: string;
    message: string;
    timestamp: Date;
    type: 'message' | 'offer' | 'counter_offer';
  }>>().default([]),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Negotiation Messages table for real-time chat persistence
export const negotiationMessages = pgTable("negotiation_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  negotiationId: varchar("negotiation_id").notNull().references(() => negotiations.id),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  messageType: varchar("message_type", { enum: ["chat", "offer", "counter", "accept", "reject", "status"] }).notNull(),
  content: text("content"), // For chat messages and optional offer messages
  amount: decimal("amount", { precision: 10, scale: 2 }), // For offers/counters
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Payments table for Stripe payment tracking
export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  negotiationId: varchar("negotiation_id").notNull().references(() => negotiations.id),
  buyerId: varchar("buyer_id").notNull().references(() => users.id),
  sellerId: varchar("seller_id").notNull().references(() => users.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  stripePaymentIntentId: varchar("stripe_payment_intent_id"),
  status: varchar("status", { length: 50 }).default("pending"), // pending, completed, failed, refunded
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// Transactions table
export const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").notNull().references(() => products.id),
  buyerId: varchar("buyer_id").notNull().references(() => users.id),
  sellerId: varchar("seller_id").notNull().references(() => users.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").default("pending"), // pending, completed, failed, disputed
  escrowReleased: boolean("escrow_released").default(false),
  ownershipCertificate: jsonb("ownership_certificate").$type<{
    certificateId: string;
    transferredAt: Date;
    digitalSignature: string;
  }>(),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  products: many(products),
  negotiationsAsBuyer: many(negotiations, { relationName: "buyer" }),
  negotiationsAsSeller: many(negotiations, { relationName: "seller" }),
  transactionsAsBuyer: many(transactions, { relationName: "buyer" }),
  transactionsAsSeller: many(transactions, { relationName: "seller" }),
  paymentsAsBuyer: many(payments, { relationName: "buyer" }),
  paymentsAsSeller: many(payments, { relationName: "seller" }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  seller: one(users, {
    fields: [products.sellerId],
    references: [users.id],
  }),
  negotiations: many(negotiations),
  transactions: many(transactions),
}));

export const negotiationsRelations = relations(negotiations, ({ one, many }) => ({
  product: one(products, {
    fields: [negotiations.productId],
    references: [products.id],
  }),
  buyer: one(users, {
    fields: [negotiations.buyerId],
    references: [users.id],
    relationName: "buyer",
  }),
  seller: one(users, {
    fields: [negotiations.sellerId],
    references: [users.id],
    relationName: "seller",
  }),
  messages: many(negotiationMessages),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  negotiation: one(negotiations, {
    fields: [payments.negotiationId],
    references: [negotiations.id],
  }),
  buyer: one(users, {
    fields: [payments.buyerId],
    references: [users.id],
    relationName: "buyer",
  }),
  seller: one(users, {
    fields: [payments.sellerId],
    references: [users.id],
    relationName: "seller",
  }),
}));

export const negotiationMessagesRelations = relations(negotiationMessages, ({ one }) => ({
  negotiation: one(negotiations, {
    fields: [negotiationMessages.negotiationId],
    references: [negotiations.id],
  }),
  sender: one(users, {
    fields: [negotiationMessages.senderId],
    references: [users.id],
  }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  product: one(products, {
    fields: [transactions.productId],
    references: [products.id],
  }),
  buyer: one(users, {
    fields: [transactions.buyerId],
    references: [users.id],
    relationName: "buyer",
  }),
  seller: one(users, {
    fields: [transactions.sellerId],
    references: [users.id],
    relationName: "seller",
  }),
}));

// Insert schemas - Keep password field for input, will be processed to hashedPassword
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  location: true,
  coordinates: true,
}).extend({
  password: z.string().min(8, "Password must be at least 8 characters long"),
});

// UpsertUser type for Replit Auth integration
export const upsertUserSchema = createInsertSchema(users).pick({
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  profileImageUrl: true,
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  suggestedPrice: true,
});

export const insertNegotiationSchema = createInsertSchema(negotiations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  messages: true,
});

// Client input schema for creating negotiations - only validates client-provided fields
export const createNegotiationSchema = insertNegotiationSchema.omit({
  buyerId: true,   // Set from authenticated user
  sellerId: true,  // Set from product lookup
  status: true,    // Defaults to "active"
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  createdAt: true,
  completedAt: true,
  ownershipCertificate: true,
});

export const insertNegotiationMessageSchema = createInsertSchema(negotiationMessages).omit({
  id: true,
  createdAt: true,
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

// Payment creation schema for API input
export const createPaymentSchema = insertPaymentSchema.omit({
  buyerId: true,   // Set from authenticated user
  sellerId: true,  // Set from negotiation lookup
  stripePaymentIntentId: true, // Set by Stripe
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpsertUser = z.infer<typeof upsertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;
export type InsertNegotiation = z.infer<typeof insertNegotiationSchema>;
export type Negotiation = typeof negotiations.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;
export type InsertNegotiationMessage = z.infer<typeof insertNegotiationMessageSchema>;
export type NegotiationMessage = typeof negotiationMessages.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;
