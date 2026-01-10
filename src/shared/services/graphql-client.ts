import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';

// Generate a typed client for authenticated data operations
export const client = generateClient<Schema>();

// Generate a public client for unauthenticated read operations (uses API key)
export const publicClient = generateClient<Schema>({
    authMode: 'apiKey'
});

// Re-export for convenience
export { client as dataClient };
