/**
 * The way into a mounted composer from outside the chat column.
 *
 * The draft is local state inside `FullChatComposer` and its attachments only
 * ever exist in memory, so there is nothing to write to for a surface that
 * wants to hand the user something to send — hence a window event, the same
 * paradigm the follow-up drafts next door already use.
 *
 * Only a composer that is mounted for that Session can take an injection.
 * Nothing is queued for one that is not: the annotations stay in the page and
 * the surface can send them again. Images especially must not be persisted —
 * `follow-up-drafts.ts` is localStorage, and a screenshot does not belong
 * there (PRD S3 implementation constraint 5).
 */

export type ComposerInjection = {
  sessionId: string;
  /** Appended to the draft as its own block, never replacing what is there. */
  text: string;
  /** Handed to the composer's existing attachment path, so they get the
   *  drawer preview and the size checks that come with it. */
  files?: File[];
};

const composerInjectionEvent = "pigui:composer-injection";

export function injectIntoComposer(injection: ComposerInjection) {
  window.dispatchEvent(
    new CustomEvent<ComposerInjection>(composerInjectionEvent, { detail: injection }),
  );
}

export function subscribeComposerInjections(
  sessionId: string,
  listener: (injection: ComposerInjection) => void,
) {
  const handle = (event: Event) => {
    const injection = (event as CustomEvent<ComposerInjection>).detail;

    // One composer is mounted at a time, but it outlives Session switches —
    // an injection aimed at the Session it used to show is not for it.
    if (injection.sessionId === sessionId) {
      listener(injection);
    }
  };

  window.addEventListener(composerInjectionEvent, handle);

  return () => window.removeEventListener(composerInjectionEvent, handle);
}
