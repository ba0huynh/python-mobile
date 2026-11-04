import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ui } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useRole, type Role } from '@/lib/role';

export default function LoginScreen() {
  const params = useLocalSearchParams<{ role?: string; phone?: string; success?: string }>();
  const { role: contextRole, setRole } = useRole();
  const { loginCustomer, loginDriver } = useAuth();

  const [activeRole, setActiveRole] = useState<Role>(
    (params.role === 'driver' || contextRole === 'driver') ? 'driver' : 'customer'
  );
  const [phone, setPhone] = useState(params.phone || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(params.success || null);

  const isDriver = activeRole === 'driver';
  const roleColor = isDriver ? Colors.driver : Colors.primary;
  const roleBg = isDriver ? Colors.driverSoft : Colors.primarySoft;

  const handleRoleChange = (nextRole: Role) => {
    setActiveRole(nextRole);
    setError(null);
    setSuccessMsg(null);
    setPhone('');
    setPassword('');
  };

  const handleFillDemo = () => {
    if (isDriver) {
      setPhone('0901234567');
      setPassword('GoXe!2026');
    } else {
      setPhone('0912345678');
      setPassword('GoXe!2026');
    }
    setError(null);
  };

  const handleSubmit = async () => {
    if (!phone.trim()) {
      setError('Vui lòng nhập số điện thoại.');
      return;
    }
    if (!password) {
      setError('Vui lòng nhập mật khẩu.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      if (isDriver) {
        await loginDriver(phone.trim(), password);
        await setRole('driver');
        router.replace('/driver');
      } else {
        await loginCustomer(phone.trim(), password);
        await setRole('customer');
        router.replace('/customer');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Đăng nhập không thành công.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={ui.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Top Bar */}
          <View style={styles.topBar}>
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
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
                name={isDriver ? 'bicycle' : 'person'}
                size={32}
                color={roleColor}
              />
            </View>
            <Text style={ui.h1}>
              {isDriver ? 'Đăng nhập Tài xế' : 'Đăng nhập Khách hàng'}
            </Text>
            <Text style={ui.muted}>
              {isDriver
                ? 'Nhận chuyến và đồng hành cùng GoXe'
                : 'Đặt chuyến xe tiện lợi, an toàn và nhanh chóng'}
            </Text>
          </View>

          {/* Success Banner */}
          {successMsg && (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
              <Text style={styles.successText}>{successMsg}</Text>
            </View>
          )}

          {/* Error Banner */}
          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={20} color={Colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Form */}
          <View style={styles.form}>
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

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Mật khẩu</Text>
              <View style={styles.inputWrap}>
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={Colors.textSecondary}
                  style={styles.inputIcon}
                />
                <TextInput
                  placeholder="Nhập mật khẩu"
                  placeholderTextColor={Colors.textSecondary}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
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

            {/* Forgot password link */}
            <View style={styles.forgotPassRow}>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/auth/forgot-password',
                    params: { role: activeRole, phone },
                  })
                }>
                <Text style={[styles.forgotPassText, { color: roleColor }]}>
                  Quên mật khẩu?
                </Text>
              </Pressable>
            </View>

            {/* Quick seed account filler */}
            <Pressable onPress={handleFillDemo} style={styles.demoBtn}>
              <Ionicons name="flash-outline" size={16} color={roleColor} />
              <Text style={[styles.demoBtnText, { color: roleColor }]}>
                {isDriver
                  ? 'Điền tài khoản mẫu (0901234567 / GoXe!2026)'
                  : 'Điền tài khoản mẫu (0912345678 / GoXe!2026)'}
              </Text>
            </Pressable>

            <Button
              title="Đăng nhập"
              variant={isDriver ? 'driver' : 'primary'}
              onPress={handleSubmit}
              loading={loading}
              disabled={loading}
              style={{ marginTop: Spacing.sm }}
            />
          </View>

          {/* Footer to Register */}
          <View style={styles.footer}>
            <Text style={ui.muted}>Chưa có tài khoản?</Text>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/auth/register',
                  params: { role: activeRole },
                })
              }>
              <Text style={[styles.linkText, { color: roleColor }]}>
                Đăng ký ngay
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: '#EAF7EE',
    borderColor: Colors.primary,
    borderWidth: 1,
    borderRadius: Radius.sm,
    padding: Spacing.md,
  },
  successText: {
    flex: 1,
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
  },
  form: {
    gap: Spacing.md,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
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
  forgotPassRow: {
    alignItems: 'flex-end',
    marginTop: -4,
  },
  forgotPassText: {
    fontSize: 13,
    fontWeight: '600',
    paddingVertical: 4,
  },
  demoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  demoBtnText: {
    fontSize: 13,
    fontWeight: '600',
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
