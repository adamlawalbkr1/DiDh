import { apiRequest } from '@/lib/queryClient';
import { wsMessageSchema, wsBroadcastSchema, type WSMessage, type WSBroadcastMessage } from '@shared/schema';

interface WebSocketToken {
  token: string;
  expiresIn: number;
  user: {
    id: string;
    username: string;
  };
}

interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
  error?: string;
  retryCount: number;
}

type MessageHandler = (message: WSBroadcastMessage) => void;
type ConnectionHandler = (state: ConnectionState) => void;

export class NegotiationWebSocket {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private tokenExpiresAt: number = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private tokenRefreshTimeout: NodeJS.Timeout | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private connectionHandlers: Set<ConnectionHandler> = new Set();
  private connectionState: ConnectionState = {
    status: 'disconnected',
    retryCount: 0
  };
  private currentNegotiationRooms: Set<string> = new Set();
  private isUserDisconnected = false;

  constructor() {
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
    
    // Listen for browser events
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('beforeunload', this.handleBeforeUnload);
  }

  // Public API Methods
  async connect(): Promise<void> {
    if (this.isConnecting() || this.isConnected()) {
      return;
    }

    this.isUserDisconnected = false;
    await this.establishConnection();
  }

  disconnect(): void {
    this.isUserDisconnected = true;
    this.clearReconnectTimeout();
    this.clearTokenRefreshTimeout();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.updateConnectionState({
      status: 'disconnected',
      retryCount: 0
    });
  }

  send(message: WSMessage): void {
    if (!this.isConnected() || !this.ws) {
      console.warn('WebSocket not connected, cannot send message:', message);
      return;
    }

    try {
      // Validate message format
      const validatedMessage = wsMessageSchema.parse(message);
      this.ws.send(JSON.stringify(validatedMessage));
    } catch (error) {
      console.error('Invalid message format:', error);
    }
  }

  subscribe(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onConnectionChange(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    // Immediately call handler with current state
    handler(this.connectionState);
    return () => this.connectionHandlers.delete(handler);
  }

  isConnected(): boolean {
    return this.connectionState.status === 'connected';
  }

  isConnecting(): boolean {
    return this.connectionState.status === 'connecting';
  }

  getConnectionState(): ConnectionState {
    return { ...this.connectionState };
  }

  // Negotiation-Specific API
  joinNegotiation(negotiationId: string): void {
    this.currentNegotiationRooms.add(negotiationId);
    this.send({
      type: 'join_negotiation',
      negotiationId
    });
  }

  leaveNegotiation(negotiationId: string): void {
    this.currentNegotiationRooms.delete(negotiationId);
    this.send({
      type: 'leave_negotiation',
      negotiationId
    });
  }

  sendMessage(negotiationId: string, content: string): void {
    this.send({
      type: 'negotiation_message',
      negotiationId,
      content
    });
  }

  sendOffer(negotiationId: string, amount: number, message?: string): void {
    this.send({
      type: 'negotiation_offer',
      negotiationId,
      amount,
      message
    });
  }

  sendCounter(negotiationId: string, amount: number, message?: string): void {
    this.send({
      type: 'negotiation_counter',
      negotiationId,
      amount,
      message
    });
  }

  acceptOffer(negotiationId: string, offerId?: string): void {
    this.send({
      type: 'negotiation_accept',
      negotiationId,
      offerId
    });
  }

  rejectOffer(negotiationId: string, offerId?: string, message?: string): void {
    this.send({
      type: 'negotiation_reject',
      negotiationId,
      offerId,
      message
    });
  }

  updateNegotiationStatus(negotiationId: string, status: 'active' | 'completed' | 'cancelled'): void {
    this.send({
      type: 'negotiation_status',
      negotiationId,
      status
    });
  }

  // Private Methods
  private async establishConnection(): Promise<void> {
    try {
      this.updateConnectionState({
        status: 'connecting',
        retryCount: this.connectionState.retryCount
      });

      // Get or refresh WebSocket token
      await this.ensureValidToken();

      if (!this.token) {
        throw new Error('Failed to obtain WebSocket token');
      }

      const wsUrl = this.getWebSocketUrl();
      this.ws = new WebSocket(`${wsUrl}?token=${this.token}`);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.updateConnectionState({
          status: 'connected',
          retryCount: 0
        });

        // Rejoin previous negotiation rooms
        this.currentNegotiationRooms.forEach(negotiationId => {
          this.send({
            type: 'join_negotiation',
            negotiationId
          });
        });
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        this.ws = null;
        
        if (!this.isUserDisconnected) {
          this.scheduleReconnect();
        } else {
          this.updateConnectionState({
            status: 'disconnected',
            retryCount: 0
          });
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.updateConnectionState({
          status: 'error',
          error: 'Connection error',
          retryCount: this.connectionState.retryCount
        });
      };

    } catch (error) {
      console.error('Failed to establish WebSocket connection:', error);
      this.updateConnectionState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Connection failed',
        retryCount: this.connectionState.retryCount
      });
      
      if (!this.isUserDisconnected) {
        this.scheduleReconnect();
      }
    }
  }

  private async ensureValidToken(): Promise<void> {
    const now = Date.now();
    
    // Check if token is still valid (with 2-minute buffer)
    if (this.token && this.tokenExpiresAt > now + (2 * 60 * 1000)) {
      return;
    }

    try {
      const response = await apiRequest('POST', '/api/ws-token');
      const tokenData: WebSocketToken = await response.json();
      
      this.token = tokenData.token;
      this.tokenExpiresAt = now + tokenData.expiresIn;
      
      // Schedule token refresh 2 minutes before expiry
      this.clearTokenRefreshTimeout();
      const refreshIn = tokenData.expiresIn - (2 * 60 * 1000);
      
      if (refreshIn > 0) {
        this.tokenRefreshTimeout = setTimeout(() => {
          if (this.isConnected()) {
            this.refreshToken();
          }
        }, refreshIn);
      }
      
    } catch (error) {
      console.error('Failed to obtain WebSocket token:', error);
      this.token = null;
      this.tokenExpiresAt = 0;
      throw error;
    }
  }

  private async refreshToken(): Promise<void> {
    try {
      await this.ensureValidToken();
      
      // If token was refreshed and we're connected, we need to reconnect with new token
      if (this.isConnected()) {
        console.log('Refreshing WebSocket connection with new token');
        this.disconnect();
        await this.connect();
      }
    } catch (error) {
      console.error('Failed to refresh WebSocket token:', error);
      // Force reconnection on token refresh failure
      if (this.isConnected()) {
        this.disconnect();
        this.scheduleReconnect();
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.isUserDisconnected) {
      return;
    }

    this.clearReconnectTimeout();
    
    const retryCount = this.connectionState.retryCount + 1;
    const delay = Math.min(Math.pow(2, retryCount) * 1000, 30000); // Max 30 seconds
    
    this.updateConnectionState({
      status: 'reconnecting',
      retryCount
    });

    console.log(`Scheduling reconnect in ${delay}ms (attempt ${retryCount})`);
    
    this.reconnectTimeout = setTimeout(async () => {
      if (!this.isUserDisconnected) {
        await this.establishConnection();
      }
    }, delay);
  }

  private handleMessage(data: string): void {
    try {
      const rawMessage = JSON.parse(data);
      const message = wsBroadcastSchema.parse(rawMessage);
      
      // Notify all message handlers
      this.messageHandlers.forEach(handler => {
        try {
          handler(message);
        } catch (error) {
          console.error('Error in message handler:', error);
        }
      });
      
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error, data);
    }
  }

  private updateConnectionState(newState: Partial<ConnectionState>): void {
    this.connectionState = {
      ...this.connectionState,
      ...newState
    };
    
    // Notify all connection handlers
    this.connectionHandlers.forEach(handler => {
      try {
        handler(this.connectionState);
      } catch (error) {
        console.error('Error in connection handler:', error);
      }
    });
  }

  private getWebSocketUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    
    // Use current host for all environments to work in hosted dev (Replit, etc.)
    // Allow optional VITE_WS_URL override for local debugging if needed
    const host = import.meta.env.VITE_WS_URL || window.location.host;
    return `${protocol}//${host}/ws`;
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private clearTokenRefreshTimeout(): void {
    if (this.tokenRefreshTimeout) {
      clearTimeout(this.tokenRefreshTimeout);
      this.tokenRefreshTimeout = null;
    }
  }

  private handleVisibilityChange(): void {
    if (document.visibilityState === 'visible' && !this.isUserDisconnected) {
      // Page became visible, check connection
      if (!this.isConnected() && !this.isConnecting()) {
        console.log('Page visible, reconnecting WebSocket');
        this.connect();
      }
    }
  }

  private handleBeforeUnload(): void {
    // Clean disconnect on page unload
    if (this.ws) {
      this.ws.close();
    }
  }

  // Cleanup method for React component unmount
  destroy(): void {
    this.disconnect();
    this.messageHandlers.clear();
    this.connectionHandlers.clear();
    this.currentNegotiationRooms.clear();
    
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
  }
}

// Singleton instance for application-wide use
let wsInstance: NegotiationWebSocket | null = null;

export function getNegotiationWebSocket(): NegotiationWebSocket {
  if (!wsInstance) {
    wsInstance = new NegotiationWebSocket();
  }
  return wsInstance;
}

// Cleanup function for app shutdown
export function cleanupWebSocket(): void {
  if (wsInstance) {
    wsInstance.destroy();
    wsInstance = null;
  }
}