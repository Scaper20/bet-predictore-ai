"use client";

import dynamic from "next/dynamic";

// Floating, fixed-position extras that nothing on first paint depends on.
// Loaded as separate chunks after hydration so they stay out of the startup
// JavaScript every page pays for — on a low-end Android phone that startup
// cost, not the network, is what holds back the first screen.
const ChatWidget = dynamic(() => import("@/components/support/chat-widget").then((m) => m.ChatWidget), { ssr: false });
const FeedbackWidget = dynamic(() => import("@/components/feedback/feedback-widget").then((m) => m.FeedbackWidget), {
  ssr: false,
});
const WhatsAppPopup = dynamic(() => import("@/components/landing/whatsapp-popup").then((m) => m.WhatsAppPopup), {
  ssr: false,
});
const GiftPopup = dynamic(() => import("@/components/account/gift-popup").then((m) => m.GiftPopup), { ssr: false });
const InstallPrompt = dynamic(() => import("@/components/pwa/install-prompt").then((m) => m.InstallPrompt), {
  ssr: false,
});
const NotificationPrompt = dynamic(
  () => import("@/components/pwa/notification-prompt").then((m) => m.NotificationPrompt),
  { ssr: false },
);
const AskPanel = dynamic(() => import("@/components/ask/ask-panel").then((m) => m.AskPanel), { ssr: false });
const ScrollToTop = dynamic(() => import("@/components/ui/scroll-to-top").then((m) => m.ScrollToTop), { ssr: false });

export function DeferredWidgets() {
  return (
    <>
      <ChatWidget />
      <FeedbackWidget />
      <WhatsAppPopup />
      <GiftPopup />
      <InstallPrompt />
      <NotificationPrompt />
      <ScrollToTop />
      <AskPanel />
    </>
  );
}
