import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { MapPin, MessageCircle, DollarSign, Star } from "lucide-react";
import type { Product, User } from "@shared/schema";
import productPlaceholder from "@assets/generated_images/Product_placeholder_image_664c762d.png";

interface ProductCardProps {
  product: Product & { seller: User };
  onConnect?: (sellerId: string) => void;
  onNegotiate?: (productId: string) => void;
  isNegotiating?: boolean;
}

export default function ProductCard({ product, onConnect, onNegotiate, isNegotiating = false }: ProductCardProps) {
  const handleConnect = () => {
    console.log('Connect clicked for seller:', product.sellerId);
    onConnect?.(product.sellerId);
  };

  const handleNegotiate = () => {
    console.log('Negotiate clicked for product:', product.id);
    onNegotiate?.(product.id);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'bg-green-500';
      case 'negotiating': return 'bg-yellow-500';
      case 'sold': return 'bg-red-500';
      case 'reserved': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <Card className="hover-elevate" data-testid={`card-product-${product.id}`}>
      <CardHeader className="p-0">
        <div className="relative">
          <img 
            src={product.images?.[0] || productPlaceholder} 
            alt={product.title}
            className="w-full h-48 object-cover rounded-t-lg"
            data-testid={`img-product-${product.id}`}
          />
          <Badge 
            className={`absolute top-2 right-2 ${getStatusColor(product.status || 'available')} text-white`}
            data-testid={`status-${product.status}-${product.id}`}
          >
            {product.status}
          </Badge>
          {product.isRealEstate && (
            <Badge className="absolute top-2 left-2 bg-purple-500 text-white">
              Real Estate
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-lg truncate" data-testid={`text-title-${product.id}`}>
            {product.title}
          </h3>
          <div className="flex items-center space-x-1 ml-2">
            <DollarSign className="w-4 h-4 text-primary" />
            <span className="font-bold text-lg text-primary" data-testid={`text-price-${product.id}`}>
              ${product.price}
            </span>
          </div>
        </div>
        
        {product.suggestedPrice && product.suggestedPrice !== product.price && (
          <div className="flex items-center space-x-1 mb-2">
            <span className="text-sm text-muted-foreground">Venice AI suggests:</span>
            <span className="text-sm font-medium text-green-600" data-testid={`text-suggested-price-${product.id}`}>
              ${product.suggestedPrice}
            </span>
          </div>
        )}
        
        <p className="text-sm text-muted-foreground mb-3 line-clamp-2" data-testid={`text-description-${product.id}`}>
          {product.description}
        </p>
        
        <div className="flex items-center justify-between mb-3">
          <Badge variant="outline" data-testid={`badge-category-${product.id}`}>
            {product.category}
          </Badge>
          <Badge variant="outline" data-testid={`badge-condition-${product.id}`}>
            {product.condition}
          </Badge>
        </div>
        
        <div className="flex items-center space-x-2 mb-3">
          <MapPin className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground" data-testid={`text-location-${product.id}`}>
            {product.location || 'Location not specified'}
          </span>
        </div>
        
        <div className="flex items-center space-x-3">
          <Avatar className="w-8 h-8">
            <AvatarImage src="" alt={product.seller.username || 'Seller'} />
            <AvatarFallback data-testid={`avatar-seller-${product.id}`}>
              {product.seller.username?.charAt(0).toUpperCase() || 'S'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" data-testid={`text-seller-${product.id}`}>
              {product.seller.username || 'Anonymous Seller'}
            </p>
            <div className="flex items-center space-x-1">
              <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
              <span className="text-xs text-muted-foreground" data-testid={`text-rating-${product.id}`}>
                {product.seller.rating} ({product.seller.totalTransactions})
              </span>
            </div>
          </div>
        </div>
      </CardContent>
      
      <CardFooter className="p-4 pt-0 flex space-x-2">
        <Button 
          variant="outline" 
          size="sm" 
          className="flex-1"
          onClick={handleConnect}
          data-testid={`button-connect-${product.id}`}
        >
          <MessageCircle className="w-4 h-4 mr-1" />
          Connect
        </Button>
        <Button 
          size="sm" 
          className="flex-1"
          onClick={handleNegotiate}
          disabled={isNegotiating || product.status === 'sold'}
          data-testid={`button-negotiate-${product.id}`}
        >
          {isNegotiating ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-1"></div>
              Starting...
            </>
          ) : (
            "Negotiate"
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}