import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "Vendor Observatory";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const fontData = await fetch(
    new URL("./fonts/JetBrainsMono-Medium.ttf", import.meta.url)
  ).then((res) => res.arrayBuffer());

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "1200px",
          height: "630px",
          backgroundColor: "#0d0d0f",
        }}
      >
        {/* Main area: vendor-observatory text centered */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "1200px",
            height: "530px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontFamily: "JetBrains Mono",
              fontSize: 64,
              fontWeight: 500,
              color: "#f0f0f4",
              letterSpacing: "-0.02em",
            }}
          >
            vendor-observatory
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            width: "1200px",
            height: "100px",
            padding: "24px 40px",
            backgroundColor: "#18181c",
            borderTop: "1px solid #222228",
          }}
        >
          <div
            style={{
              display: "flex",
              fontFamily: "JetBrains Mono",
              fontSize: 24,
              fontWeight: 500,
              color: "#f0f0f4",
              marginBottom: "4px",
            }}
          >
            Revealed Preference &gt; Stated
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "JetBrains Mono",
              fontSize: 16,
              color: "#5a5a6e",
            }}
          >
            panopticonos.com
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "JetBrains Mono",
          data: fontData,
          style: "normal",
          weight: 500,
        },
      ],
    }
  );
}
