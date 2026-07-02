import Script from "next/script";

const MEDIA_SHADER_SRC = "https://unpkg.com/media-shader@1.1.6/media-shader.js";
const MEDIA_SHADER_INTEGRITY =
  "sha384-EuKn7HDNNaAsO1Kt2EKRvuNsu7gZa76tjbNFCTPbu4Qqi3+5O89Dxe6vhaNdg+BE";

export function MediaShaderScript() {
  return (
    <Script
      crossOrigin="anonymous"
      integrity={MEDIA_SHADER_INTEGRITY}
      src={MEDIA_SHADER_SRC}
      strategy="afterInteractive"
    />
  );
}
