import { Button, cn } from "@cloudflare/kumo";

type ButtonProps = React.ComponentProps<typeof Button> & {
  text: string;
  color: string;
};

export const HeroButton = ({ text, className, color, ...props }: ButtonProps) => {
  return (
    <Button
      variant="primary"
      className={cn(
        `!bg-${color} rounded-xl px-6 py-3 text-white`,
        "shadow-[0_1px_2px_0_rgba(14,18,27,0.24),0_0_0_1px_#288DFF,inset_0_1px_0_0_rgba(255,255,255,0.12)]",
        className,
      )}
      {...props}
    >
      {text}
    </Button>
  );
};

type MarketingButtonProps = React.ComponentProps<typeof Button> & {
  text: string;
  color: "black" | "blue";
};

export const MarketingButton = ({
  text,
  className,
  color,
  style,
  ...props
}: MarketingButtonProps) => {
  const isBlack = color === "black";
  const bg = isBlack ? "#1a1a1a" : "#288DFF";
  const ring = isBlack ? "#1a1a1a" : "#288DFF";
  const gradientStart = isBlack ? "#2a2a2a" : "#3b97ff";
  const gradientEnd = isBlack ? "#111111" : "#1580f5";

  const customStyle = {
    ...style,
    "--kumo-button-emphasis-bg": bg,
    "--kumo-button-emphasis-ring": ring,
    "--kumo-button-emphasis-gradient-start": gradientStart,
    "--kumo-button-emphasis-gradient-end": gradientEnd,
  } as React.CSSProperties;

  return (
    <Button
      variant="primary"
      className={cn(
        "rounded-xl px-6 py-3 text-white shadow-[0_1px_2px_0_rgba(14,18,27,0.24)]",
        className,
      )}
      style={customStyle}
      {...props}
    >
      {text}
    </Button>
  );
};

type CustomButtonProps = React.ComponentPropsWithoutRef<"button"> & {
  text: string;
};

export const CustomButton = ({ text, className, ...props }: CustomButtonProps) => {
  return (
    <button
      className={cn(
        "inline-flex h-[30px] items-center justify-center rounded-[10px] px-4 bg-gradient-to-b from-white to-[#F7F7F7] font-[Geist,sans-serif] text-sm font-medium text-black shadow-[0_1px_2px_0_rgba(40,40,40,0.08),0_0_0_1px_#ECECEC] cursor-pointer",
        className,
      )}
      {...props}
    >
      {text}
    </button>
  );
};
