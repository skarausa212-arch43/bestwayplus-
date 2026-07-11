import React, { useState } from 'react';
import { View, ScrollView, Text, TouchableOpacity, Alert } from 'react-native';
import { Button, Card, Input, H1, Sub } from '@/components/UI';
import { useAuthStore } from '@/store/auth';
import { colors, spacing } from '@/theme';

export const CustomerAuthScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: 'customer@cargogo.pl', password: 'Test1234!', password2: '' });
  const { login, registerCustomer } = useAuthStore();
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (mode === 'login') {
      const res = login(form.email, form.password);
      if (!res.ok) return Alert.alert('Błąd', res.error);
      navigation.replace('CustomerTabs');
    } else {
      if (!form.firstName || !form.email || form.password.length < 8) return Alert.alert('Błąd', 'Uzupełnij dane. Hasło min. 8 znaków.');
      if (form.password !== form.password2) return Alert.alert('Błąd', 'Hasła nie są takie same.');
      // Mock: SMS + e-mail подтверждение — сразу успех
      registerCustomer({ firstName: form.firstName, lastName: form.lastName, phone: form.phone, email: form.email, password: form.password });
      navigation.replace('CustomerTabs');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.xl, paddingTop: 60 }}>
      <H1 style={{ marginBottom: 4 }}>{mode === 'login' ? 'Witaj ponownie!' : 'Załóż konto'}</H1>
      <Sub style={{ marginBottom: spacing.xl }}>Konto klienta</Sub>
      <Card>
        {mode === 'register' && (<>
          <Input label="Imię" value={form.firstName} onChangeText={(v) => set('firstName', v)} />
          <Input label="Nazwisko" value={form.lastName} onChangeText={(v) => set('lastName', v)} />
          <Input label="Numer telefonu" value={form.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" placeholder="+48" />
        </>)}
        <Input label="E-mail" value={form.email} onChangeText={(v) => set('email', v)} keyboardType="email-address" />
        <Input label="Hasło" value={form.password} onChangeText={(v) => set('password', v)} secureTextEntry />
        {mode === 'register' && <Input label="Powtórz hasło" value={form.password2} onChangeText={(v) => set('password2', v)} secureTextEntry />}
        <Button title={mode === 'login' ? 'Zaloguj się' : 'Zarejestruj się'} onPress={submit} style={{ marginTop: spacing.s }} />
        <Button title=" Google" variant="secondary" onPress={() => {}} style={{ marginTop: spacing.s }} />
        <TouchableOpacity onPress={() => setMode(mode === 'login' ? 'register' : 'login')} style={{ marginTop: spacing.l }}>
          <Text style={{ color: colors.brand, textAlign: 'center', fontWeight: '700' }}>
            {mode === 'login' ? 'Nie masz konta? Zarejestruj się' : 'Masz konto? Zaloguj się'}
          </Text>
        </TouchableOpacity>
      </Card>
      <Sub style={{ textAlign: 'center', marginTop: spacing.l }}>Demo: customer@cargogo.pl / Test1234!</Sub>
    </ScrollView>
  );
};
