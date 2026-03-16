import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "Vendor Observatory";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const jetbrainsMono = await fetch(
    "https://fonts.gstatic.com/s/jetbrainsmono/v18/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKxjPVmUsaaDhw.woff"
  ).then((res) => res.arrayBuffer());

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          backgroundColor: "#0d0d0f",
        }}
      >
        {/* Main area: vendor-observatory text centered */}
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontFamily: "JetBrains Mono",
              fontSize: 64,
              fontWeight: 500,
              color: "#f0f0f4",
              letterSpacing: "-0.02em",
            }}
          >
            vendor-observatory
          </span>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "24px 40px",
            backgroundColor: "#18181c",
            borderTop: "1px solid #222228",
            gap: "4px",
          }}
        >
          <span
            style={{
              fontFamily: "JetBrains Mono",
              fontSize: 24,
              fontWeight: 500,
              color: "#f0f0f4",
            }}
          >
            Revealed Preference {">"} Stated
          </span>
          <span
            style={{
              fontFamily: "JetBrains Mono",
              fontSize: 16,
              color: "#5a5a6e",
            }}
          >
            panopticonos.com
          </span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "JetBrains Mono",
          data: jetbrainsMono,
          style: "normal",
          weight: 500,
        },
      ],
    }
  );
}
