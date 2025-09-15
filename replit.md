# P2P Marketplace Platform

## Overview
A decentralized peer-to-peer marketplace platform that enables direct trading between users with built-in escrow protection, real-time negotiation chat, and location-based discovery. The platform combines modern web technologies with AI-powered price suggestions and map-based product discovery for secure peer-to-peer transactions.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **React with TypeScript**: Modern component-based architecture using React 18 with TypeScript for type safety
- **Styling System**: Utility-first approach using Tailwind CSS with a comprehensive design system based on shadcn/ui components
- **State Management**: TanStack Query (React Query) for server state management with optimistic updates and caching
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod schema validation for type-safe form management
- **UI Components**: Radix UI primitives with custom styling for accessibility and consistent design
- **Theme Support**: Dark/light mode toggle with CSS custom properties for theme switching

### Backend Architecture
- **Express.js Server**: RESTful API server with middleware for logging and error handling
- **Database Layer**: Drizzle ORM with PostgreSQL for type-safe database operations
- **Authentication**: Replit Auth integration with OpenID Connect and session-based authentication
- **File Structure**: Monorepo structure with shared schema definitions between client and server

### Data Storage Solutions
- **PostgreSQL Database**: Primary data store using Neon serverless PostgreSQL
- **Session Storage**: Database-backed session management for authentication persistence
- **Schema Design**: Comprehensive database schema including:
  - Users with wallet balances, ratings, and location data
  - Products with pricing, categorization, and geolocation
  - Negotiations for real-time price discussions
  - Transactions for escrow and payment tracking

### Authentication and Authorization
- **Replit Auth**: OAuth-based authentication using OpenID Connect
- **Session Management**: Secure session handling with PostgreSQL session store
- **Password Security**: bcrypt for password hashing when applicable
- **Route Protection**: Middleware-based authentication checks for protected endpoints

### Key Features Architecture
- **Real-time Negotiation**: Chat system for buyer-seller communication with offer/counter-offer functionality
- **AI Price Suggestions**: Venice AI integration for intelligent pricing recommendations based on product details and market analysis
- **Map-based Discovery**: Geolocation-based product search with distance filtering and coordinate bounds
- **Wallet System**: Built-in wallet functionality for secure transactions and balance management
- **Escrow Protection**: Transaction management system for secure peer-to-peer payments

## External Dependencies

### Core Infrastructure
- **Neon Database**: Serverless PostgreSQL hosting for scalable data storage
- **Replit Auth**: Authentication service for user management and OAuth flows

### AI and Intelligence
- **Venice AI**: AI-powered price suggestion service for market analysis and pricing recommendations

### Payment Processing
- **Stripe**: Payment processing integration for wallet funding and transaction handling (React Stripe.js components included)

### Development and Build Tools
- **Vite**: Fast build tool and development server with hot module replacement
- **TypeScript**: Type checking and enhanced developer experience
- **Drizzle Kit**: Database migration and schema management tools
- **ESBuild**: Fast JavaScript bundler for production builds

### UI and Styling
- **Tailwind CSS**: Utility-first CSS framework for responsive design
- **Radix UI**: Headless UI components for accessibility and consistent behavior
- **Lucide React**: Icon system for consistent iconography
- **Google Fonts (Inter)**: Typography system for clean, modern text rendering

### Form and Validation
- **React Hook Form**: Efficient form state management with minimal re-renders
- **Zod**: Runtime type validation and schema definition
- **Hookform Resolvers**: Integration layer between React Hook Form and Zod validation