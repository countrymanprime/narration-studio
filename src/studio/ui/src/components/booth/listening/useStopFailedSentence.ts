import { useEffect, useRef } from 'react';
import type { OverlayService } from '../../../overlay/overlayService';
import { retryAction } from '../../primitives/Toast';

const STOP_FAILED_TOPIC = 'booth-listening-stop-failed';

/**
 * Says, once, that the host would not stop the listening session (#3409): the microphone may still be open and the next start would find the session
 * "already running". Retry sends the stop again, only while the session it meant is still the one running (`retryStop`). The sentence goes when its reason
 * does: the session ends, a new one starts or is joined (`stopFailed` clears), or the Booth that said it is left (its Retry would be unchecked then). Only a
 * sentence this page said is ever dismissed.
 */
export function useStopFailedSentence(overlay: Pick<OverlayService, 'toast' | 'dismissTopic'>, stopFailed: boolean, stopAgain: () => void): void {
  const said = useRef(false);
  const again = useRef(stopAgain);
  again.current = stopAgain;
  useEffect(() => {
    if (stopFailed) {
      said.current = true;
      overlay.toast(
        'The Booth could not stop listening, so your microphone may still be open. Press Retry, or quit and reopen the app if the microphone stays on.',
        {
          tone: 'error',
          topic: STOP_FAILED_TOPIC,
          action: retryAction(() => again.current()),
        },
      );
    } else if (said.current) {
      said.current = false;
      overlay.dismissTopic(STOP_FAILED_TOPIC);
    }
  }, [overlay, stopFailed]);
  useEffect(
    () => () => {
      if (said.current) {
        said.current = false;
        overlay.dismissTopic(STOP_FAILED_TOPIC);
      }
    },
    [overlay],
  );
}
