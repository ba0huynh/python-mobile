import { Alert, Platform } from 'react-native';

/**
 * Cross-platform dialogs. react-native-web's Alert.alert does nothing,
 * so on web we fall back to the browser's alert/confirm.
 */
export function showAlert(title: string, message?: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

export function confirmAsync(
  title: string,
  message: string,
  options: { confirmText?: string; cancelText?: string; destructive?: boolean } = {}
): Promise<boolean> {
  const { confirmText = 'Đồng ý', cancelText = 'Hủy', destructive = false } = options;
  if (Platform.OS === 'web') {
    return Promise.resolve(typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
        { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}
