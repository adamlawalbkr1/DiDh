import { 
  type User, type InsertUser, type UpsertUser,
  type Product, type InsertProduct,
  type Negotiation, type InsertNegotiation,
  type Transaction, type InsertTransaction,
  type NegotiationMessage, type InsertNegotiationMessage,
  type Payment, type InsertPayment,
  users, products, negotiations, transactions, negotiationMessages, payments
} from "@shared/schema";
import { db } from "./db";
import { eq, asc, sql, inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";

export interface IStorage {
  // User operations
  // (IMPORTANT) these user operations are mandatory for Replit Auth.
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;
  
  // Authentication operations
  validateCredentials(username: string, password: string): Promise<User | null>;
  comparePassword(password: string, hashedPassword: string): Promise<boolean>;

  // Product operations  
  getProduct(id: string): Promise<Product | undefined>;
  getProductsBySeller(sellerId: string): Promise<Product[]>;
  getProductsByCategory(category: string): Promise<Product[]>;
  getProductsByStatus(status: string): Promise<Product[]>;
  getAllProducts(): Promise<Product[]>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: string, updates: Partial<Product>): Promise<Product | undefined>;
  deleteProduct(id: string): Promise<boolean>;

  // Negotiation operations
  getNegotiation(id: string): Promise<Negotiation | undefined>;
  getNegotiationsByProduct(productId: string): Promise<Negotiation[]>;
  getNegotiationsByBuyer(buyerId: string): Promise<Negotiation[]>;
  getNegotiationsBySeller(sellerId: string): Promise<Negotiation[]>;
  createNegotiation(negotiation: InsertNegotiation): Promise<Negotiation>;
  updateNegotiation(id: string, updates: Partial<Negotiation>): Promise<Negotiation | undefined>;
  deleteNegotiation(id: string): Promise<boolean>;

  // Transaction operations
  getTransaction(id: string): Promise<Transaction | undefined>;
  getTransactionsByProduct(productId: string): Promise<Transaction[]>;
  getTransactionsByBuyer(buyerId: string): Promise<Transaction[]>;
  getTransactionsBySeller(sellerId: string): Promise<Transaction[]>;
  getTransactionsByStatus(status: string): Promise<Transaction[]>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  updateTransaction(id: string, updates: Partial<Transaction>): Promise<Transaction | undefined>;
  deleteTransaction(id: string): Promise<boolean>;

  // Negotiation Message operations
  createMessage(message: InsertNegotiationMessage): Promise<NegotiationMessage>;
  getMessages(negotiationId: string): Promise<NegotiationMessage[]>;
  getMessagesWithSender(negotiationId: string): Promise<Array<NegotiationMessage & { senderName: string }>>;
  updateNegotiationStatus(id: string, status: string): Promise<Negotiation | undefined>;

  // Presence operations
  updateUserOnlineStatus(userId: string, isOnline: boolean): Promise<User | undefined>;
  getUsersOnlineStatus(userIds: string[]): Promise<Array<{ id: string; username: string; isOnline: boolean; lastSeen: Date | null }>>;
  setUserLastSeen(userId: string): Promise<User | undefined>;

  // Payment operations
  createPayment(payment: InsertPayment): Promise<Payment>;
  getPayment(id: string): Promise<Payment | undefined>;
  getPaymentByNegotiation(negotiationId: string): Promise<Payment | undefined>;
  getPaymentsByUser(userId: string): Promise<Payment[]>;
  updatePayment(id: string, updates: Partial<Payment>): Promise<Payment | undefined>;
  updatePaymentStatus(id: string, status: string, stripePaymentIntentId?: string): Promise<Payment | undefined>;
  updateNegotiationPaymentStatus(negotiationId: string, paymentStatus: string): Promise<Negotiation | undefined>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  // (IMPORTANT) these user operations are mandatory for Replit Auth.

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    // Hash the password before storing
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(insertUser.password, saltRounds);
    
    // Create user object with hashed password, excluding the plain password
    const { password, ...userDataWithoutPassword } = insertUser;
    const userToInsert = {
      ...userDataWithoutPassword,
      hashedPassword
    };
    
    const [user] = await db.insert(users).values(userToInsert).returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const [user] = await db.update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Authentication methods
  async comparePassword(password: string, hashedPassword: string): Promise<boolean> {
    return await bcrypt.compare(password, hashedPassword);
  }

  async validateCredentials(username: string, password: string): Promise<User | null> {
    const user = await this.getUserByUsername(username);
    if (!user || !user.hashedPassword) {
      return null;
    }
    
    const isPasswordValid = await this.comparePassword(password, user.hashedPassword);
    if (!isPasswordValid) {
      return null;
    }
    
    return user;
  }

  // Product operations
  async getProduct(id: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product || undefined;
  }

  async getProductsBySeller(sellerId: string): Promise<Product[]> {
    return await db.select().from(products).where(eq(products.sellerId, sellerId));
  }

  async getProductsByCategory(category: string): Promise<Product[]> {
    return await db.select().from(products).where(eq(products.category, category));
  }

  async getProductsByStatus(status: string): Promise<Product[]> {
    return await db.select().from(products).where(eq(products.status, status));
  }

  async getAllProducts(): Promise<Product[]> {
    return await db.select().from(products);
  }

  async createProduct(insertProduct: InsertProduct): Promise<Product> {
    const [product] = await db.insert(products).values(insertProduct).returning();
    return product;
  }

  async updateProduct(id: string, updates: Partial<Product>): Promise<Product | undefined> {
    const [product] = await db.update(products)
      .set(updates)
      .where(eq(products.id, id))
      .returning();
    return product || undefined;
  }

  async deleteProduct(id: string): Promise<boolean> {
    const result = await db.delete(products).where(eq(products.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Negotiation operations
  async getNegotiation(id: string): Promise<Negotiation | undefined> {
    const [negotiation] = await db.select().from(negotiations).where(eq(negotiations.id, id));
    return negotiation || undefined;
  }

  async getNegotiationsByProduct(productId: string): Promise<Negotiation[]> {
    return await db.select().from(negotiations).where(eq(negotiations.productId, productId));
  }

  async getNegotiationsByBuyer(buyerId: string): Promise<Negotiation[]> {
    return await db.select().from(negotiations).where(eq(negotiations.buyerId, buyerId));
  }

  async getNegotiationsBySeller(sellerId: string): Promise<Negotiation[]> {
    return await db.select().from(negotiations).where(eq(negotiations.sellerId, sellerId));
  }

  async createNegotiation(insertNegotiation: InsertNegotiation): Promise<Negotiation> {
    const [negotiation] = await db.insert(negotiations).values(insertNegotiation).returning();
    return negotiation;
  }

  async updateNegotiation(id: string, updates: Partial<Negotiation>): Promise<Negotiation | undefined> {
    const [negotiation] = await db.update(negotiations)
      .set(updates)
      .where(eq(negotiations.id, id))
      .returning();
    return negotiation || undefined;
  }

  async deleteNegotiation(id: string): Promise<boolean> {
    const result = await db.delete(negotiations).where(eq(negotiations.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Transaction operations
  async getTransaction(id: string): Promise<Transaction | undefined> {
    const [transaction] = await db.select().from(transactions).where(eq(transactions.id, id));
    return transaction || undefined;
  }

  async getTransactionsByProduct(productId: string): Promise<Transaction[]> {
    return await db.select().from(transactions).where(eq(transactions.productId, productId));
  }

  async getTransactionsByBuyer(buyerId: string): Promise<Transaction[]> {
    return await db.select().from(transactions).where(eq(transactions.buyerId, buyerId));
  }

  async getTransactionsBySeller(sellerId: string): Promise<Transaction[]> {
    return await db.select().from(transactions).where(eq(transactions.sellerId, sellerId));
  }

  async getTransactionsByStatus(status: string): Promise<Transaction[]> {
    return await db.select().from(transactions).where(eq(transactions.status, status));
  }

  async createTransaction(insertTransaction: InsertTransaction): Promise<Transaction> {
    const [transaction] = await db.insert(transactions).values(insertTransaction).returning();
    return transaction;
  }

  async updateTransaction(id: string, updates: Partial<Transaction>): Promise<Transaction | undefined> {
    const [transaction] = await db.update(transactions)
      .set(updates)
      .where(eq(transactions.id, id))
      .returning();
    return transaction || undefined;
  }

  async deleteTransaction(id: string): Promise<boolean> {
    const result = await db.delete(transactions).where(eq(transactions.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Negotiation Message operations
  async createMessage(message: InsertNegotiationMessage): Promise<NegotiationMessage> {
    const [newMessage] = await db.insert(negotiationMessages).values(message).returning();
    return newMessage;
  }

  async getMessages(negotiationId: string): Promise<NegotiationMessage[]> {
    return await db.select().from(negotiationMessages)
      .where(eq(negotiationMessages.negotiationId, negotiationId))
      .orderBy(asc(negotiationMessages.createdAt));
  }

  async getMessagesWithSender(negotiationId: string): Promise<Array<NegotiationMessage & { senderName: string }>> {
    return await db.select({
      id: negotiationMessages.id,
      negotiationId: negotiationMessages.negotiationId,
      senderId: negotiationMessages.senderId,
      messageType: negotiationMessages.messageType,
      content: negotiationMessages.content,
      amount: negotiationMessages.amount,
      createdAt: negotiationMessages.createdAt,
      senderName: users.username,
    })
    .from(negotiationMessages)
    .innerJoin(users, eq(negotiationMessages.senderId, users.id))
    .where(eq(negotiationMessages.negotiationId, negotiationId))
    .orderBy(asc(negotiationMessages.createdAt));
  }

  async updateNegotiationStatus(id: string, status: string): Promise<Negotiation | undefined> {
    const [negotiation] = await db.update(negotiations)
      .set({ status, updatedAt: new Date() })
      .where(eq(negotiations.id, id))
      .returning();
    return negotiation || undefined;
  }

  // Presence operations
  async updateUserOnlineStatus(userId: string, isOnline: boolean): Promise<User | undefined> {
    const [user] = await db.update(users)
      .set({ 
        isOnline,
        lastSeen: isOnline ? new Date() : new Date(),
        updatedAt: new Date()
      })
      .where(eq(users.id, userId))
      .returning();
    return user || undefined;
  }

  async getUsersOnlineStatus(userIds: string[]): Promise<Array<{ id: string; username: string; isOnline: boolean; lastSeen: Date | null }>> {
    if (userIds.length === 0) {
      return [];
    }
    
    const results = await db.select({
      id: users.id,
      username: users.username,
      isOnline: users.isOnline,
      lastSeen: users.lastSeen
    })
    .from(users)
    .where(inArray(users.id, userIds));
    
    return results.map(user => ({
      id: user.id,
      username: user.username || 'Unknown',
      isOnline: user.isOnline || false,
      lastSeen: user.lastSeen
    }));
  }

  async setUserLastSeen(userId: string): Promise<User | undefined> {
    const [user] = await db.update(users)
      .set({ 
        lastSeen: new Date(),
        updatedAt: new Date()
      })
      .where(eq(users.id, userId))
      .returning();
    return user || undefined;
  }

  // Payment operations
  async createPayment(payment: InsertPayment): Promise<Payment> {
    const [createdPayment] = await db.insert(payments).values(payment).returning();
    return createdPayment;
  }

  async getPayment(id: string): Promise<Payment | undefined> {
    const [payment] = await db.select().from(payments).where(eq(payments.id, id));
    return payment || undefined;
  }

  async getPaymentByNegotiation(negotiationId: string): Promise<Payment | undefined> {
    const [payment] = await db.select().from(payments).where(eq(payments.negotiationId, negotiationId));
    return payment || undefined;
  }

  async getPaymentsByUser(userId: string): Promise<Payment[]> {
    return await db.select().from(payments).where(eq(payments.buyerId, userId));
  }

  async updatePayment(id: string, updates: Partial<Payment>): Promise<Payment | undefined> {
    const [payment] = await db.update(payments)
      .set(updates)
      .where(eq(payments.id, id))
      .returning();
    return payment || undefined;
  }

  async updatePaymentStatus(id: string, status: string, stripePaymentIntentId?: string): Promise<Payment | undefined> {
    const updateData: any = { status };
    if (status === 'completed') {
      updateData.completedAt = new Date();
    }
    if (stripePaymentIntentId) {
      updateData.stripePaymentIntentId = stripePaymentIntentId;
    }

    const [payment] = await db.update(payments)
      .set(updateData)
      .where(eq(payments.id, id))
      .returning();
    return payment || undefined;
  }

  async updateNegotiationPaymentStatus(negotiationId: string, paymentStatus: string): Promise<Negotiation | undefined> {
    const [negotiation] = await db.update(negotiations)
      .set({ paymentStatus, updatedAt: new Date() })
      .where(eq(negotiations.id, negotiationId))
      .returning();
    return negotiation || undefined;
  }
}

export const storage = new DatabaseStorage();
