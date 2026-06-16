"use client";

/**
 * Ambient "threat console" backdrop: layered grid, radial signal glow and a
 * slow vertical sweep line. Purely decorative and pointer-events-none.
 */
export function AppBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-bg">
      <div className="absolute inset-0 bg-grid opacity-[0.55]" />
      <div className="absolute inset-0 bg-radial-glow" />
      {/* horizon glow */}
      <div className="absolute -top-40 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-accent/10 blur-[140px]" />
      <div className="absolute bottom-[-160px] right-[-120px] h-[380px] w-[520px] rounded-full bg-accent-2/10 blur-[150px]" />
      {/* sweep line */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
    </div>
  );
}
