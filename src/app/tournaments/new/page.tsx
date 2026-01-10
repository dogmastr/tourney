"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import Link from "next/link";
import { createTournamentAsync } from "@/features/tournaments/storage";
import { useAuth } from "@/features/auth/auth-context";
import { useCloudTournaments } from "@/features/tournaments/hooks/use-cloud-tournaments";
import { Loader2, LogIn, Cloud, AlertCircle } from "lucide-react";
import { validateTournamentInput } from "@/features/tournaments/validation";
import { sanitizeString } from "@/shared/validation";
import { LIMITS, LIMIT_MESSAGES, canCreateTournament, getRemainingTournaments } from "@/features/tournaments/limits";
import { getMutationRateLimiter } from "@/shared/rate-limiter";
import { RateLimitAlert } from "@/shared/components/rate-limit-alert";

export default function NewTournamentPage() {
  const router = useRouter();
  const { user, username, isLoading: isAuthLoading, isAuthenticated, signInWithGoogle } = useAuth();
  const { tournaments, isLoading: isTournamentsLoading } = useCloudTournaments();
  const [formData, setFormData] = useState({
    name: "",
    system: "normal-swiss",
    byeValue: "0.5",
    totalRounds: "",
    rated: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimitState, setRateLimitState] = useState<{ isLimited: boolean; retryAfterMs: number }>({
    isLimited: false,
    retryAfterMs: 0,
  });

  // Calculate remaining tournaments
  const userTournamentCount = tournaments.filter(t => t.creatorId === user?.userId).length;
  const canCreate = canCreateTournament(userTournamentCount);
  const remainingSlots = getRemainingTournaments(userTournamentCount);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setError(null);

    // Check tournament limit
    if (!canCreate) {
      setError(LIMIT_MESSAGES.TOURNAMENT_LIMIT_REACHED);
      return;
    }

    // Sanitize inputs
    const sanitizedName = sanitizeString(formData.name);
    const totalRounds = parseInt(formData.totalRounds, 10);
    const byeValue = parseFloat(formData.byeValue);

    // Validate inputs
    const validation = validateTournamentInput({
      name: sanitizedName,
      system: formData.system,
      byeValue,
      totalRounds,
    });

    if (!validation.valid) {
      setError(validation.error || 'Invalid input');
      return;
    }

    // Check rate limit
    const limiter = getMutationRateLimiter();
    const limitResult = limiter.check();
    if (!limitResult.allowed) {
      setRateLimitState({
        isLimited: true,
        retryAfterMs: limitResult.retryAfterMs || 1000,
      });
      return;
    }
    limiter.record();

    setIsSubmitting(true);

    try {
      const tournament = await createTournamentAsync(
        {
          name: sanitizedName,
          system: formData.system,
          byeValue,
          totalRounds,
          rated: formData.rated,
        },
        user.userId,
        username || undefined
      );

      router.push(`/tournaments/${tournament.id}`);
    } catch (error) {
      console.error("Failed to create tournament:", error);
      setError(error instanceof Error ? error.message : 'Failed to create tournament');
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: string | boolean) => {
    setError(null);
    setFormData((prev) => ({
      ...prev,
      [field]: field === "rated" ? value === true || value === "true" : value,
    }));
  };

  if (isAuthLoading || isTournamentsLoading) {
    return (
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <Button asChild variant="outline">
            <Link href="/tournaments">← Back to Tournaments</Link>
          </Button>
        </div>

        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-4 bg-primary/10 rounded-full w-fit">
              <LogIn className="h-8 w-8 text-primary" />
            </div>
            <CardTitle>Sign In Required</CardTitle>
            <CardDescription>
              You need to sign in to create tournaments. Your tournaments will be saved to the cloud.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={signInWithGoogle} className="w-full gap-2">
              <Cloud className="h-4 w-4" />
              Sign in with Google
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/tournaments">Cancel</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <Button asChild variant="outline">
          <Link href="/tournaments">← Back to Tournaments</Link>
        </Button>
      </div>

      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Create New Tournament</CardTitle>
          <CardDescription className="flex items-center gap-2">
            <Cloud className="h-4 w-4" />
            Your tournament will be saved to the cloud
            {remainingSlots <= 3 && (
              <span className="text-amber-600 ml-2">
                ({remainingSlots} slot{remainingSlots === 1 ? '' : 's'} remaining)
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!canCreate && (
            <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive">Tournament Limit Reached</p>
                <p className="text-sm text-muted-foreground">
                  {LIMIT_MESSAGES.TOURNAMENT_LIMIT_REACHED} Delete an existing tournament to create a new one.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <RateLimitAlert
            isLimited={rateLimitState.isLimited}
            retryAfterMs={rateLimitState.retryAfterMs}
            onCooldownComplete={() => setRateLimitState({ isLimited: false, retryAfterMs: 0 })}
          />

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Tournament Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Enter tournament name"
                value={formData.name}
                onChange={(e) => handleChange("name", e.target.value)}
                maxLength={LIMITS.MAX_TOURNAMENT_NAME_LENGTH}
                required
                disabled={!canCreate}
              />
              <p className="text-xs text-muted-foreground">
                {formData.name.length}/{LIMITS.MAX_TOURNAMENT_NAME_LENGTH} characters
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="system">System</Label>
              <Select
                value={formData.system}
                onValueChange={(value) => handleChange("system", value)}
                disabled={!canCreate}
              >
                <SelectTrigger id="system">
                  <SelectValue placeholder="Select system" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal-swiss">FIDE (Dutch) Swiss System</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="byeValue">Bye Value</Label>
              <Input
                id="byeValue"
                type="number"
                step="0.5"
                min="0"
                max="1"
                placeholder="0.5"
                value={formData.byeValue}
                onChange={(e) => handleChange("byeValue", e.target.value)}
                required
                disabled={!canCreate}
              />
              <p className="text-sm text-muted-foreground">
                Points awarded for a bye (0, 0.5, or 1)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="totalRounds">Total Rounds</Label>
              <Input
                id="totalRounds"
                type="number"
                min={LIMITS.MIN_ROUNDS_PER_TOURNAMENT}
                max={LIMITS.MAX_ROUNDS_PER_TOURNAMENT}
                placeholder={`1-${LIMITS.MAX_ROUNDS_PER_TOURNAMENT}`}
                value={formData.totalRounds}
                onChange={(e) => handleChange("totalRounds", e.target.value)}
                required
                disabled={!canCreate}
              />
              <p className="text-sm text-muted-foreground">
                Maximum {LIMITS.MAX_ROUNDS_PER_TOURNAMENT} rounds
              </p>
            </div>

            <div className="flex items-start space-x-3 pt-2">
              <input
                id="rated"
                type="checkbox"
                checked={formData.rated}
                onChange={(e) => handleChange("rated", e.target.checked)}
                disabled={!canCreate}
                className="h-4 w-4 mt-1 rounded border-gray-300"
              />
              <div>
                <Label htmlFor="rated" className="cursor-pointer">Rated Tournament</Label>
                <p className="text-sm text-muted-foreground">
                  Player ratings will update after each round. Results cannot be changed after a round is completed.
                </p>
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <Button type="submit" className="flex-1" disabled={isSubmitting || !canCreate}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Tournament"
                )}
              </Button>
              <Button type="button" variant="outline" asChild disabled={isSubmitting}>
                <Link href="/tournaments">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}


