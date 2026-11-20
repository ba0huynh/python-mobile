import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OtpField } from '@/components/otp-field';
import { KeyboardScreen } from '@/components/keyboard';
import { Button, ui } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import { useRole, type Role } from '@/lib/role';

export default function ForgotPasswordScreen() {
  const params = useLocalSearchParams<{ role?: string; phone?: string }>();
  const { role: contextRole } = useRole();

  const [activeRole, setActiveRole] = useState<Role>(
    params.role === 'driver' || contextRole === 'driver' ? 'driver' : 'customer'
  );
  const [phone, setPhone] = useState(params.phone || '');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDriver = activeRole === 'driver';
  const roleColor = isDriver ? Colors.driver : Colors.primary;
  const roleBg = isDriver ? Colors.driverSoft : Colors.primarySoft;

  const handleRoleChange = (nextRole: Role) => {
    setActiveRole(nextRole);
    setOtp('');
    setError(null);
  };

  const handleSubmit = async () => {
    if (!phone.trim()) {
      setError('Vui lòng nhập số điện thoại.');
      return;
    }
    if (!/^\d{6}$/.test(otp)) {
      setError('Vui lòng nhập mã xác thực 6 số đã gửi tới điện thoại của bạn.');
      return;
    }
    if (!newPassword) {
      setError('Vui lòng nhập mật khẩu mới.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Mật khẩu mới phải có ít nhất 8 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await api.auth.resetPassword({
        phone: phone.trim(),
        role: activeRole,
        otp: otp.trim(),
        new_password: newPassword,
        new_password_confirm: confirmPassword,
      });

      router.replace({
        pathname: '/auth/login',
        params: {
          role: activeRole,
          phone: phone.trim(),
          success: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập với mật khẩu mới.',
        },
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Đặt lại mật khẩu không thành công.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={ui.screen}>
      <KeyboardScreen contentContainerStyle={styles.scroll}>
          {/* Top Bar */}
          <View style={styles.topBar}>
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/auth/login'))}
              style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color={Colors.text} />
            </Pressable>
            <Text style={styles.topTitle}>GoXe</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Role selector pill */}
          <View style={styles.rolePicker}>
            <Pressable
              onPress={() => handleRoleChange('customer')}
              style={[
                styles.roleOption,
                !isDriver && { backgroundColor: Colors.primary },
              ]}>
              <Ionicons
                name="person"
                size={16}
                color={!isDriver ? '#fff' : Colors.textSecondary}
              />
              <Text
                style={[
                  styles.roleText,
                  !isDriver && styles.roleTextActive,
                ]}>
                Khách hàng
              </Text>
            </Pressable>

            <Pressable
              onPress={() => handleRoleChange('driver')}
              style={[
                styles.roleOption,
                isDriver && { backgroundColor: Colors.driver },
              ]}>
              <Ionicons
                name="bicycle"
                size={16}
                color={isDriver ? '#fff' : Colors.textSecondary}
              />
              <Text
                style={[
                  styles.roleText,
                  isDriver && styles.roleTextActive,
                ]}>
                Tài xế
              </Text>
            </Pressable>
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.avatarIcon, { backgroundColor: roleBg }]}>
              <Ionicons
                name="key-outline"
                size={32}
                color={roleColor}
              />
            </View>
            <Text style={ui.h1}>Quên mật khẩu</Text>
            <Text style={[ui.muted, { textAlign: 'center', paddingHorizontal: Spacing.md }]}>
              Nhập số điện thoại tài khoản {isDriver ? 'Tài xế' : 'Khách hàng'} rồi nhận mã xác thực qua SMS để đặt lại mật khẩu.
            </Text>
          </View>

          {/* Error Banner */}
          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={20} color={Colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Form */}
          <View style={styles.form}>
            {/* Phone */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Số điện thoại</Text>
              <View style={styles.inputWrap}>
                <Ionicons
                  name="call-outline"
                  size={20}
                  color={Colors.textSecondary}
                  style={styles.inputIcon}
                />
                <TextInput
                  placeholder="0912345678 hoặc +84912345678"
                  placeholderTextColor={Colors.textSecondary}
                  value={phone}
                  onChangeText={(text) => {
                    setPhone(text);
                    setError(null);
                  }}
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  style={styles.input}
                />
              </View>
            </View>

            <OtpField
              phone={phone}
              purpose="reset_password"
              role={activeRole}
              value={otp}
              onChange={setOtp}
              color={roleColor}
              onError={setError}
            />

            {/* New Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Mật khẩu mới</Text>
              <View style={styles.inputWrap}>
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={Colors.textSecondary}
                  style={styles.inputIcon}
                />
                <TextInput
                  placeholder="Nhập mật khẩu mới (tối thiểu 8 ký tự)"
                  placeholderTextColor={Colors.textSecondary}
                  value={newPassword}
                  onChangeText={(text) => {
                    setNewPassword(text);
                    setError(null);
                  }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  style={styles.input}
                />
                <Pressable
                  onPress={() => setShowPassword((prev) => !prev)}
                  style={styles.eyeBtn}>
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={Colors.textSecondary}
                  />
                </Pressable>
              </View>
            </View>

            {/* Confirm New Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Xác nhận mật khẩu mới</Text>
              <View style={styles.inputWrap}>
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={Colors.textSecondary}
                  style={styles.inputIcon}
                />
                <TextInput
                  placeholder="Nhập lại mật khẩu mới"
                  placeholderTextColor={Colors.textSecondary}
                  value={confirmPassword}
                  onChangeText={(text) => {
                    setConfirmPassword(text);
                    setError(null);
                  }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  style={styles.input}
                />
              </View>
            </View>

            <Button
              title="Đặt lại mật khẩu"
              variant={isDriver ? 'driver' : 'primary'}
              onPress={handleSubmit}
              loading={loading}
              disabled={loading}
              style={{ marginTop: Spacing.sm }}
            />
          </View>

          {/* Footer to Login */}
          <View style={styles.footer}>
            <Text style={ui.muted}>Đã nhớ mật khẩu?</Text>
            <Pressable
              onPress={() =>
                router.replace({
                  pathname: '/auth/login',
                  params: { role: activeRole },
                })
              }>
              <Text style={[styles.linkText, { color: roleColor }]}>
                Đăng nhập
              </Text>
            </Pressable>
          </View>
        </KeyboardScreen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl * 2,
    gap: Spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  topTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
  },
  rolePicker: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.pill,
    padding: 4,
    gap: 4,
  },
  roleOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.pill,
  },
  roleText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  roleTextActive: {
    color: '#fff',
  },
  header: {
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
  },
  avatarIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: '#FDE8E8',
    borderColor: Colors.danger,
    borderWidth: 1,
    borderRadius: Radius.sm,
    padding: Spacing.md,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: Colors.danger,
  },
  form: {
    gap: Spacing.md,
  },
  inputGroup: {
    gap: 6,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  badge: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    height: 50,
  },
  inputIcon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
    height: '100%',
    outlineWidth: 0,
    borderWidth: 0,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  eyeBtn: {
    padding: 6,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.md,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
