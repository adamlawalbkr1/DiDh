import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import AppHeader from "@/components/AppHeader";
import HomePage from "@/pages/HomePage";
import Landing from "@/pages/Landing";
import NotFound from "@/pages/not-found";

function Router() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <Switch>
      {!isAuthenticated ? (
        <Route path="/" component={Landing} />
      ) : (
        <>
          <Route path="/" component={HomePage} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthenticatedApp />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function AuthenticatedApp() {
  const { isAuthenticated, user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {isAuthenticated && user && (
        <AppHeader
          user={{
            id: user.id,
            username: user.username || user.firstName || user.email || 'User',
            walletBalance: user.walletBalance || '0.00',
            isOnline: user.isOnline || false,
          }}
          unreadNotifications={3}
          unreadMessages={7}
          onSearch={(query) => console.log('Global search:', query)}
          onCreateProduct={() => console.log('Create product from header')}
          onWalletClick={() => console.log('Wallet from header')}
          onProfileClick={() => console.log('Profile from header')}
          onNotificationsClick={() => console.log('Notifications from header')}
          onMessagesClick={() => console.log('Messages from header')}
          onMenuClick={() => console.log('Menu from header')}
        />
      )}
      <Router />
    </div>
  );
}

export default App;
