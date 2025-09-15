import ProductCard from '../ProductCard';
import type { Product, User } from '@shared/schema';

// Mock data for demonstration
const mockSeller: User = {
  id: 'seller-1',
  username: 'TechDealer',
  password: '',
  email: 'dealer@example.com',
  walletBalance: '1250.00',
  rating: '4.8',
  totalTransactions: 127,
  location: 'San Francisco, CA',
  coordinates: { lat: 37.7749, lng: -122.4194 },
  isOnline: true,
  lastSeen: new Date(),
  stripeCustomerId: null,
  stripeSubscriptionId: null,
};

const mockProduct: Product & { seller: User } = {
  id: 'product-1',
  sellerId: 'seller-1',
  title: 'iPhone 15 Pro Max 256GB',
  description: 'Brand new iPhone 15 Pro Max in Natural Titanium. Sealed box, never opened. Includes all original accessories and 1-year Apple warranty.',
  price: '1199.00',
  suggestedPrice: '1149.00',
  category: 'Electronics',
  condition: 'new',
  images: [],
  features: {
    storage: '256GB',
    color: 'Natural Titanium',
    carrier: 'Unlocked'
  },
  location: 'San Francisco, CA',
  coordinates: { lat: 37.7749, lng: -122.4194 },
  status: 'available',
  isRealEstate: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  seller: mockSeller,
};

export default function ProductCardExample() {
  return (
    <div className="w-80">
      <ProductCard 
        product={mockProduct}
        onConnect={(sellerId) => console.log('Connect to seller:', sellerId)}
        onNegotiate={(productId) => console.log('Negotiate for product:', productId)}
      />
    </div>
  );
}