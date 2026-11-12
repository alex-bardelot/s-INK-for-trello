import {useMemo, useRef} from 'react';
import {GestureResponderHandlers, PanResponder} from 'react-native';

import {classifySwipe, SwipeDirection} from './layout';

/**
 * Detects a two-finger swipe, the gesture used to turn pages in Supernote
 * documents. One-finger touches are left to the views underneath (buttons),
 * and the swipe is reported once, when the fingers are lifted.
 */
export function useTwoFingerSwipe(
  onSwipe: (direction: SwipeDirection) => void,
): GestureResponderHandlers {
  // Kept in a ref so that the responder is created once.
  const onSwipeRef = useRef(onSwipe);
  onSwipeRef.current = onSwipe;

  return useMemo(() => {
    const finish = (dx: number, dy: number) => {
      const direction = classifySwipe(dx, dy);
      if (direction) {
        onSwipeRef.current(direction);
      }
    };
    return PanResponder.create({
      onStartShouldSetPanResponderCapture: event =>
        event.nativeEvent.touches.length >= 2,
      onMoveShouldSetPanResponderCapture: (_event, gesture) =>
        gesture.numberActiveTouches >= 2,
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_event, gesture) =>
        finish(gesture.dx, gesture.dy),
    }).panHandlers;
  }, []);
}
