import { Button } from "@cloudflare/kumo/components/button";

export const Header = () => {
	return (
		<header className="fixed body-font bg-transparent">
			<div className="mx-auto grid min-h-20 min-w-screen grid-cols-[1fr_auto_1fr] items-center gap-6 px-6">
				<a className="flex w-fit items-center gap-3" href="/">
					<img
						src="/mascot.png"
						alt="OpenDiagram mascot"
						width={40}
						height={40}
					/>
					<span className="heading-font text-gray-950">OpenDiagram</span>
				</a>
				<nav
					className="flex items-center gap-8"
					aria-label="Primary navigation"
				>
					<a
						className="text-sm font-medium text-gray-600 hover:text-gray-950"
						href="/features"
					>
						Features
					</a>
					<a
						className="text-sm font-medium text-gray-600 hover:text-gray-950"
						href="/about"
					>
						About
					</a>
					<a
						className="text-sm font-medium text-gray-600 hover:text-gray-950"
						href="https://github.com/Itz-Agasta/OpenDiagram"
					>
						GitHub
					</a>
				</nav>
				<Button className="justify-self-end" variant="primary">
					Try for Free
				</Button>
			</div>
		</header>
	);
};
