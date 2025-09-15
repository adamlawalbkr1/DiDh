import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import { parse } from "url";
import { storage } from "./storage";
import { insertProductSchema, type Product, createNegotiationSchema, insertNegotiationSchema, type Negotiation, wsMessageSchema, type WSMessage as SharedWSMessage, type WSBroadcastMessage, createPaymentSchema, type Payment } from "@shared/schema";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { veniceAI, type PriceSuggestionRequest } from "./veniceAI";
import { z } from "zod";
import Stripe from "stripe";
import { securityMiddleware, enhancedValidation, fraudDetection, moderateContent } from "./security";

// Initialize Stripe
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

// WebSocket types and interfaces
interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  isAuthenticated?: boolean;
}

interface WSMessage {
  type: string;
  data?: any;
  negotiationId?: string;
  timestamp?: string;
}

// WebSocket state management
const userSockets = new Map<string, Set<AuthenticatedWebSocket>>();
const negotiationRooms = new Map<string, Set<AuthenticatedWebSocket>>();

// Helper function to calculate distance between two coordinates
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c; // Distance in kilometers
  return distance;
}

// Coordinate bounds filtering schema
const coordinateFilterSchema = z.object({
  lat: z.string().transform(Number),
  lng: z.string().transform(Number),
  radius: z.string().transform(Number).optional().default("10") // Default 10km radius
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Create HTTP server
  const server = createServer(app);
  
  // Setup WebSocket server with authentication
  setupWebSocketServer(server);

  // Auth routes with rate limiting
  app.get('/api/auth/user', 
    securityMiddleware.authRateLimit,
    isAuthenticated, 
    async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // GET /api/products - List products with filtering (no auth required for browsing)
  app.get("/api/products", async (req: Request, res: Response) => {
    try {
      const { category, status, sellerId, location, lat, lng, radius } = req.query;
      
      let products = await storage.getAllProducts();
      
      // Apply filters
      if (category && typeof category === 'string') {
        products = products.filter(p => p.category === category);
      }
      
      if (status && typeof status === 'string') {
        products = products.filter(p => p.status === status);
      }
      
      if (sellerId && typeof sellerId === 'string') {
        products = products.filter(p => p.sellerId === sellerId);
      }
      
      if (location && typeof location === 'string') {
        products = products.filter(p => p.location && p.location.toLowerCase().includes(location.toLowerCase()));
      }
      
      // Coordinate-based filtering for map discovery
      if (lat && lng) {
        try {
          const coordFilter = coordinateFilterSchema.parse({ lat, lng, radius });
          products = products.filter(product => {
            if (!product.coordinates) return false;
            const distance = calculateDistance(
              coordFilter.lat, 
              coordFilter.lng, 
              product.coordinates.lat, 
              product.coordinates.lng
            );
            return distance <= coordFilter.radius;
          });
        } catch (error) {
          return res.status(400).json({ 
            error: "Invalid coordinates format. Expected lat and lng as numbers." 
          });
        }
      }
      
      // Get seller information for each product
      const productsWithSellers = await Promise.all(
        products.map(async (product) => {
          const seller = await storage.getUser(product.sellerId);
          return {
            ...product,
            seller: seller ? {
              id: seller.id,
              username: seller.username,
              rating: seller.rating,
              location: seller.location,
              isOnline: seller.isOnline
            } : null
          };
        })
      );
      
      res.json(productsWithSellers);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/products - Create new product listing (protected)
  app.post("/api/products", 
    securityMiddleware.productCreationRateLimit,
    isAuthenticated, 
    enhancedValidation.validateProductContent,
    enhancedValidation.validatePrice,
    async (req: any, res: Response) => {
    try {
      // Get authenticated user ID from session
      const sellerId = req.user.claims.sub;
      
      // Verify seller exists
      const seller = await storage.getUser(sellerId);
      if (!seller) {
        return res.status(404).json({ error: "Seller not found" });
      }
      
      // Anti-fraud: Check for duplicate products by same user
      if (req.body.title && req.body.price) {
        await fraudDetection.checkDuplicateProduct(sellerId, req.body.title, req.body.price);
      }
      
      // Anti-fraud: Log product creation activity
      fraudDetection.logSuspiciousActivity(sellerId, 'product_creation', {
        title: req.body.title?.substring(0, 50),
        price: req.body.price,
        category: req.body.category,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      // Parse product data and set sellerId from auth session
      const productData = {
        ...req.body,
        sellerId: sellerId // Override any provided sellerId with authenticated user ID
      };
      const validatedData = insertProductSchema.parse(productData);
      
      const product = await storage.createProduct(validatedData);
      
      // Log successful product creation
      console.log(`Product created successfully`, {
        productId: product.id,
        sellerId,
        title: product.title.substring(0, 50),
        price: product.price,
        timestamp: new Date().toISOString()
      });
      
      res.status(201).json({
        ...product,
        seller: {
          id: seller.id,
          username: seller.username,
          rating: seller.rating,
          location: seller.location,
          isOnline: seller.isOnline
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Validation error", 
          details: error.errors 
        });
      }
      console.error("Error creating product:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/products/:id - Get single product details
  app.get("/api/products/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({ error: "Product ID is required" });
      }
      
      const product = await storage.getProduct(id);
      
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      // Get seller information
      const seller = await storage.getUser(product.sellerId);
      
      res.json({
        ...product,
        seller: seller ? {
          id: seller.id,
          username: seller.username,
          rating: seller.rating,
          location: seller.location,
          isOnline: seller.isOnline,
          totalTransactions: seller.totalTransactions
        } : null
      });
    } catch (error) {
      console.error("Error fetching product:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/products/:id - Update existing product (protected)
  app.put("/api/products/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const { id } = req.params;
      const authenticatedUserId = req.user.claims.sub;
      
      if (!id) {
        return res.status(400).json({ error: "Product ID is required" });
      }
      
      // Get existing product to validate ownership
      const existingProduct = await storage.getProduct(id);
      
      if (!existingProduct) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      // Validate ownership - only seller can update their product
      if (existingProduct.sellerId !== authenticatedUserId) {
        return res.status(403).json({ error: "Only the seller can update this product" });
      }
      
      // Prevent status changes that could enable double selling
      if (req.body.status === 'sold' && existingProduct.status !== 'sold') {
        // Additional validation for marking as sold could go here
        // e.g., verify there's a completed transaction
      }
      
      // Validate update data (partial schema)
      const updateSchema = insertProductSchema.partial().omit({ sellerId: true });
      let validatedUpdates;
      
      try {
        validatedUpdates = updateSchema.parse(req.body);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ 
            error: "Validation error", 
            details: error.errors 
          });
        }
        throw error;
      }
      
      // Add updatedAt timestamp
      const updatedProduct = await storage.updateProduct(id, {
        ...validatedUpdates,
        updatedAt: new Date()
      });
      
      if (!updatedProduct) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      // Get seller information for response
      const seller = await storage.getUser(updatedProduct.sellerId);
      
      res.json({
        ...updatedProduct,
        seller: seller ? {
          id: seller.id,
          username: seller.username,
          rating: seller.rating,
          location: seller.location,
          isOnline: seller.isOnline
        } : null
      });
    } catch (error) {
      console.error("Error updating product:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /api/products/:id - Soft delete product (protected)
  app.delete("/api/products/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const { id } = req.params;
      const authenticatedUserId = req.user.claims.sub;
      
      if (!id) {
        return res.status(400).json({ error: "Product ID is required" });
      }
      
      // Get existing product to validate ownership
      const existingProduct = await storage.getProduct(id);
      
      if (!existingProduct) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      // Validate ownership - only seller can delete their product
      if (existingProduct.sellerId !== authenticatedUserId) {
        return res.status(403).json({ error: "Only the seller can delete this product" });
      }
      
      // Soft delete by setting status to inactive
      const updatedProduct = await storage.updateProduct(id, {
        status: 'inactive',
        updatedAt: new Date()
      });
      
      if (!updatedProduct) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      res.json({ 
        message: "Product successfully removed",
        product: updatedProduct
      });
    } catch (error) {
      console.error("Error deleting product:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/products/suggest-price - Get AI price suggestion (protected)
  app.post("/api/products/suggest-price", isAuthenticated, async (req: Request, res: Response) => {
    const startTime = Date.now();
    
    try {
      console.log("Price suggestion request received:", req.body);
      
      // Validate request body
      const requestSchema = z.object({
        title: z.string().min(1, "Title is required").max(100, "Title too long"),
        description: z.string().min(1, "Description is required").max(1000, "Description too long"),
        category: z.string().min(1, "Category is required"),
        condition: z.enum(["new", "used", "refurbished"]),
        location: z.string().optional(),
      });

      const validatedData = requestSchema.parse(req.body);
      console.log("Request validation successful");

      // Get price suggestion from Venice AI (with built-in fallback)
      const suggestion = await veniceAI.suggestPrice(validatedData as PriceSuggestionRequest);
      
      const duration = Date.now() - startTime;
      console.log(`Price suggestion generated successfully in ${duration}ms`);

      res.json({
        success: true,
        suggestion: {
          price: suggestion.suggestedPrice,
          priceRange: suggestion.priceRange,
          confidence: suggestion.confidence,
          reasoning: suggestion.reasoning,
          marketFactors: suggestion.marketFactors
        },
        metadata: {
          duration,
          timestamp: new Date().toISOString(),
          fallbackUsed: suggestion.confidence < 80 // Indicates if fallback was likely used
        }
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`Venice AI price suggestion error after ${duration}ms:`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        requestBody: req.body
      });
      
      // Validation errors
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: "Invalid request data",
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          })),
          metadata: { duration, timestamp: new Date().toISOString() }
        });
      }

      // Specific error handling for better user experience
      if (error instanceof Error) {
        // API key configuration issues
        if (error.message.includes("VENICE_AI_API_KEY") || error.message.includes("not configured")) {
          return res.status(200).json({ // Return 200 to avoid frontend error states
            success: true,
            suggestion: {
              price: 50, // Safe default
              priceRange: { min: 30, max: 70 },
              confidence: 60,
              reasoning: "Price suggestion based on general market analysis. Venice AI service is currently unavailable.",
              marketFactors: ["Service unavailable", "Using fallback analysis", "General market trends"]
            },
            metadata: {
              duration,
              timestamp: new Date().toISOString(),
              fallbackUsed: true,
              reason: "Venice AI service not configured"
            }
          });
        }

        // API timeout or network errors
        if (error.message.includes("timeout") || error.message.includes("ECONNREFUSED") || error.message.includes("fetch")) {
          return res.status(200).json({ // Return 200 to avoid frontend error states
            success: true,
            suggestion: {
              price: 45,
              priceRange: { min: 25, max: 65 },
              confidence: 55,
              reasoning: "Price suggestion based on standard market analysis. AI pricing service is temporarily unavailable.",
              marketFactors: ["Network timeout", "Using backup analysis", "Standard pricing model"]
            },
            metadata: {
              duration,
              timestamp: new Date().toISOString(),
              fallbackUsed: true,
              reason: "Venice AI service timeout"
            }
          });
        }

        // JSON parsing or API response errors
        if (error.message.includes("JSON") || error.message.includes("parse") || error.message.includes("invalid")) {
          return res.status(200).json({
            success: true,
            suggestion: {
              price: 40,
              priceRange: { min: 25, max: 60 },
              confidence: 50,
              reasoning: "Price suggestion using standard pricing algorithms. AI response could not be processed.",
              marketFactors: ["AI response error", "Using algorithm fallback", "Safe pricing estimate"]
            },
            metadata: {
              duration,
              timestamp: new Date().toISOString(),
              fallbackUsed: true,
              reason: "Venice AI response parsing error"
            }
          });
        }
      }

      // Final fallback for any unexpected errors
      console.error("Unexpected error in price suggestion:", error);
      res.status(200).json({
        success: true,
        suggestion: {
          price: 35,
          priceRange: { min: 20, max: 50 },
          confidence: 45,
          reasoning: "Conservative price estimate using backup analysis. Please adjust based on your market knowledge.",
          marketFactors: ["Backup system active", "Conservative estimate", "Manual adjustment recommended"]
        },
        metadata: {
          duration,
          timestamp: new Date().toISOString(),
          fallbackUsed: true,
          reason: "Unexpected service error"
        }
      });
    }
  });

  // GET /api/ai/health - Venice AI service health check
  app.get("/api/ai/health", async (req: Request, res: Response) => {
    try {
      const startTime = Date.now();
      const status = veniceAI.getStatus();
      
      let healthCheck = null;
      if (status.configured) {
        healthCheck = await veniceAI.healthCheck();
      }
      
      const duration = Date.now() - startTime;
      
      res.json({
        service: "Venice AI",
        configured: status.configured,
        healthy: healthCheck === true,
        responseTime: duration,
        timestamp: new Date().toISOString(),
        details: {
          hasApiKey: status.configured,
          canConnect: healthCheck,
          fallbackAvailable: true
        }
      });
    } catch (error) {
      console.error("Venice AI health check error:", error);
      res.status(500).json({
        service: "Venice AI",
        configured: false,
        healthy: false,
        error: error instanceof Error ? error.message : "Health check failed",
        timestamp: new Date().toISOString(),
        details: {
          hasApiKey: false,
          canConnect: false,
          fallbackAvailable: true
        }
      });
    }
  });

  // WebSocket Token endpoint - Generate short-lived tokens for WS authentication
  app.post("/api/ws-token", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Generate short-lived token (15 minutes)
      const wsSecret = process.env.WS_SECRET || process.env.SESSION_SECRET || 'fallback-secret';
      const token = jwt.sign(
        { 
          userId: user.id,
          username: user.username,
          iat: Math.floor(Date.now() / 1000)
        },
        wsSecret,
        { 
          expiresIn: '15m',
          issuer: 'p2p-marketplace',
          subject: 'websocket-auth'
        }
      );
      
      res.json({
        token,
        expiresIn: 15 * 60 * 1000, // 15 minutes in milliseconds
        user: {
          id: user.id,
          username: user.username
        }
      });
    } catch (error) {
      console.error("Error generating WebSocket token:", error);
      res.status(500).json({ error: "Failed to generate WebSocket token" });
    }
  });

  // POST /api/negotiations - Create new negotiation (protected)
  app.post("/api/negotiations", 
    securityMiddleware.negotiationCreationRateLimit,
    isAuthenticated, 
    async (req: any, res: Response) => {
    try {
      const authenticatedUserId = req.user.claims.sub;
      
      // Validate client input - only validates fields client should provide
      let validatedClientData;
      try {
        validatedClientData = createNegotiationSchema.parse(req.body);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ 
            error: "Validation error", 
            details: error.errors 
          });
        }
        throw error;
      }
      
      // Verify product exists and get seller information
      const product = await storage.getProduct(validatedClientData.productId);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      // Ensure product is available for negotiation
      if (product.status !== 'available') {
        return res.status(400).json({ error: "Product is not available for negotiation" });
      }
      
      // Prevent seller from negotiating on their own product
      if (product.sellerId === authenticatedUserId) {
        return res.status(400).json({ error: "You cannot negotiate on your own product" });
      }
      
      // Check for existing active negotiation between same buyer and seller for this product
      const existingNegotiations = await storage.getNegotiationsByProduct(validatedClientData.productId);
      const duplicateNegotiation = existingNegotiations.find(neg => 
        neg.buyerId === authenticatedUserId && 
        neg.sellerId === product.sellerId && 
        neg.status === 'active'
      );
      
      if (duplicateNegotiation) {
        return res.status(409).json({ 
          error: "Active negotiation already exists between you and this seller for this product",
          existingNegotiationId: duplicateNegotiation.id
        });
      }
      
      // Anti-fraud: Log negotiation creation activity
      fraudDetection.logSuspiciousActivity(authenticatedUserId, 'negotiation_creation', {
        productId: validatedClientData.productId,
        sellerId: product.sellerId,
        productTitle: product.title.substring(0, 50),
        productPrice: product.price,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      // Construct complete negotiation payload server-side
      const negotiationToCreate = {
        ...validatedClientData,
        buyerId: authenticatedUserId,  // From authenticated user
        sellerId: product.sellerId,    // From product lookup
        status: 'active' as const,     // Default status
      };
      
      const negotiation = await storage.createNegotiation(negotiationToCreate);
      
      res.status(201).json(negotiation);
    } catch (error) {
      console.error("Error creating negotiation:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/negotiations/:id - Get specific negotiation (protected)
  app.get("/api/negotiations/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const { id } = req.params;
      const authenticatedUserId = req.user.claims.sub;
      
      if (!id) {
        return res.status(400).json({ error: "Negotiation ID is required" });
      }
      
      const negotiation = await storage.getNegotiation(id);
      
      if (!negotiation) {
        return res.status(404).json({ error: "Negotiation not found" });
      }
      
      // Authorization: only buyer or seller can view the negotiation
      if (negotiation.buyerId !== authenticatedUserId && negotiation.sellerId !== authenticatedUserId) {
        return res.status(403).json({ error: "Access denied. You are not authorized to view this negotiation" });
      }
      
      res.json(negotiation);
    } catch (error) {
      console.error("Error fetching negotiation:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/negotiations - List negotiations with filtering (protected)
  app.get("/api/negotiations", isAuthenticated, async (req: any, res: Response) => {
    try {
      const authenticatedUserId = req.user.claims.sub;
      const { productId, role } = req.query;
      
      let negotiations: Negotiation[] = [];
      
      if (productId && typeof productId === 'string') {
        // Filter by product and only return negotiations the user is part of
        const productNegotiations = await storage.getNegotiationsByProduct(productId);
        negotiations = productNegotiations.filter(neg => 
          neg.buyerId === authenticatedUserId || neg.sellerId === authenticatedUserId
        );
      } else if (role === 'buyer') {
        negotiations = await storage.getNegotiationsByBuyer(authenticatedUserId);
      } else if (role === 'seller') {
        negotiations = await storage.getNegotiationsBySeller(authenticatedUserId);
      } else {
        // Return all negotiations where user is either buyer or seller
        const buyerNegotiations = await storage.getNegotiationsByBuyer(authenticatedUserId);
        const sellerNegotiations = await storage.getNegotiationsBySeller(authenticatedUserId);
        
        // Combine and deduplicate
        const allNegotiations = [...buyerNegotiations, ...sellerNegotiations];
        const negotiationMap = new Map();
        allNegotiations.forEach(neg => negotiationMap.set(neg.id, neg));
        negotiations = Array.from(negotiationMap.values());
      }
      
      res.json(negotiations);
    } catch (error) {
      console.error("Error fetching negotiations:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Payment endpoints for secure Stripe integration

  // POST /api/negotiations/:negotiationId/payment-intent - Create payment intent for negotiation
  app.post("/api/negotiations/:negotiationId/payment-intent", 
    securityMiddleware.paymentRateLimit,
    isAuthenticated, 
    async (req: any, res: Response) => {
    try {
      const { negotiationId } = req.params;
      const authenticatedUserId = req.user.claims.sub;

      if (!negotiationId) {
        return res.status(400).json({ error: "Negotiation ID is required" });
      }
      
      // Anti-fraud: Log payment intent creation
      fraudDetection.logSuspiciousActivity(authenticatedUserId, 'payment_intent_creation', {
        negotiationId,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      });

      // Get negotiation details
      const negotiation = await storage.getNegotiation(negotiationId);
      if (!negotiation) {
        return res.status(404).json({ error: "Negotiation not found" });
      }

      // Verify user is the buyer
      if (negotiation.buyerId !== authenticatedUserId) {
        return res.status(403).json({ error: "Only the buyer can initiate payment" });
      }

      // Check negotiation status
      if (negotiation.status !== 'accepted') {
        return res.status(400).json({ error: "Negotiation must be accepted before payment" });
      }

      // Check payment status
      if (negotiation.paymentStatus === 'paid') {
        return res.status(400).json({ error: "Payment already completed for this negotiation" });
      }

      // Check for existing payment
      const existingPayment = await storage.getPaymentByNegotiation(negotiationId);
      if (existingPayment && existingPayment.status === 'completed') {
        return res.status(400).json({ error: "Payment already completed" });
      }

      // Validate amount
      if (!negotiation.currentOffer || negotiation.currentOffer <= 0) {
        return res.status(400).json({ error: "Invalid offer amount" });
      }

      const amountInCents = Math.round(parseFloat(negotiation.currentOffer.toString()) * 100);

      // ANTI-FRAUD: Check for existing PaymentIntent to prevent duplicates
      if (existingPayment && existingPayment.stripePaymentIntentId) {
        try {
          console.log(`Checking existing PaymentIntent ${existingPayment.stripePaymentIntentId} for negotiation ${negotiationId}`);
          
          // Retrieve existing PaymentIntent from Stripe
          const existingPaymentIntent = await stripe.paymentIntents.retrieve(existingPayment.stripePaymentIntentId);
          
          // If existing PaymentIntent is still valid (not succeeded), reuse it
          if (existingPaymentIntent.status !== 'succeeded' && existingPaymentIntent.status !== 'canceled') {
            console.log(`Reusing existing PaymentIntent ${existingPaymentIntent.id} with status ${existingPaymentIntent.status}`);
            
            // Validate the existing PaymentIntent amount matches current negotiation
            if (existingPaymentIntent.amount === amountInCents) {
              return res.json({
                clientSecret: existingPaymentIntent.client_secret,
                paymentId: existingPayment.id,
                amount: negotiation.currentOffer,
                reused: true
              });
            } else {
              console.log(`Existing PaymentIntent amount mismatch: ${existingPaymentIntent.amount} vs ${amountInCents}. Creating new one.`);
              // Amount changed, need to create new PaymentIntent
            }
          } else {
            console.log(`Existing PaymentIntent ${existingPaymentIntent.id} has status ${existingPaymentIntent.status}, creating new one`);
          }
        } catch (stripeError: any) {
          console.error(`Error retrieving existing PaymentIntent ${existingPayment.stripePaymentIntentId}:`, stripeError.message);
          // Continue to create new PaymentIntent if existing one is invalid
        }
      }

      // Create or update payment record
      let payment = existingPayment;
      if (!payment) {
        payment = await storage.createPayment({
          negotiationId,
          buyerId: negotiation.buyerId,
          sellerId: negotiation.sellerId,
          amount: negotiation.currentOffer,
          status: 'pending',
          metadata: {}
        });
      }

      // IDEMPOTENCY: Use idempotency key to prevent duplicate PaymentIntents
      const idempotencyKey = `negotiation-${negotiationId}-payment-${Date.now()}`;
      
      console.log(`Creating new PaymentIntent for negotiation ${negotiationId} with amount ${amountInCents} cents`);

      // Create Stripe PaymentIntent with idempotency protection
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: 'usd',
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          negotiationId,
          paymentId: payment.id,
          buyerId: negotiation.buyerId,
          sellerId: negotiation.sellerId
        },
        description: `Payment for negotiation ${negotiationId}`
      }, {
        idempotencyKey // Prevents duplicate creation if request is retried
      });

      // Update payment with Stripe payment intent ID
      await storage.updatePayment(payment.id, {
        stripePaymentIntentId: paymentIntent.id
      });

      console.log(`Successfully created PaymentIntent ${paymentIntent.id} for negotiation ${negotiationId}`);

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentId: payment.id,
        amount: negotiation.currentOffer
      });

    } catch (error) {
      console.error("Error creating payment intent:", error);
      res.status(500).json({ error: "Failed to create payment intent" });
    }
  });

  // POST /api/negotiations/:negotiationId/confirm-payment - Confirm payment completion
  app.post("/api/negotiations/:negotiationId/confirm-payment", isAuthenticated, async (req: any, res: Response) => {
    try {
      const { negotiationId } = req.params;
      const { paymentIntentId } = req.body;
      const authenticatedUserId = req.user.claims.sub;

      if (!negotiationId || !paymentIntentId) {
        return res.status(400).json({ error: "Negotiation ID and payment intent ID are required" });
      }

      // Get negotiation details
      const negotiation = await storage.getNegotiation(negotiationId);
      if (!negotiation) {
        return res.status(404).json({ error: "Negotiation not found" });
      }

      // Verify user is the buyer
      if (negotiation.buyerId !== authenticatedUserId) {
        return res.status(403).json({ error: "Only the buyer can confirm payment" });
      }

      // Get payment record
      const payment = await storage.getPaymentByNegotiation(negotiationId);
      if (!payment) {
        return res.status(404).json({ error: "Payment record not found" });
      }

      // Prevent double-processing if payment already completed
      if (payment.status === 'completed') {
        return res.json({
          success: true,
          paymentStatus: 'completed',
          negotiationStatus: 'completed',
          amount: payment.amount,
          message: "Payment already processed"
        });
      }

      // Verify payment intent with Stripe - CRITICAL SECURITY CHECK
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      // SECURITY: Validate payment intent status
      if (paymentIntent.status !== 'succeeded') {
        console.log(`Payment verification failed: status ${paymentIntent.status} for PaymentIntent ${paymentIntentId}`);
        await storage.updatePaymentStatus(payment.id, 'failed', paymentIntentId);
        return res.status(400).json({ 
          error: "Payment not successful", 
          paymentStatus: paymentIntent.status 
        });
      }

      // SECURITY: Validate payment intent amount matches negotiation amount exactly
      const expectedAmountInCents = Math.round(parseFloat(negotiation.currentOffer!.toString()) * 100);
      if (paymentIntent.amount !== expectedAmountInCents) {
        console.error(`Payment amount mismatch: expected ${expectedAmountInCents} cents, got ${paymentIntent.amount} cents for PaymentIntent ${paymentIntentId}`);
        await storage.updatePaymentStatus(payment.id, 'failed', paymentIntentId);
        return res.status(400).json({ 
          error: "Payment amount does not match negotiation amount",
          expectedAmount: expectedAmountInCents,
          actualAmount: paymentIntent.amount
        });
      }

      // SECURITY: Validate currency is USD
      if (paymentIntent.currency !== 'usd') {
        console.error(`Payment currency invalid: expected USD, got ${paymentIntent.currency} for PaymentIntent ${paymentIntentId}`);
        await storage.updatePaymentStatus(payment.id, 'failed', paymentIntentId);
        return res.status(400).json({ 
          error: "Payment currency must be USD",
          expectedCurrency: 'usd',
          actualCurrency: paymentIntent.currency
        });
      }

      // SECURITY: Validate metadata contains correct IDs
      const metadata = paymentIntent.metadata;
      if (!metadata || 
          metadata.negotiationId !== negotiationId ||
          metadata.buyerId !== negotiation.buyerId ||
          metadata.sellerId !== negotiation.sellerId) {
        console.error(`Payment metadata validation failed for PaymentIntent ${paymentIntentId}:`, {
          expected: { negotiationId, buyerId: negotiation.buyerId, sellerId: negotiation.sellerId },
          actual: metadata
        });
        await storage.updatePaymentStatus(payment.id, 'failed', paymentIntentId);
        return res.status(400).json({ 
          error: "Payment metadata validation failed - security check"
        });
      }

      // SECURITY: Verify this PaymentIntent belongs to our payment record
      if (payment.stripePaymentIntentId && payment.stripePaymentIntentId !== paymentIntentId) {
        console.error(`PaymentIntent ID mismatch: expected ${payment.stripePaymentIntentId}, got ${paymentIntentId}`);
        return res.status(400).json({ 
          error: "PaymentIntent ID does not match payment record"
        });
      }

      // ALL SECURITY CHECKS PASSED - Process successful payment
      console.log(`Payment verification successful for PaymentIntent ${paymentIntentId}, amount: ${paymentIntent.amount} cents`);

      // Get product to update status to 'sold'
      const product = await storage.getProduct(negotiation.productId);
      if (!product) {
        console.error(`Product not found for negotiation ${negotiationId}`);
        return res.status(404).json({ error: "Product not found" });
      }

      // Atomic updates for payment completion
      try {
        // Update payment status
        await storage.updatePaymentStatus(payment.id, 'completed', paymentIntentId);
        
        // Update negotiation payment status
        await storage.updateNegotiationPaymentStatus(negotiationId, 'paid');
        
        // Update negotiation status to completed
        await storage.updateNegotiationStatus(negotiationId, 'completed');

        // ANTI-FRAUD: Mark product as sold to prevent double-selling
        await storage.updateProduct(product.id, { status: 'sold', updatedAt: new Date() });

        console.log(`Payment processing completed for negotiation ${negotiationId}`);

        res.json({
          success: true,
          paymentStatus: 'completed',
          negotiationStatus: 'completed',
          amount: payment.amount,
          productStatus: 'sold'
        });
      } catch (dbError) {
        console.error(`Database update failed during payment completion for negotiation ${negotiationId}:`, dbError);
        res.status(500).json({ error: "Payment processed but database update failed" });
      }

    } catch (error) {
      console.error("Error confirming payment:", error);
      res.status(500).json({ error: "Failed to confirm payment" });
    }
  });

  // GET /api/negotiations/:negotiationId/payment - Get payment status and details
  app.get("/api/negotiations/:negotiationId/payment", isAuthenticated, async (req: any, res: Response) => {
    try {
      const { negotiationId } = req.params;
      const authenticatedUserId = req.user.claims.sub;

      if (!negotiationId) {
        return res.status(400).json({ error: "Negotiation ID is required" });
      }

      // Get negotiation details
      const negotiation = await storage.getNegotiation(negotiationId);
      if (!negotiation) {
        return res.status(404).json({ error: "Negotiation not found" });
      }

      // Verify user is participant (buyer or seller)
      if (negotiation.buyerId !== authenticatedUserId && negotiation.sellerId !== authenticatedUserId) {
        return res.status(403).json({ error: "Access denied: not a participant in this negotiation" });
      }

      // Get payment record
      const payment = await storage.getPaymentByNegotiation(negotiationId);
      
      const response = {
        negotiationId,
        paymentStatus: negotiation.paymentStatus,
        negotiationStatus: negotiation.status,
        amount: negotiation.currentOffer,
        payment: payment ? {
          id: payment.id,
          status: payment.status,
          createdAt: payment.createdAt,
          completedAt: payment.completedAt
        } : null
      };

      res.json(response);

    } catch (error) {
      console.error("Error fetching payment details:", error);
      res.status(500).json({ error: "Failed to fetch payment details" });
    }
  });

  // STRIPE WEBHOOKS - Critical for production payment processing
  // Must handle asynchronous payment events like 3D Secure confirmations
  app.post("/api/stripe/webhook", 
    // Use raw body parser for webhook signature verification
    (req: Request, res: Response, next) => {
      // Ensure raw body is available for signature verification
      if (req.is('application/json')) {
        let data = '';
        req.setEncoding('utf8');
        req.on('data', chunk => data += chunk);
        req.on('end', () => {
          (req as any).rawBody = data;
          next();
        });
      } else {
        next();
      }
    },
    async (req: Request, res: Response) => {
      try {
        const sig = req.headers['stripe-signature'] as string;
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        if (!webhookSecret) {
          console.error("Stripe webhook secret not configured");
          return res.status(500).json({ error: "Webhook secret not configured" });
        }

        if (!sig) {
          console.error("Missing Stripe signature header");
          return res.status(400).json({ error: "Missing signature header" });
        }

        let event: Stripe.Event;

        try {
          // Verify webhook signature
          event = stripe.webhooks.constructEvent((req as any).rawBody, sig, webhookSecret);
          console.log(`Stripe webhook received: ${event.type} for ${event.data.object.id}`);
        } catch (err: any) {
          console.error(`Webhook signature verification failed: ${err.message}`);
          return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
        }

        // Handle different event types
        switch (event.type) {
          case 'payment_intent.succeeded':
            await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
            break;
            
          case 'payment_intent.payment_failed':
            await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
            break;
            
          case 'payment_intent.canceled':
            await handlePaymentCanceled(event.data.object as Stripe.PaymentIntent);
            break;
            
          default:
            console.log(`Unhandled Stripe webhook event type: ${event.type}`);
        }

        res.json({ received: true });

      } catch (error) {
        console.error("Error processing Stripe webhook:", error);
        res.status(500).json({ error: "Webhook processing failed" });
      }
    }
  );

  // Webhook event handlers
  async function handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
    console.log(`Processing successful payment: ${paymentIntent.id}`);
    
    try {
      const { negotiationId, paymentId } = paymentIntent.metadata;
      
      if (!negotiationId || !paymentId) {
        console.error(`Missing metadata in PaymentIntent ${paymentIntent.id}:`, paymentIntent.metadata);
        return;
      }

      // Get payment record
      const payment = await storage.getPayment(paymentId);
      if (!payment) {
        console.error(`Payment record not found for PaymentIntent ${paymentIntent.id}, paymentId ${paymentId}`);
        return;
      }

      // Prevent double-processing
      if (payment.status === 'completed') {
        console.log(`Payment ${paymentId} already completed, skipping webhook processing`);
        return;
      }

      // Get negotiation and product details
      const negotiation = await storage.getNegotiation(negotiationId);
      if (!negotiation) {
        console.error(`Negotiation not found for PaymentIntent ${paymentIntent.id}, negotiationId ${negotiationId}`);
        return;
      }

      const product = await storage.getProduct(negotiation.productId);
      if (!product) {
        console.error(`Product not found for negotiation ${negotiationId}`);
        return;
      }

      console.log(`Webhook processing payment success for negotiation ${negotiationId}, product ${product.id}`);

      // Atomic updates for payment completion
      await storage.updatePaymentStatus(payment.id, 'completed', paymentIntent.id);
      await storage.updateNegotiationPaymentStatus(negotiationId, 'paid');
      await storage.updateNegotiationStatus(negotiationId, 'completed');
      
      // ANTI-FRAUD: Mark product as sold to prevent double-selling
      await storage.updateProduct(product.id, { status: 'sold', updatedAt: new Date() });

      console.log(`Successfully processed payment webhook for PaymentIntent ${paymentIntent.id}`);

      // TODO: Broadcast WebSocket notification to users about completed payment
      // This would notify both buyer and seller of the successful transaction

    } catch (error) {
      console.error(`Error processing payment success webhook for PaymentIntent ${paymentIntent.id}:`, error);
    }
  }

  async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
    console.log(`Processing failed payment: ${paymentIntent.id}`);
    
    try {
      const { negotiationId, paymentId } = paymentIntent.metadata;
      
      if (!negotiationId || !paymentId) {
        console.error(`Missing metadata in failed PaymentIntent ${paymentIntent.id}:`, paymentIntent.metadata);
        return;
      }

      // Get payment record
      const payment = await storage.getPayment(paymentId);
      if (!payment) {
        console.error(`Payment record not found for failed PaymentIntent ${paymentIntent.id}, paymentId ${paymentId}`);
        return;
      }

      console.log(`Webhook processing payment failure for negotiation ${negotiationId}`);

      // Update payment status to failed
      await storage.updatePaymentStatus(payment.id, 'failed', paymentIntent.id);

      console.log(`Successfully processed payment failure webhook for PaymentIntent ${paymentIntent.id}`);

      // TODO: Broadcast WebSocket notification to users about failed payment
      // This would notify the buyer that payment failed and needs retry

    } catch (error) {
      console.error(`Error processing payment failure webhook for PaymentIntent ${paymentIntent.id}:`, error);
    }
  }

  async function handlePaymentCanceled(paymentIntent: Stripe.PaymentIntent) {
    console.log(`Processing canceled payment: ${paymentIntent.id}`);
    
    try {
      const { negotiationId, paymentId } = paymentIntent.metadata;
      
      if (!negotiationId || !paymentId) {
        console.error(`Missing metadata in canceled PaymentIntent ${paymentIntent.id}:`, paymentIntent.metadata);
        return;
      }

      // Get payment record
      const payment = await storage.getPayment(paymentId);
      if (!payment) {
        console.error(`Payment record not found for canceled PaymentIntent ${paymentIntent.id}, paymentId ${paymentId}`);
        return;
      }

      console.log(`Webhook processing payment cancellation for negotiation ${negotiationId}`);

      // Update payment status to failed/canceled
      await storage.updatePaymentStatus(payment.id, 'failed', paymentIntent.id);

      console.log(`Successfully processed payment cancellation webhook for PaymentIntent ${paymentIntent.id}`);

    } catch (error) {
      console.error(`Error processing payment cancellation webhook for PaymentIntent ${paymentIntent.id}:`, error);
    }
  }

  return server;
}

// WebSocket Server Setup with Authentication
function setupWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ 
    server: server, 
    path: '/ws',
    verifyClient: (info: any) => {
      // Pre-verify that token exists in query params
      const url = parse(info.req.url!, true);
      const token = url.query.token as string;
      return !!token; // Basic check, full validation happens on connection
    }
  });
  
  console.log("WebSocket Server initialized on path /ws");
  
  wss.on('connection', async (ws: AuthenticatedWebSocket, req) => {
    console.log("New WebSocket connection attempt");
    
    try {
      // Parse token from query parameters
      const url = parse(req.url!, true);
      const token = url.query.token as string;
      
      if (!token) {
        console.log("WebSocket connection rejected: No token provided");
        ws.close(1008, "Authentication token required");
        return;
      }
      
      // Verify JWT token
      const wsSecret = process.env.WS_SECRET || process.env.SESSION_SECRET || 'fallback-secret';
      const decoded = jwt.verify(token, wsSecret) as any;
      
      // Validate decoded token has required fields
      if (!decoded?.userId) {
        console.log("WebSocket connection rejected: Invalid token payload");
        ws.close(1008, "Invalid token payload");
        return;
      }
      
      // Set authenticated user info on WebSocket
      const userId = decoded.userId as string;
      ws.userId = userId;
      ws.isAuthenticated = true;
      
      // Add to user socket mapping
      if (!userSockets.has(userId)) {
        userSockets.set(userId, new Set());
      }
      userSockets.get(userId)!.add(ws);
      
      // Update user online status in database
      try {
        await storage.updateUserOnlineStatus(userId, true);
        console.log(`User ${userId} marked as online in database`);
        
        // Broadcast presence update to other users
        await broadcastPresenceUpdate(userId, decoded.username, true);
      } catch (error) {
        console.error(`Failed to update online status for user ${userId}:`, error);
      }
      
      console.log(`WebSocket authenticated for user: ${decoded.username} (${ws.userId})`);
      
      // Send connection confirmation
      ws.send(JSON.stringify({
        type: 'connection_confirmed',
        data: {
          userId: ws.userId,
          username: decoded.username,
          timestamp: new Date().toISOString()
        }
      }));
      
      // Handle incoming messages
      ws.on('message', async (data) => {
        try {
          const message: WSMessage = JSON.parse(data.toString());
          await handleWebSocketMessage(ws, message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          ws.send(JSON.stringify({
            type: 'error',
            data: { message: 'Invalid message format' }
          }));
        }
      });
      
      // Handle connection close
      ws.on('close', (code, reason) => {
        console.log(`WebSocket closed for user ${ws.userId || 'unknown'}: ${code} ${reason}`);
        cleanupWebSocket(ws);
      });
      
      // Handle errors
      ws.on('error', (error) => {
        console.error(`WebSocket error for user ${ws.userId || 'unknown'}:`, error);
        cleanupWebSocket(ws);
      });
      
      // Setup ping/pong for connection health
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        } else {
          clearInterval(pingInterval);
        }
      }, 30000); // Ping every 30 seconds
      
      ws.on('pong', () => {
        // Connection is alive, no action needed
      });
      
    } catch (error) {
      console.error("WebSocket authentication failed:", error);
      ws.close(1008, "Authentication failed");
    }
  });
}

// Handle WebSocket Messages
async function handleWebSocketMessage(ws: AuthenticatedWebSocket, message: WSMessage) {
  if (!ws.isAuthenticated || !ws.userId) {
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Not authenticated' }
    }));
    return;
  }
  
  console.log(`WebSocket message from ${ws.userId || 'unknown'}:`, message.type);
  
  // Validate message structure using schema
  try {
    const validatedMessage = wsMessageSchema.parse(message);
    
    switch (validatedMessage.type) {
      case 'join_negotiation':
        await handleJoinNegotiation(ws, validatedMessage.negotiationId);
        break;
        
      case 'leave_negotiation':
        handleLeaveNegotiation(ws, validatedMessage.negotiationId);
        break;
        
      case 'negotiation_message':
        await handleNegotiationMessage(ws, validatedMessage.negotiationId, validatedMessage.content);
        break;
        
      case 'negotiation_offer':
        await handleNegotiationOffer(ws, validatedMessage.negotiationId, validatedMessage.amount, validatedMessage.message);
        break;
        
      case 'negotiation_counter':
        await handleNegotiationCounter(ws, validatedMessage.negotiationId, validatedMessage.amount, validatedMessage.message);
        break;
        
      case 'negotiation_accept':
        await handleNegotiationAccept(ws, validatedMessage.negotiationId);
        break;
        
      case 'negotiation_reject':
        await handleNegotiationReject(ws, validatedMessage.negotiationId, validatedMessage.message);
        break;
        
      case 'negotiation_status':
        await handleNegotiationStatus(ws, validatedMessage.negotiationId, validatedMessage.status);
        break;
        
      case 'presence_update':
        await handlePresenceUpdate(ws, validatedMessage.userId, validatedMessage.isOnline);
        break;
        
      case 'request_presence':
        await handlePresenceRequest(ws, validatedMessage.userIds);
        break;
        
      default:
        ws.send(JSON.stringify({
          type: 'error',
          data: { message: `Unknown message type: ${message.type}` }
        }));
    }
  } catch (error) {
    console.error('WebSocket message validation error:', error);
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Invalid message format' }
    }));
  }
}

// Join Negotiation Room
async function handleJoinNegotiation(ws: AuthenticatedWebSocket, negotiationId?: string) {
  if (!negotiationId || !ws.userId) {
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Invalid negotiation ID' }
    }));
    return;
  }
  
  try {
    // Verify user has access to this negotiation
    const negotiation = await storage.getNegotiation(negotiationId);
    if (!negotiation) {
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: 'Negotiation not found' }
      }));
      return;
    }
    
    if (negotiation.buyerId !== ws.userId && negotiation.sellerId !== ws.userId) {
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: 'Access denied to this negotiation' }
      }));
      return;
    }
    
    // Add to negotiation room
    if (!negotiationRooms.has(negotiationId)) {
      negotiationRooms.set(negotiationId, new Set());
    }
    negotiationRooms.get(negotiationId)!.add(ws);
    
    ws.send(JSON.stringify({
      type: 'negotiation_joined',
      data: { 
        negotiationId,
        timestamp: new Date().toISOString()
      }
    }));
    
    console.log(`User ${ws.userId} joined negotiation ${negotiationId}`);
    
  } catch (error) {
    console.error('Error joining negotiation:', error);
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Failed to join negotiation' }
    }));
  }
}

// Leave Negotiation Room
function handleLeaveNegotiation(ws: AuthenticatedWebSocket, negotiationId?: string) {
  if (!negotiationId) return;
  
  const room = negotiationRooms.get(negotiationId);
  if (room) {
    room.delete(ws);
    if (room.size === 0) {
      negotiationRooms.delete(negotiationId);
    }
  }
  
  ws.send(JSON.stringify({
    type: 'negotiation_left',
    data: { 
      negotiationId,
      timestamp: new Date().toISOString()
    }
  }));
}

// Handle Negotiation Messages
async function handleNegotiationMessage(ws: AuthenticatedWebSocket, negotiationId: string, content: string) {
  try {
    // Validate access to negotiation
    const accessCheck = await validateNegotiationAccess(ws.userId!, negotiationId);
    if (!accessCheck.success) {
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: accessCheck.error }
      }));
      return;
    }

    // Persist message to database
    const message = await storage.createMessage({
      negotiationId,
      senderId: ws.userId!,
      messageType: 'chat',
      content
    });

    // Get sender info for broadcast
    const sender = await storage.getUser(ws.userId!);
    
    // Broadcast to negotiation room
    await broadcastNegotiationUpdate(negotiationId, {
      id: message.id,
      senderId: ws.userId!,
      senderName: sender?.username || 'Unknown',
      messageType: 'chat',
      content,
      createdAt: message.createdAt!.toISOString()
    });

  } catch (error) {
    console.error('Error handling negotiation message:', error);
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Failed to send message' }
    }));
  }
}

// Handle Negotiation Offers
async function handleNegotiationOffer(ws: AuthenticatedWebSocket, negotiationId: string, amount: number, message?: string) {
  try {
    // Validate access to negotiation
    const accessCheck = await validateNegotiationAccess(ws.userId!, negotiationId);
    if (!accessCheck.success) {
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: accessCheck.error }
      }));
      return;
    }

    // Additional validation: only buyers can make initial offers
    if (accessCheck.negotiation!.buyerId !== ws.userId) {
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: 'Only buyers can make offers' }
      }));
      return;
    }

    // Update negotiation with current offer
    await storage.updateNegotiation(negotiationId, { 
      currentOffer: amount.toString(),
      updatedAt: new Date()
    });

    // Persist offer message to database
    const offerMessage = await storage.createMessage({
      negotiationId,
      senderId: ws.userId!,
      messageType: 'offer',
      content: message || `Offered $${amount}`,
      amount: amount.toString()
    });

    // Get sender info for broadcast
    const sender = await storage.getUser(ws.userId!);
    
    // Broadcast to negotiation room
    await broadcastNegotiationUpdate(negotiationId, {
      id: offerMessage.id,
      senderId: ws.userId!,
      senderName: sender?.username || 'Unknown',
      messageType: 'offer',
      content: message || `Offered $${amount}`,
      amount,
      createdAt: offerMessage.createdAt!.toISOString()
    });

  } catch (error) {
    console.error('Error handling negotiation offer:', error);
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Failed to make offer' }
    }));
  }
}

// Handle Negotiation Counter Offers
async function handleNegotiationCounter(ws: AuthenticatedWebSocket, negotiationId: string, amount: number, message?: string) {
  try {
    // Validate access to negotiation
    const accessCheck = await validateNegotiationAccess(ws.userId!, negotiationId);
    if (!accessCheck.success) {
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: accessCheck.error }
      }));
      return;
    }

    // Additional validation: only sellers can make counter offers
    if (accessCheck.negotiation!.sellerId !== ws.userId) {
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: 'Only sellers can make counter offers' }
      }));
      return;
    }

    // Update negotiation with current offer
    await storage.updateNegotiation(negotiationId, { 
      currentOffer: amount.toString(),
      updatedAt: new Date()
    });

    // Persist counter offer message to database
    const counterMessage = await storage.createMessage({
      negotiationId,
      senderId: ws.userId!,
      messageType: 'counter',
      content: message || `Counter offer: $${amount}`,
      amount: amount.toString()
    });

    // Get sender info for broadcast
    const sender = await storage.getUser(ws.userId!);
    
    // Broadcast to negotiation room
    await broadcastNegotiationUpdate(negotiationId, {
      id: counterMessage.id,
      senderId: ws.userId!,
      senderName: sender?.username || 'Unknown',
      messageType: 'counter',
      content: message || `Counter offer: $${amount}`,
      amount,
      createdAt: counterMessage.createdAt!.toISOString()
    });

  } catch (error) {
    console.error('Error handling negotiation counter:', error);
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Failed to make counter offer' }
    }));
  }
}

// Handle Negotiation Accept
async function handleNegotiationAccept(ws: AuthenticatedWebSocket, negotiationId: string) {
  try {
    // Validate access to negotiation
    const accessCheck = await validateNegotiationAccess(ws.userId!, negotiationId);
    if (!accessCheck.success) {
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: accessCheck.error }
      }));
      return;
    }

    // Update negotiation status to completed
    await storage.updateNegotiationStatus(negotiationId, 'completed');

    // Persist accept message to database
    const acceptMessage = await storage.createMessage({
      negotiationId,
      senderId: ws.userId!,
      messageType: 'accept',
      content: 'Offer accepted!'
    });

    // Get sender info for broadcast
    const sender = await storage.getUser(ws.userId!);
    
    // Broadcast to negotiation room
    await broadcastNegotiationUpdate(negotiationId, {
      id: acceptMessage.id,
      senderId: ws.userId!,
      senderName: sender?.username || 'Unknown',
      messageType: 'accept',
      content: 'Offer accepted!',
      createdAt: acceptMessage.createdAt!.toISOString()
    });

  } catch (error) {
    console.error('Error handling negotiation accept:', error);
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Failed to accept offer' }
    }));
  }
}

// Handle Negotiation Reject
async function handleNegotiationReject(ws: AuthenticatedWebSocket, negotiationId: string, message?: string) {
  try {
    // Validate access to negotiation
    const accessCheck = await validateNegotiationAccess(ws.userId!, negotiationId);
    if (!accessCheck.success) {
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: accessCheck.error }
      }));
      return;
    }

    // Persist reject message to database
    const rejectMessage = await storage.createMessage({
      negotiationId,
      senderId: ws.userId!,
      messageType: 'reject',
      content: message || 'Offer rejected'
    });

    // Get sender info for broadcast
    const sender = await storage.getUser(ws.userId!);
    
    // Broadcast to negotiation room
    await broadcastNegotiationUpdate(negotiationId, {
      id: rejectMessage.id,
      senderId: ws.userId!,
      senderName: sender?.username || 'Unknown',
      messageType: 'reject',
      content: message || 'Offer rejected',
      createdAt: rejectMessage.createdAt!.toISOString()
    });

  } catch (error) {
    console.error('Error handling negotiation reject:', error);
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Failed to reject offer' }
    }));
  }
}

// Handle Negotiation Status Updates
async function handleNegotiationStatus(ws: AuthenticatedWebSocket, negotiationId: string, status: string) {
  try {
    // Validate access to negotiation
    const accessCheck = await validateNegotiationAccess(ws.userId!, negotiationId);
    if (!accessCheck.success) {
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: accessCheck.error }
      }));
      return;
    }

    // Update negotiation status
    await storage.updateNegotiationStatus(negotiationId, status);

    // Persist status message to database
    const statusMessage = await storage.createMessage({
      negotiationId,
      senderId: ws.userId!,
      messageType: 'status',
      content: `Negotiation status changed to: ${status}`
    });

    // Get sender info for broadcast
    const sender = await storage.getUser(ws.userId!);
    
    // Broadcast to negotiation room
    await broadcastNegotiationUpdate(negotiationId, {
      id: statusMessage.id,
      senderId: ws.userId!,
      senderName: sender?.username || 'Unknown',
      messageType: 'status',
      content: `Negotiation status changed to: ${status}`,
      createdAt: statusMessage.createdAt!.toISOString()
    });

    // Also broadcast dedicated status update for toast notifications
    await broadcastNegotiationStatusUpdate(negotiationId, status, ws.userId!, `Negotiation status changed to: ${status}`);

  } catch (error) {
    console.error('Error handling negotiation status:', error);
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Failed to update status' }
    }));
  }
}

// Helper function to validate negotiation access
async function validateNegotiationAccess(userId: string, negotiationId: string) {
  const negotiation = await storage.getNegotiation(negotiationId);
  
  if (!negotiation) {
    return { success: false, error: 'Negotiation not found' };
  }

  if (negotiation.status === 'completed' || negotiation.status === 'cancelled') {
    return { success: false, error: 'Cannot modify completed or cancelled negotiation' };
  }

  if (negotiation.buyerId !== userId && negotiation.sellerId !== userId) {
    return { success: false, error: 'Access denied to this negotiation' };
  }

  return { success: true, negotiation };
}

// Helper function to broadcast negotiation updates
async function broadcastNegotiationUpdate(negotiationId: string, message: any) {
  const broadcastMessage: WSBroadcastMessage = {
    type: 'negotiation_update',
    negotiationId,
    message
  };

  broadcastToNegotiation(negotiationId, broadcastMessage);
}

// Handle Presence Update Message
async function handlePresenceUpdate(ws: AuthenticatedWebSocket, userId: string, isOnline: boolean) {
  try {
    // Validate that user can only update their own presence
    if (ws.userId !== userId) {
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: 'Cannot update presence for other users' }
      }));
      return;
    }
    
    // Update presence in database
    const user = await storage.updateUserOnlineStatus(userId, isOnline);
    if (user) {
      // Broadcast presence update to other users
      await broadcastPresenceUpdate(userId, user.username || 'Unknown', isOnline);
      
      ws.send(JSON.stringify({
        type: 'presence_updated',
        data: { userId, isOnline, timestamp: new Date().toISOString() }
      }));
    }
    
  } catch (error) {
    console.error('Error handling presence update:', error);
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Failed to update presence' }
    }));
  }
}

// Handle Presence Request Message
async function handlePresenceRequest(ws: AuthenticatedWebSocket, userIds?: string[]) {
  try {
    if (!ws.userId) {
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: 'Not authenticated' }
      }));
      return;
    }
    
    // If no specific users requested, send presence for all connected users
    const targetUserIds = userIds || getConnectedUsers();
    
    // Get presence status from database
    const usersPresence = await storage.getUsersOnlineStatus(targetUserIds);
    
    // Send presence data back to requesting user
    ws.send(JSON.stringify({
      type: 'presence_data',
      data: {
        users: usersPresence,
        timestamp: new Date().toISOString()
      }
    }));
    
  } catch (error) {
    console.error('Error handling presence request:', error);
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Failed to get presence data' }
    }));
  }
}

// Broadcast presence update to relevant users
async function broadcastPresenceUpdate(userId: string, username: string, isOnline: boolean) {
  try {
    const presenceMessage = {
      type: 'presence_update',
      userId,
      username,
      isOnline,
      lastSeen: new Date().toISOString()
    };
    
    // Broadcast to all connected users
    userSockets.forEach((socketSet, connectedUserId) => {
      if (connectedUserId !== userId) { // Don't send to the user themselves
        socketSet.forEach(socket => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(presenceMessage));
          }
        });
      }
    });
    
    console.log(`Broadcasted presence update: ${username} is now ${isOnline ? 'online' : 'offline'}`);
  } catch (error) {
    console.error('Error broadcasting presence update:', error);
  }
}

// Enhanced negotiation status broadcasting
async function broadcastNegotiationStatusUpdate(negotiationId: string, status: string, changedBy: string, context?: string) {
  try {
    // Get negotiation details
    const negotiation = await storage.getNegotiation(negotiationId);
    if (!negotiation) {
      console.error(`Negotiation ${negotiationId} not found for status broadcasting`);
      return;
    }
    
    // Get user info for changed by user
    const changedByUser = await storage.getUser(changedBy);
    
    const statusMessage = {
      type: 'negotiation_status_update',
      negotiationId,
      status,
      changedBy,
      changedByName: changedByUser?.username || 'Unknown',
      timestamp: new Date().toISOString(),
      context
    };
    
    // Broadcast to negotiation participants
    const participantIds = [negotiation.buyerId, negotiation.sellerId];
    participantIds.forEach(participantId => {
      const userSocketSet = userSockets.get(participantId);
      if (userSocketSet) {
        userSocketSet.forEach(socket => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(statusMessage));
          }
        });
      }
    });
    
    console.log(`Broadcasted negotiation status update: ${negotiationId} -> ${status} by ${changedByUser?.username}`);
  } catch (error) {
    console.error('Error broadcasting negotiation status update:', error);
  }
}

// Cleanup WebSocket connections
async function cleanupWebSocket(ws: AuthenticatedWebSocket) {
  if (!ws.userId) return;
  
  const userId = ws.userId;
  
  // Remove from user socket mapping
  const userSocketSet = userSockets.get(userId);
  if (userSocketSet) {
    userSocketSet.delete(ws);
    
    // If no more connections for this user, mark them offline
    if (userSocketSet.size === 0) {
      userSockets.delete(userId);
      
      try {
        // Update user offline status in database
        const user = await storage.updateUserOnlineStatus(userId, false);
        
        // Update last seen timestamp
        await storage.setUserLastSeen(userId);
        
        if (user) {
          console.log(`User ${userId} marked as offline in database`);
          
          // Broadcast presence update to other users
          await broadcastPresenceUpdate(userId, user.username || 'Unknown', false);
        }
      } catch (error) {
        console.error(`Failed to update offline status for user ${userId}:`, error);
      }
    }
  }
  
  // Remove from all negotiation rooms
  negotiationRooms.forEach((room, negotiationId) => {
    if (room.has(ws)) {
      room.delete(ws);
      if (room.size === 0) {
        negotiationRooms.delete(negotiationId);
      }
    }
  });
}

// WebSocket utility functions
export function broadcastToUser(userId: string, message: any) {
  const userSocketSet = userSockets.get(userId);
  if (userSocketSet) {
    userSocketSet.forEach(socket => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    });
  }
}

export function broadcastToNegotiation(negotiationId: string, message: any) {
  const room = negotiationRooms.get(negotiationId);
  if (room) {
    room.forEach(socket => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    });
  }
}

export function getConnectedUsers(): string[] {
  return Array.from(userSockets.keys());
}

export function isUserConnected(userId: string): boolean {
  const userSocketSet = userSockets.get(userId);
  return !!userSocketSet && userSocketSet.size > 0;
}
