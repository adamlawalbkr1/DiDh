import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet, Plus, Minus, TrendingUp, TrendingDown, Clock } from "lucide-react";

interface Transaction {
  id: string;
  type: 'credit' | 'debit';
  amount: string;
  description: string;
  timestamp: Date;
  status: 'completed' | 'pending' | 'failed';
}

interface WalletCardProps {
  balance: string;
  transactions?: Transaction[];
  onAddFunds?: () => void;
  onWithdraw?: () => void;
}

export default function WalletCard({ 
  balance, 
  transactions = [], 
  onAddFunds, 
  onWithdraw 
}: WalletCardProps) {
  const handleAddFunds = () => {
    console.log('Add funds clicked');
    onAddFunds?.();
  };

  const handleWithdraw = () => {
    console.log('Withdraw clicked');
    onWithdraw?.();
  };

  const getTransactionIcon = (type: string, status: string) => {
    if (status === 'pending') return <Clock className="w-4 h-4 text-yellow-500" />;
    return type === 'credit' ? 
      <TrendingUp className="w-4 h-4 text-green-500" /> : 
      <TrendingDown className="w-4 h-4 text-red-500" />;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'pending': return 'bg-yellow-500';
      case 'failed': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <Card className="w-full max-w-md" data-testid="card-wallet">
      <CardHeader className="flex flex-row items-center space-y-0 pb-2">
        <div className="flex items-center space-x-2">
          <Wallet className="w-5 h-5 text-primary" />
          <CardTitle className="text-lg">Wallet</CardTitle>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground mb-1">Available Balance</p>
          <p className="text-3xl font-bold text-primary" data-testid="text-balance">
            ${balance}
          </p>
        </div>
        
        <div className="flex space-x-2">
          <Button 
            className="flex-1" 
            onClick={handleAddFunds}
            data-testid="button-add-funds"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Funds
          </Button>
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={handleWithdraw}
            data-testid="button-withdraw"
          >
            <Minus className="w-4 h-4 mr-1" />
            Withdraw
          </Button>
        </div>
        
        {transactions.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Recent Transactions</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {transactions.slice(0, 5).map((transaction) => (
                <div 
                  key={transaction.id} 
                  className="flex items-center justify-between p-2 rounded-md hover-elevate"
                  data-testid={`transaction-${transaction.id}`}
                >
                  <div className="flex items-center space-x-3">
                    {getTransactionIcon(transaction.type, transaction.status)}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {transaction.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {transaction.timestamp.toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`text-sm font-medium ${
                      transaction.type === 'credit' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {transaction.type === 'credit' ? '+' : '-'}${transaction.amount}
                    </span>
                    <Badge 
                      className={`${getStatusColor(transaction.status)} text-white text-xs`}
                      data-testid={`status-${transaction.status}-${transaction.id}`}
                    >
                      {transaction.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}