import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AuthButton } from "@/components/auth-button";

export function Navbar() {
    return (
        <nav className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container mx-auto px-4">
                <div className="flex h-16 items-center justify-between">
                    <div className="flex items-center gap-8">
                        <div className="flex flex-col">
                            <Link
                                href="/"
                                className="text-xl font-bold hover:opacity-80 transition-opacity leading-none"
                            >
                                tourney
                            </Link>
                            <span className="text-[10px] text-muted-foreground">created by zy (@dogmastr)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" asChild>
                                <Link href="/tournaments">Tournaments</Link>
                            </Button>
                            <Button variant="ghost" asChild>
                                <Link href="/users">Users</Link>
                            </Button>
                            <Button variant="ghost" asChild>
                                <Link href="/contribute" className="text-yellow-500 hover:text-yellow-600">Contribute</Link>
                            </Button>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <AuthButton />
                    </div>
                </div>
            </div>
        </nav>
    );
}