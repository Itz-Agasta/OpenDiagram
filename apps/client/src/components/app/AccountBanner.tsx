import { Banner, cn } from "@cloudflare/kumo";

/** Default informational banner with title and description. */
export function AccountBanner({
  imageUrl,
  name,
  email,
  className,
}: {
  imageUrl: string;
  name: string;
  email: string;
  className: string;
}) {
  return (
    <Banner
      icon={
        <img
          src={imageUrl}
          alt="User avatar"
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            objectFit: "cover",
          }}
        />
      }
      title={name ? name : "Guest"}
      className={cn(className)}
    >
      <p>{email}</p>
    </Banner>
  );
}
