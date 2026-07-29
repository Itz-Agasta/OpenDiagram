import { Button } from "@cloudflare/kumo/components/button";
import {Input } from "@cloudflare/kumo/components/input";

const linkClass =
	"w-fit text-[17px] leading-none text-white transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white";

export const Footer = () => {
	return (
		<footer className="overflow-hidden rounded-b-[22px] bg-[#ff4a2c] font-[Geist,sans-serif] text-white">
			<div className="relative z-10 mx-auto grid max-w-[1800px] gap-16 px-6 pt-20 sm:px-10 lg:grid-cols-[1.35fr_3fr] lg:gap-24 lg:px-[6vw] lg:pt-28">
				<div>
					<h2 className="max-w-[380px] text-[42px] font-medium leading-[1.12] tracking-[-0.04em] sm:text-[52px]">
						Turn the idea
						<br />
						into a Vibe
						<br />
						Diagram.
					</h2>
					<p className="mt-8 max-w-[440px] text-[18px] font-normal leading-[1.55] tracking-[-0.02em] text-white/75">
						Describe what you are thinking, see it take shape, and keep editing
						as the idea evolves.
					</p>

					<form className="mt-12" action="#" method="post">
						<label
							className="block text-[15px] font-normal text-white/65"
							htmlFor="footer-email"
						>
							Try our beta or join the waitlist
						</label>
						<div className="mt-4 flex max-w-[450px] gap-3">
							<Input
								aria-label="email"
								placeholder="Enter your email"
								type="email"
							/>
							<Button
								type="submit"
								variant="secondary"
							>
								Join
							</Button>
						</div>
					</form>
				</div>
				<nav
					className="grid grid-cols-2 gap-x-10 gap-y-12 sm:grid-cols-4 lg:pt-1"
					aria-label="Footer navigation"
				>
					<div className="flex flex-col gap-7">
						<h3 className="font-mono text-[12px] font-normal uppercase tracking-[0.28em] text-white/65">
							Product
						</h3>
						<a className={linkClass} href="/features">
							Features
						</a>
						<a className={linkClass} href="/#how-it-works">
							How it works
						</a>
						<a className={linkClass} href="/dashboard">
							GitHub import
						</a>
						<a className={linkClass} href="/dashboard">
							Dashboard
						</a>
					</div>

					<div className="flex flex-col gap-7">
						<h3 className="font-mono text-[12px] font-normal uppercase tracking-[0.28em] text-white/65">
							Resources
						</h3>
						<a className={linkClass} href="/#faq">
							FAQ
						</a>
						<a className={linkClass} href="/about">
							About
						</a>
					</div>

					<div className="flex flex-col gap-7">
						<h3 className="font-mono text-[12px] font-normal uppercase tracking-[0.28em] text-white/65">
							Company
						</h3>
						<a className={linkClass} href="/about">
							About OpenDiagram
						</a>
						<a className={linkClass} href="mailto:hello@opendiagram.com">
							Contact
						</a>
					</div>

					<div className="flex flex-col gap-7">
						<h3 className="font-mono text-[11px] font-normal uppercase tracking-[0.28em] text-white/65">
							Connect
						</h3>
						<div className="flex flex-wrap gap-x-5 gap-y-4">
							<a
								className={linkClass}
								href="https://github.com/Itz-Agasta/OpenDiagram"
							>
								GitHub
							</a>
							<a className={linkClass} href="https://discord.com">
								Discord
							</a>
							<a className={linkClass} href="mailto:hello@opendiagram.com">
								Email
							</a>
						</div>
					</div>
				</nav>
			</div>

			<div
				className="pointer-events-none mt-10 translate-y-[0.08em] whitespace-nowrap px-[3vw] text-[clamp(7rem,16.5vw,20rem)] font-medium leading-[0.72] tracking-[-0.075em] text-white/20 sm:mt-12 lg:mt-4"
				aria-hidden="true"
			>
				OpenDiagram
			</div>

			<p className="bottom-8 right-[6vw] z-10 font-mono text-[10px] uppercase tracking-[0.25em] text-white/65 sm:text-[11px]">
				© 2026 · OpenDiagram · All rights reserved
			</p>
		</footer>
	);
};
