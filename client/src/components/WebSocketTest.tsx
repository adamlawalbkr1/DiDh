import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useNegotiationSocket, useGlobalWebSocketStatus } from '@/hooks/useNegotiationSocket';

interface WebSocketTestProps {
  negotiationId?: string;
}

export function WebSocketTest({ negotiationId = 'test-negotiation-123' }: WebSocketTestProps) {
  const [testMessage, setTestMessage] = useState('Hello from WebSocket!');
  const [testAmount, setTestAmount] = useState(100);
  
  const globalStatus = useGlobalWebSocketStatus();
  const {
    isConnected,
    connectionState,
    messages,
    sendMessage,
    sendOffer,
    sendCounter,
    acceptOffer,
    rejectOffer,
    connect,
    disconnect,
    clearMessages,
  } = useNegotiationSocket({ 
    negotiationId,
    autoConnect: true
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'default';
      case 'connecting': return 'outline';
      case 'reconnecting': return 'outline';
      case 'error': return 'destructive';
      default: return 'secondary';
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          WebSocket Test Component
          <Badge variant={getStatusColor(connectionState.status) as any}>
            {connectionState.status.toUpperCase()}
          </Badge>
        </CardTitle>
        <div className="text-sm text-muted-foreground">
          <div>Global Status: <Badge variant={globalStatus.isConnected ? 'default' : 'secondary'} data-testid="badge-global-status">
            {globalStatus.isConnected ? 'Connected' : 'Disconnected'}
          </Badge></div>
          <div>Negotiation ID: <code>{negotiationId}</code></div>
          {connectionState.error && (
            <div className="text-destructive">Error: {connectionState.error}</div>
          )}
          {connectionState.retryCount > 0 && (
            <div>Retry Count: {connectionState.retryCount}</div>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Connection Controls */}
        <div className="flex gap-2 flex-wrap">
          <Button 
            onClick={connect} 
            disabled={isConnected || connectionState.status === 'connecting'}
            data-testid="button-connect"
          >
            Connect
          </Button>
          <Button 
            onClick={disconnect} 
            variant="outline" 
            disabled={!isConnected}
            data-testid="button-disconnect"
          >
            Disconnect
          </Button>
          <Button 
            onClick={clearMessages} 
            variant="outline"
            data-testid="button-clear-messages"
          >
            Clear Messages
          </Button>
        </div>

        {/* Message Testing */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Test message"
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              disabled={!isConnected}
              data-testid="input-test-message"
            />
            <Button 
              onClick={() => sendMessage(testMessage)}
              disabled={!isConnected || !testMessage.trim()}
              data-testid="button-send-message"
            >
              Send Message
            </Button>
          </div>
        </div>

        {/* Offer Testing */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="Amount"
              value={testAmount}
              onChange={(e) => setTestAmount(Number(e.target.value))}
              disabled={!isConnected}
              data-testid="input-test-amount"
            />
            <Button 
              onClick={() => sendOffer(testAmount, `Offer for $${testAmount}`)}
              disabled={!isConnected || testAmount <= 0}
              data-testid="button-send-offer"
            >
              Send Offer
            </Button>
            <Button 
              onClick={() => sendCounter(testAmount - 10, `Counter offer for $${testAmount - 10}`)}
              disabled={!isConnected || testAmount <= 10}
              data-testid="button-send-counter"
            >
              Counter
            </Button>
          </div>
        </div>

        {/* Accept/Reject Testing */}
        <div className="flex gap-2">
          <Button 
            onClick={acceptOffer}
            disabled={!isConnected}
            variant="default"
            data-testid="button-accept-offer"
          >
            Accept Offer
          </Button>
          <Button 
            onClick={() => rejectOffer('Not interested, thanks!')}
            disabled={!isConnected}
            variant="destructive"
            data-testid="button-reject-offer"
          >
            Reject Offer
          </Button>
        </div>

        {/* Messages Display */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Messages ({messages.length})</h3>
          <div className="max-h-48 overflow-y-auto space-y-1 border rounded p-2" data-testid="messages-container">
            {messages.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">
                No messages yet. Connect and send a test message!
              </div>
            ) : (
              messages.map((message, index) => (
                <div 
                  key={message.id || index} 
                  className="text-sm p-2 bg-muted rounded"
                  data-testid={`message-${index}`}
                >
                  <div className="font-medium text-xs text-muted-foreground mb-1">
                    {message.senderName} • {message.messageType} • {new Date(message.createdAt).toLocaleTimeString()}
                  </div>
                  <div>
                    {message.content && <span>{message.content}</span>}
                    {message.amount && <span className="font-bold text-primary"> ${message.amount}</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default WebSocketTest;