import { useRef, type KeyboardEvent } from "react";

/** Keyboard convenience only: the existing form retains all send authority. */
export function useChatSubmit() {
  const composing = useRef(false);
  return {
    onCompositionStart: () => { composing.current = true; },
    onCompositionEnd: () => { composing.current = false; },
    onBlur: () => { composing.current = false; },
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.defaultPrevented || event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey ||
          composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
      event.preventDefault();
      // Holding Enter must neither resend an uncertain message nor add newlines.
      if (!event.repeat) event.currentTarget.form?.requestSubmit();
    },
  };
}
