'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Hub } from 'aws-amplify/utils';
import { getCurrentUser } from 'aws-amplify/auth';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Check if this is an OAuth callback (has code parameter)
    const urlParams = new URLSearchParams(window.location.search);
    const hasAuthCode = urlParams.has('code');

    let unsubscribe: (() => void) | undefined;
    let timer: NodeJS.Timeout | undefined;

    if (hasAuthCode) {
      // Wait for Amplify to process the OAuth callback
      const checkAuth = async () => {
        try {
          // Listen for the auth event
          unsubscribe = Hub.listen('auth', ({ payload }) => {
            if (payload.event === 'signInWithRedirect') {
              if (unsubscribe) unsubscribe();
              unsubscribe = undefined;
              router.push('/tournaments');
            }
            if (payload.event === 'signInWithRedirect_failure') {
              if (unsubscribe) unsubscribe();
              unsubscribe = undefined;
              console.error('Sign in failed');
              router.push('/tournaments');
            }
          });

          // Also check if user is already authenticated
          timer = setTimeout(async () => {
            try {
              await getCurrentUser();
              if (unsubscribe) unsubscribe();
              unsubscribe = undefined;
              router.push('/tournaments');
            } catch {
              // Not authenticated yet, keep waiting
            }
          }, 1000);
        } catch (error) {
          console.error('Auth error:', error);
          if (unsubscribe) unsubscribe();
          unsubscribe = undefined;
          router.push('/tournaments');
        }
      };

      checkAuth();
    } else {
      // No auth code, just redirect
      router.push('/tournaments');
    }

    return () => {
      if (unsubscribe) unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}
