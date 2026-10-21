/* ==========================================================================
   BOOKNEST ANIMATED LAMP LOGIN COMPONENT
   Adapted from: https://github.com/saklincodes/Animated-Lamp-Login
   Original Copyright (c) 2025 saklincodes (MIT License)

   Permission is hereby granted, free of charge, to any person obtaining a copy
   of this software and associated documentation files (the "Software"), to deal
   in the Software without restriction, including without limitation the rights
   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   copies of the Software, and to permit persons to whom the Software is
   furnished to do so, subject to the following conditions:

   The above copyright notice and this permission notice shall be included in all
   copies or substantial portions of the Software.

   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   SOFTWARE.
   ========================================================================== */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import '../styles/animated-lamp-login.css';

interface AnimatedLampLoginProps {
  isOn: boolean;
  onToggleLamp: (on: boolean) => void;
  className?: string;
  stringHandleRef?: React.RefObject<HTMLDivElement | null>;
  accessibleToggleRef?: React.RefObject<HTMLButtonElement | null>;
}

export const AnimatedLampLogin: React.FC<AnimatedLampLoginProps> = ({
  isOn,
  onToggleLamp,
  className = '',
  stringHandleRef,
  accessibleToggleRef,
}) => {
  // Sound toggle (Web Audio API procedural synthesizer) - MUTED by default
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // References for spring physics & visual updates
  const pathRef = useRef<SVGPathElement | null>(null);
  const localHandleRef = useRef<HTMLDivElement | null>(null);
  const handleRef = stringHandleRef || localHandleRef;
  const lampHeadRef = useRef<HTMLDivElement | null>(null);
  const lightBeamRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  // Physics & gesture debouncing state
  const springRafRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const hasToggledInCurrentGestureRef = useRef(false);
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const curXRef = useRef(0);
  const curYRef = useRef(0);
  const defaultLength = 80;

  // Reduced motion preference
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, []);

  // Web Audio API initialization and sound generation
  const initAudio = useCallback(() => {
    if (!audioCtxRef.current && typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioCtxRef.current = new AudioContextClass();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
  }, []);

  const playSound = useCallback((type: 'pull' | 'switch' | 'tap') => {
    if (!soundEnabled) return;
    try {
      initAudio();
      const ctx = audioCtxRef.current;
      if (!ctx) return;

      const now = ctx.currentTime;

      if (type === 'pull') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.05);

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.05);
      } else if (type === 'switch') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(isOn ? 700 : 1200, now);
        osc.frequency.exponentialRampToValueAtTime(isOn ? 200 : 300, now + 0.06);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.07);

        if (!isOn) {
          const humOsc = ctx.createOscillator();
          const humGain = ctx.createGain();
          humOsc.type = 'sine';
          humOsc.frequency.setValueAtTime(120, now);
          humGain.gain.setValueAtTime(0.08, now);
          humGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

          humOsc.connect(humGain);
          humGain.connect(ctx.destination);
          humOsc.start(now);
          humOsc.stop(now + 0.25);
        }
      } else if (type === 'tap') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(540, now);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.04);
      }
    } catch {
      // AudioContext unavailable or blocked by browser policy
    }
  }, [soundEnabled, initAudio, isOn]);

  // Update SVG string path and handle transform
  const updateStringVisual = useCallback((x: number, y: number) => {
    if (pathRef.current) {
      pathRef.current.setAttribute(
        'd',
        `M 0 0 Q ${x * 0.3} ${(defaultLength + y) * 0.5} ${x} ${defaultLength + y}`
      );
    }
    if (handleRef.current) {
      handleRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
  }, [defaultLength, handleRef]);

  // Spring physics calculation on release
  const startSpringPhysics = useCallback((initialX: number, initialY: number) => {
    if (springRafRef.current) {
      cancelAnimationFrame(springRafRef.current);
    }

    if (prefersReducedMotion) {
      updateStringVisual(0, 0);
      return;
    }

    let x = initialX;
    let y = initialY;
    let vx = 0;
    let vy = 0;
    const stiffness = 0.16;
    const damping = 0.78;

    const step = () => {
      const ax = -stiffness * x;
      const ay = -stiffness * y;

      vx = (vx + ax) * damping;
      vy = (vy + ay) * damping;

      x += vx;
      y += vy;

      updateStringVisual(x, y);

      if (Math.abs(x) > 0.1 || Math.abs(y) > 0.1 || Math.abs(vx) > 0.1 || Math.abs(vy) > 0.1) {
        springRafRef.current = requestAnimationFrame(step);
      } else {
        updateStringVisual(0, 0);
      }
    };

    springRafRef.current = requestAnimationFrame(step);
  }, [prefersReducedMotion, updateStringVisual]);

  const triggerToggle = useCallback(() => {
    playSound('switch');
    onToggleLamp(!isOn);
  }, [isOn, onToggleLamp, playSound]);

  // Pointer drag events for pull switch
  const handlePointerDown = (e: React.PointerEvent) => {
    if (springRafRef.current) {
      cancelAnimationFrame(springRafRef.current);
    }
    isDraggingRef.current = true;
    hasToggledInCurrentGestureRef.current = false;
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    curXRef.current = 0;
    curYRef.current = 0;

    if (handleRef.current) {
      handleRef.current.classList.add('dragging');
      try {
        handleRef.current.setPointerCapture(e.pointerId);
      } catch {}
    }
    playSound('pull');
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;

    const rawDx = (e.clientX - startXRef.current) * 0.35;
    const rawDy = Math.max(0, e.clientY - startYRef.current) * 0.75;

    curXRef.current = Math.max(-35, Math.min(35, rawDx));
    curYRef.current = Math.min(140, rawDy);

    updateStringVisual(curXRef.current, curYRef.current);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    if (handleRef.current) {
      handleRef.current.classList.remove('dragging');
      try {
        handleRef.current.releasePointerCapture(e.pointerId);
      } catch {}
    }

    // Forgiving downward threshold: > 20px
    const triggered = curYRef.current > 20;
    if (triggered && !hasToggledInCurrentGestureRef.current) {
      hasToggledInCurrentGestureRef.current = true;
      triggerToggle();
    }

    startSpringPhysics(curXRef.current, curYRef.current);
  };

  // Keyboard accessibility: Enter or Space triggers the switch
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      triggerToggle();
      startSpringPhysics(0, 35);
    }
  };

  // Click on string handle directly
  const handleClick = () => {
    if (!hasToggledInCurrentGestureRef.current && curYRef.current <= 5) {
      hasToggledInCurrentGestureRef.current = true;
      triggerToggle();
      startSpringPhysics(0, 30);
    }
  };

  // Subtle 3D mouse parallax tilt
  useEffect(() => {
    if (prefersReducedMotion) return;

    let mouseRaf: number | null = null;
    const handleMouseMove = (e: MouseEvent) => {
      if (mouseRaf) cancelAnimationFrame(mouseRaf);
      mouseRaf = requestAnimationFrame(() => {
        if (!stageRef.current || !lampHeadRef.current || !lightBeamRef.current) return;
        const rect = stageRef.current.getBoundingClientRect();
        if (rect.width === 0) return;

        const normX = ((e.clientX - rect.left) / rect.width - 0.5) * 2; // -1 to 1
        const rotateZ = normX * 4;
        const skewX = normX * 1.5;

        lampHeadRef.current.style.transform = `rotate(${rotateZ}deg) skewX(${skewX}deg)`;
        lightBeamRef.current.style.transform = `translate3d(${normX * 10}px, 0, 0) rotate(${rotateZ * 0.7}deg)`;
      });
    };

    const stageEl = stageRef.current;
    if (stageEl) {
      stageEl.addEventListener('mousemove', handleMouseMove, { passive: true });
    }

    return () => {
      if (mouseRaf) cancelAnimationFrame(mouseRaf);
      if (stageEl) {
        stageEl.removeEventListener('mousemove', handleMouseMove);
      }
    };
  }, [prefersReducedMotion]);

  // Clean up animation frames and audio contexts on unmount
  useEffect(() => {
    return () => {
      if (springRafRef.current) {
        cancelAnimationFrame(springRafRef.current);
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  return (
    <div
      ref={stageRef}
      className={`booknest-lamp-stage ${className}`}
      aria-label="Interactive campus reading lamp"
    >
      {/* Subtle Night Nook Stars */}
      <div className="booknest-nook-stars" aria-hidden="true" />

      {/* Floating Dust Motes in Lamp Beam */}
      <div className="booknest-dust-motes" aria-hidden="true">
        <span className="booknest-mote" style={{ top: '35%', left: '42%', width: '4px', height: '4px', animationDelay: '0s' }} />
        <span className="booknest-mote" style={{ top: '55%', left: '52%', width: '5px', height: '5px', animationDelay: '-2s' }} />
        <span className="booknest-mote" style={{ top: '70%', left: '38%', width: '3px', height: '3px', animationDelay: '-4s' }} />
        <span className="booknest-mote" style={{ top: '48%', left: '60%', width: '4px', height: '4px', animationDelay: '-1.5s' }} />
      </div>

      {/* Controls Overlay: Lamp Status & Sound FX Toggle */}
      <div className="booknest-lamp-controls">
        <div className="booknest-lamp-pill" aria-live="polite">
          <span className="booknest-lamp-pill-dot" />
          <span>{isOn ? 'Reading Lamp Active' : 'Night Room Ambiance'}</span>
        </div>

        <button
          type="button"
          onClick={() => {
            const next = !soundEnabled;
            setSoundEnabled(next);
            if (next) playSound('tap');
          }}
          className="booknest-sound-btn"
          aria-label={soundEnabled ? 'Disable lamp sound effects' : 'Enable lamp sound effects'}
          title={soundEnabled ? 'Sound Effects Enabled' : 'Sound Effects Disabled (Click to enable)'}
        >
          {soundEnabled ? (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.08" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          ) : (
            <svg className="w-4 h-4 opacity-75" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          )}
        </button>
      </div>

      {/* Interactive Lamp Assembly */}
      <div className="booknest-lamp-assembly">
        {/* Pull Hint Tooltip */}
        <div className="booknest-pull-hint" aria-hidden="true">
          <i className="fa-solid fa-hand-pointer text-amber-400 text-xs" />
          <span>{isOn ? 'Pull string to dim' : 'Pull string to begin'}</span>
        </div>

        {/* Lamp Finial */}
        <div className="booknest-lamp-finial" aria-hidden="true" />

        {/* Lamp Head & Bulb */}
        <div ref={lampHeadRef} className="booknest-lamp-head" aria-hidden="true">
          <div className="booknest-lamp-bulb" />
        </div>

        {/* Core Glow & Volumetric Light Beam */}
        <div className="booknest-lamp-glow" aria-hidden="true" />
        <div ref={lightBeamRef} className="booknest-light-beam" aria-hidden="true" />

        {/* Neck, Stem, Joint, Base, Desk Glow */}
        <div className="booknest-lamp-neck-joint" aria-hidden="true" />
        <div className="booknest-lamp-stem" aria-hidden="true" />
        <div className="booknest-lamp-joint" aria-hidden="true" />
        <div className="booknest-lamp-base" aria-hidden="true">
          <div className="booknest-base-ridge" />
        </div>
        <div className="booknest-desk-surface" aria-hidden="true" />

        {/* Dynamic SVG String Path with Physics Curve */}
        <svg className="booknest-string-svg" aria-hidden="true">
          <path ref={pathRef} d="M 0 0 L 0 80" />
        </svg>

        {/* Interactive Pull String Handle */}
        <div
          ref={handleRef}
          role="button"
          tabIndex={0}
          aria-label={isOn ? 'Turn reading lamp off' : 'Pull lamp string to reveal login form'}
          aria-pressed={isOn}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={handleKeyDown}
          onClick={handleClick}
          className="booknest-string-handle"
          title={isOn ? 'Click or pull to turn lamp off' : 'Click or pull to reveal login form'}
        >
          <div className="booknest-handle-bead" aria-hidden="true" />
        </div>
      </div>

      {/* Cinematic Intro (Shown When Lamp is Switched OFF) */}
      <div className="booknest-lamp-intro">
        <div className="booknest-intro-badge">
          <i className="fa-solid fa-book-bookmark" aria-hidden="true" />
          <span>BookNest Campus Library</span>
        </div>

        <blockquote className="booknest-intro-quote">
          “Every great story begins with a little light.”
        </blockquote>

        <p className="booknest-intro-instruction">
          <i className="fa-solid fa-arrow-down text-amber-400 text-xs" aria-hidden="true" />
          <span>Pull the string to begin.</span>
        </p>

        {/* Accessible Alternative Button for Screen Readers & Keyboard Users */}
        <button
          ref={accessibleToggleRef}
          type="button"
          onClick={() => {
            triggerToggle();
            startSpringPhysics(0, 30);
          }}
          className="booknest-lamp-toggle-btn"
          aria-label={isOn ? 'Turn lamp off and hide login' : 'Pull lamp string to reveal login form'}
        >
          <i className={`fa-solid ${isOn ? 'fa-lightbulb' : 'fa-power-off'}`} aria-hidden="true" />
          <span>{isOn ? 'Turn Lamp Off' : 'Pull String to Begin'}</span>
        </button>
      </div>
    </div>
  );
};
