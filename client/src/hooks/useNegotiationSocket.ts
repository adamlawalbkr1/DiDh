import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { queryClient } from '@/lib/queryClient';
import { getNegotiationWebSocket, type NegotiationWebSocket } from '@/lib/ws';
import { useToast } from '@/hooks/use-toast';
import type { WSBroadcastMessage } from '@shared/schema';

interface NegotiationMessage {
  id: string;
  senderId: string;
  senderName: string;
  messageType: 'chat' | 'offer' | 'counter' | 'accept' | 'reject' | 'status';
  content?: string;
  amount?: number;
  createdAt: string;
}

interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
  error?: string;
  retryCount: number;
}

interface UserPresence {
  userId: string;
  username?: string;
  isOnline: boolean;
  lastSeen?: string;
}

interface StatusUpdate {
  negotiationId: string;
  status: string;
  changedBy: string;
  changedByName?: string;
  timestamp: string;
  context?: string;
}

interface UseNegotiationSocketReturn {
  // Connection state
  isConnected: boolean;
  connectionState: ConnectionState;
  
  // Message handling
  messages: NegotiationMessage[];
  
  // Presence tracking
  userPresence: Record<string, UserPresence>;
  
  // Status updates
  lastStatusUpdate?: StatusUpdate;
  
  // Actions
  sendMessage: (content: string) => void;
  sendOffer: (amount: number, message?: string) => void;
  sendCounter: (amount: number, message?: string) => void;
  acceptOffer: (offerId?: string) => void;
  rejectOffer: (offerId?: string, message?: string) => void;
  updateStatus: (status: 'active' | 'completed' | 'cancelled') => void;
  
  // Presence actions
  requestPresence: (userIds?: string[]) => void;
  updatePresence: (isOnline: boolean) => void;
  
  // Utilities
  connect: () => void;
  disconnect: () => void;
  clearMessages: () => void;
}

interface UseNegotiationSocketOptions {
  negotiationId?: string;
  autoConnect?: boolean;
  maxMessages?: number;
}

export function useNegotiationSocket(
  options: UseNegotiationSocketOptions = {}
): UseNegotiationSocketReturn {
  const { negotiationId, autoConnect = true, maxMessages = 100 } = options;
  const { isAuthenticated, user } = useAuth();
  
  // WebSocket instance and state
  const wsRef = useRef<NegotiationWebSocket | null>(null);
  const [wsReady, setWsReady] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: 'disconnected',
    retryCount: 0
  });
  const [messages, setMessages] = useState<NegotiationMessage[]>([]);
  const [userPresence, setUserPresence] = useState<Record<string, UserPresence>>({});
  const [lastStatusUpdate, setLastStatusUpdate] = useState<StatusUpdate | undefined>(undefined);
  
  // Track current negotiation room
  const currentNegotiationRef = useRef<string | null>(null);
  
  // Initialize toast
  const { toast } = useToast();

  // Initialize WebSocket instance
  useEffect(() => {
    if (isAuthenticated && user) {
      wsRef.current = getNegotiationWebSocket();
      setWsReady(true);
    } else {
      setWsReady(false);
    }
    
    return () => {
      // Cleanup on unmount - but don't destroy the singleton instance
      if (currentNegotiationRef.current && wsRef.current) {
        wsRef.current.leaveNegotiation(currentNegotiationRef.current);
      }
    };
  }, [isAuthenticated, user]);

  // Handle connection state updates
  useEffect(() => {
    if (!wsReady || !wsRef.current) return;
    
    const unsubscribe = wsRef.current.onConnectionChange((state) => {
      setConnectionState(state);
    });
    
    return unsubscribe;
  }, [wsReady]);

  // Handle incoming messages
  useEffect(() => {
    if (!wsReady || !wsRef.current) return;
    
    const handleMessage = (data: any) => {
      const messageType = data.type;
      
      // Handle negotiation messages
      if (messageType === 'negotiation_update' && negotiationId && data.negotiationId === negotiationId) {
        const newMessage: NegotiationMessage = {
          id: data.message.id,
          senderId: data.message.senderId,
          senderName: data.message.senderName,
          messageType: data.message.messageType,
          content: data.message.content,
          amount: data.message.amount,
          createdAt: data.message.createdAt,
        };
        
        setMessages(prev => {
          const updated = [...prev, newMessage];
          return updated.slice(-maxMessages);
        });
        
        queryClient.invalidateQueries({ queryKey: ['/api/negotiations', negotiationId] });
        queryClient.invalidateQueries({ queryKey: ['/api/negotiations'] });
      }
      
      // Handle presence updates
      else if (messageType === 'presence_update') {
        const { userId, username, isOnline, lastSeen } = data;
        setUserPresence(prev => ({
          ...prev,
          [userId]: { userId, username, isOnline, lastSeen }
        }));
      }
      
      // Handle presence data response
      else if (messageType === 'presence_data') {
        const { users } = data.data;
        const presenceMap: Record<string, UserPresence> = {};
        users.forEach((user: any) => {
          presenceMap[user.id] = {
            userId: user.id,
            username: user.username,
            isOnline: user.isOnline,
            lastSeen: user.lastSeen
          };
        });
        setUserPresence(prev => ({ ...prev, ...presenceMap }));
      }
      
      // Handle negotiation status updates
      else if (messageType === 'negotiation_status_update') {
        const statusUpdate: StatusUpdate = {
          negotiationId: data.negotiationId,
          status: data.status,
          changedBy: data.changedBy,
          changedByName: data.changedByName,
          timestamp: data.timestamp,
          context: data.context
        };
        
        setLastStatusUpdate(statusUpdate);
        
        // Show toast notification
        if (data.changedBy !== user?.id) {
          toast({
            title: 'Negotiation Status Updated',
            description: `${data.changedByName || 'Someone'} changed the status to ${data.status}`,
          });
        }
        
        // Invalidate cache
        queryClient.invalidateQueries({ queryKey: ['/api/negotiations', data.negotiationId] });
        queryClient.invalidateQueries({ queryKey: ['/api/negotiations'] });
      }
    };
    
    const unsubscribe = wsRef.current.subscribe(handleMessage);
    return unsubscribe;
  }, [wsReady, negotiationId, maxMessages]);

  // Handle negotiation room management
  useEffect(() => {
    if (!wsReady || !wsRef.current || !negotiationId || !wsRef.current.isConnected()) {
      return;
    }
    
    // Leave previous room if we were in one
    if (currentNegotiationRef.current && currentNegotiationRef.current !== negotiationId) {
      wsRef.current.leaveNegotiation(currentNegotiationRef.current);
    }
    
    // Join new negotiation room
    if (negotiationId !== currentNegotiationRef.current) {
      wsRef.current.joinNegotiation(negotiationId);
      currentNegotiationRef.current = negotiationId;
      
      // Clear messages when switching negotiations
      setMessages([]);
    }
    
    return () => {
      if (currentNegotiationRef.current && wsRef.current) {
        wsRef.current.leaveNegotiation(currentNegotiationRef.current);
      }
    };
  }, [wsReady, negotiationId, connectionState.status]);

  // Auto-connect when authenticated
  useEffect(() => {
    if (autoConnect && isAuthenticated && wsReady && wsRef.current && !wsRef.current.isConnected()) {
      wsRef.current.connect();
    } else if (!isAuthenticated && wsRef.current) {
      wsRef.current.disconnect();
      setMessages([]);
    }
  }, [isAuthenticated, autoConnect, wsReady]);

  // Action methods
  const sendMessage = useCallback((content: string) => {
    if (!wsRef.current || !negotiationId) {
      console.warn('Cannot send message: WebSocket not ready or no negotiation ID');
      return;
    }
    wsRef.current.sendMessage(negotiationId, content);
  }, [negotiationId]);

  const sendOffer = useCallback((amount: number, message?: string) => {
    if (!wsRef.current || !negotiationId) {
      console.warn('Cannot send offer: WebSocket not ready or no negotiation ID');
      return;
    }
    wsRef.current.sendOffer(negotiationId, amount, message);
  }, [negotiationId]);

  const sendCounter = useCallback((amount: number, message?: string) => {
    if (!wsRef.current || !negotiationId) {
      console.warn('Cannot send counter: WebSocket not ready or no negotiation ID');
      return;
    }
    wsRef.current.sendCounter(negotiationId, amount, message);
  }, [negotiationId]);

  const acceptOffer = useCallback((offerId?: string) => {
    if (!wsRef.current || !negotiationId) {
      console.warn('Cannot accept offer: WebSocket not ready or no negotiation ID');
      return;
    }
    wsRef.current.acceptOffer(negotiationId, offerId);
  }, [negotiationId]);

  const rejectOffer = useCallback((offerId?: string, message?: string) => {
    if (!wsRef.current || !negotiationId) {
      console.warn('Cannot reject offer: WebSocket not ready or no negotiation ID');
      return;
    }
    wsRef.current.rejectOffer(negotiationId, offerId, message);
  }, [negotiationId]);

  const updateStatus = useCallback((status: 'active' | 'completed' | 'cancelled') => {
    if (!wsRef.current || !negotiationId) {
      console.warn('Cannot update status: WebSocket not ready or no negotiation ID');
      return;
    }
    wsRef.current.updateNegotiationStatus(negotiationId, status);
  }, [negotiationId]);

  const connect = useCallback(() => {
    if (!wsRef.current) {
      console.warn('Cannot connect: WebSocket not initialized');
      return;
    }
    wsRef.current.connect();
  }, []);

  const disconnect = useCallback(() => {
    if (!wsRef.current) return;
    wsRef.current.disconnect();
    setMessages([]);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  // Presence action methods
  const requestPresence = useCallback((userIds?: string[]) => {
    if (!wsRef.current) {
      console.warn('Cannot request presence: WebSocket not ready');
      return;
    }
    
    const message = {
      type: 'request_presence',
      userIds
    };
    
    wsRef.current.send(JSON.stringify(message));
  }, []);

  const updatePresence = useCallback((isOnline: boolean) => {
    if (!wsRef.current || !user?.id) {
      console.warn('Cannot update presence: WebSocket not ready or no user');
      return;
    }
    
    const message = {
      type: 'presence_update',
      userId: user.id,
      isOnline
    };
    
    wsRef.current.send(JSON.stringify(message));
  }, [user?.id]);

  return {
    isConnected: connectionState.status === 'connected',
    connectionState,
    messages,
    userPresence,
    lastStatusUpdate,
    sendMessage,
    sendOffer,
    sendCounter,
    acceptOffer,
    rejectOffer,
    updateStatus,
    requestPresence,
    updatePresence,
    connect,
    disconnect,
    clearMessages,
  };
}

// Hook for managing global WebSocket connection without negotiation-specific features
export function useWebSocketConnection() {
  const { isAuthenticated } = useAuth();
  const wsRef = useRef<NegotiationWebSocket | null>(null);
  const [wsReady, setWsReady] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: 'disconnected',
    retryCount: 0
  });

  // Initialize WebSocket instance
  useEffect(() => {
    if (isAuthenticated) {
      wsRef.current = getNegotiationWebSocket();
      setWsReady(true);
    } else {
      setWsReady(false);
    }
  }, [isAuthenticated]);

  // Handle connection state updates
  useEffect(() => {
    if (!wsReady || !wsRef.current) return;
    
    const unsubscribe = wsRef.current.onConnectionChange((state) => {
      setConnectionState(state);
    });
    
    return unsubscribe;
  }, [wsReady]);

  // Auto-connect when authenticated
  useEffect(() => {
    if (isAuthenticated && wsReady && wsRef.current && !wsRef.current.isConnected()) {
      wsRef.current.connect();
    } else if (!isAuthenticated && wsRef.current) {
      wsRef.current.disconnect();
    }
  }, [isAuthenticated, wsReady]);

  const connect = useCallback(() => {
    if (!wsRef.current) return;
    wsRef.current.connect();
  }, []);

  const disconnect = useCallback(() => {
    if (!wsRef.current) return;
    wsRef.current.disconnect();
  }, []);

  return {
    isConnected: connectionState.status === 'connected',
    connectionState,
    connect,
    disconnect,
  };
}

// Context provider for global WebSocket state (optional - can be added later if needed)
// This would be useful for displaying global connection status in the UI
export function useGlobalWebSocketStatus() {
  const { connectionState } = useWebSocketConnection();
  
  return {
    isConnected: connectionState.status === 'connected',
    isConnecting: connectionState.status === 'connecting',
    isReconnecting: connectionState.status === 'reconnecting',
    hasError: connectionState.status === 'error',
    error: connectionState.error,
    retryCount: connectionState.retryCount,
  };
}