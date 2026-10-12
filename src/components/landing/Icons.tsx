// Wayfinding pictograms: solid, square-ended shapes on a 24-unit grid.
type IconProps = { className?: string; title?: string };

function Svg({ className, title, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function ArrowRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 10.25h12.6L10.4 5.05 12.9 2.6 22.3 12l-9.4 9.4-2.5-2.45 5.2-5.2H3z" />
    </Svg>
  );
}

export function ArrowDown(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13.75 3v12.6l5.2-5.2 2.45 2.5L12 22.3l-9.4-9.4 2.45-2.5 5.2 5.2V3z" />
    </Svg>
  );
}

export function Lock(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 2a5.5 5.5 0 0 0-5.5 5.5V10H5v12h14V10h-1.5V7.5A5.5 5.5 0 0 0 12 2Zm-3 8V7.5a3 3 0 1 1 6 0V10Zm2 4h2v4h-2z" />
    </Svg>
  );
}

export function Plane(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21.5 15.2v-2l-8.25-5V3.4a1.6 1.6 0 0 0-3.2 0v4.8L1.8 13.2v2l8.25-2.55v4.85L7.8 19.2v1.6l3.85-1.1 3.85 1.1v-1.6l-2.25-1.7v-4.85z" />
    </Svg>
  );
}
