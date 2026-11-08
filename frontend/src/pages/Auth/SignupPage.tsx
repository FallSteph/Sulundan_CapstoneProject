import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Loader2, ArrowLeft, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { COLLEGES, DEPARTMENTS, UserRole, ROLE_LABELS } from '@/types';

const AVAILABLE_ROLES: UserRole[] = ['faculty', 'dept_head', 'dean', 'citl', 'vpaa'];

export default function SignupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signup } = useAuth();
  const { toast } = useToast();
  
  const isGoogleSignup = searchParams.get('google') === 'true';
  const googleEmail = searchParams.get('email') || '';
  const googleFirstName = searchParams.get('firstName') || '';
  const googleLastName = searchParams.get('lastName') || '';

  const [formData, setFormData] = useState({
    firstName: googleFirstName,
    lastName: googleLastName,
    email: googleEmail,
    password: '',
    confirmPassword: '',
    role: '' as UserRole | '',
    college: '',
    department: '',
  });

  useEffect(() => {
    if (isGoogleSignup) {
      setFormData(prev => ({
        ...prev,
        firstName: googleFirstName,
        lastName: googleLastName,
        email: googleEmail
      }));
    }
  }, [isGoogleSignup, googleFirstName, googleLastName, googleEmail]);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const availableDepartments = formData.college ? DEPARTMENTS[formData.college] || [] : [];

  const showCollege = formData.role && !['citl', 'vpaa'].includes(formData.role);
  const showDepartment = formData.role && !['dean', 'citl', 'vpaa'].includes(formData.role);

  const handleBack = () => {
    navigate(-1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isGoogleSignup && formData.password !== formData.confirmPassword) {
      toast({
        variant: 'destructive',
        title: 'Passwords do not match',
        description: 'Please make sure your passwords match.',
      });
      return;
    }

    const nameRegex = /\d/;
    if (nameRegex.test(formData.firstName) || nameRegex.test(formData.lastName)) {
      toast({
        variant: 'destructive',
        title: 'Invalid character in name',
        description: 'First and last names cannot contain numbers.',
      });
      return;
    }

    if (!formData.role) {
      toast({
        variant: 'destructive',
        title: 'Role required',
        description: 'Please select your role.',
      });
      return;
    }

    setIsLoading(true);

    const result = await signup({
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      password: isGoogleSignup ? undefined : formData.password,
      role: formData.role as UserRole,
      college: formData.college || 'N/A',
      department: formData.department || 'N/A',
    });

    if (result.success) {
      toast({
        title: 'Account created!',
        description: 'Your account is pending verification by Admin. You will be notified once approved.',
      });
      navigate('/login');
    } else {
        toast({
          variant: 'destructive',
          title: 'Signup failed',
          description: result.error,
        });
      }

    setIsLoading(false);
  };

  const handleGoogleSignup = () => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
    window.location.href = `${apiBase}/auth/google/authorize`;
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 py-8">
      <div className="w-full max-w-lg animate-slide-up">
        {/* Back Button */}
        <Button
          variant="ghost"
          className="mb-4 -ml-2"
          onClick={handleBack}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <div className="flex justify-center mb-8">
          <Logo size="lg" />
        </div>

        <Card className="shadow-soft border-border/50">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">
              {isGoogleSignup ? 'Complete Google Sign Up' : 'Create an account'}
            </CardTitle>
            <CardDescription className="text-center">
              {isGoogleSignup 
                ? 'Finish setting up your account details' 
                : 'Enter your information to get started'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isGoogleSignup && (
              <div className="mb-6 p-3 rounded-lg bg-primary/5 border border-primary/20 flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <p className="text-sm font-medium text-primary">
                  Linked with Google: <span className="font-bold">{googleEmail}</span>
                </p>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    placeholder="John"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    placeholder="Doe"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john.doe@university.edu"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  disabled={isGoogleSignup}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value: UserRole) => setFormData({ ...formData, role: value, college: '', department: '' })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select your role" />
                  </SelectTrigger>
                  <SelectContent>
                    {AVAILABLE_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {showCollege && (
                <div className="space-y-2">
                  <Label htmlFor="college">College</Label>
                  <Select
                    value={formData.college}
                    onValueChange={(value) => setFormData({ ...formData, college: value, department: '' })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select your college" />
                    </SelectTrigger>
                    <SelectContent>
                      {COLLEGES.map((college) => (
                        <SelectItem key={college} value={college}>
                          {college}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {showDepartment && (
                <div className="space-y-2">
                  <Label htmlFor="department">Program</Label>
                  <Select
                    value={formData.department}
                    onValueChange={(value) => setFormData({ ...formData, department: value })}
                    disabled={!formData.college}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={formData.college ? "Select your program" : "Select college first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableDepartments.map((dept) => (
                        <SelectItem key={dept} value={dept}>
                          {dept}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {!isGoogleSignup && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Create a password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        required
                        minLength={8}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-10 w-10"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="Confirm your password"
                        value={formData.confirmPassword}
                        onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-10 w-10"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </>
              )}

              <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Account
              </Button>

              {!isGoogleSignup && (
                <>
                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">
                        Or sign up with
                      </span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={handleGoogleSignup}
                  >
                    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                      <path
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        fill="#4285F4"
                      />
                      <path
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        fill="#34A853"
                      />
                      <path
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        fill="#FBBC05"
                      />
                      <path
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        fill="#EA4335"
                      />
                    </svg>
                    Sign up with Google
                  </Button>
                </>
              )}
            </form>

            <div className="mt-6 p-4 rounded-xl bg-warning/10 border border-warning/20">
              <p className="text-sm text-warning text-center">
                <strong>Note:</strong> Your account will need to be approved by an administrator before you can log in.
              </p>
            </div>

            <div className="mt-4 text-center">
              <p className="text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link to="/login" className="text-primary font-medium hover:underline">
                  Sign in
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
