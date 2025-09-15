import WalletCard from '../WalletCard';

// Mock transaction data
const mockTransactions = [
  {
    id: 'tx-1',
    type: 'credit' as const,
    amount: '1199.00',
    description: 'Payment received - iPhone 15 Pro',
    timestamp: new Date(Date.now() - 86400000), // 1 day ago
    status: 'completed' as const,
  },
  {
    id: 'tx-2',
    type: 'debit' as const,
    amount: '850.00',
    description: 'Purchase - MacBook Pro',
    timestamp: new Date(Date.now() - 172800000), // 2 days ago
    status: 'completed' as const,
  },
  {
    id: 'tx-3',
    type: 'credit' as const,
    amount: '500.00',
    description: 'Funds added via Stripe',
    timestamp: new Date(Date.now() - 259200000), // 3 days ago
    status: 'pending' as const,
  },
  {
    id: 'tx-4',
    type: 'debit' as const,
    amount: '25.00',
    description: 'Transaction fee',
    timestamp: new Date(Date.now() - 345600000), // 4 days ago
    status: 'failed' as const,
  },
];

export default function WalletCardExample() {
  return (
    <WalletCard 
      balance="2,847.50"
      transactions={mockTransactions}
      onAddFunds={() => console.log('Add funds triggered')}
      onWithdraw={() => console.log('Withdraw triggered')}
    />
  );
}