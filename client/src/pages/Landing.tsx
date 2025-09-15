import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl font-bold tracking-tight mb-6">
            P2P Marketplace Platform
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            Buy, sell, and negotiate on a secure peer-to-peer marketplace with escrow protection, 
            real-time chat, and location-based discovery.
          </p>
          
          <div className="mb-12">
            <Button 
              size="lg" 
              onClick={() => window.location.href = '/api/login'}
              data-testid="button-login"
            >
              Sign In to Get Started
            </Button>
          </div>

          <div className="grid md:grid-cols-3 gap-6 text-left">
            <Card>
              <CardHeader>
                <CardTitle>Secure Trading</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Escrow protection ensures safe transactions between buyers and sellers
                </CardDescription>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Real-time Negotiation</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Chat and negotiate prices directly with other users in real-time
                </CardDescription>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Location Discovery</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Find products and services near you with integrated map search
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}