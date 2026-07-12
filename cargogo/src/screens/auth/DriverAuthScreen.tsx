import React, { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, Alert } from 'react-native';
import { Button, Card, Input, H1, Sub } from '@/components/UI';
import { useAuthStore } from '@/store/auth';
import { useDriverStore } from '@/store/driver';
import { colors, spacing } from '@/theme';

export const DriverAuthScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [email, setEmail] = useState('driver@pakujgo.pl');
  const [password, setPassword] = useState('Test1234!');
  const login = useAuthStore((s) => s.login);
  const status = useDriverStore((s) => s.verificationStatus);

  const submit = () => {
    const res = login(email, password);
    if (!res.ok) return Alert.alert('Błąd', res.error);
    navigation.replace(status === 'approved' ? 'DriverTabs' : 'DriverRegistration');
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.xl, paddingTop: 60 }}>
      <H1 style={{ marginBottom: 4 }}>Panel kierowcy</H1>
      <Sub style={{ marginBottom: spacing.xl }}>Zaloguj się lub przejdź rejestrację</Sub>
      <Card>
        <Input label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" />
        <Input label="Hasło" value={password} onChangeText={setPassword} secureTextEntry />
        <Button title="Zaloguj się" onPress={submit} style={{ marginTop: spacing.s }} />
        <TouchableOpacity onPress={() => { login('driver@pakujgo.pl', 'Test1234!'); navigation.navigate('DriverRegistration'); }} style={{ marginTop: spacing.l }}>
          <Text style={{ color: colors.brand, textAlign: 'center', fontWeight: '700' }}>Nowy kierowca? Rozpocznij rejestrację</Text>
        </TouchableOpacity>
      </Card>
      <Sub style={{ textAlign: 'center', marginTop: spacing.l }}>Demo: driver@pakujgo.pl / Test1234!</Sub>
    </ScrollView>
  );
};
