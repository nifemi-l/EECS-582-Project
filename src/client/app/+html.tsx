/* PROLOGUE
File name: +html.tsx
Description: Web-only root HTML shell for Expo Router. Replaces default ScrollViewStyleReset
             (body overflow hidden) with mobile-safe rules so pinch-zoom does not brick scrolling.
Programmers: Nifemi Lawal
Creation date: 4/13/26
Preconditions: None
Postconditions: None
Errors: None
Side effects: None
Invariants: None
Known faults: None
*/

import { type PropsWithChildren } from "react";

const ROOT_SCROLL_CSS = `
html {
  height: 100%;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}
body {
  margin: 0;
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
html, body, #root {
  height: 100%;
}
#root {
  display: flex;
  flex-direction: column;
}
`.trim();

/**
 * Root HTML for static web export and dev web. Runs in Node during static render;
 * must not use browser-only APIs.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <style id="expo-root-scroll-stable" dangerouslySetInnerHTML={{ __html: ROOT_SCROLL_CSS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
