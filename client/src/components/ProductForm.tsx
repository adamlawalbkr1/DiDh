import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Camera, MapPin, Sparkles, X, AlertCircle, CheckCircle, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const productFormSchema = z.object({
  title: z.string().min(1, "Title is required").max(100, "Title too long"),
  description: z.string().min(1, "Description is required").max(1000, "Description too long"),
  price: z.string().min(1, "Price is required"),
  category: z.string().min(1, "Category is required"),
  condition: z.string().min(1, "Condition is required"),
  location: z.string().min(1, "Location is required"),
  isRealEstate: z.boolean().default(false),
  features: z.record(z.string()).optional(),
});

type ProductFormData = z.infer<typeof productFormSchema>;

interface ProductFormProps {
  onSubmit: (data: ProductFormData & { images: string[] }) => void;
  onCancel?: () => void;
}

interface PriceSuggestion {
  price: number;
  priceRange: {
    min: number;
    max: number;
  };
  confidence: number;
  reasoning: string;
  marketFactors: string[];
}

export default function ProductForm({ 
  onSubmit, 
  onCancel
}: ProductFormProps) {
  const [images, setImages] = useState<string[]>([]);
  const [features, setFeatures] = useState<Record<string, string>>({});
  const [newFeatureKey, setNewFeatureKey] = useState("");
  const [newFeatureValue, setNewFeatureValue] = useState("");
  const [priceSuggestion, setPriceSuggestion] = useState<PriceSuggestion | null>(null);
  const { toast } = useToast();

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      title: "",
      description: "",
      price: "",
      category: "",
      condition: "",
      location: "",
      isRealEstate: false,
      features: {},
    },
  });

  const handleSubmit = (data: ProductFormData) => {
    console.log('Product form submitted:', data);
    onSubmit({ ...data, images, features });
  };

  const handleCancel = () => {
    console.log('Product form cancelled');
    onCancel?.();
  };

  const handleAddImage = () => {
    console.log('Add image clicked');
    // TODO: Implement image upload
    setImages([...images, `placeholder-image-${images.length + 1}.jpg`]);
  };

  const handleRemoveImage = (index: number) => {
    console.log('Remove image at index:', index);
    setImages(images.filter((_, i) => i !== index));
  };

  const handleAddFeature = () => {
    if (newFeatureKey && newFeatureValue) {
      console.log('Adding feature:', newFeatureKey, newFeatureValue);
      setFeatures({ ...features, [newFeatureKey]: newFeatureValue });
      setNewFeatureKey("");
      setNewFeatureValue("");
    }
  };

  const handleRemoveFeature = (key: string) => {
    console.log('Removing feature:', key);
    const newFeatures = { ...features };
    delete newFeatures[key];
    setFeatures(newFeatures);
  };

  // Venice AI price suggestion mutation
  const priceSuggestionMutation = useMutation({
    mutationFn: async (productData: { title: string; description: string; category: string; condition: string; location?: string }) => {
      const response = await apiRequest('POST', '/api/products/suggest-price', productData);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setPriceSuggestion(data.suggestion);
        toast({
          title: "Price suggestion ready!",
          description: `AI suggests $${data.suggestion.price} based on market analysis`,
        });
      } else {
        toast({
          title: "Price suggestion failed",
          description: data.error || "Unable to generate price suggestion",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      console.error('Price suggestion error:', error);
      toast({
        title: "Venice AI unavailable",
        description: "Price suggestion service is temporarily unavailable",
        variant: "destructive",
      });
    }
  });

  const handleGeneratePrice = () => {
    const formValues = form.getValues();
    
    // Validate required fields for price suggestion
    if (!formValues.title || !formValues.description || !formValues.category || !formValues.condition) {
      toast({
        title: "Missing information",
        description: "Please fill in title, description, category, and condition to get price suggestions",
        variant: "destructive",
      });
      return;
    }

    // Clear previous suggestion
    setPriceSuggestion(null);
    
    // Call Venice AI
    priceSuggestionMutation.mutate({
      title: formValues.title,
      description: formValues.description,
      category: formValues.category,
      condition: formValues.condition,
      location: formValues.location || undefined,
    });
  };

  const handleUseSuggestedPrice = (price: number) => {
    form.setValue('price', price.toString());
    toast({
      title: "Price updated",
      description: `Set price to $${price} based on AI suggestion`,
    });
  };

  const categories = [
    "Electronics",
    "Real Estate", 
    "Vehicles",
    "Home & Garden",
    "Sports & Recreation",
    "Fashion",
    "Musical Instruments",
    "Books & Media",
    "Collectibles",
    "Other"
  ];

  const conditions = [
    "new",
    "used",
    "refurbished"
  ];

  return (
    <Card className="w-full max-w-2xl" data-testid="card-product-form">
      <CardHeader>
        <CardTitle>List New Product</CardTitle>
      </CardHeader>
      
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {/* Title */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="What are you selling?"
                      data-testid="input-title"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Describe your item in detail..."
                      className="min-h-24"
                      data-testid="textarea-description"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Price with AI suggestion */}
            <div className="space-y-3">
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price ($)</FormLabel>
                    <div className="flex space-x-2">
                      <FormControl>
                        <Input 
                          type="number"
                          placeholder="0.00"
                          data-testid="input-price"
                          {...field}
                        />
                      </FormControl>
                      <Button 
                        type="button"
                        variant="outline"
                        onClick={handleGeneratePrice}
                        disabled={priceSuggestionMutation.isPending}
                        data-testid="button-generate-price"
                      >
                        <Sparkles className="w-4 h-4 mr-1" />
                        {priceSuggestionMutation.isPending ? 'Analyzing...' : 'AI Price'}
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {priceSuggestion && (
                <div className="p-4 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg border">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-900 dark:text-blue-100">Venice AI Price Analysis</span>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-lg font-semibold">
                          Suggested: <span className="text-green-600">${priceSuggestion.price}</span>
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Range: ${priceSuggestion.priceRange.min} - ${priceSuggestion.priceRange.max}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        <span className="text-sm font-medium">{priceSuggestion.confidence}% confident</span>
                      </div>
                    </div>
                    
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Reasoning:</p>
                      <p className="text-sm">{priceSuggestion.reasoning}</p>
                    </div>
                    
                    {priceSuggestion.marketFactors.length > 0 && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Market factors:</p>
                        <div className="flex flex-wrap gap-1">
                          {priceSuggestion.marketFactors.map((factor, index) => (
                            <Badge key={index} variant="secondary" className="text-xs">
                              {factor}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div className="flex gap-2 pt-2">
                      <Button 
                        type="button"
                        size="sm"
                        onClick={() => handleUseSuggestedPrice(priceSuggestion.price)}
                        data-testid="button-use-suggested-price"
                      >
                        Use ${priceSuggestion.price}
                      </Button>
                      <Button 
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleUseSuggestedPrice(priceSuggestion.priceRange.min)}
                        data-testid="button-use-min-price"
                      >
                        Use min ${priceSuggestion.priceRange.min}
                      </Button>
                      <Button 
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleUseSuggestedPrice(priceSuggestion.priceRange.max)}
                        data-testid="button-use-max-price"
                      >
                        Use max ${priceSuggestion.priceRange.max}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              
              {priceSuggestionMutation.isError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <span className="text-sm text-red-700 dark:text-red-300">AI service temporarily unavailable</span>
                  </div>
                </div>
              )}
            </div>

            {/* Category and Condition */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="condition"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Condition</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-condition">
                          <SelectValue placeholder="Select condition" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {conditions.map((condition) => (
                          <SelectItem key={condition} value={condition}>
                            {condition.charAt(0).toUpperCase() + condition.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Location */}
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <div className="flex space-x-2">
                    <FormControl>
                      <Input 
                        placeholder="City, State or Address"
                        data-testid="input-location"
                        {...field}
                      />
                    </FormControl>
                    <Button 
                      type="button"
                      variant="outline"
                      data-testid="button-use-current-location"
                    >
                      <MapPin className="w-4 h-4" />
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Real Estate Toggle */}
            <FormField
              control={form.control}
              name="isRealEstate"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <FormLabel className="text-base">Real Estate Property</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Enable precise coordinate mapping for property listings
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-real-estate"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* Images */}
            <div className="space-y-3">
              <FormLabel>Images</FormLabel>
              <div className="grid grid-cols-4 gap-3">
                {images.map((image, index) => (
                  <div key={index} className="relative">
                    <div className="aspect-square bg-muted rounded-lg flex items-center justify-center">
                      <span className="text-xs text-muted-foreground">Image {index + 1}</span>
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute -top-2 -right-2 w-6 h-6"
                      onClick={() => handleRemoveImage(index)}
                      data-testid={`button-remove-image-${index}`}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  className="aspect-square"
                  onClick={handleAddImage}
                  data-testid="button-add-image"
                >
                  <Camera className="w-6 h-6" />
                </Button>
              </div>
            </div>

            {/* Features */}
            <div className="space-y-3">
              <FormLabel>Features & Specifications</FormLabel>
              <div className="flex space-x-2">
                <Input
                  placeholder="Feature name"
                  value={newFeatureKey}
                  onChange={(e) => setNewFeatureKey(e.target.value)}
                  data-testid="input-feature-key"
                />
                <Input
                  placeholder="Feature value"
                  value={newFeatureValue}
                  onChange={(e) => setNewFeatureValue(e.target.value)}
                  data-testid="input-feature-value"
                />
                <Button 
                  type="button"
                  onClick={handleAddFeature}
                  disabled={!newFeatureKey || !newFeatureValue}
                  data-testid="button-add-feature"
                >
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(features).map(([key, value]) => (
                  <Badge 
                    key={key} 
                    variant="secondary" 
                    className="flex items-center space-x-1"
                    data-testid={`feature-${key}`}
                  >
                    <span>{key}: {value}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="w-4 h-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => handleRemoveFeature(key)}
                      data-testid={`button-remove-feature-${key}`}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex space-x-4 pt-4">
              <Button 
                type="submit" 
                className="flex-1"
                data-testid="button-submit"
              >
                List Product
              </Button>
              <Button 
                type="button"
                variant="outline"
                onClick={handleCancel}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}