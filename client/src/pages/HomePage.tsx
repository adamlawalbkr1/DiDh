import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import ProductCard from "@/components/ProductCard";
import MapView from "@/components/MapView";
import WalletCard from "@/components/WalletCard";
import NegotiationChat from "@/components/NegotiationChat";
import ProductForm from "@/components/ProductForm";
import WebSocketTest from "@/components/WebSocketTest";
import { Grid, Map, Plus, X, Filter } from "lucide-react";
import type { Product, User } from "@shared/schema";

type ProductWithSeller = Product & { seller: User };

// Mock user data for the sidebar
const mockUser = {
  walletBalance: '2847.50',
  rating: '4.9',
  totalTransactions: 156,
};

export default function HomePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [isMapFullScreen, setIsMapFullScreen] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [activeNegotiation, setActiveNegotiation] = useState<{
    negotiationId: string;
    productId: string;
    productTitle: string;
    currentPrice: string;
    otherUser: {
      id: string;
      username: string;
      isOnline: boolean;
    };
  } | null>(null);
  const [searchRadius, setSearchRadius] = useState(10);
  const [mapCenter, setMapCenter] = useState({ lat: 37.7749, lng: -122.4194 }); // Default to San Francisco
  const [negotiatingProductId, setNegotiatingProductId] = useState<string | null>(null);

  const handleSearchRadiusChange = (radius: number) => {
    console.log('HomePage: Updating search radius from', searchRadius, 'to', radius);
    // Use functional update to ensure we get the latest state
    setSearchRadius(prevRadius => {
      console.log('HomePage: State transition:', prevRadius, '->', radius);
      return radius;
    });
  };

  const handleMapCenterChange = (center: { lat: number; lng: number }) => {
    console.log('HomePage: Updating map center to', center);
    setMapCenter(center);
  };

  const handleLocationSearch = (location: string) => {
    console.log('HomePage: Searching for location:', location);
    // TODO: Implement geocoding - for now, use predefined centers
    const predefinedLocations: Record<string, { lat: number; lng: number }> = {
      'san francisco': { lat: 37.7749, lng: -122.4194 },
      'los angeles': { lat: 34.0522, lng: -118.2437 },
      'new york': { lat: 40.7128, lng: -74.0060 },
      'seattle': { lat: 47.6062, lng: -122.3321 },
      'austin': { lat: 30.2672, lng: -97.7431 },
    };
    
    const searchKey = location.toLowerCase();
    const foundLocation = predefinedLocations[searchKey];
    if (foundLocation) {
      setMapCenter(foundLocation);
    }
  };

  // Fetch real products from API with coordinate filtering
  const { data: products = [], isLoading: isLoadingProducts } = useQuery<ProductWithSeller[]>({
    queryKey: ["/api/products", mapCenter.lat, mapCenter.lng, searchRadius],
    queryFn: async () => {
      const params = new URLSearchParams({
        lat: mapCenter.lat.toString(),
        lng: mapCenter.lng.toString(),
        radius: searchRadius.toString(),
      });
      const url = `/api/products?${params.toString()}`;
      console.log('Fetching products with URL:', url);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch products: ${response.status}`);
      }
      return response.json();
    },
    retry: 1,
  });

  // Transform products for map view
  const mapProducts = products
    .filter(p => p.coordinates) // Only show products with coordinates on map
    .map(p => ({
      id: p.id,
      title: p.title,
      price: p.price,
      seller: {
        id: p.seller.id,
        username: p.seller.username || 'Unknown',
        rating: p.seller.rating || '0.0',
        isOnline: p.seller.isOnline || false,
      },
      coordinates: p.coordinates!,
      category: p.category,
      status: p.status || 'available',
      isRealEstate: p.isRealEstate || false,
    }));

  const handleCreateProduct = () => {
    console.log('Create product triggered');
    setShowProductForm(true);
  };

  const handleProductSubmit = (data: any) => {
    console.log('Product form submitted:', data);
    setShowProductForm(false);
    // Invalidate products query to refetch after new product creation
    queryClient.invalidateQueries({ queryKey: ["/api/products"] });
  };

  // Mutation to create new negotiation
  const createNegotiationMutation = useMutation({
    mutationFn: async ({ productId, sellerId }: { productId: string; sellerId: string }) => {
      const response = await apiRequest('POST', '/api/negotiations', { 
        productId, 
        sellerId, 
        buyerId: user?.id 
      });
      return response.json();
    },
    onSuccess: (negotiation) => {
      queryClient.invalidateQueries({ queryKey: ['/api/negotiations'] });
      toast({
        title: "Chat started",
        description: "You can now negotiate with the seller.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to start chat",
        description: error.message || "Unable to start negotiation. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleConnectToSeller = async (sellerId: string) => {
    console.log('Connect to seller:', sellerId);
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to start a negotiation.",
        variant: "destructive",
      });
      return;
    }

    // Find a product from this seller to start negotiation
    const product = products.find(p => p.seller.id === sellerId);
    if (product) {
      handleNegotiate(product.id);
    }
  };

  const handleNegotiate = async (productId: string) => {
    console.log('Start negotiation for product:', productId);
    if (!user) {
      toast({
        title: "Authentication required", 
        description: "Please log in to start a negotiation.",
        variant: "destructive",
      });
      return;
    }

    const product = products.find(p => p.id === productId);
    if (!product) {
      toast({
        title: "Product not found",
        description: "Unable to find the product for negotiation.",
        variant: "destructive",
      });
      return;
    }

    if (product.seller.id === user.id) {
      toast({
        title: "Cannot negotiate",
        description: "You cannot negotiate on your own product.",
        variant: "destructive",
      });
      return;
    }

    if (product.status === 'sold') {
      toast({
        title: "Product unavailable",
        description: "This product has already been sold.",
        variant: "destructive",
      });
      return;
    }

    setNegotiatingProductId(productId);

    try {
      // Check if negotiation already exists
      const existingNegotiation = await fetch(`/api/negotiations?productId=${productId}&buyerId=${user.id}`);
      if (existingNegotiation.ok) {
        const negotiations = await existingNegotiation.json();
        if (negotiations.length > 0) {
          // Use existing negotiation
          const negotiation = negotiations[0];
          setActiveNegotiation({
            negotiationId: negotiation.id,
            productId: product.id,
            productTitle: product.title,
            currentPrice: product.price,
            otherUser: {
              id: product.seller.id,
              username: product.seller.username || 'Unknown',
              isOnline: product.seller.isOnline || false,
            }
          });
          toast({
            title: "Negotiation resumed",
            description: "You already have an active negotiation for this product.",
          });
          setNegotiatingProductId(null);
          return;
        }
      }

      // Create new negotiation
      const negotiation = await createNegotiationMutation.mutateAsync({
        productId,
        sellerId: product.seller.id
      });

      setActiveNegotiation({
        negotiationId: negotiation.id,
        productId: product.id,
        productTitle: product.title,
        currentPrice: product.price,
        otherUser: {
          id: product.seller.id,
          username: product.seller.username || 'Unknown',
          isOnline: product.seller.isOnline || false,
        }
      });
      
      toast({
        title: "Negotiation started",
        description: `You can now chat with ${product.seller.username || 'the seller'} about ${product.title}.`,
      });
    } catch (error) {
      console.error('Failed to start negotiation:', error);
      toast({
        title: "Failed to start negotiation",
        description: "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setNegotiatingProductId(null);
    }
  };

  const handleToggleWallet = () => {
    console.log('Toggle wallet');
    setShowWallet(!showWallet);
  };


  return (
    <div className="min-h-screen bg-background">
      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left Sidebar - Wallet and Filters */}
          <div className="w-full lg:w-80 space-y-6">
            {/* WebSocket Test Component */}
            <WebSocketTest negotiationId="test-negotiation-123" />
            
            {/* Wallet Card */}
            <WalletCard
              balance={mockUser.walletBalance}
              transactions={[
                {
                  id: 'tx-1',
                  type: 'credit',
                  amount: '1199.00',
                  description: 'Payment received - iPhone 15 Pro',
                  timestamp: new Date(Date.now() - 86400000),
                  status: 'completed',
                },
                {
                  id: 'tx-2',
                  type: 'debit',
                  amount: '850.00',
                  description: 'Purchase - MacBook Pro',
                  timestamp: new Date(Date.now() - 172800000),
                  status: 'completed',
                },
              ]}
              onAddFunds={() => console.log('Add funds')}
              onWithdraw={() => console.log('Withdraw')}
            />

            {/* Quick Stats */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3">Quick Stats</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Your Rating</span>
                    <span className="font-medium">{mockUser.rating}/5.0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Transactions</span>
                    <span className="font-medium">{mockUser.totalTransactions}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Active Listings</span>
                    <span className="font-medium">3</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Active Negotiation */}
            {activeNegotiation && (
              <NegotiationChat
                negotiationId={activeNegotiation.negotiationId}
                productTitle={activeNegotiation.productTitle}
                currentPrice={activeNegotiation.currentPrice}
                otherUser={activeNegotiation.otherUser}
                onClose={() => setActiveNegotiation(null)}
              />
            )}
          </div>

          {/* Main Content Area */}
          <div className="flex-1">
            {/* View Toggle and Create Button */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-4">
                <h2 className="text-2xl font-bold">Marketplace</h2>
                <Badge variant="outline" data-testid="text-total-products">
                  {products.length} products
                </Badge>
              </div>
              
              <div className="flex items-center space-x-2">
                <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as 'grid' | 'map')}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="grid" data-testid="tab-grid-view">
                      <Grid className="w-4 h-4 mr-1" />
                      Grid
                    </TabsTrigger>
                    <TabsTrigger value="map" data-testid="tab-map-view">
                      <Map className="w-4 h-4 mr-1" />
                      Map
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                
                <Button onClick={handleCreateProduct} data-testid="button-create-product-main">
                  <Plus className="w-4 h-4 mr-1" />
                  List Item
                </Button>
              </div>
            </div>

            {/* Content based on view mode */}
            {isLoadingProducts ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                  <p className="text-muted-foreground">Loading products...</p>
                </div>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {products.length > 0 ? (
                  products.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onConnect={handleConnectToSeller}
                      onNegotiate={handleNegotiate}
                      isNegotiating={negotiatingProductId === product.id}
                    />
                  ))
                ) : (
                  <div className="col-span-full text-center py-12">
                    <p className="text-muted-foreground mb-4">No products available</p>
                    <Button onClick={handleCreateProduct} data-testid="button-create-first-product">
                      List Your First Item
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <MapView
                products={mapProducts}
                searchRadius={searchRadius}
                onSearchRadiusChange={handleSearchRadiusChange}
                mapCenter={mapCenter}
                onMapCenterChange={handleMapCenterChange}
                onLocationSearch={handleLocationSearch}
                onConnectToSeller={handleConnectToSeller}
                onProductClick={(productId) => console.log('Product clicked:', productId)}
                onNegotiate={handleNegotiate}
                isFullScreen={isMapFullScreen}
                onToggleFullScreen={() => setIsMapFullScreen(!isMapFullScreen)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showProductForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <ProductForm
              onSubmit={handleProductSubmit}
              onCancel={() => setShowProductForm(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}