const GA_SCRIPT_ID = 'ga4-script';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export const gaMeasurementId = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim();

export function initializeAnalytics() {
  if (!gaMeasurementId || typeof window === 'undefined') {
    return;
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function gtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    };

  if (!document.getElementById(GA_SCRIPT_ID)) {
    const script = document.createElement('script');
    script.id = GA_SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaMeasurementId)}`;
    document.head.appendChild(script);
  }

  window.gtag('js', new Date());
}

export function trackPageView(path: string) {
  if (!gaMeasurementId || typeof window === 'undefined') {
    return;
  }

  window.gtag?.('config', gaMeasurementId, {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}
