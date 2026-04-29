'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { AuthForm } from '@/components/auth-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import placeholderImagesData from '@/lib/placeholder-images.json';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
  const { userProfile, loading } = useAuth();
  const router = useRouter();
  const placeholderImages = placeholderImagesData.placeholderImages || [];
  const loginImage =
    placeholderImages.find((p) => p.id === 'login-background') || {
      imageUrl: 'https://picsum.photos/seed/1/1920/1080',
      imageHint: 'cargo ship port',
    };

  useEffect(() => {
    if (!loading && userProfile) {
      router.push('/dashboard');
    }
  }, [userProfile, loading, router]);

  if (loading || (!loading && userProfile)) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center">
      <Image
        src={loginImage.imageUrl}
        alt="Cargo ship at a port"
        fill
        className="object-cover"
        data-ai-hint={loginImage.imageHint}
        priority
      />
      <div className="absolute inset-0 bg-primary/80" />
      <Card className="relative z-10 w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold tracking-tight">KNEX</CardTitle>
        </CardHeader>
        <CardContent>
          <AuthForm />
          <div className="mt-4 flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <Link className="underline transition hover:text-foreground" href="/privacy-policy">
              Privacy Policy
            </Link>
            <span aria-hidden="true">|</span>
            <Link className="underline transition hover:text-foreground" href="/terms-and-conditions">
              Terms and Conditions
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
