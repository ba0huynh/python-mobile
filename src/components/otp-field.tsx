import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, ApiError, errorMessage, type AuthRole, type OtpPurpose } from '@/lib/api';

type Props = {
  phone: string;
  purpose: OtpPurpose;
  role: AuthRole;
  value: string;
  onChange: (code: string) => void;
  color: string;
  onError: (message: string | null) => void;
};

/** "Send code" button + 6-digit input with a resend cooldown. */
export function OtpField({ phone, purpose, role, value, onChange, color, onError }: Props) {
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const waiting = resendAt > now;
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [waiting]);

  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const requestCode = async () => {
    if (!phone.trim()) {
      onError('Vui lòng nhập số điện thoại trước khi lấy mã.');
      return;
    }
    onError(null);
    setSending(true);
    try {
      const res = await api.auth.requestOtp({ phone: phone.trim(), purpose, role });
      setSentTo(phone.trim());
      setResendAt(Date.now() + (res.resend_in ?? 60) * 1000);
      setNow(Date.now());
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        const retry = Number((err.data as { retry_after?: number } | null)?.retry_after) || 60;
        setResendAt(Date.now() + retry * 1000);
        setNow(Date.now());
      }
      onError(errorMessage(err, 'Không gửi được mã xác thực.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.group}>
      <Text style={styles.label}>Mã xác thực (OTP) *</Text>
      <View style={styles.row}>
        <View style={styles.inputWrap}>
          <Ionicons name="shield-checkmark-outline" size={20} color={Colors.textSecondary} style={{ marginRight: Spacing.sm }} />
          <TextInput
            placeholder="6 chữ số"
            placeholderTextColor={Colors.textSecondary}
            value={value}
            onChangeText={(t) => {
              onChange(t.replace(/\D/g, '').slice(0, 6));
              onError(null);
            }}
            keyboardType="number-pad"
            maxLength={6}
            autoComplete="sms-otp"
            textContentType="oneTimeCode"
            style={styles.input}
          />
        </View>
        <Pressable
          onPress={requestCode}
          disabled={sending || waiting}
          style={[styles.sendBtn, { backgroundColor: color, opacity: sending || waiting ? 0.5 : 1 }]}>
          {sending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.sendText}>{waiting ? `${secondsLeft}s` : sentTo ? 'Gửi lại' : 'Gửi mã'}</Text>
          )}
        </Pressable>
      </View>
      {sentTo && <Text style={styles.hint}>Mã đã được gửi qua SMS tới {sentTo}. Mã có hiệu lực 5 phút.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600', color: Colors.text },
  row: { flexDirection: 'row', gap: Spacing.sm },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    height: 50,
  },
  input: {
    flex: 1,
    fontSize: 16,
    letterSpacing: 4,
    color: Colors.text,
    height: '100%',
    borderWidth: 0,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  sendBtn: {
    minWidth: 96,
    height: 50,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  sendText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  hint: { fontSize: 12, color: Colors.textSecondary },
});
