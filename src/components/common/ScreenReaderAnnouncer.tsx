import React from 'react';

interface ScreenReaderAnnouncerProps {
  message: string;
}

/**
 * Accessible ARIA live region for screen-reader announcements (Test 3 / WCAG).
 */
export const ScreenReaderAnnouncer: React.FC<ScreenReaderAnnouncerProps> = ({ message }) => {
  return (
    <div
      data-testid="screen-reader-announcer"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
};
