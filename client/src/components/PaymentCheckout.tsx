import { useState, useEffect } from "react";
import { useStripe, useElements, PaymentElement, Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, CreditCard, Check, AlertCircle, DollarSign } from "lucide-react";

// Make sure to call `loadStripe` outside of a component's render to avoid
// recreating the `Stripe` object on every render.
if (!import.meta.env.VITE_STRIPE_PUBLIC_KEY) {
  throw new Error('Missing required Stripe key: VITE_STRIPE_PUBLIC_KEY');
}
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

interface PaymentCheckoutProps {
  negotiationId: string;
  productTitle: string;
  amount: string;
  sellerName: string;
  onPaymentSuccess?: (paymentResult: any) => void;
  onPaymentError?: (error: string) => void;
  onCancel?: () => void;
}

const CheckoutForm = ({ 
  negotiationId, 
  productTitle, 
  amount, 
  sellerName,
  onPaymentSuccess,
  onPaymentError,
  onCancel 
}: PaymentCheckoutProps) => {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'processing' | 'succeeded' | 'failed'>('pending');
  const [errorMessage, setErrorMessage] = useState<string>("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      setErrorMessage("Stripe is not properly initialized");
      return;
    }

    setIsLoading(true);
    setPaymentStatus('processing');
    setErrorMessage("");

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/payment-success`,
        },
        redirect: 'if_required',
      });

      if (error) {
        setPaymentStatus('failed');
        setErrorMessage(error.message || "Payment failed");
        onPaymentError?.(error.message || "Payment failed");
        toast({
          title: "Payment Failed",
          description: error.message,
          variant: "destructive",
        });
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        setPaymentStatus('succeeded');
        
        // Confirm payment completion with backend
        await apiRequest("POST", `/api/negotiations/${negotiationId}/confirm-payment`, {
          paymentIntentId: paymentIntent.id
        });

        onPaymentSuccess?.(paymentIntent);
        toast({
          title: "Payment Successful",
          description: `Payment of $${amount} completed successfully!`,
        });
      }
    } catch (error: any) {
      setPaymentStatus('failed');
      const errorMsg = error.message || "An unexpected error occurred";
      setErrorMessage(errorMsg);
      onPaymentError?.(errorMsg);
      toast({
        title: "Payment Error",
        description: errorMsg,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: string) => {
    return `$${parseFloat(amount).toFixed(2)}`;
  };

  if (paymentStatus === 'succeeded') {
    return (
      <Card className="w-full max-w-md mx-auto" data-testid="payment-success-card">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mb-4">
            <Check className="w-6 h-6 text-green-600 dark:text-green-400" />
          </div>
          <CardTitle className="text-green-600 dark:text-green-400">Payment Successful!</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <div>
            <p data-testid="text-payment-success" className="text-sm text-muted-foreground">
              Your payment of {formatCurrency(amount)} has been processed successfully.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Thank you for your purchase of <strong>{productTitle}</strong> from {sellerName}.
            </p>
          </div>
          <Button 
            onClick={onCancel}
            variant="outline" 
            className="w-full"
            data-testid="button-close-payment"
          >
            Close
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto" data-testid="payment-form">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="w-5 h-5" />
          Complete Payment
        </CardTitle>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Product:</span>
            <span className="text-sm font-medium">{productTitle}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Seller:</span>
            <span className="text-sm font-medium">{sellerName}</span>
          </div>
          <Separator />
          <div className="flex justify-between items-center">
            <span className="text-base font-medium">Total Amount:</span>
            <Badge variant="secondary" className="text-base font-bold" data-testid={`payment-amount-${negotiationId}`}>
              <DollarSign className="w-4 h-4 mr-1" />
              {formatCurrency(amount)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <PaymentElement 
              options={{
                layout: "tabs"
              }}
            />
          </div>
          
          {errorMessage && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <AlertCircle className="w-4 h-4 text-destructive" />
              <span className="text-sm text-destructive" data-testid="text-payment-error">
                {errorMessage}
              </span>
            </div>
          )}

          <div className="space-y-3">
            <Button
              type="submit"
              disabled={!stripe || isLoading || paymentStatus === 'succeeded'}
              className="w-full"
              data-testid="button-confirm-payment"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing Payment...
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4 mr-2" />
                  Pay {formatCurrency(amount)}
                </>
              )}
            </Button>
            
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isLoading}
              className="w-full"
              data-testid="button-cancel-payment"
            >
              Cancel
            </Button>
          </div>
        </form>

        <div className="mt-4 text-xs text-muted-foreground text-center">
          <p>Your payment information is secure and encrypted.</p>
          <p>Powered by Stripe</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default function PaymentCheckout(props: PaymentCheckoutProps) {
  const [clientSecret, setClientSecret] = useState<string>("");
  const [isCreatingPayment, setIsCreatingPayment] = useState(true);
  const [initializationError, setInitializationError] = useState<string>("");
  const { toast } = useToast();

  useEffect(() => {
    // Create PaymentIntent as soon as the component loads
    const createPaymentIntent = async () => {
      try {
        setIsCreatingPayment(true);
        const response = await apiRequest("POST", `/api/negotiations/${props.negotiationId}/payment-intent`);
        const data = await response.json();
        
        if (response.ok) {
          setClientSecret(data.clientSecret);
        } else {
          throw new Error(data.error || "Failed to create payment intent");
        }
      } catch (error: any) {
        const errorMessage = error.message || "Failed to initialize payment";
        setInitializationError(errorMessage);
        props.onPaymentError?.(errorMessage);
        toast({
          title: "Payment Setup Failed",
          description: errorMessage,
          variant: "destructive",
        });
      } finally {
        setIsCreatingPayment(false);
      }
    };

    createPaymentIntent();
  }, [props.negotiationId, props.onPaymentError, toast]);

  if (isCreatingPayment) {
    return (
      <Card className="w-full max-w-md mx-auto" data-testid="payment-loading">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin mb-4" />
          <p className="text-sm text-muted-foreground">Setting up secure payment...</p>
        </CardContent>
      </Card>
    );
  }

  if (initializationError) {
    return (
      <Card className="w-full max-w-md mx-auto" data-testid="payment-error">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="w-8 h-8 text-destructive mb-4" />
          <p className="text-sm text-destructive mb-4" data-testid="text-payment-init-error">
            {initializationError}
          </p>
          <Button onClick={props.onCancel} variant="outline" data-testid="button-close-error">
            Close
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!clientSecret) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="w-8 h-8 text-destructive mb-4" />
          <p className="text-sm text-destructive">Unable to initialize payment</p>
        </CardContent>
      </Card>
    );
  }

  // Make SURE to wrap the form in <Elements> which provides the stripe context.
  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <CheckoutForm {...props} />
    </Elements>
  );
}