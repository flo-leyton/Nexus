import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const INITIAL = { scale: 1, x: 0, y: 0 };
type Size = { width: number; height: number };
type Transform = typeof INITIAL;

export function containSize(view: Size, image: Size): Size {
  const ratio = Math.min(view.width / image.width, view.height / image.height);
  return { width: image.width * ratio, height: image.height * ratio };
}

export function constrainPhoto(transform: Transform, view: Size, photo: Size): Transform {
  'worklet';
  const { scale, x, y } = transform;
  const maxX = Math.max(0, (photo.width * scale - view.width) / 2);
  const maxY = Math.max(0, (photo.height * scale - view.height) / 2);
  return { scale, x: maxX ? Math.max(-maxX, Math.min(maxX, x)) : 0,
    y: maxY ? Math.max(-maxY, Math.min(maxY, y)) : 0 };
}

export function zoomPhoto(start: Transform, scale: number, origin: { x: number; y: number },
  focus: { x: number; y: number }, view: Size, photo: Size): Transform {
  'worklet';
  const next = Math.max(1, Math.min(4, scale));
  const ratio = next / start.scale;
  return constrainPhoto({ scale: next, x: focus.x - (origin.x - start.x) * ratio,
    y: focus.y - (origin.y - start.y) * ratio }, view, photo);
}

export function PhotoViewport({ uri, onError }: { uri: string; onError(): void }) {
  const [view, setView] = useState<Size>({ width: 0, height: 0 });
  const [image, setImage] = useState<Size | null>(null);
  const photo = image ? containSize(view, image) : view;
  const transform = useSharedValue(INITIAL);
  const pinchStart = useSharedValue({ transform: INITIAL, x: 0, y: 0 });
  const pinching = useSharedValue(false);
  const pinch = Gesture.Pinch()
    .onStart((event) => {
      cancelAnimation(transform);
      pinching.value = true;
      pinchStart.value = { transform: transform.value, x: event.focalX - view.width / 2, y: event.focalY - view.height / 2 };
    })
    .onUpdate((event) => {
      const start = pinchStart.value;
      transform.value = zoomPhoto(start.transform, start.transform.scale * event.scale, start,
        { x: event.focalX - view.width / 2, y: event.focalY - view.height / 2 }, view, photo);
    })
    .onFinalize(() => { pinching.value = false; });
  const pan = Gesture.Pan().minDistance(5).maxPointers(1)
    .onStart(() => { if (!pinching.value) cancelAnimation(transform); })
    .onChange((event) => {
      if (pinching.value || event.numberOfPointers !== 1 || transform.value.scale <= 1) return;
      const { scale, x, y } = transform.value;
      transform.value = constrainPhoto({ scale, x: x + event.changeX, y: y + event.changeY }, view, photo);
    });
  const doubleTap = Gesture.Tap().numberOfTaps(2).onEnd((event, success) => {
    if (!success || pinching.value) return;
    const point = { x: event.x - view.width / 2, y: event.y - view.height / 2 };
    transform.value = withTiming(transform.value.scale > 1 ? INITIAL : zoomPhoto(INITIAL, 2, point, point, view, photo), { duration: 180 });
  });
  const style = useAnimatedStyle(() => {
    const { scale, x, y } = constrainPhoto(transform.value, view, photo);
    return { transform: [{ translateX: x }, { translateY: y }, { scale }] };
  });

  return <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, doubleTap)}>
    <View collapsable={false} style={styles.viewport} onLayout={({ nativeEvent: { layout } }) => {
      setView({ width: layout.width, height: layout.height });
    }}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject, style]}>
        <Image accessibilityLabel="Fotografía ampliable" source={{ uri }} resizeMode="contain" onError={onError}
          onLoad={({ nativeEvent: { source } }) => {
            if (source.width > 0 && source.height > 0) setImage({ width: source.width, height: source.height });
          }}
          style={StyleSheet.absoluteFillObject} />
      </Animated.View>
    </View>
  </GestureDetector>;
}

const styles = StyleSheet.create({ viewport: { flex: 1, overflow: 'hidden', backgroundColor: '#000' } });
