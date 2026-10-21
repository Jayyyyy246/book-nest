import { useEffect, useRef } from 'react';

interface UseModalA11yOptions {
  isOpen: boolean;
  onClose: () => void;
  autoFocusSelector?: string;
  preventScroll?: boolean;
}

export function useModalA11y({
  isOpen,
  onClose,
  autoFocusSelector,
  preventScroll = true,
}: UseModalA11yOptions) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // Focus capture, body scroll lock, and opener restoration
  useEffect(() => {
    if (!isOpen) return;

    // Capture the element that had focus when the modal was opened
    openerRef.current = document.activeElement as HTMLElement | null;

    // Prevent background scrolling while modal is open
    const originalOverflow = document.body.style.overflow;
    if (preventScroll) {
      document.body.style.overflow = 'hidden';
    }

    // Move keyboard focus into the modal
    const timer = setTimeout(() => {
      if (!modalRef.current) return;

      if (autoFocusSelector) {
        const target = modalRef.current.querySelector<HTMLElement>(autoFocusSelector);
        if (target && typeof target.focus === 'function') {
          target.focus();
          return;
        }
      }

      // Find first visible focusable element
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      const visibleFocusable = Array.from(focusable).filter(
        el => el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0
      );

      if (visibleFocusable.length > 0) {
        visibleFocusable[0].focus();
      } else {
        modalRef.current.focus();
      }
    }, 40);

    return () => {
      clearTimeout(timer);
      if (preventScroll) {
        document.body.style.overflow = originalOverflow;
      }
      // Restore focus to the opener element
      if (openerRef.current && typeof openerRef.current.focus === 'function') {
        openerRef.current.focus();
      }
    };
  }, [isOpen, autoFocusSelector, preventScroll]);

  // Tab and Shift+Tab Focus Trapping & Escape Key Dismissal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        const focusable = Array.from(focusableElements).filter(
          el => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
        );

        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return { modalRef, openerRef };
}
