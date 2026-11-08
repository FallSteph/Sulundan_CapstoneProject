import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AccessDenied() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] p-4 text-center">
      <div className="h-24 w-24 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
        <ShieldAlert className="h-12 w-12 text-destructive" />
      </div>
      
      <h1 className="text-4xl font-extrabold text-foreground mb-2">403</h1>
      <h2 className="text-2xl font-bold text-foreground mb-4">Access Denied</h2>
      
      <p className="text-muted-foreground max-w-md mb-8">
        Oops! You don't have the required permissions to access this page. 
        This area is restricted to system administrators only.
      </p>
      
      <div className="flex flex-col sm:flex-row gap-4">
        <Button 
          variant="outline" 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Go Back
        </Button>
        <Button 
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2"
        >
          <Home className="h-4 w-4" />
          Back to Dashboard
        </Button>
      </div>
    </div>
  );
}
