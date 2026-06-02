interface LoadingSpinnerProps {
  kicker?: string;
  title?: string;
  subtitle?: string;
}

export function LoadingSpinner({
  kicker = 'Cylform',
  title = 'Preparing molecular workspace',
  subtitle = 'Loading the 3-D renderer and desktop workspace.',
}: LoadingSpinnerProps) {
  return (
    <div className="canvas-shell-loading" role="status" aria-live="polite">
      <div className="loading-card">
        <div className="loading-orbit" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p className="loading-kicker">{kicker}</p>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}
