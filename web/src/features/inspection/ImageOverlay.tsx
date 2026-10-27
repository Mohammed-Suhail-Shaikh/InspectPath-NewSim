import { useEffect, useRef } from "react";

// An accessible image lightbox. Opens an enlarged image over a backdrop.
// Close with Esc, the visible close button, or a backdrop click. Focus moves
// into the overlay on open and returns to the element that opened it on close
// (the caller passes returnFocusRef). The image carries alt text.
export default function ImageOverlay({
  src,
  alt,
  onClose,
  returnFocusRef,
}: {
  src: string;
  alt: string;
  onClose: () => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Move focus into the overlay (the close button) on open.
    closeBtnRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Tab") {
        // Simple focus trap: the dialog has one focusable control (close), so
        // keep focus on it.
        e.preventDefault();
        closeBtnRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      // Return focus to the thumbnail that opened the overlay.
      returnFocusRef?.current?.focus();
    };
  }, [onClose, returnFocusRef]);

  return (
    <div
      className="image-overlay-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      ref={dialogRef}
      onClick={(e) => {
        // Close only when the backdrop itself (not the image/button) is clicked.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="image-overlay-content">
        <button
          ref={closeBtnRef}
          className="image-overlay-close"
          onClick={onClose}
          aria-label="Close enlarged image"
        >
          Close
        </button>
        <img className="image-overlay-img" src={src} alt={alt} />
      </div>
    </div>
  );
}
