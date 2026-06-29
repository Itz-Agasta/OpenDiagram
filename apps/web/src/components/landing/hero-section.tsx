"use client";

import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import gsap from "gsap";

const slideshowImages = [
  "https://framerusercontent.com/images/jSslhcqo8HKNjUvPEceq7bhbY.jpg",
  "https://framerusercontent.com/images/wWjLitV3mnO3fgL2J1WnS6WKDU.jpg",
  "https://framerusercontent.com/images/0Y1cjcOdQp68PBw6G3HHfHz6TYo.jpg",
];

const heroLogoSvgs = [
  `<svg width="88" height="48" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#a)" fill="#E3E3E3"><path d="M87.993 17.071a.742.742 0 0 0 0-.2.526.526 0 0 0 0-.165l-.652-4.692a3.041 3.041 0 0 0-.726-1.515l-.112-.128-.205-.201L75.013.64l.316.31a2.696 2.696 0 0 0-.951-.711A2.747 2.747 0 0 0 73.206 0H69.78a2.51 2.51 0 0 0-1.545.493A2.719 2.719 0 0 0 66.632 0h-3.427a2.592 2.592 0 0 0-1.285.317c-.392.215-.72.528-.95.907a2.514 2.514 0 0 0-.372 1.826l.428 2.957a1.892 1.892 0 0 0-.93-.237H43.501a3.155 3.155 0 0 0-1.676.493 2.98 2.98 0 0 0-1.118 1.223L39.423 6.41a2.693 2.693 0 0 0-1.862-.694H11.526a3.478 3.478 0 0 0-1.695.475 3.076 3.076 0 0 0-1.434 1.826L.128 35.128a2.33 2.33 0 0 0-.043 1.384c.126.455.387.864.75 1.172.096.08.195.152.299.22 0 0-.168-.11-.26-.201l11.285 9.548a2.635 2.635 0 0 0 1.75.676h26.24a3.457 3.457 0 0 0 1.695-.493 2.75 2.75 0 0 0 .764-.603l.093-.127.15-.183.11-.2 1.23 1.04a2.58 2.58 0 0 0 1.713.639h26.297a3.553 3.553 0 0 0 1.694-.493c.283-.164.54-.367.764-.602l.093-.128.149-.183c.079-.115.148-.238.205-.365.06-.11.11-.227.149-.347l7.542-24.757v-.22c.01-.084.01-.17 0-.255v-.164a.498.498 0 0 0 0-.165 2.363 2.363 0 0 0 0-.347h2.421c.21.02.423.02.633 0h.168c.136-.04.268-.095.391-.164h.186l.335-.255.15-.11.26-.329v-.11l.187-.31a.538.538 0 0 1 0-.182.144.144 0 0 1 0-.091c.04-.107.07-.217.093-.33a.233.233 0 0 1 0-.109.503.503 0 0 1 0-.164s.372-.712.372-.749Z" fill-opacity=".1"/><path d="M38.325 7.797a.636.636 0 0 1 .167.712l-8.25 27.094a1.267 1.267 0 0 1-.596.694c-.227.15-.49.237-.763.256H2.66a.921.921 0 0 1-.596-.256.637.637 0 0 1-.168-.694l8.27-27.094c.094-.3.3-.554.576-.712a1.7 1.7 0 0 1 .764-.238H37.73a.885.885 0 0 1 .596.238ZM24.636 30.144l4.936-16.176H15.753l-4.916 16.176h13.8ZM63.354 8.071a.911.911 0 0 0 .727.31h3.408a.776.776 0 0 0 .652-.347.758.758 0 0 0 .13-.584l-.67-4.82a1.524 1.524 0 0 0-.336-.603.913.913 0 0 0-.726-.31h-3.408a.776.776 0 0 0-.652.347c-.13.255-.186.42-.13.566l.689 4.82c.035.234.146.452.316.62Zm10.82-5.478a1.526 1.526 0 0 0-.335-.602.874.874 0 0 0-.707-.31h-3.427a.719.719 0 0 0-.633.346.755.755 0 0 0-.15.566l.69 4.82c.043.232.153.448.317.621a.948.948 0 0 0 .726.31h3.426a.737.737 0 0 0 .634-.347.688.688 0 0 0 .13-.584l-.67-4.82ZM60.357 9.896l-.335-2.373H43.5c-.258.014-.51.096-.725.237a1.074 1.074 0 0 0-.54.712L40.857 13a.61.61 0 0 0 .112.694.9.9 0 0 0 .578.237h20.076l-4.936 16.177h-20.02a1.4 1.4 0 0 0-.726.219 1.244 1.244 0 0 0-.54.712l-1.397 4.528a.664.664 0 0 0 .13.693.865.865 0 0 0 .578.256h26.296c.272-.023.534-.11.763-.256.275-.151.482-.399.578-.693l7.56-24.758H61.4a1.005 1.005 0 0 1-.726-.292 1.324 1.324 0 0 1-.317-.584v-.037Z"/></g><defs><clipPath id="a"><path fill="#fff" d="M0 0h88v48H0z"/></clipPath></defs></svg>`,
  `<svg width="88" height="34" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#a)" fill="#E3E3E3"><path d="M20.888 0a12.928 12.928 0 0 0-9.162 3.812l-7.93 7.967A13.047 13.047 0 0 0 0 20.983C0 28.173 5.801 34 12.958 34c3.436 0 6.732-1.371 9.162-3.813l5.486-5.51L43.589 8.62a6.175 6.175 0 0 1 4.376-1.82c2.748 0 5.078 1.8 5.885 4.289l5.045-5.068C56.594 2.401 52.559 0 47.965 0a12.928 12.928 0 0 0-9.162 3.812L17.333 25.38a6.174 6.174 0 0 1-4.375 1.821c-3.418 0-6.189-2.783-6.189-6.217a6.23 6.23 0 0 1 1.813-4.396l7.93-7.966A6.175 6.175 0 0 1 20.888 6.8c2.748 0 5.078 1.8 5.885 4.289l5.045-5.068C29.517 2.401 25.482 0 20.888 0Z"/><path d="M44.41 25.38a6.175 6.175 0 0 1-4.375 1.82c-2.748 0-5.077-1.799-5.885-4.288l-5.044 5.067C31.407 31.6 35.442 34 40.035 34c3.436 0 6.732-1.371 9.162-3.813l21.47-21.566A6.175 6.175 0 0 1 75.041 6.8c3.418 0 6.189 2.783 6.189 6.217a6.23 6.23 0 0 1-1.813 4.396l-7.93 7.966a6.175 6.175 0 0 1-4.376 1.821c-2.748 0-5.078-1.799-5.885-4.288l-5.045 5.067C58.484 31.599 62.52 34 67.112 34c3.436 0 6.732-1.371 9.162-3.813l7.93-7.966A13.046 13.046 0 0 0 88 13.017C88 5.827 82.199 0 75.042 0a12.928 12.928 0 0 0-9.162 3.812L44.41 25.38Z"/></g><defs><clipPath id="a"><path fill="#fff" d="M0 0h88v34H0z"/></clipPath></defs></svg>`,
  `<svg width="132" height="30" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#a)" fill="#E3E3E3"><path fill-rule="evenodd" clip-rule="evenodd" d="M11.25 21a3.75 3.75 0 0 1-3.75-3.75V0H0v17.25C0 23.463 5.037 28.5 11.25 28.5h8.25V21h-8.25Zm22.5-13.5a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5ZM19.5 14.25C19.5 6.38 25.88 0 33.75 0S48 6.38 48 14.25 41.62 28.5 33.75 28.5 19.5 22.12 19.5 14.25Zm95.25-6.75a6.75 6.75 0 1 0 0 13.501 6.75 6.75 0 0 0 0-13.501Zm-14.25 6.75C100.5 6.38 106.88 0 114.75 0S129 6.38 129 14.25s-6.38 14.25-14.25 14.25-14.25-6.38-14.25-14.25ZM63.75 0C55.88 0 49.5 6.38 49.5 14.25S55.88 28.5 63.75 28.5h21c1.477 0 2.901-.225 4.24-.642L93 30l4.326-8.103A14.255 14.255 0 0 0 99 15.196v-.946C99 6.38 92.62 0 84.75 0h-21ZM91.5 14.25a6.75 6.75 0 0 0-6.75-6.75h-21a6.75 6.75 0 1 0 0 13.5h21a6.75 6.75 0 0 0 6.75-6.697v-.053Z"/><path d="M132 1.875a1.878 1.878 0 0 1-1.875 1.875 1.877 1.877 0 0 1-1.326-3.2A1.877 1.877 0 0 1 132 1.874Z"/></g><defs><clipPath id="a"><path fill="#fff" d="M0 0h132v30H0z"/></clipPath></defs></svg>`,
  `<svg width="100" height="40" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#a)"><path d="M4.77 4.235C5.03 3.001 6.26 2 7.513 2h6.812L8.66 28.823H1.848c-1.254 0-2.06-1-1.799-2.235L4.77 4.235Zm22.707 0C27.738 3.001 28.967 2 30.22 2h6.812l-5.665 26.823h-6.812c-1.254 0-2.06-1-1.799-2.235l4.721-22.353Zm45.415 0C73.152 3.001 74.38 2 75.635 2h6.812l-5.665 26.823H69.97c-1.254 0-2.059-1-1.798-2.235l4.721-22.353ZM39.303 2h6.812c1.254 0 2.06 1 1.8 2.235l-4.722 22.353c-.26 1.235-1.489 2.235-2.743 2.235h-6.812L39.303 2Zm45.415 0h6.812c1.254 0 2.06 1 1.8 2.235l-4.723 22.353c-.26 1.235-1.488 2.235-2.742 2.235h-6.813L84.718 2ZM50.185 4.235C50.445 3.001 51.673 2 52.927 2h6.813l-5.666 26.823h-6.812c-1.254 0-2.06-1-1.798-2.235l4.72-22.353h.001ZM62.01 2h6.813c1.254 0 2.06 1 1.798 2.235l-7.08 33.53C63.277 38.999 62.05 40 60.795 40h-6.813L62.01 2ZM12.82 19.882h9.082l-1.416 6.706c-.26 1.235-1.49 2.235-2.743 2.235H10.93l1.888-8.94.001-.001Zm31.7 11.177h9.082L51.714 40h-6.812c-1.255 0-2.06-1-1.799-2.235l1.417-6.706Zm24.654 2.079-1.15 5.446c-.05.234-.128.298-.366.298h-.523c-.238 0-.29-.064-.24-.298l1.15-5.446c.05-.233.128-.298.366-.298h.523c.238 0 .29.065.24.298Zm1.512 3.674h-.107c-.114 0-.154.032-.177.145l-.344 1.627c-.05.234-.129.298-.366.298h-.524c-.237 0-.289-.064-.24-.298l1.15-5.446c.05-.233.13-.298.367-.298h1.08c1.244 0 1.715.443 1.485 1.53l-.192.911c-.23 1.088-.888 1.531-2.132 1.531Zm.316-2.699-.3 1.426c-.025.113.001.145.116.145h.172c.4 0 .615-.161.702-.572l.12-.572c.087-.41-.059-.572-.46-.572h-.172c-.114 0-.154.032-.178.145Zm3.738.878.85.935c.446.483.508.773.394 1.313l-.03.145c-.215 1.015-.727 1.579-1.914 1.579-1.186 0-1.479-.475-1.205-1.773l.034-.16c.05-.234.13-.299.366-.299h.556c.238 0 .29.065.24.298l-.075.355c-.068.322.036.451.322.451.287 0 .443-.12.505-.41l.032-.154c.048-.226.022-.338-.224-.604l-.8-.862c-.448-.475-.505-.75-.39-1.29l.036-.176c.215-1.015.727-1.58 1.913-1.58 1.187 0 1.48.476 1.206 1.773l-.034.161c-.05.234-.129.298-.366.298H75.6c-.237 0-.289-.064-.24-.298l.075-.354c.068-.323-.035-.451-.322-.451-.286 0-.443.12-.504.41l-.029.137c-.05.234-.024.347.161.556Zm4.792-1.853c.05-.233.128-.298.366-.298h.523c.238 0 .29.065.24.298l-.856 4.053c-.274 1.297-.767 1.772-1.954 1.772-1.186 0-1.479-.475-1.205-1.773l.856-4.052c.05-.233.13-.298.366-.298h.524c.237 0 .29.065.24.298l-.897 4.246c-.068.322.044.451.355.451.302 0 .477-.129.545-.451l.897-4.246Zm3.406 3.279c.003.065.024.08.065.08.04 0 .07-.015.1-.08l1.413-3.367c.07-.17.151-.21.356-.21h.794c.237 0 .29.065.24.298l-1.15 5.446c-.05.234-.13.298-.367.298h-.376c-.237 0-.29-.064-.24-.298l.552-2.61c.015-.072.002-.089-.047-.089-.033 0-.07.017-.09.073l-1.142 2.659c-.082.193-.187.265-.424.265H82.4c-.246 0-.32-.072-.32-.265l-.028-2.66c-.005-.056-.018-.072-.059-.072-.049 0-.069.017-.084.089l-.55 2.61c-.05.234-.129.298-.367.298h-.376c-.238 0-.29-.064-.24-.298l1.15-5.446c.05-.233.13-.298.366-.298h.68c.286 0 .378.065.376.347l-.01 3.23ZM100 2c0 1.105-.89 2-1.987 2a1.993 1.993 0 0 1-1.987-2c0-1.105.89-2 1.987-2S100 .895 100 2Z" fill="#E3E3E3"/></g><defs><clipPath id="a"><path fill="#fff" d="M0 0h100v40H0z"/></clipPath></defs></svg>`,
];

function Slideshow({ className = "" }: { className?: string }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setIndex((i) => (i + 1) % slideshowImages.length),
      3000,
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={`relative inline-flex h-[108px] w-[144px] -rotate-2 overflow-hidden rounded-[36px] border-2 border-black bg-black max-md:h-20 max-md:w-28 ${className}`}>
      <AnimatePresence mode="wait">
        <motion.img
          key={slideshowImages[index]}
          src={slideshowImages[index]}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.7, ease: "easeInOut" }}
        />
      </AnimatePresence>
    </div>
  );
}

function Ticker({ className = "" }: { className?: string }) {
  const logoLoop = [...heroLogoSvgs, ...heroLogoSvgs];

  return (
    <div className={`relative inline-flex h-[108px] w-[144px] rotate-2 items-center overflow-hidden rounded-[36px] border-2 border-black bg-[#262626] max-md:h-20 max-md:w-28 ${className}`}>
      <motion.div
        className="absolute flex items-center gap-9 whitespace-nowrap"
        animate={{ x: ["0%", "-50%"] }}
        transition={{
          repeat: Infinity,
          ease: "linear",
          duration: 20,
        }}
      >
        {logoLoop.map((svg, i) => (
          <img
            key={`hero-logo-top-${i}`}
            src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
            alt=""
            className="h-9 w-auto shrink-0 opacity-25"
          />
        ))}
      </motion.div>
    </div>
  );
}

const avatarImages = [
  "https://framerusercontent.com/images/75ILrhKQhUkwU1dH15BUDezAQ.png",
  "https://framerusercontent.com/images/EgbF2rgcHm4Q19cR6VXfj7f5awk.png",
  "https://framerusercontent.com/images/etglVFVv5e7VnmUVyHsNK3oyIbI.png",
  "https://framerusercontent.com/images/Y3PGv0d0lyAiS8gk3emx3d41fvU.png",
  "https://framerusercontent.com/images/kpYj3BEOGRfBZXfMd4dgKyI0.png",
];

export function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        gsap.set([".hero-media-box", ".hero-copy"], { autoAlpha: 1, clearProps: "transform" });
        return;
      }

      gsap.set(".hero-media-box", { autoAlpha: 0, y: -34 });
      gsap.set(".hero-copy", { autoAlpha: 0, y: 18 });

      gsap.timeline({ defaults: { ease: "power3.out" } })
        .to(".hero-media-box", {
          autoAlpha: 1,
          y: 0,
          duration: 0.72,
          stagger: 0.08,
        })
        .to(".hero-copy", {
          autoAlpha: 1,
          y: 0,
          duration: 0.62,
          stagger: 0.045,
        }, "-=0.1");
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="relative flex w-full flex-col items-center justify-center px-[120px] max-md:px-6">
      <div className="flex w-full max-w-[1440px] flex-col items-center gap-12 pb-[118px] pt-[180px] max-md:gap-8 max-md:pb-16 max-md:pt-[120px]">
        <div className="flex w-full max-w-[1000px] flex-col items-center gap-9 max-md:gap-6">
          <div className="hero-copy inline-flex items-center gap-2 rounded-[382px] border border-white bg-white px-4 py-2">
            <span
              className="h-[9px] w-[6px] rounded-full"
              style={{ backgroundColor: "rgb(12, 179, 0)" }}
            />
            <span className="text-base">Get Started for free!</span>
          </div>

          <div className="flex w-full flex-wrap items-center justify-center gap-3">
            <h1 className="hero-copy text-center text-[78px] font-normal leading-[1.15] -tracking-[0.06em] max-md:text-5xl max-sm:text-4xl">
              Open{" "}
            </h1>
            <Slideshow className="hero-media-box" />
            <h1 className="hero-copy text-center text-[78px] font-normal leading-[1.15] -tracking-[0.06em] max-md:text-5xl max-sm:text-4xl">
              <span className="text-black/50">Diagram</span>
            </h1>
            <h1 className="hero-copy text-center text-[78px] font-normal leading-[1.15] -tracking-[0.06em] max-md:text-5xl max-sm:text-4xl">
              <span className="text-black/50">for Every </span>
            </h1>
            <Ticker className="hero-media-box" />
            <h1 className="hero-copy text-center text-[78px] font-normal leading-[1.15] -tracking-[0.06em] max-md:text-5xl max-sm:text-4xl">
              Open Source Project
            </h1>
          </div>

          <p className="hero-copy max-w-[434px] text-center text-base leading-[1.7]">
            We help open source maintainers generate beautiful, accurate
            documentation — fast and automatically.
          </p>
        </div>

        <div className="hero-copy flex items-center gap-4 max-md:flex-col">
          <div className="inline-flex items-center gap-6 rounded-[33px] bg-white p-2">
            <a
              href="/import/github"
              className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-black px-6 py-3 text-sm font-medium text-white transition-all hover:opacity-90"
            >
              Import From GitHub
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </a>
          </div>

          <div className="flex flex-col items-start gap-0.5">
            <div className="relative h-8 w-[135px]">
              {avatarImages.map((src, i) => (
                <img
                  key={src}
                  src={src}
                  alt=""
                  className="absolute h-[31px] w-[31px] rounded-full border border-white"
                  style={{ left: `${i * 25}px` }}
                />
              ))}
            </div>
            <span className="text-xs">Trusted by Maintainers</span>
          </div>
        </div>
      </div>
    </section>
  );
}
