import { permanentRedirect } from "next/navigation";

export default function BlogsRedirect() {
  permanentRedirect("/blog");
}
