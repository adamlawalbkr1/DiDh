import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import rateLimit from "express-rate-limit";
import slowDown from "express-slow-down";
import helmet from "helmet";
import { body, query, param, ValidationChain } from "express-validator";
import { Request, Response, NextFunction } from "express";
import { z } from "zod";

// Setup DOMPurify with JSDOM for server-side usage
const window = new JSDOM('').window;
const purify = DOMPurify(window);

// Enhanced security configuration
export const securityConfig = {
  // Rate limiting configurations
  rateLimits: {
    // General API rate limit
    general: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000, // Limit each IP to 1000 requests per windowMs
      message: "Too many requests from this IP, please try again later.",
      standardHeaders: true,
      legacyHeaders: false,
    },
    // Authentication endpoints (stricter)
    auth: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 10, // Limit each IP to 10 auth requests per windowMs
      message: "Too many authentication attempts, please try again later.",
      standardHeaders: true,
      legacyHeaders: false,
    },
    // Product creation (prevent spam)
    productCreation: {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 50, // Limit each IP to 50 product creations per hour
      message: "Too many products created, please wait before creating more.",
      standardHeaders: true,
      legacyHeaders: false,
    },
    // Negotiation creation
    negotiationCreation: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 20, // Limit each IP to 20 negotiations per 15 minutes
      message: "Too many negotiations started, please wait before starting more.",
      standardHeaders: true,
      legacyHeaders: false,
    },
    // Payment endpoints (very strict)
    payment: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // Limit each IP to 5 payment attempts per 15 minutes
      message: "Too many payment attempts, please try again later.",
      standardHeaders: true,
      legacyHeaders: false,
    }
  },
  
  // Content moderation
  contentModeration: {
    // Prohibited words/phrases for product titles and descriptions
    prohibitedWords: [
      'drugs', 'weapon', 'gun', 'knife', 'explosive', 'bomb',
      'stolen', 'counterfeit', 'fake', 'replica', 'illegal',
      'prescription', 'medicine', 'pills', 'alcohol', 'tobacco',
      'gambling', 'casino', 'lottery', 'ponzi', 'pyramid',
      'adult', 'explicit', 'sexual', 'pornographic',
      'human', 'organ', 'body', 'blood', 'tissue'
    ],
    
    // Suspicious patterns
    suspiciousPatterns: [
      /\b(100%|guaranteed)\s+(profit|money|income)\b/i,
      /\b(get\s+rich\s+quick|easy\s+money|no\s+work)\b/i,
      /\b(wire\s+transfer|western\s+union|money\s+gram)\b/i,
      /\b(urgent|emergency|asap|immediately)\b.*\b(money|payment|transfer)\b/i,
      /\b(prince|inheritance|lottery|winner|million\s+dollars)\b/i
    ],
    
    // Price reasonableness checks
    priceThresholds: {
      maxPrice: 1000000, // $1M max
      minPrice: 0.01,    // $0.01 min
      suspiciouslyLow: 0.99, // Flag items under $1
      suspiciouslyHigh: 50000 // Flag items over $50k
    }
  }
};

// HTML/XSS Sanitization
export const sanitizeHtml = (input: string): string => {
  if (!input || typeof input !== 'string') return '';
  
  // Configure DOMPurify to be more restrictive for marketplace content
  return purify.sanitize(input, {
    ALLOWED_TAGS: [], // No HTML tags allowed in marketplace content
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true, // Keep text content, remove tags
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    SANITIZE_DOM: true,
    WHOLE_DOCUMENT: false
  }).trim();
};

// Input sanitization for different content types
export const sanitizeInput = {
  // For product titles, descriptions, and user content
  text: (input: string): string => {
    if (!input || typeof input !== 'string') return '';
    return sanitizeHtml(input)
      .replace(/\s+/g, ' ') // Normalize whitespace
      .substring(0, 1000) // Limit length
      .trim();
  },
  
  // For location strings
  location: (input: string): string => {
    if (!input || typeof input !== 'string') return '';
    return sanitizeHtml(input)
      .replace(/[^a-zA-Z0-9\s,.-]/g, '') // Only allow safe location characters
      .substring(0, 200)
      .trim();
  },
  
  // For usernames and names
  name: (input: string): string => {
    if (!input || typeof input !== 'string') return '';
    return sanitizeHtml(input)
      .replace(/[^a-zA-Z0-9\s_.-]/g, '') // Only alphanumeric, spaces, and safe chars
      .substring(0, 50)
      .trim();
  },
  
  // For email addresses
  email: (input: string): string => {
    if (!input || typeof input !== 'string') return '';
    return input.toLowerCase().trim().substring(0, 254);
  }
};

// Content moderation functions
export const moderateContent = {
  // Check for prohibited words
  checkProhibitedWords: (text: string): { isViolation: boolean; matches: string[] } => {
    if (!text) return { isViolation: false, matches: [] };
    
    const lowerText = text.toLowerCase();
    const matches = securityConfig.contentModeration.prohibitedWords.filter(word => 
      lowerText.includes(word.toLowerCase())
    );
    
    return {
      isViolation: matches.length > 0,
      matches
    };
  },
  
  // Check for suspicious patterns
  checkSuspiciousPatterns: (text: string): { isViolation: boolean; matches: string[] } => {
    if (!text) return { isViolation: false, matches: [] };
    
    const matches: string[] = [];
    securityConfig.contentModeration.suspiciousPatterns.forEach(pattern => {
      if (pattern.test(text)) {
        matches.push(pattern.source);
      }
    });
    
    return {
      isViolation: matches.length > 0,
      matches
    };
  },
  
  // Check price reasonableness
  checkPriceReasonableness: (price: number): { isValid: boolean; warnings: string[] } => {
    const warnings: string[] = [];
    const { maxPrice, minPrice, suspiciouslyLow, suspiciouslyHigh } = 
      securityConfig.contentModeration.priceThresholds;
    
    if (price < minPrice || price > maxPrice) {
      return { isValid: false, warnings: ['Price outside acceptable range'] };
    }
    
    if (price < suspiciouslyLow) {
      warnings.push('Price is suspiciously low');
    }
    
    if (price > suspiciouslyHigh) {
      warnings.push('Price is suspiciously high - may require verification');
    }
    
    return { isValid: true, warnings };
  }
};

// Rate limiting middleware factories
export const createRateLimit = (config: any) => rateLimit(config);
export const createSlowDown = (config: any) => slowDown(config);

// Security middleware
export const securityMiddleware = {
  // Helmet for basic security headers (development-friendly)
  helmet: helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        // Allow development scripts and inline scripts for Vite
        scriptSrc: process.env.NODE_ENV === 'development' 
          ? ["'self'", "'unsafe-inline'", "'unsafe-eval'"] 
          : ["'self'"],
        // Allow WebSocket connections for Vite HMR
        connectSrc: ["'self'", "wss:", "ws:", "https:", ...(process.env.NODE_ENV === 'development' ? ["*"] : [])]
      }
    },
    crossOriginEmbedderPolicy: false
  }),
  
  // General API rate limiting
  generalRateLimit: createRateLimit(securityConfig.rateLimits.general),
  
  // Auth rate limiting
  authRateLimit: createRateLimit(securityConfig.rateLimits.auth),
  
  // Product creation rate limiting
  productCreationRateLimit: createRateLimit(securityConfig.rateLimits.productCreation),
  
  // Negotiation creation rate limiting
  negotiationCreationRateLimit: createRateLimit(securityConfig.rateLimits.negotiationCreation),
  
  // Payment rate limiting
  paymentRateLimit: createRateLimit(securityConfig.rateLimits.payment),
  
  // Slow down middleware for repeated requests
  slowDown: createSlowDown({
    windowMs: 15 * 60 * 1000, // 15 minutes
    delayAfter: 100, // Allow 100 requests per windowMs without delay
    delayMs: () => 500, // Add 500ms delay per request after delayAfter
    validate: { delayMs: false } // Disable the warning
  })
};

// Enhanced validation schemas
export const enhancedValidation = {
  // Product validation with content moderation
  validateProductContent: (req: Request, res: Response, next: NextFunction) => {
    const { title, description } = req.body;
    
    if (title) {
      const titleCheck = moderateContent.checkProhibitedWords(title);
      const titlePatternCheck = moderateContent.checkSuspiciousPatterns(title);
      
      if (titleCheck.isViolation || titlePatternCheck.isViolation) {
        return res.status(400).json({
          error: "Product title contains prohibited content",
          details: [...titleCheck.matches, ...titlePatternCheck.matches]
        });
      }
    }
    
    if (description) {
      const descCheck = moderateContent.checkProhibitedWords(description);
      const descPatternCheck = moderateContent.checkSuspiciousPatterns(description);
      
      if (descCheck.isViolation || descPatternCheck.isViolation) {
        return res.status(400).json({
          error: "Product description contains prohibited content",
          details: [...descCheck.matches, ...descPatternCheck.matches]
        });
      }
    }
    
    next();
  },
  
  // Price validation
  validatePrice: (req: Request, res: Response, next: NextFunction) => {
    const { price } = req.body;
    
    if (price !== undefined) {
      const priceNumber = typeof price === 'string' ? parseFloat(price) : price;
      const priceCheck = moderateContent.checkPriceReasonableness(priceNumber);
      
      if (!priceCheck.isValid) {
        return res.status(400).json({
          error: "Invalid price",
          details: priceCheck.warnings
        });
      }
      
      // Log warnings for suspicious prices
      if (priceCheck.warnings.length > 0) {
        console.warn(`Suspicious price detected: ${priceNumber}`, {
          warnings: priceCheck.warnings,
          userId: (req as any).user?.claims?.sub,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    next();
  }
};

// Input sanitization middleware
export const sanitizationMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Sanitize common text fields in request body
  if (req.body) {
    if (req.body.title) {
      req.body.title = sanitizeInput.text(req.body.title);
    }
    if (req.body.description) {
      req.body.description = sanitizeInput.text(req.body.description);
    }
    if (req.body.location) {
      req.body.location = sanitizeInput.location(req.body.location);
    }
    if (req.body.username) {
      req.body.username = sanitizeInput.name(req.body.username);
    }
    if (req.body.firstName) {
      req.body.firstName = sanitizeInput.name(req.body.firstName);
    }
    if (req.body.lastName) {
      req.body.lastName = sanitizeInput.name(req.body.lastName);
    }
    if (req.body.email) {
      req.body.email = sanitizeInput.email(req.body.email);
    }
    if (req.body.content) {
      req.body.content = sanitizeInput.text(req.body.content);
    }
    if (req.body.message) {
      req.body.message = sanitizeInput.text(req.body.message);
    }
  }
  
  next();
};

// Fraud detection utilities
export const fraudDetection = {
  // Log suspicious activity
  logSuspiciousActivity: (userId: string, activity: string, details: any) => {
    console.warn(`FRAUD ALERT: Suspicious activity detected`, {
      userId,
      activity,
      details,
      timestamp: new Date().toISOString(),
      ip: details.ip || 'unknown'
    });
    
    // In a production environment, this would also:
    // - Store in database for investigation
    // - Send alerts to security team
    // - Update user risk score
  },
  
  // Check for duplicate product creation patterns
  checkDuplicateProduct: async (userId: string, title: string, price: string) => {
    // This would check against recent products by the same user
    // For now, just log the pattern
    console.log(`Product creation pattern check`, {
      userId,
      title: title.substring(0, 50),
      price,
      timestamp: new Date().toISOString()
    });
  }
};

export default {
  sanitizeHtml,
  sanitizeInput,
  moderateContent,
  securityMiddleware,
  enhancedValidation,
  sanitizationMiddleware,
  fraudDetection,
  securityConfig
};