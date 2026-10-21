# Third-Party Licenses & Attributions

This document records third-party open-source components, reference implementations, and design patterns incorporated or adapted into BookNest.

---

## 1. Animated Lamp Login

* **Source Repository**: `https://github.com/saklincodes/Animated-Lamp-Login`
* **Original Author**: saklincodes
* **License**: MIT License
* **Usage in BookNest**:
  - Visual lamp structure (lampshade, volumetric light beam, desk glow, hardware assembly).
  - SVG pull-string quadratic Bezier path rendering and damped harmonic spring physics mechanics.
  - Web Audio API procedural sound synthesizer for mechanical switch, string tension, and filament hum.
  - Adapted into React component [`src/components/AnimatedLampLogin.tsx`](file:///C:/Users/jay/Book%20Nest/book-nest/src/components/AnimatedLampLogin.tsx) and CSS module [`src/styles/animated-lamp-login.css`](file:///C:/Users/jay/Book%20Nest/book-nest/src/styles/animated-lamp-login.css), tuned to BookNest's warm amber and slate palette with full WCAG accessibility, reduced-motion queries, and non-blocking authentication integration.

### Full MIT License Text

```text
MIT License

Copyright (c) 2025 saklincodes

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
```
