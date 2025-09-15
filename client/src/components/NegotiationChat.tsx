import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useNegotiationSocket } from "@/hooks/useNegotiationSocket";
import { apiRequest } from "@/lib/queryClient";
import PaymentCheckout from "@/components/PaymentCheckout";
import { Send, DollarSign, X, Wifi, WifiOff, Clock, Check, AlertCircle, CreditCard } from "lucide-react";

interface NegotiationChatProps {
  negotiationId: string;
  productTitle: string;
  currentPrice: string;
  otherUser: {
    id: string;
    username: string;
    isOnline: boolean;
  };
  onClose?: () => void;
}

interface PaymentStatus {
  negotiationId: string;
  paymentStatus: string;
  negotiationStatus: string;
  amount: string;
  payment: {
    id: string;
    status: string;
    createdAt: string;
    completedAt?: string;
  } | null;
}

export default function NegotiationChat({
  negotiationId,
  productTitle,
  currentPrice,
  otherUser,
  onClose
}: NegotiationChatProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const [messageText, setMessageText] = useState("");
  const [offerAmount, setOfferAmount] = useState("");
  const [showOfferInput, setShowOfferInput] = useState(false);
  const [acceptingOfferId, setAcceptingOfferId] = useState<string | null>(null);
  const [rejectingOfferId, setRejectingOfferId] = useState<string | null>(null);
  
  // Payment-related state
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null);
  const [isLoadingPaymentStatus, setIsLoadingPaymentStatus] = useState(false);
  const [negotiationStatus, setNegotiationStatus] = useState<string>('active');
  const [acceptedOfferAmount, setAcceptedOfferAmount] = useState<string>('');

  // Real-time WebSocket integration
  const {
    isConnected,
    connectionState,
    messages,
    sendMessage,
    sendOffer,
    sendCounter,
    acceptOffer,
    rejectOffer
  } = useNegotiationSocket({
    negotiationId,
    autoConnect: true,
    maxMessages: 100
  });

  // Auto-scroll to latest messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch payment status when component mounts or negotiation changes
  useEffect(() => {
    fetchPaymentStatus();
  }, [negotiationId]);

  // Monitor messages for accepted offers to update negotiation status
  useEffect(() => {
    const acceptedMessage = messages.find(msg => msg.messageType === 'accept');
    if (acceptedMessage) {
      setNegotiationStatus('accepted');
      // Find the most recent offer amount
      const lastOffer = messages
        .filter(msg => (msg.messageType === 'offer' || msg.messageType === 'counter') && msg.amount)
        .pop();
      if (lastOffer && lastOffer.amount) {
        setAcceptedOfferAmount(lastOffer.amount.toString());
      }
    }
  }, [messages]);

  // Fetch payment status from backend
  const fetchPaymentStatus = async () => {
    try {
      setIsLoadingPaymentStatus(true);
      const response = await apiRequest("GET", `/api/negotiations/${negotiationId}/payment`);
      const data = await response.json();
      
      if (response.ok) {
        setPaymentStatus(data);
        setNegotiationStatus(data.negotiationStatus || 'active');
        if (data.amount) {
          setAcceptedOfferAmount(data.amount.toString());
        }
      }
    } catch (error) {
      console.error('Error fetching payment status:', error);
    } finally {
      setIsLoadingPaymentStatus(false);
    }
  };

  // Handle sending messages
  const handleSendMessage = async () => {
    if (!messageText.trim()) return;
    
    try {
      sendMessage(messageText.trim());
      setMessageText("");
      toast({
        title: "Message sent",
        description: "Your message has been delivered.",
      });
    } catch (error) {
      toast({
        title: "Failed to send message",
        description: "Please check your connection and try again.",
        variant: "destructive",
      });
    }
  };

  // Handle sending offers
  const handleSendOffer = async () => {
    const amount = parseFloat(offerAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid offer amount.",
        variant: "destructive",
      });
      return;
    }

    try {
      sendOffer(amount, `Offer: $${amount.toFixed(2)}`);
      setOfferAmount("");
      setShowOfferInput(false);
      toast({
        title: "Offer sent",
        description: `Your offer of $${amount.toFixed(2)} has been sent.`,
      });
    } catch (error) {
      toast({
        title: "Failed to send offer",
        description: "Please check your connection and try again.",
        variant: "destructive",
      });
    }
  };

  // Handle sending counter offers
  const handleSendCounter = async () => {
    const amount = parseFloat(offerAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid counter offer amount.",
        variant: "destructive",
      });
      return;
    }

    try {
      sendCounter(amount, `Counter offer: $${amount.toFixed(2)}`);
      setOfferAmount("");
      setShowOfferInput(false);
      toast({
        title: "Counter offer sent",
        description: `Your counter offer of $${amount.toFixed(2)} has been sent.`,
      });
    } catch (error) {
      toast({
        title: "Failed to send counter offer",
        description: "Please check your connection and try again.",
        variant: "destructive",
      });
    }
  };

  // Handle accepting offers
  const handleAcceptOffer = async (offerId: string) => {
    try {
      setAcceptingOfferId(offerId);
      acceptOffer(offerId);
      toast({
        title: "Offer accepted",
        description: "The offer has been accepted successfully.",
      });
    } catch (error) {
      toast({
        title: "Failed to accept offer",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setAcceptingOfferId(null);
    }
  };

  // Handle rejecting offers
  const handleRejectOffer = async (offerId: string, reason?: string) => {
    try {
      setRejectingOfferId(offerId);
      rejectOffer(offerId, reason || "Offer declined");
      toast({
        title: "Offer rejected",
        description: "The offer has been declined.",
      });
    } catch (error) {
      toast({
        title: "Failed to reject offer",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setRejectingOfferId(null);
    }
  };

  // Handle payment initiation
  const handlePayNow = () => {
    setShowPaymentDialog(true);
  };

  // Handle payment success
  const handlePaymentSuccess = async (paymentResult: any) => {
    toast({
      title: "Payment Successful!",
      description: `Payment of $${acceptedOfferAmount} completed successfully.`,
    });
    
    // Refresh payment status
    await fetchPaymentStatus();
    setShowPaymentDialog(false);
  };

  // Handle payment error
  const handlePaymentError = (error: string) => {
    toast({
      title: "Payment Failed",
      description: error,
      variant: "destructive",
    });
  };

  // Handle payment cancellation
  const handlePaymentCancel = () => {
    setShowPaymentDialog(false);
  };

  // Check if user can pay (is buyer and negotiation is accepted)
  const canPayNow = () => {
    return (
      user?.id && 
      user.id !== otherUser.id && // Current user is not the seller
      (negotiationStatus === 'accepted' || paymentStatus?.negotiationStatus === 'accepted') &&
      paymentStatus?.paymentStatus !== 'paid' &&
      acceptedOfferAmount &&
      parseFloat(acceptedOfferAmount) > 0
    );
  };

  // Get payment status display info
  const getPaymentStatusInfo = () => {
    if (!paymentStatus) return null;
    
    switch (paymentStatus.paymentStatus) {
      case 'paid':
        return {
          label: 'Payment Completed',
          variant: 'default' as const,
          icon: Check,
          className: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
        };
      case 'pending':
        return {
          label: 'Payment Pending',
          variant: 'secondary' as const,
          icon: Clock,
          className: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300'
        };
      case 'failed':
        return {
          label: 'Payment Failed',
          variant: 'destructive' as const,
          icon: AlertCircle,
          className: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'
        };
      default:
        return null;
    }
  };

  const handleClose = () => {
    onClose?.();
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  const getConnectionIcon = () => {
    switch (connectionState.status) {
      case 'connected':
        return <Wifi className="w-4 h-4 text-green-500" />;
      case 'connecting':
      case 'reconnecting':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <WifiOff className="w-4 h-4 text-gray-500" />;
    }
  };

  const getConnectionStatus = () => {
    switch (connectionState.status) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'reconnecting':
        return 'Reconnecting...';
      case 'error':
        return 'Connection Error';
      default:
        return 'Disconnected';
    }
  };

  const getMessageTypeIcon = (messageType: string) => {
    switch (messageType) {
      case 'offer':
      case 'counter':
        return <DollarSign className="w-4 h-4" />;
      case 'accept':
        return <Check className="w-4 h-4 text-green-500" />;
      case 'reject':
        return <X className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <Card className="w-full max-w-md h-[600px] flex flex-col" data-testid="card-negotiation">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center space-x-3">
          <Avatar className="w-8 h-8">
            <AvatarImage src="" alt={otherUser.username} />
            <AvatarFallback data-testid={`avatar-user-${otherUser.id}`}>
              {otherUser.username.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <CardTitle className="text-base" data-testid="text-other-username">
              {otherUser.username}
            </CardTitle>
            <div className="flex items-center space-x-2">
              <Badge 
                variant={otherUser.isOnline ? "default" : "secondary"}
                className="text-xs"
                data-testid={`status-${otherUser.isOnline ? 'online' : 'offline'}`}
              >
                {otherUser.isOnline ? 'Online' : 'Offline'}
              </Badge>
              <div className="flex items-center space-x-1" data-testid="status-connection">
                {getConnectionIcon()}
                <span className="text-xs text-muted-foreground">
                  {getConnectionStatus()}
                </span>
              </div>
            </div>
          </div>
        </div>
        <Button 
          variant="ghost" 
          size="icon"
          onClick={handleClose}
          data-testid="button-close-chat"
        >
          <X className="w-4 h-4" />
        </Button>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col space-y-3 min-h-0">
        {/* Product Info */}
        <div className="p-3 bg-muted rounded-md">
          <p className="text-sm font-medium truncate" data-testid="text-product-title">
            {productTitle}
          </p>
          <p className="text-sm text-muted-foreground">
            Listed at: <span className="font-medium" data-testid="text-current-price">{formatCurrency(parseFloat(currentPrice))}</span>
          </p>
          
          {/* Payment Status */}
          {paymentStatus && getPaymentStatusInfo() && (
            <div className="mt-2 flex items-center gap-2">
              {(() => {
                const statusInfo = getPaymentStatusInfo()!;
                const Icon = statusInfo.icon;
                return (
                  <Badge 
                    variant={statusInfo.variant}
                    className={statusInfo.className}
                    data-testid={`payment-status-${negotiationId}`}
                  >
                    <Icon className="w-3 h-3 mr-1" />
                    {statusInfo.label}
                  </Badge>
                );
              })()}
              {paymentStatus.paymentStatus === 'paid' && paymentStatus.amount && (
                <span className="text-sm text-muted-foreground">
                  ${parseFloat(paymentStatus.amount).toFixed(2)}
                </span>
              )}
            </div>
          )}
          
          {/* Pay Now Button */}
          {canPayNow() && (
            <div className="mt-3">
              <Button 
                onClick={handlePayNow}
                className="w-full"
                size="sm"
                data-testid="button-pay-now"
              >
                <CreditCard className="w-4 h-4 mr-2" />
                Pay Now - {formatCurrency(parseFloat(acceptedOfferAmount))}
              </Button>
            </div>
          )}
        </div>

        {/* Connection Error Alert */}
        {connectionState.status === 'error' && (
          <div className="p-2 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-sm text-destructive">
              Connection error: {connectionState.error || 'Unable to connect'}
            </p>
          </div>
        )}

        {/* Messages Container */}
        <ScrollArea className="flex-1 pr-4" data-testid="messages-container">
          <div className="space-y-3">
            {messages.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">
                  {isConnected ? 'Start the conversation!' : 'Connecting...'}
                </p>
              </div>
            ) : (
              messages.map((message, index) => {
                const isCurrentUser = message.senderId === user?.id;
                
                return (
                  <div
                    key={message.id || index}
                    className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
                    data-testid={`message-${message.id || index}`}
                  >
                    <div
                      className={`max-w-[80%] p-3 rounded-lg ${
                        isCurrentUser 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-muted'
                      }`}
                    >
                      {/* Offer/Counter-offer Messages */}
                      {(message.messageType === 'offer' || message.messageType === 'counter') && (
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            {getMessageTypeIcon(message.messageType)}
                            <span className="font-medium text-sm">
                              {message.messageType === 'offer' ? 'Offer' : 'Counter Offer'}
                            </span>
                          </div>
                          {message.amount && (
                            <div 
                              className="text-lg font-bold"
                              data-testid={`text-offer-amount-${message.id}`}
                            >
                              {formatCurrency(message.amount)}
                            </div>
                          )}
                          {message.content && (
                            <p className="text-sm">{message.content}</p>
                          )}
                          
                          {/* Action buttons for received offers */}
                          {!isCurrentUser && (message.messageType === 'offer' || message.messageType === 'counter') && (
                            <div className="flex space-x-2 mt-2">
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button 
                                    size="sm" 
                                    variant="default"
                                    disabled={acceptingOfferId === message.id || !isConnected}
                                    data-testid={`button-accept-offer-${message.id}`}
                                  >
                                    {acceptingOfferId === message.id ? 'Accepting...' : 'Accept'}
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Accept Offer</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to accept this offer of {message.amount ? formatCurrency(message.amount) : 'this amount'}?
                                      This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction 
                                      onClick={() => handleAcceptOffer(message.id)}
                                      data-testid={`button-confirm-accept-${message.id}`}
                                    >
                                      Accept Offer
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                              
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    disabled={rejectingOfferId === message.id || !isConnected}
                                    data-testid={`button-reject-offer-${message.id}`}
                                  >
                                    {rejectingOfferId === message.id ? 'Rejecting...' : 'Reject'}
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Reject Offer</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to reject this offer? You can still send a counter-offer afterwards.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction 
                                      onClick={() => handleRejectOffer(message.id)}
                                      data-testid={`button-confirm-reject-${message.id}`}
                                    >
                                      Reject Offer
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Accept/Reject Messages */}
                      {(message.messageType === 'accept' || message.messageType === 'reject') && (
                        <div className="flex items-center space-x-2">
                          {getMessageTypeIcon(message.messageType)}
                          <span className="font-medium text-sm">
                            {message.messageType === 'accept' ? 'Offer Accepted' : 'Offer Rejected'}
                          </span>
                        </div>
                      )}

                      {/* Regular Chat Messages */}
                      {message.messageType === 'chat' && message.content && (
                        <p className="text-sm" data-testid={`text-message-${message.id}`}>
                          {message.content}
                        </p>
                      )}

                      {/* Status Messages */}
                      {message.messageType === 'status' && (
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium">
                            Status: {message.content}
                          </span>
                        </div>
                      )}

                      {/* Timestamp */}
                      <p className={`text-xs mt-2 ${
                        isCurrentUser ? 'text-primary-foreground/70' : 'text-muted-foreground'
                      }`}>
                        {formatTimestamp(message.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Offer Input Section */}
        {showOfferInput && (
          <div className="space-y-3 p-3 bg-muted/50 rounded-md">
            <div className="flex items-center space-x-2">
              <DollarSign className="w-4 h-4" />
              <span className="text-sm font-medium">Make an Offer</span>
            </div>
            <div className="flex space-x-2">
              <Input
                type="number"
                placeholder="Enter amount"
                value={offerAmount}
                onChange={(e) => setOfferAmount(e.target.value)}
                disabled={!isConnected}
                data-testid="input-offer-amount"
              />
              <Button 
                onClick={handleSendOffer} 
                disabled={!isConnected || !offerAmount.trim()}
                data-testid="button-send-offer"
              >
                Send Offer
              </Button>
              <Button 
                onClick={handleSendCounter} 
                variant="outline"
                disabled={!isConnected || !offerAmount.trim()}
                data-testid="button-send-counter"
              >
                Counter
              </Button>
            </div>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setShowOfferInput(false)}
              data-testid="button-cancel-offer"
            >
              Cancel
            </Button>
          </div>
        )}

        {/* Message Input Section */}
        {!showOfferInput && (
          <div className="flex space-x-2">
            <Input
              placeholder="Type a message..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
              disabled={!isConnected}
              data-testid="input-message"
            />
            <Button 
              onClick={handleSendMessage}
              disabled={!isConnected || !messageText.trim()}
              data-testid="button-send-message"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex space-x-2">
          <Button 
            variant="outline" 
            onClick={() => setShowOfferInput(!showOfferInput)}
            disabled={!isConnected}
            data-testid="button-make-offer"
          >
            <DollarSign className="w-4 h-4 mr-1" />
            {showOfferInput ? 'Cancel Offer' : 'Make Offer'}
          </Button>
        </div>
      </CardContent>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Complete Payment</DialogTitle>
          </DialogHeader>
          {showPaymentDialog && acceptedOfferAmount && (
            <PaymentCheckout
              negotiationId={negotiationId}
              productTitle={productTitle}
              amount={acceptedOfferAmount}
              sellerName={otherUser.username}
              onPaymentSuccess={handlePaymentSuccess}
              onPaymentError={handlePaymentError}
              onCancel={handlePaymentCancel}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}