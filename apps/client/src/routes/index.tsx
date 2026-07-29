import { createFileRoute } from "@tanstack/react-router";
import { Hero } from "#/components/landing/hero";
import { Footer } from "#/components/ui/footer";
import { Header } from "#/components/ui/header";
import { LenisProvider } from "#/hooks/useLenisProvider";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	return (
		<LenisProvider>
			<div className="flex flex-col min-h-screen">
			<Header/>
			<Hero />
			<Footer />
		</div>
		</LenisProvider>
	);
}