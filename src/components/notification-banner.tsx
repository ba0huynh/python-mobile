import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { useSocket, type BannerType } from '@/lib/socket';

const BANNER_CONFIG: Record<
  BannerType,
  { bg: string; border: string; icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  success: {
    bg: '#EAF7EE',
    border: Colors.primary,
    icon: 'checkmark-circle',
    color: Colors.primary,
  },
  driver: {
    bg: '#EBF3FC',
    border: Colors.driver,
    icon: 'bicycle',
    color: Colors.driver,
  },
  warning: {
    bg: '#FDF2F2',
    border: Colors.danger,
    icon: 'alert-circle',
    color: Colors.danger,
  },
  info: {
    bg: '#F3F4F6',
    border: '#9CA3AF',
    icon: 'notifications',
    color: Colors.text,
  },
};

export function NotificationBanner() {
  const insets = useSafeAreaInsets();
  const { banner, dismissBanner } = useSocket();

  const [translateY] = useState(() => new Animated.Value(-120));
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (banner) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 6,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -120,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [banner, translateY, opacity]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy < -10,
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dy < -20) {
            dismissBanner();
          }
        },
      }),
    [dismissBanner]
  );

  if (!banner) return null;

  const config = BANNER_CONFIG[banner.type ?? 'info'];
  const topPadding = Math.max(insets.top, Platform.OS === 'web' ? 12 : 16);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          paddingTop: topPadding,
          transform: [{ translateY }],
          opacity,
        },
      ]}
      pointerEvents="box-none"
      {...panResponder.panHandlers}>
      <Pressable
        onPress={() => {
          if (banner.onPress) {
            banner.onPress();
          }
          dismissBanner();
        }}
        style={[styles.banner, { backgroundColor: config.bg, borderColor: config.border }]}>
        <View style={[styles.iconWrap, { backgroundColor: config.color }]}>
          <Ionicons name={config.icon} size={20} color="#fff" />
        </View>

        <View style={styles.textWrap}>
          <Text style={styles.title} numberOfLines={1}>
            {banner.title}
          </Text>
          <Text style={styles.message} numberOfLines={2}>
            {banner.message}
          </Text>
        </View>

        <Pressable
          hitSlop={10}
          onPress={dismissBanner}
          style={styles.closeBtn}>
          <Ionicons name="close" size={18} color={Colors.textSecondary} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 99999,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: 520,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  message: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  closeBtn: {
    padding: 4,
    borderRadius: 12,
  },
});
