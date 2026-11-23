interface BannerProps {
  message: string | null;
  onClose: () => void;
}

export function Banner({ message, onClose }: BannerProps) {
  if (!message) return null;

  return (
    <div className="banner" role="alert">
      <span className="banner-text">{message}</span>
      <button
        type="button"
        className="banner-close"
        onClick={onClose}
        aria-label="بستن پیام"
      >
        ×
      </button>
    </div>
  );
}
