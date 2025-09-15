import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { 
  MapPin, 
  Search, 
  MessageCircle, 
  DollarSign, 
  Filter, 
  Expand,
  Navigation,
  Star
} from "lucide-react";

interface MapProduct {
  id: string;
  title: string;
  price: string;
  seller: {
    id: string;
    username: string;
    rating: string;
    isOnline: boolean;
  };
  coordinates: { lat: number; lng: number };
  category: string;
  status: string;
  isRealEstate: boolean;
}

interface MapViewProps {
  products: MapProduct[];
  searchRadius: number;
  onSearchRadiusChange: (radius: number) => void;
  mapCenter: { lat: number; lng: number };
  onMapCenterChange: (center: { lat: number; lng: number }) => void;
  onLocationSearch: (location: string) => void;
  onConnectToSeller: (sellerId: string) => void;
  onProductClick: (productId: string) => void;
  onNegotiate: (productId: string) => void;
  isFullScreen?: boolean;
  onToggleFullScreen?: () => void;
}

export default function MapView({
  products,
  searchRadius,
  onSearchRadiusChange,
  mapCenter,
  onMapCenterChange,
  onLocationSearch,
  onConnectToSeller,
  onProductClick,
  onNegotiate,
  isFullScreen = false,
  onToggleFullScreen
}: MapViewProps) {
  const [selectedProduct, setSelectedProduct] = useState<MapProduct | null>(null);
  const [searchLocation, setSearchLocation] = useState("");
  const sliderRef = useRef<HTMLInputElement>(null);

  // Ensure slider UI stays synchronized with searchRadius prop
  useEffect(() => {
    if (sliderRef.current && sliderRef.current.value !== searchRadius.toString()) {
      console.log('MapView: Synchronizing slider value from', sliderRef.current.value, 'to', searchRadius);
      sliderRef.current.value = searchRadius.toString();
    }
  }, [searchRadius]);

  const handleMarkerClick = (product: MapProduct) => {
    console.log('Marker clicked for product:', product.id);
    setSelectedProduct(product);
  };

  const handleConnectFromMap = (sellerId: string) => {
    console.log('Connect from map for seller:', sellerId);
    onConnectToSeller(sellerId);
    setSelectedProduct(null);
  };

  const handleProductView = (productId: string) => {
    console.log('View product from map:', productId);
    onProductClick(productId);
    setSelectedProduct(null);
  };

  const handleNegotiateFromMap = (productId: string) => {
    console.log('Negotiate from map for product:', productId);
    onNegotiate(productId);
    setSelectedProduct(null);
  };

  const handleToggleFullScreen = () => {
    console.log('Toggle fullscreen map');
    onToggleFullScreen?.();
  };

  const handleSearchLocation = () => {
    console.log('Search location:', searchLocation);
    if (searchLocation.trim()) {
      onLocationSearch(searchLocation.trim());
      setSearchLocation('');
    }
  };

  const handleRadiusChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newRadius = parseInt(e.target.value);
    console.log('MapView: Radius event triggered');
    console.log('MapView: Event type:', e.type, 'target value:', e.target.value, 'parsed radius:', newRadius);
    console.log('MapView: Current searchRadius prop before update:', searchRadius);
    console.log('MapView: Slider ref current value:', sliderRef.current?.value);
    
    // Immediately call the parent handler to update state
    onSearchRadiusChange(newRadius);
    
    // Force a re-render to ensure UI is synchronized
    setTimeout(() => {
      console.log('MapView: Post-update verification:');
      console.log('MapView: - searchRadius prop:', searchRadius);
      console.log('MapView: - input target value:', e.target.value);
      console.log('MapView: - slider ref value:', sliderRef.current?.value);
    }, 100);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'bg-green-500';
      case 'negotiating': return 'bg-yellow-500';
      case 'sold': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <Card className={`${isFullScreen ? 'fixed inset-0 z-50' : 'w-full h-96'} flex flex-col`} data-testid="card-map">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center space-x-2">
          <MapPin className="w-5 h-5 text-primary" />
          <span>Product Map</span>
          <Badge variant="outline" data-testid="text-product-count">
            {products.length} items
          </Badge>
        </CardTitle>
        <div className="flex items-center space-x-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleToggleFullScreen}
            data-testid="button-toggle-fullscreen"
          >
            <Expand className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col space-y-3">
        {/* Search and Filter Controls */}
        <div className="flex space-x-2">
          <div className="flex-1 flex space-x-2">
            <Input
              placeholder="Search location..."
              value={searchLocation}
              onChange={(e) => setSearchLocation(e.target.value)}
              data-testid="input-search-location"
            />
            <Button 
              onClick={handleSearchLocation}
              data-testid="button-search-location"
            >
              <Search className="w-4 h-4" />
            </Button>
          </div>
          <Button variant="outline" data-testid="button-filters">
            <Filter className="w-4 h-4" />
          </Button>
        </div>

        {/* Radius Control */}
        <div className="flex items-center space-x-3">
          <span className="text-sm text-muted-foreground">Search radius:</span>
          <Input
            ref={sliderRef}
            type="range"
            min="1"
            max="50"
            value={searchRadius}
            onChange={handleRadiusChange}
            onInput={handleRadiusChange}
            className="flex-1"
            data-testid="slider-search-radius"
          />
          <span className="text-sm font-medium w-16" data-testid="text-radius-value">
            {searchRadius} km
          </span>
        </div>

        {/* Mock Map Area */}
        <div className="flex-1 bg-muted rounded-lg relative overflow-hidden min-h-48" data-testid="map-container">
          {/* Mock map background */}
          <div className="absolute inset-0 bg-gradient-to-br from-blue-100 to-green-100 dark:from-blue-900 dark:to-green-900">
            <div className="absolute inset-0 opacity-10">
              <svg className="w-full h-full" viewBox="0 0 400 300">
                {/* Mock street lines */}
                <line x1="0" y1="100" x2="400" y2="100" stroke="currentColor" strokeWidth="2" />
                <line x1="0" y1="200" x2="400" y2="200" stroke="currentColor" strokeWidth="2" />
                <line x1="100" y1="0" x2="100" y2="300" stroke="currentColor" strokeWidth="2" />
                <line x1="200" y1="0" x2="200" y2="300" stroke="currentColor" strokeWidth="2" />
                <line x1="300" y1="0" x2="300" y2="300" stroke="currentColor" strokeWidth="2" />
              </svg>
            </div>
          </div>

          {/* Product Markers */}
          {products.map((product) => {
            // Calculate normalized position based on product coordinates relative to map center
            const getMarkerPosition = () => {
              // Define map bounds - roughly 0.02 degrees (~2.2km) around center in each direction
              const mapBounds = {
                north: mapCenter.lat + 0.02,
                south: mapCenter.lat - 0.02,
                east: mapCenter.lng + 0.02,
                west: mapCenter.lng - 0.02,
              };
              
              // Calculate relative position within bounds (0-1)
              const relativeX = (product.coordinates.lng - mapBounds.west) / (mapBounds.east - mapBounds.west);
              const relativeY = (mapBounds.north - product.coordinates.lat) / (mapBounds.north - mapBounds.south);
              
              // Clamp to visible area and convert to percentage
              const clampedX = Math.max(0.1, Math.min(0.9, relativeX));
              const clampedY = Math.max(0.1, Math.min(0.9, relativeY));
              
              return {
                left: `${clampedX * 100}%`,
                top: `${clampedY * 100}%`,
              };
            };
            
            const position = getMarkerPosition();
            
            return (
              <div
                key={product.id}
                className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                style={position}
                onClick={() => handleMarkerClick(product)}
                data-testid={`marker-${product.id}`}
                title={`${product.title} - $${product.price}`}
              >
                <div className="relative">
                  <div className={`w-6 h-6 rounded-full ${getStatusColor(product.status)} border-2 border-white shadow-lg flex items-center justify-center hover-elevate`}>
                    <DollarSign className="w-3 h-3 text-white" />
                  </div>
                  {product.isRealEstate && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-purple-500 rounded-full border border-white"></div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Map center marker */}
          <div 
            className="absolute transform -translate-x-1/2 -translate-y-1/2"
            style={{ left: '50%', top: '50%' }}
            data-testid="map-center-marker"
            title={`Map Center: ${mapCenter.lat.toFixed(4)}, ${mapCenter.lng.toFixed(4)}`}
          >
            <div className="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg">
              <div className="w-full h-full bg-blue-500 rounded-full animate-ping opacity-75"></div>
            </div>
          </div>
          
          {/* Search radius indicator */}
          <div 
            className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: '50%', top: '50%' }}
            data-testid="radius-indicator"
          >
            <div 
              className="border border-blue-300 border-dashed rounded-full opacity-50"
              style={{
                width: `${Math.min(searchRadius * 8, 300)}px`,
                height: `${Math.min(searchRadius * 8, 300)}px`,
              }}
            ></div>
          </div>
        </div>

        {/* Product Details Popup */}
        {selectedProduct && (
          <Card className="absolute bottom-4 left-4 right-4 z-10 shadow-lg" data-testid={`popup-product-${selectedProduct.id}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold truncate" data-testid={`popup-title-${selectedProduct.id}`}>
                    {selectedProduct.title}
                  </h4>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="font-bold text-primary" data-testid={`popup-price-${selectedProduct.id}`}>
                      ${selectedProduct.price}
                    </span>
                    <Badge variant="outline" data-testid={`popup-category-${selectedProduct.id}`}>
                      {selectedProduct.category}
                    </Badge>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setSelectedProduct(null)}
                  data-testid="button-close-popup"
                >
                  ×
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Avatar className="w-6 h-6">
                    <AvatarImage src="" alt={selectedProduct.seller.username} />
                    <AvatarFallback className="text-xs">
                      {selectedProduct.seller.username.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium" data-testid={`popup-seller-${selectedProduct.id}`}>
                      {selectedProduct.seller.username}
                    </p>
                    <div className="flex items-center space-x-1">
                      <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                      <span className="text-xs text-muted-foreground" data-testid={`popup-rating-${selectedProduct.id}`}>
                        {selectedProduct.seller.rating}
                      </span>
                      <Badge 
                        variant={selectedProduct.seller.isOnline ? "default" : "secondary"}
                        className="text-xs ml-2"
                      >
                        {selectedProduct.seller.isOnline ? 'Online' : 'Offline'}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleConnectFromMap(selectedProduct.seller.id)}
                    data-testid={`button-connect-popup-${selectedProduct.id}`}
                  >
                    <MessageCircle className="w-4 h-4 mr-1" />
                    Connect
                  </Button>
                  <Button 
                    variant="outline"
                    size="sm"
                    onClick={() => handleNegotiateFromMap(selectedProduct.id)}
                    disabled={selectedProduct.status === 'sold'}
                    data-testid={`button-negotiate-popup-${selectedProduct.id}`}
                  >
                    <DollarSign className="w-4 h-4 mr-1" />
                    Negotiate
                  </Button>
                  <Button 
                    size="sm"
                    onClick={() => handleProductView(selectedProduct.id)}
                    data-testid={`button-view-popup-${selectedProduct.id}`}
                  >
                    View
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}