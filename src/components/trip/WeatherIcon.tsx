import { useId } from "react";
import type { WeatherDay } from "./dayPlan";

// Weather pictograms in the wayfinding style: solid shapes on a 24-unit grid.
export type Condition = WeatherDay["condition"];

function Sun({ c, r, inner, outer, w }: { c: number; r: number; inner: number; outer: number; w: number }) {
  const len = outer - inner;
  const ray = `M${c - w / 2} ${c - outer}h${w}v${len}h${-w}zM${c - w / 2} ${c + inner}h${w}v${len}h${-w}z`;
  return (
    <>
      {[0, 45, 90, 135].map((angle) => (
        <path key={angle} d={ray} transform={angle ? `rotate(${angle} ${c} ${c})` : undefined} />
      ))}
      <circle cx={c} cy={c} r={r} />
    </>
  );
}

const fullCloud = (
  <>
    <circle cx="8" cy="14.5" r="5" />
    <circle cx="13.5" cy="10.5" r="6" />
    <circle cx="17.5" cy="15" r="4.5" />
    <rect x="8" y="13.5" width="9.5" height="6" />
  </>
);

const highCloud = (
  <>
    <circle cx="8" cy="10" r="4.5" />
    <circle cx="13" cy="7" r="5" />
    <circle cx="17" cy="10.5" r="4" />
    <rect x="8" y="9.5" width="9" height="5" />
  </>
);

const lowCloud = (
  <>
    <circle cx="10.5" cy="16.5" r="4" />
    <circle cx="15" cy="13" r="5" />
    <circle cx="18.5" cy="16.75" r="3.75" />
    <rect x="10.5" y="15" width="8" height="5.5" />
  </>
);

export function WeatherIcon({ condition, className }: { condition: Condition; className?: string }) {
  const maskId = `wx${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  let shapes: React.ReactNode;
  switch (condition) {
    case "clear":
      shapes = <Sun c={12} r={4.6} inner={7} outer={10.6} w={2.2} />;
      break;
    case "partly-cloudy":
      // The mask cuts a gap around the cloud so the sun reads as behind it.
      shapes = (
        <>
          <defs>
            <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
              <rect width="24" height="24" fill="#fff" />
              <g fill="#000" stroke="#000" strokeWidth="3">
                {lowCloud}
              </g>
            </mask>
          </defs>
          <g mask={`url(#${maskId})`}>
            <Sun c={8.5} r={3.4} inner={5.3} outer={7.7} w={2} />
          </g>
          {lowCloud}
        </>
      );
      break;
    case "cloudy":
      shapes = fullCloud;
      break;
    case "rain":
      shapes = (
        <>
          {highCloud}
          <path d="M7.6 16.5h2.2l-1.6 5.5H6zM12 16.5h2.2l-1.6 5.5h-2.2zM16.4 16.5h2.2L17 22h-2.2z" />
        </>
      );
      break;
    case "storm":
      shapes = (
        <>
          {highCloud}
          <path d="M11.6 16h4l-1.9 2.8h2.6L10.6 23.5l1.3-3.4H9.6z" />
          <path d="M6.6 16.5h2.2l-1.6 5.5H5z" />
        </>
      );
      break;
  }

  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      {shapes}
    </svg>
  );
}
