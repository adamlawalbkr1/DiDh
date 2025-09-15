# Design Guidelines: P2P Marketplace Platform

## Design Approach
**System-Based Approach (Design System)**: Using a modern, utility-focused design system optimized for complex data interactions, mapping interfaces, and financial transactions. This platform requires trust, clarity, and efficiency above visual flourish.

**Reference**: Combining Linear's clean interface patterns with Stripe's financial UI conventions, adapted for peer-to-peer marketplace needs.

## Core Design Elements

### A. Color Palette
**Primary Brand Colors:**
- Primary: 220 85% 55% (Trust-building blue for CTAs and branding)
- Secondary: 220 25% 25% (Dark slate for text and containers)

**Dark Mode:**
- Background: 220 15% 8% (Deep dark with blue undertone)
- Surface: 220 15% 12% (Elevated surfaces)
- Border: 220 15% 20% (Subtle borders)

**Light Mode:**
- Background: 0 0% 98% (Clean white)
- Surface: 0 0% 100% (Pure white surfaces)
- Border: 220 15% 90% (Light gray borders)

**Accent Colors:**
- Success: 142 70% 45% (Transaction confirmations)
- Warning: 38 92% 55% (Price alerts, negotiations)
- Error: 0 85% 60% (Failed transactions, validation)

### B. Typography
**Font Family**: Inter (Google Fonts) for clarity and modern feel
**Hierarchy:**
- H1: 2.5rem, font-weight-700 (Hero sections)
- H2: 2rem, font-weight-600 (Section headers)
- H3: 1.5rem, font-weight-600 (Card titles)
- Body: 1rem, font-weight-400 (General content)
- Small: 0.875rem, font-weight-400 (Metadata, timestamps)

### C. Layout System
**Spacing Units**: Tailwind units of 2, 4, 6, 8, 12, 16
- Micro spacing (p-2, m-2): Form elements, buttons
- Standard spacing (p-4, m-4): Card padding, general margins
- Section spacing (p-8, m-8): Page sections, major components
- Hero spacing (p-16): Landing sections, major layouts

### D. Component Library

**Navigation:**
- Top navigation with wallet balance display
- Sticky map toggle for mobile
- Breadcrumb navigation for deep product views

**Core UI Elements:**
- Cards with subtle shadows and rounded corners (rounded-lg)
- Primary buttons with solid fills, secondary with outlines
- Input fields with focus states and validation indicators
- Toast notifications for transaction updates

**Data Displays:**
- Product grid with image thumbnails and key details
- Transaction history tables with status indicators
- Price comparison charts with Venice AI suggestions
- User rating displays with star systems

**Mapping Interface:**
- Full-screen map toggle capability
- Floating search and filter controls
- Map markers with product previews
- Radius selector with visual overlay

**Financial Components:**
- Wallet balance with transaction history
- Escrow status indicators
- Price negotiation interface with counter-offer flows
- Digital certificate displays with verification badges

**Anti-Fraud Elements:**
- Product verification badges
- Seller reputation indicators
- Transaction security notices
- Double-selling prevention alerts

### E. Animations
**Minimal Approach:**
- Subtle fade-ins for page transitions (200ms)
- Hover states for interactive elements
- Loading states for Venice AI price calculations
- Map marker animations for new product discoveries

**NO complex animations** - focus on performance and clarity for financial transactions.

## Images
**Product Showcase:**
- High-quality product images in 16:9 aspect ratio
- Image galleries with zoom capability for detailed inspection
- Real estate coordinate mapping with satellite/street view integration

**Trust Elements:**
- User avatar placeholders (geometric patterns)
- Verification badges and security icons
- Transaction certificate templates

**No large hero image** - the platform opens directly to the product discovery interface with integrated map view, prioritizing immediate utility over marketing appeal.