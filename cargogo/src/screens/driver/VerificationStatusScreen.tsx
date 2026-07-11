import React from 'react';
import { View, Text } from 'react-native';
import { Card, Button, H2, Sub, StatusPill } from '@/components/UI';
import { useDriverStore } from '@/store/driver';
import { colors, spacing } from '@/theme';

const ITEMS = ['Dane osobowe', 'Tożsamość', 'Prawo jazdy', 'Pojazd', 'Dokumenty pojazdu', 'Dane do wypłat'];

export const VerificationStatusScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const status = useDriverStore((s) => s.verificationStatus);
  const approved = status === 'approved';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.l, paddingTop: 80 }}>
      <Card>
        <Text style={{ fontSize: 40, textAlign: 'center' }}>{approved ? '🎉' : '🕐'}</Text>
        <H2 style={{ textAlign: 'center', marginVertical: spacing.s }}>
          {approved ? 'Konto zatwierdzone!' : 'Twoje konto jest w trakcie weryfikacji'}
        </H2>
        {ITEMS.map((i, idx) => (
          <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: idx < ITEMS.length - 1 ? 1 : 0, borderColor: colors.line }}>
            <Text style={{ color: colors.ink, fontWeight: '600' }}>{i}</Text>
            <StatusPill label={approved ? 'Zatwierdzone' : idx === 0 ? 'Przesłane' : 'Weryfikacja'} tone={approved ? 'brand' : idx === 0 ? 'info' : 'warn'} />
          </View>
        ))}
        {approved && <Button title="Przejdź do panelu kierowcy" onPress={() => navigation.replace('DriverTabs')} style={{ marginTop: spacing.l }} />}
        {!approved && <Sub style={{ textAlign: 'center', marginTop: spacing.l }}>Weryfikacja demo trwa ~6 sekund. Otrzymasz powiadomienie.</Sub>}
      </Card>
    </View>
  );
};
