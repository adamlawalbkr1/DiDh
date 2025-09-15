import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { 
  Search, 
  Bell, 
  Plus, 
  MessageCircle, 
  Wallet,
  User,
  Menu
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";

interface AppHeaderProps {
  user?: {
    id: string;
    username: string;
    walletBalance: string;
    isOnline: boolean;
  };
  unreadNotifications?: number;
  unreadMessages?: number;
  onSearch?: (query: string) => void;
  onCreateProduct?: () => void;
  onWalletClick?: () => void;
  onProfileClick?: () => void;
  onNotificationsClick?: () => void;
  onMessagesClick?: () => void;
  onMenuClick?: () => void;
}

export default function AppHeader({
  user,
  unreadNotifications = 0,
  unreadMessages = 0,
  onSearch,
  onCreateProduct,
  onWalletClick,
  onProfileClick,
  onNotificationsClick,
  onMessagesClick,
  onMenuClick
}: AppHeaderProps) {
  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const query = formData.get('search') as string;
    console.log('Search submitted:', query);
    onSearch?.(query);
  };

  const handleCreateProduct = () => {
    console.log('Create product clicked');
    onCreateProduct?.();
  };

  const handleWalletClick = () => {
    console.log('Wallet clicked');
    onWalletClick?.();
  };

  const handleProfileClick = () => {
    console.log('Profile clicked');
    onProfileClick?.();
  };

  const handleNotificationsClick = () => {
    console.log('Notifications clicked');
    onNotificationsClick?.();
  };

  const handleMessagesClick = () => {
    console.log('Messages clicked');
    onMessagesClick?.();
  };

  const handleMenuClick = () => {
    console.log('Menu clicked');
    onMenuClick?.();
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Left section - Logo and menu */}
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={handleMenuClick}
              data-testid="button-menu"
            >
              <Menu className="w-5 h-5" />
            </Button>
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-lg">P</span>
              </div>
              <h1 className="font-bold text-xl hidden sm:block" data-testid="text-app-title">
                PeerMarket
              </h1>
            </div>
          </div>

          {/* Center section - Search */}
          <div className="flex-1 max-w-md mx-4">
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                name="search"
                placeholder="Search products, sellers, or locations..."
                className="pl-10 pr-4"
                data-testid="input-search"
              />
            </form>
          </div>

          {/* Right section - Actions and user */}
          <div className="flex items-center space-x-2">
            {/* Create Product Button */}
            <Button
              onClick={handleCreateProduct}
              className="hidden sm:flex"
              data-testid="button-create-product"
            >
              <Plus className="w-4 h-4 mr-1" />
              List Item
            </Button>

            {user && (
              <>
                {/* Wallet */}
                <Button
                  variant="ghost"
                  onClick={handleWalletClick}
                  className="hidden md:flex items-center space-x-2"
                  data-testid="button-wallet"
                >
                  <Wallet className="w-4 h-4" />
                  <span className="font-medium" data-testid="text-wallet-balance">
                    ${user.walletBalance}
                  </span>
                </Button>

                {/* Notifications */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative"
                  onClick={handleNotificationsClick}
                  data-testid="button-notifications"
                >
                  <Bell className="w-4 h-4" />
                  {unreadNotifications > 0 && (
                    <Badge 
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full p-0 flex items-center justify-center text-xs"
                      data-testid="badge-notification-count"
                    >
                      {unreadNotifications > 99 ? '99+' : unreadNotifications}
                    </Badge>
                  )}
                </Button>

                {/* Messages */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative"
                  onClick={handleMessagesClick}
                  data-testid="button-messages"
                >
                  <MessageCircle className="w-4 h-4" />
                  {unreadMessages > 0 && (
                    <Badge 
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full p-0 flex items-center justify-center text-xs"
                      data-testid="badge-message-count"
                    >
                      {unreadMessages > 99 ? '99+' : unreadMessages}
                    </Badge>
                  )}
                </Button>

                {/* User Profile */}
                <Button
                  variant="ghost"
                  className="flex items-center space-x-2 pl-2"
                  onClick={handleProfileClick}
                  data-testid="button-profile"
                >
                  <Avatar className="w-7 h-7">
                    <AvatarImage src="" alt={user.username} />
                    <AvatarFallback className="text-sm">
                      {user.username.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden lg:block font-medium" data-testid="text-username">
                    {user.username}
                  </span>
                  <div className={`w-2 h-2 rounded-full ${
                    user.isOnline ? 'bg-green-500' : 'bg-gray-400'
                  } hidden lg:block`} data-testid={`status-${user.isOnline ? 'online' : 'offline'}`} />
                </Button>
              </>
            )}

            {!user && (
              <>
                <Button variant="ghost" data-testid="button-login">
                  Sign In
                </Button>
                <Button data-testid="button-signup">
                  Sign Up
                </Button>
              </>
            )}

            {/* Theme Toggle */}
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}