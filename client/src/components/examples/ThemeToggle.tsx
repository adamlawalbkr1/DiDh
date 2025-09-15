import ThemeToggle from '../ThemeToggle';

export default function ThemeToggleExample() {
  return (
    <div className="flex items-center space-x-4 p-4">
      <span>Toggle theme:</span>
      <ThemeToggle />
    </div>
  );
}