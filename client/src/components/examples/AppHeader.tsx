import AppHeader from '../AppHeader';

// Mock user data
const mockUser = {
  id: 'user-1',
  username: 'TechTrader',
  walletBalance: '2,847.50',
  isOnline: true,
};

export default function AppHeaderExample() {
  return (
    <div className="w-full">
      <AppHeader
        user={mockUser}
        unreadNotifications={3}
        unreadMessages={7}
        onSearch={(query) => console.log('Search:', query)}
        onCreateProduct={() => console.log('Create product')}
        onWalletClick={() => console.log('Wallet clicked')}
        onProfileClick={() => console.log('Profile clicked')}
        onNotificationsClick={() => console.log('Notifications clicked')}
        onMessagesClick={() => console.log('Messages clicked')}
        onMenuClick={() => console.log('Menu clicked')}
      />
    </div>
  );
}