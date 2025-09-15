import { z } from "zod";

// Configuration constants
const VENICE_AI_TIMEOUT = 15000; // 15 seconds
const MAX_RETRIES = 2;

// Input validation schema for price suggestion requests
const priceSuggestionSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  category: z.string().min(1, "Category is required"),
  condition: z.enum(["new", "used", "refurbished"]),
  location: z.string().optional(),
});

export type PriceSuggestionRequest = z.infer<typeof priceSuggestionSchema>;

export interface PriceSuggestionResponse {
  suggestedPrice: number;
  priceRange: {
    min: number;
    max: number;
  };
  confidence: number; // 0-100
  reasoning: string;
  marketFactors: string[];
}

export class VeniceAIService {
  private readonly apiKey: string;
  private readonly baseUrl = "https://api.venice.ai/api/v1";
  private readonly model = "qwen3-4b"; // Venice Small - most cost-effective for price analysis
  private readonly isConfigured: boolean;

  constructor() {
    this.apiKey = process.env.VENICE_AI_API_KEY || "";
    this.isConfigured = !!this.apiKey;
    
    if (!this.isConfigured) {
      console.warn("VENICE_AI_API_KEY not configured - using fallback pricing");
    }
  }

  /**
   * Generate intelligent price suggestions using Venice AI with fallback
   */
  async suggestPrice(productData: PriceSuggestionRequest): Promise<PriceSuggestionResponse> {
    // Validate input data
    const validatedData = priceSuggestionSchema.parse(productData);

    // If Venice AI is not configured, use fallback immediately
    if (!this.isConfigured) {
      console.log("Venice AI not configured, using fallback pricing");
      return this.generateFallbackPricing(validatedData);
    }

    // Try Venice AI with retries
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`Venice AI attempt ${attempt}/${MAX_RETRIES} with model: ${this.model}`);
        const result = await this.callVeniceAPI(validatedData);
        console.log("Venice AI request successful");
        return result;
      } catch (error) {
        console.warn(`Venice AI attempt ${attempt} failed:`, error);
        
        // If this is the last attempt, use fallback
        if (attempt === MAX_RETRIES) {
          console.log("All Venice AI attempts failed, using fallback pricing");
          return this.generateFallbackPricing(validatedData);
        }
        
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }

    // Fallback (should not reach here, but just in case)
    return this.generateFallbackPricing(validatedData);
  }

  /**
   * Make the actual Venice AI API call with timeout
   */
  private async callVeniceAPI(productData: PriceSuggestionRequest): Promise<PriceSuggestionResponse> {
    const prompt = this.buildPricingPrompt(productData);

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), VENICE_AI_TIMEOUT);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "system",
              content: `You are an expert marketplace pricing analyst. Analyze product information and provide accurate price suggestions based on current market conditions, product condition, category trends, and comparable listings. Always respond in valid JSON format with the exact structure requested.`
            },
            {
              role: "user",
              content: prompt
            }
          ],
          max_tokens: 500,
          temperature: 0.3, // Lower temperature for more consistent pricing
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No response body');
        console.error(`Venice AI API error details:`, {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers),
          body: errorText
        });
        throw new Error(`Venice AI API error: ${response.status} - ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error("Invalid response structure from Venice AI API");
      }

      const aiResponse = data.choices[0].message.content;
      
      // Parse AI response as JSON with better error handling
      let parsedResponse;
      try {
        // Clean the response - sometimes AI returns markdown code blocks
        const cleanedResponse = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        parsedResponse = JSON.parse(cleanedResponse);
      } catch (parseError) {
        console.error("Failed to parse Venice AI response as JSON:");
        console.error("Original response:", aiResponse);
        console.error("Parse error:", parseError);
        throw new Error("Venice AI returned invalid JSON format");
      }

      // Validate response structure
      const responseSchema = z.object({
        suggestedPrice: z.number().positive(),
        priceRange: z.object({
          min: z.number().positive(),
          max: z.number().positive(),
        }),
        confidence: z.number().min(0).max(100),
        reasoning: z.string(),
        marketFactors: z.array(z.string()),
      });

      try {
        return responseSchema.parse(parsedResponse);
      } catch (validationError) {
        console.error("Venice AI response validation failed:", validationError);
        console.error("Response data:", parsedResponse);
        throw new Error("Venice AI response structure is invalid");
      }

    } catch (error: unknown) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Venice AI request timed out after ${VENICE_AI_TIMEOUT}ms`);
      }
      
      throw error;
    }
  }

  /**
   * Build an intelligent pricing prompt based on product characteristics
   */
  private buildPricingPrompt(product: PriceSuggestionRequest): string {
    const conditionContext = {
      new: "brand new, unused condition with full warranty",
      used: "pre-owned condition with normal wear",
      refurbished: "professionally restored to like-new condition"
    };

    const locationContext = product.location ? ` in ${product.location}` : "";

    return `Analyze this product and provide a price suggestion in JSON format:

Product Details:
- Title: "${product.title}"
- Description: "${product.description}"
- Category: "${product.category}"
- Condition: ${conditionContext[product.condition]}
- Location: ${product.location || "Not specified"}

Please analyze:
1. Market value for similar items in ${product.category} category
2. Condition impact on pricing (${product.condition})
3. Regional market factors${locationContext}
4. Demand trends for this type of product
5. Comparable marketplace listings

Respond with this exact JSON structure:
{
  "suggestedPrice": [single recommended price as number],
  "priceRange": {
    "min": [minimum reasonable price],
    "max": [maximum reasonable price]
  },
  "confidence": [confidence level 0-100],
  "reasoning": "[brief explanation of pricing rationale]",
  "marketFactors": ["factor1", "factor2", "factor3"]
}

Consider current market conditions, seasonal trends, and typical depreciation rates for ${product.category} items. Base your analysis on realistic marketplace data and provide practical pricing advice.`;
  }

  /**
   * Generate heuristic-based pricing fallback when Venice AI is unavailable
   */
  private generateFallbackPricing(productData: PriceSuggestionRequest): PriceSuggestionResponse {
    const { title, description, category, condition } = productData;
    
    // Basic heuristic pricing based on category and condition
    const basePrices = {
      "electronics": 200,
      "clothing": 25,
      "books": 12,
      "home": 50,
      "sports": 75,
      "automotive": 150,
      "toys": 20,
      "jewelry": 100,
      "tools": 80,
      "furniture": 120,
      "other": 30
    };
    
    const conditionMultipliers = {
      "new": 1.0,
      "refurbished": 0.8,
      "used": 0.6
    };
    
    // Get base price (default to 'other' if category not found)
    const basePrice = basePrices[category.toLowerCase() as keyof typeof basePrices] || basePrices.other;
    const conditionMultiplier = conditionMultipliers[condition] || 0.6;
    
    // Calculate suggested price
    const suggestedPrice = Math.round(basePrice * conditionMultiplier);
    
    // Create price range (±30%)
    const minPrice = Math.max(1, Math.round(suggestedPrice * 0.7));
    const maxPrice = Math.round(suggestedPrice * 1.3);
    
    // Generate reasoning
    const reasoning = `Based on heuristic analysis: ${category} items typically range ${minPrice}-${maxPrice}. Condition (${condition}) adjusts base pricing by ${Math.round((conditionMultiplier - 1) * 100)}%.`;
    
    const marketFactors = [
      `Category: ${category}`,
      `Condition impact: ${condition}`,
      "Market demand: Average",
      "Pricing method: Heuristic fallback"
    ];
    
    return {
      suggestedPrice,
      priceRange: { min: minPrice, max: maxPrice },
      confidence: 65, // Lower confidence for heuristic pricing
      reasoning,
      marketFactors
    };
  }

  /**
   * Health check method to verify API connectivity
   */
  async healthCheck(): Promise<boolean> {
    if (!this.isConfigured) {
      return false;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout for health check

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "user", content: "test" }],
          max_tokens: 1
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      console.error("Venice AI health check failed:", error);
      return false;
    }
  }

  /**
   * Get service status information
   */
  getStatus(): { configured: boolean; available: boolean } {
    return {
      configured: this.isConfigured,
      available: this.isConfigured // Will be updated by health checks
    };
  }
}

// Export singleton instance
export const veniceAI = new VeniceAIService();