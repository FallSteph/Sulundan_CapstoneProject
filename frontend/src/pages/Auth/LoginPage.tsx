import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, BookOpen, Shield, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, updateUser, user } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const googleStatus = url.searchParams.get('google');
    if (googleStatus === 'success') {
      const u = {
        id: url.searchParams.get('id') || '',
        email: url.searchParams.get('email') || '',
        firstName: url.searchParams.get('firstName') || '',
        lastName: url.searchParams.get('lastName') || '',
        role: (url.searchParams.get('role') as any) || 'faculty',
        isApproved: true,
        college: '',
        department: '',
        notificationsEnabled: url.searchParams.get('notificationsEnabled') === 'true',
        theme: url.searchParams.get('theme') === 'dark' ? 'dark' : 'light',
        hasPassword: url.searchParams.get('hasPassword') === 'true',
      } as any;

      const token = url.searchParams.get('token');
      if (token) {
        localStorage.setItem('auth_token', token);
      }

      updateUser(u);
      toast({
        title: 'Signed in with Google',
        description: 'Welcome!',
      });
      navigate('/dashboard');
    } else if (googleStatus === 'pending') {
      toast({
        title: 'Approval Pending',
        description: 'Your account is currently pending approval by the Admin. Please wait for confirmation.',
      });
      navigate('/login', { replace: true });
    } else if (googleStatus === 'cancel') {
      toast({
        title: 'Sign in canceled',
        description: 'You canceled the Google sign-in process.',
      });
      // Clear URL params
      navigate('/login', { replace: true });
    } else if (googleStatus === 'error') {
      const msg = url.searchParams.get('message') || 'An error occurred during Google sign-in.';
      toast({
        variant: 'destructive',
        title: 'Sign in failed',
        description: msg,
      });
      // Clear URL params
      navigate('/login', { replace: true });
    }
  }, [navigate, toast, updateUser]);

  useEffect(() => {
    const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
    if (!siteKey) return;
    const loadScript = (src: string) =>
      new Promise<void>((resolve) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) return resolve();
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.defer = true;
        s.onload = () => resolve();
        document.body.appendChild(s);
      });
    loadScript('https://www.google.com/recaptcha/api.js').then(() => {
      const grecaptcha = (window as any).grecaptcha;
      if (grecaptcha && document.getElementById('recaptcha-container')) {
        grecaptcha.ready(() => {
          grecaptcha.render('recaptcha-container', {
            sitekey: siteKey,
            callback: (token: string) => setRecaptchaToken(token),
          });
        });
      }
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
    if (siteKey && !recaptchaToken) {
      toast({
        variant: 'destructive',
        title: 'reCAPTCHA required',
        description: 'Please complete the reCAPTCHA challenge.',
      });
      setIsLoading(false);
      return;
    }

    const result = await login(email, password, recaptchaToken || '');

    if (result.success) {
      toast({
        title: 'Welcome back!',
        description: 'You have successfully logged in.',
      });
      // Navigation is handled by useEffect on user state change
    } else {
      toast({
        variant: 'destructive',
        title: 'Login failed',
        description: result.error,
      });
      // Reset reCAPTCHA on failure
      const grecaptcha = (window as any).grecaptcha;
      if (grecaptcha && grecaptcha.reset) {
        grecaptcha.reset();
      }
      setRecaptchaToken(null);
    }

    setIsLoading(false);
  };

  const handleGoogleSignIn = () => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
    window.location.href = `${apiBase}/auth/google/authorize`;
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left side - Decorative */}
      <div className="hidden lg:flex lg:w-1/2 gradient-primary relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ffffff%22%20fill-opacity%3D%220.05%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E')] opacity-20" />
        <div className="relative z-10 flex flex-col justify-center items-center w-full p-12 text-primary-foreground">
          <Logo size="lg" className="mb-8 text-primary-foreground" />
          <h1 className="text-4xl font-bold mb-4 text-center">
            AI-Driven Syllabus Management
          </h1>
          <p className="text-lg text-primary-foreground/80 text-center max-w-md">
            Streamline your academic workflow with intelligent syllabus tracking and digital signing.
          </p>
          <div className="mt-12 space-y-5 w-full max-w-sm">
            {[
              {
                icon: BookOpen,
                title: 'Centralized Tracking',
                desc: 'Monitor every syllabus through each stage of the approval pipeline.',
              },
              {
                icon: Shield,
                title: 'Role-Based Access',
                desc: 'Reviewers only see and act on what their role permits.',
              },
              {
                icon: CheckCircle,
                title: 'Digital Signatures',
                desc: 'Secure, paperless sign-off at every approval level.',
              },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                  <item.icon className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-primary-foreground">{item.title}</p>
                  <p className="text-sm text-primary-foreground/70">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right side - Login form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md animate-slide-up">
          <div className="lg:hidden flex justify-center mb-8">
            <Logo size="lg" />
          </div>

          <Card className="shadow-soft border-border/50">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl font-bold text-center">Welcome back</CardTitle>
              <CardDescription className="text-center">
                Sign in to your account to continue
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
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

                <div className="flex items-center justify-end">
                  <Link
                    to="/forgot-password"
                    className="text-sm text-primary hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>

                {import.meta.env.VITE_RECAPTCHA_SITE_KEY && (
                  <div id="recaptcha-container" className="flex justify-center my-4"></div>
                )}

                <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign In
                </Button>

                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      Or continue with
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleGoogleSignIn}
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
                  Continue with Google
                </Button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Don't have an account?{' '}
                  <Link to="/signup" className="text-primary font-medium hover:underline">
                    Sign up
                  </Link>
                </p>
              </div>

              <div className="mt-6 p-4 rounded-xl bg-muted/50">
                <p className="text-xs text-muted-foreground text-center mb-2">Demo Credentials</p>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p><span className="font-medium">Admin:</span> admin@sulundan.edu</p>
                  <p><span className="font-medium">Faculty:</span> faculty@sulundan.edu</p>
                  <p><span className="font-medium">Dept Head:</span> depthead@sulundan.edu</p>
                  <p><span className="font-medium">Dean:</span> dean@sulundan.edu</p>
                  <p><span className="font-medium">CITL:</span> citl@sulundan.edu</p>
                  <p><span className="font-medium">VPAA:</span> vpaa@sulundan.edu</p>
                  <p className="mt-2"><span className="font-medium">Password:</span> password123</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
