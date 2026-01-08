import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Heart, Star, Sparkles, Coffee, Github, GitPullRequest, Bug } from "lucide-react";
import Link from "next/link";

export default function PatronPage() {
    return (
        <main className="container mx-auto px-4 py-8 max-w-3xl">
            {/* Hero Section */}
            <div className="text-center mb-10 space-y-4">
                <h1 className="text-4xl font-bold tracking-tight">Support</h1>
                <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                    Help us keep our servers running and support ongoing development.
                    <br />
                    As a thank you, you&apos;ll get a special badge on your profile!
                </p>
            </div>

            {/* Donation Card */}
            <Card className="mb-10 border-primary/20 bg-primary/5">
                <CardHeader className="text-center pb-2">
                    <div className="mx-auto bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
                        <Heart className="h-6 w-6 text-primary fill-primary" />
                    </div>
                    <CardTitle className="text-2xl">Become a Patron</CardTitle>
                    <CardDescription>
                        Support the project and get a special badge on your profile!
                        <br />
                        Just $1 is enough to keep the website running for an entire month.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-6 pt-4">
                    <ul className="text-left space-y-3 text-sm">
                        <li className="flex items-center gap-2">
                            <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                            <span>Exclusive <strong>Patron Badge</strong> on your profile</span>
                        </li>
                        <li className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-purple-500" />
                            <span>Early access to new features</span>
                        </li>
                        <li className="flex items-center gap-2">
                            <Coffee className="h-4 w-4 text-amber-700" />
                            <span>Directly support server costs & development</span>
                        </li>
                    </ul>

                    <Button size="lg" className="w-full sm:w-auto min-w-[200px] gap-2 font-semibold" asChild>
                        <Link href="https://ko-fi.com/dogmastr" target="_blank" rel="noopener noreferrer">
                            <Heart className="h-4 w-4 fill-current" />
                            Donate
                        </Link>
                    </Button>
                    <p className="text-xs text-muted-foreground">
                        Takes you to my Ko-fi page. Secure payment handling.
                    </p>
                </CardContent>
            </Card>

            {/* Contributing Card */}
            <Card className="mb-10 border-primary/20 bg-muted/30">
                <CardHeader className="text-center pb-2">
                    <div className="mx-auto bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
                        <Github className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-2xl">Contribute on GitHub</CardTitle>
                    <CardDescription>
                        This project is open source. You can help make it better!
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-6 pt-4">
                    <div className="text-center text-sm text-muted-foreground max-w-lg">
                        <ul className="text-left inline-block space-y-2">
                            <li className="flex items-center gap-2">
                                <span className="bg-primary/10 p-1 rounded-full"><GitPullRequest className="h-3 w-3 text-primary" /></span>
                                <span>Submit Pull Requests for new features</span>
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="bg-primary/10 p-1 rounded-full"><Bug className="h-3 w-3 text-primary" /></span>
                                <span>Report bugs and issues</span>
                            </li>
                        </ul>
                    </div>

                    <Button variant="outline" size="lg" className="w-full sm:w-auto min-w-[200px] gap-2" asChild>
                        <Link href="https://github.com/dogmastr/tourney" target="_blank" rel="noopener noreferrer">
                            <Github className="h-4 w-4" />
                            GitHub
                        </Link>
                    </Button>
                </CardContent>
            </Card>

            {/* FAQ Section */}
            <div className="space-y-6">
                <h2 className="text-2xl font-bold text-center mb-6">Frequently Asked Questions</h2>

                <div className="grid gap-4 md:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">What do I get for donating?</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground">
                            Aside from our eternal gratitude, you&apos;ll receive a special &quot;Patron&quot; badge next to your username across the entire platform. It shows everyone that you helped make this happen!
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">How is the money used?</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground">
                            100% of donations go towards server hosting costs (AWS), domain renewal, and supporting the developer&apos;s time to add new features and fix bugs.
                        </CardContent>
                    </Card>
                </div>
            </div>
        </main>
    );
}
