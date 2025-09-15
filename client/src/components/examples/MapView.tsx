import MapView from '../MapView';

// Mock data for demonstration
const mockProducts = [
  {
    id: 'product-1',
    title: 'iPhone 15 Pro Max',
    price: '1199.00',
    seller: {
      id: 'seller-1',
      username: 'TechDealer',
      rating: '4.8',
      isOnline: true,
    },
    coordinates: { lat: 37.7749, lng: -122.4194 },
    category: 'Electronics',
    status: 'available',
    isRealEstate: false,
  },
  {
    id: 'product-2',
    title: 'Modern Apartment Downtown',
    price: '450000.00',
    seller: {
      id: 'seller-2',
      username: 'RealtyPro',
      rating: '4.9',
      isOnline: false,
    },
    coordinates: { lat: 37.7849, lng: -122.4094 },
    category: 'Real Estate',
    status: 'negotiating',
    isRealEstate: true,
  },
  {
    id: 'product-3',
    title: 'Gaming Laptop RTX 4090',
    price: '2499.00',
    seller: {
      id: 'seller-3',
      username: 'GameGear',
      rating: '4.6',
      isOnline: true,
    },
    coordinates: { lat: 37.7649, lng: -122.4294 },
    category: 'Electronics',
    status: 'available',
    isRealEstate: false,
  },
  {
    id: 'product-4',
    title: 'Vintage Guitar 1969',
    price: '5500.00',
    seller: {
      id: 'seller-4',
      username: 'MusicLover',
      rating: '4.7',
      isOnline: true,
    },
    coordinates: { lat: 37.7949, lng: -122.3994 },
    category: 'Musical Instruments',
    status: 'sold',
    isRealEstate: false,
  },
  {
    id: 'product-5',
    title: 'Mountain Bike Carbon',
    price: '1200.00',
    seller: {
      id: 'seller-5',
      username: 'BikeShop',
      rating: '4.5',
      isOnline: false,
    },
    coordinates: { lat: 37.7549, lng: -122.4394 },
    category: 'Sports',
    status: 'available',
    isRealEstate: false,
  },
];

export default function MapViewExample() {
  return (
    <div className="w-full h-96">
      <MapView
        products={mockProducts}
        searchRadius={10}
        onSearchRadiusChange={(radius) => console.log('Radius changed:', radius)}
        onConnectToSeller={(sellerId) => console.log('Connect to seller:', sellerId)}
        onProductClick={(productId) => console.log('Product clicked:', productId)}
        onToggleFullScreen={() => console.log('Toggle fullscreen')}
      />
    </div>
  );
}