import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Image, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/RootNavigator';
import { BRANDING } from '@/constants/persona';
import { login } from '@/services/authService';
import { useAppStore } from '@/store/appStore';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const { setAuthUser } = useAppStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError('');
    try {
      const { user } = await login(email.trim(), password);
      setAuthUser(user);
      navigation.replace('Standby');
    } catch (err: any) {
      setError(err.message ?? 'Sign-in failed. Check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inner}>

          <View style={styles.headerRow}>
            <Image source={require('../assets/logo.png')} style={styles.logo} resizeMode="contain" />
            <View>
              <Text style={styles.title}>FELLITO</Text>
              <Text style={styles.tagline}>{BRANDING.tagline}</Text>
            </View>
          </View>

          <Image source={require('../assets/fellito-avatar.png')} style={styles.avatar} resizeMode="cover" />

          <Text style={styles.welcomeText}>Sign in to your account</Text>
          <Text style={styles.welcomeSub}>{BRANDING.poweredBy}</Text>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>EMAIL</Text>
          <TextInput
            style={styles.input}
            placeholder="your@email.com"
            placeholderTextColor={BRANDING.textSecondary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />

          <Text style={styles.label}>PASSWORD</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor={BRANDING.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            onSubmitEditing={handleLogin}
            returnKeyType="go"
          />

          <TouchableOpacity
            style={[styles.btn, (!email.trim() || !password || loading) && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={!email.trim() || !password || loading}
          >
            {loading
              ? <ActivityIndicator color="#000" />
              : <Text style={styles.btnText}>SIGN IN</Text>}
          </TouchableOpacity>

          <Text style={styles.hint}>
            Access granted by your Go-Live team administrator.
            Contact them if you need an account.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BRANDING.bgColor },
  flex: { flex: 1 },
  inner: { flex: 1, padding: 28, justifyContent: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 28 },
  logo: { width: 40, height: 50 },
  title: { fontSize: 28, fontWeight: '900', color: '#FF8C00', letterSpacing: 5 },
  tagline: { fontSize: 11, color: BRANDING.textSecondary, letterSpacing: 1.5, textTransform: 'uppercase' },
  avatar: {
    width: 88, height: 88, borderRadius: 44,
    borderWidth: 3, borderColor: '#FF8C00',
    alignSelf: 'center', marginBottom: 20,
  },
  welcomeText: { fontSize: 22, fontWeight: '800', color: BRANDING.textPrimary, textAlign: 'center', marginBottom: 4 },
  welcomeSub: { fontSize: 12, color: BRANDING.textSecondary, textAlign: 'center', marginBottom: 28 },
  errorBox: {
    backgroundColor: 'rgba(255,59,92,0.1)', borderWidth: 1,
    borderColor: BRANDING.dangerColor, borderRadius: 10,
    padding: 12, marginBottom: 16,
  },
  errorText: { color: BRANDING.dangerColor, fontSize: 13, lineHeight: 18 },
  label: {
    fontSize: 10, fontWeight: '700', color: BRANDING.accentColor,
    letterSpacing: 2, marginBottom: 6, marginTop: 16,
  },
  input: {
    backgroundColor: BRANDING.cardColor, borderColor: BRANDING.borderColor,
    borderWidth: 1, borderRadius: 10, padding: 14,
    color: BRANDING.textPrimary, fontSize: 15,
  },
  btn: {
    marginTop: 28, backgroundColor: '#FF8C00',
    borderRadius: 12, padding: 17, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.35 },
  btnText: { color: '#000', fontWeight: '900', fontSize: 16, letterSpacing: 2 },
  hint: {
    marginTop: 20, fontSize: 12, color: BRANDING.textSecondary,
    textAlign: 'center', lineHeight: 18,
  },
});
