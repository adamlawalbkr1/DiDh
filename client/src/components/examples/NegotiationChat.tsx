import NegotiationChat from '../NegotiationChat';

// Mock data for demonstration
const mockMessages = [
  {
    id: 'msg-1',
    senderId: 'other-user',
    message: 'Hi! Interested in your iPhone. Is it still available?',
    timestamp: new Date(Date.now() - 3600000), // 1 hour ago
    type: 'message' as const,
  },
  {
    id: 'msg-2',
    senderId: 'current-user',
    message: 'Yes, it\'s still available! It\'s brand new, never opened.',
    timestamp: new Date(Date.now() - 3300000), // 55 minutes ago
    type: 'message' as const,
  },
  {
    id: 'msg-3',
    senderId: 'other-user',
    message: 'Would you consider a lower price?',
    timestamp: new Date(Date.now() - 3000000), // 50 minutes ago
    type: 'offer' as const,
    amount: '1100.00',
  },
  {
    id: 'msg-4',
    senderId: 'current-user',
    message: 'How about we meet in the middle?',
    timestamp: new Date(Date.now() - 2700000), // 45 minutes ago
    type: 'counter_offer' as const,
    amount: '1150.00',
  },
  {
    id: 'msg-5',
    senderId: 'other-user',
    message: 'That sounds fair. Can we meet today?',
    timestamp: new Date(Date.now() - 1800000), // 30 minutes ago
    type: 'message' as const,
  },
];

const mockOtherUser = {
  id: 'other-user',
  username: 'TechBuyer',
  isOnline: true,
};

export default function NegotiationChatExample() {
  return (
    <NegotiationChat
      productTitle="iPhone 15 Pro Max 256GB"
      currentPrice="1199.00"
      otherUser={mockOtherUser}
      messages={mockMessages}
      currentUserId="current-user"
      onSendMessage={(message) => console.log('Send message:', message)}
      onSendOffer={(amount) => console.log('Send offer:', amount)}
      onAcceptOffer={(messageId) => console.log('Accept offer:', messageId)}
      onClose={() => console.log('Close chat')}
    />
  );
}