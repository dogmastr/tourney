'use client';

import { ReactNode } from 'react';
import { Amplify } from 'aws-amplify';
import { AuthProvider } from '@/lib/auth-context';
import { UsernameSetupModal } from '@/components/username-setup-modal';
import outputs from '@/amplify_outputs.json';

// Configure Amplify on the client side
Amplify.configure(outputs, { ssr: true });

export function Providers({ children }: { children: ReactNode }) {
    return (
        <AuthProvider>
            {children}
            <UsernameSetupModal />
        </AuthProvider>
    );
}

