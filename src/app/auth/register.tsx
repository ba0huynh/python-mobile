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
import { useAuth } from '@/lib/auth';
import { useRole, type Role } from '@/lib/role';

type VehicleOption = 'bike' | 'car4' | 'car7';

const VEHICLE_OPTIONS: { id: VehicleOption; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'bike', label: 'GoBike (Xe máy)', icon: 'bicycle' },
  { id: 'car4', label: 'GoCar 4 chỗ', icon: 'car-outline' },
  { id: 'car7', label: 'GoCar 7 chỗ', icon: 'car-sport-outline' },
];

export default function RegisterScreen() {
  const params = useLocalSearchParams<{ role?: string }>();
  const { role: contextRole, setRole } = useRole();
  const { registerCustomer, registerDriver } = useAuth();

  const [activeRole, setActiveRole] = useState<Role>(
    (params.role === 'driver' || contextRole === 'driver') ? 'driver' : 'customer'
  );

  // Common fields
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Customer field

  // Driver fields
  const [licenseNumber, setLicenseNumber] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleOption>('bike');
  const [vehicleName, setVehicleName] = useState('');

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
    if (!fullName.trim()) {
      setError('Vui lòng nhập họ và tên.');
      return;
    }
    if (!password) {
      setError('Vui lòng nhập mật khẩu.');
      return;
    }
    if (password.length < 8) {
      setError('Mật khẩu cần tối thiểu 8 ký tự.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    if (!/^\d{6}$/.test(otp)) {
      setError('Vui lòng nhập mã xác thực 6 số đã gửi tới điện thoại của bạn.');
      return;
    }

    if (isDriver) {
      if (!licenseNumber.trim()) {
        setError('Vui lòng nhập số bằng lái (GPLX).');
        return;
      }
      if (!vehiclePlate.trim()) {
        setError('Vui lòng nhập biển số xe.');
        return;
      }
    }

    setError(null);
    setLoading(true);

    try {
      if (isDriver) {
        await registerDriver({
          phone: phone.trim(),
          full_name: fullName.trim(),
          license_number: licenseNumber.trim(),
          vehicle_plate: vehiclePlate.trim(),
          vehicle_type: vehicleType,
          vehicle_name: vehicleName.trim() || undefined,
          password,
          password_confirm: passwordConfirm,
          otp,
        });
        await setRole('driver');
        router.replace('/driver');
      } else {
        await registerCustomer({
          phone: phone.trim(),
          full_name: fullName.trim(),
          password,
          password_confirm: passwordConfirm,
          otp,
        });
        await setRole('customer');
        router.replace('/customer');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Đăng ký không thành công.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={ui.screen}>
      <KeyboardScreen contentContainerStyle={styles.scroll}>
          {/* Top Bar with back button */}
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
              {isDriver ? 'Đăng ký Tài xế' : 'Đăng ký Khách hàng'}
            </Text>
            <Text style={ui.muted}>
              {isDriver
                ? 'Đăng ký thông tin lái xe để bắt đầu nhận cuốc'
                : 'Tạo tài khoản GoXe để đặt xe mọi lúc mọi nơi'}
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
              <Text style={styles.label}>Số điện thoại *</Text>
              <View style={styles.inputWrap}>
                <Ionicons
                  name="call-outline"
                  size={20}
                  color={Colors.textSecondary}
                  style={styles.inputIcon}
                />
                <TextInput
                  placeholder="VD: 0912345678"
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
              purpose="register"
              role={activeRole}
              value={otp}
              onChange={setOtp}
              color={roleColor}
              onError={setError}
            />

            {/* Full Name */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Họ và tên *</Text>
              <View style={styles.inputWrap}>
                <Ionicons
                  name="person-outline"
                  size={20}
                  color={Colors.textSecondary}
                  style={styles.inputIcon}
                />
                <TextInput
                  placeholder="VD: Nguyễn Văn An"
                  placeholderTextColor={Colors.textSecondary}
                  value={fullName}
                  onChangeText={(text) => {
                    setFullName(text);
                    setError(null);
                  }}
                  autoCapitalize="words"
                  style={styles.input}
                />
              </View>
            </View>

            {/* Driver only: Vehicle & License info */}
            {isDriver && (
              <>
                {/* Vehicle Type Choice */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Loại phương tiện *</Text>
                  <View style={styles.vehicleTypeRow}>
                    {VEHICLE_OPTIONS.map((opt) => {
                      const selected = vehicleType === opt.id;
                      return (
                        <Pressable
                          key={opt.id}
                          onPress={() => setVehicleType(opt.id)}
                          style={[
                            styles.vehicleTypeCard,
                            selected && {
                              borderColor: Colors.driver,
                              backgroundColor: Colors.driverSoft,
                            },
                          ]}>
                          <Ionicons
                            name={opt.icon}
                            size={20}
                            color={selected ? Colors.driver : Colors.textSecondary}
                          />
                          <Text
                            style={[
                              styles.vehicleTypeLabel,
                              selected && { color: Colors.driver, fontWeight: '700' },
                            ]}>
                            {opt.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* License Number */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Số bằng lái xe (GPLX) *</Text>
                  <View style={styles.inputWrap}>
                    <Ionicons
                      name="card-outline"
                      size={20}
                      color={Colors.textSecondary}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      placeholder="VD: B1-000001"
                      placeholderTextColor={Colors.textSecondary}
                      value={licenseNumber}
                      onChangeText={(text) => {
                        setLicenseNumber(text);
                        setError(null);
                      }}
                      autoCapitalize="characters"
                      style={styles.input}
                    />
                  </View>
                </View>

                {/* Vehicle Plate */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Biển số xe *</Text>
                  <View style={styles.inputWrap}>
                    <Ionicons
                      name="barcode-outline"
                      size={20}
                      color={Colors.textSecondary}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      placeholder="VD: 59X2-123.45"
                      placeholderTextColor={Colors.textSecondary}
                      value={vehiclePlate}
                      onChangeText={(text) => {
                        setVehiclePlate(text);
                        setError(null);
                      }}
                      autoCapitalize="characters"
                      style={styles.input}
                    />
                  </View>
                </View>

                {/* Vehicle Name */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Tên & màu xe</Text>
                  <View style={styles.inputWrap}>
                    <Ionicons
                      name="information-circle-outline"
                      size={20}
                      color={Colors.textSecondary}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      placeholder="VD: Honda Vision · Đỏ"
                      placeholderTextColor={Colors.textSecondary}
                      value={vehicleName}
                      onChangeText={setVehicleName}
                      style={styles.input}
                    />
                  </View>
                </View>
              </>
            )}

            {/* Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Mật khẩu *</Text>
              <View style={styles.inputWrap}>
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={Colors.textSecondary}
                  style={styles.inputIcon}
                />
                <TextInput
                  placeholder="Tối thiểu 8 ký tự"
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

            {/* Password Confirm */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Xác nhận mật khẩu *</Text>
              <View style={styles.inputWrap}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={20}
                  color={Colors.textSecondary}
                  style={styles.inputIcon}
                />
                <TextInput
                  placeholder="Nhập lại mật khẩu"
                  placeholderTextColor={Colors.textSecondary}
                  value={passwordConfirm}
                  onChangeText={(text) => {
                    setPasswordConfirm(text);
                    setError(null);
                  }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  style={styles.input}
                />
              </View>
            </View>

            <Button
              title="Đăng ký tài khoản"
              variant={isDriver ? 'driver' : 'primary'}
              onPress={handleSubmit}
              loading={loading}
              disabled={loading}
              style={{ marginTop: Spacing.sm }}
            />
          </View>

          {/* Footer to Login */}
          <View style={styles.footer}>
            <Text style={ui.muted}>Đã có tài khoản?</Text>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/auth/login',
                  params: { role: activeRole },
                })
              }>
              <Text style={[styles.linkText, { color: roleColor }]}>
                Đăng nhập ngay
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
    paddingVertical: Spacing.sm,
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
  vehicleTypeRow: {
    gap: Spacing.xs,
  },
  vehicleTypeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  vehicleTypeLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
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
