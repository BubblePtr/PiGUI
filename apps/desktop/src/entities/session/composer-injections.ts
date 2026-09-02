/**
 * The way into a mounted composer from outside the chat column.
 *
 * The draft is local state inside `FullChatComposer` and its attachments only
 * ever exist in memory, so there is nothing to write to for a surface that
 * wants to hand the user something to send — hence a window event, the same
 * paradigm the follow-up drafts next door already use.
 *
 * Only a composer that is mounted for that Session can take an injection, and
 * `injectIntoComposer` says whether one did. Nothing is queued for one that is
 * not — an archived Session is a read-only projection with no composer at all
 * — so the sender has to be able to tell the user that, with the annotations
 * still on the page to send again. Images especially must not be persisted:
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

/** The envelope: `delivered` is the subscriber's answer back to the sender. */
type ComposerInjectionEnvelope = {
  injection: ComposerInjection;
  delivered: boolean;
};

/**
 * Returns whether a composer took it. Dispatch is synchronous, so the answer
 * is known by the time this returns — and a caller that hears "no" can say so
 * rather than let the user believe their marks were sent somewhere.
 */
export function injectIntoComposer(injection: ComposerInjection) {
  const envelope: ComposerInjectionEnvelope = { injection, delivered: false };

  window.dispatchEvent(
    new CustomEvent<ComposerInjectionEnvelope>(composerInjectionEvent, {
      detail: envelope,
    }),
  );

  return envelope.delivered;
}

export function subscribeComposerInjections(
  sessionId: string,
  listener: (injection: ComposerInjection) => void,
) {
  const handle = (event: Event) => {
    const envelope = (event as CustomEvent<ComposerInjectionEnvelope>).detail;

    // One composer is mounted at a time, but it outlives Session switches —
    // an injection aimed at the Session it used to show is not for it.
    if (envelope.injection.sessionId !== sessionId) {
      return;
    }

    envelope.delivered = true;
    listener(envelope.injection);
  };

  window.addEventListener(composerInjectionEvent, handle);

  return () => window.removeEventListener(composerInjectionEvent, handle);
}
