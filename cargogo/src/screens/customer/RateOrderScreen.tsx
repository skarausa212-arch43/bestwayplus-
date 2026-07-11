import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Card, Button, H2, Sub, Input } from '@/components/UI';
import { notify } from '@/services/notifications';
import { useT } from '@/i18n';
import { colors, spacing } from '@/theme';

export const RateOrderScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const t = useT();
  const [stars, setStars] = useState(0);
  const [tip, setTip] = useState(0);
  const [comment, setComment] = useState('');

  const submit = () => {
    if (tip > 0) notify('driver', 'n.tip', 'n.tipB', [tip]);
    notify('driver', 'n.rate', 'n.rateB', [stars]);
    navigation.popToTop();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.l, paddingTop: 80 }}>
      <Card>
        <Text style={{ fontSize: 40, textAlign: 'center' }}>✅</Text>
        <H2 style={{ textAlign: 'center', marginVertical: spacing.s }}>{t('rate.delivered')}</H2>
        <Sub style={{ textAlign: 'center', marginBottom: spacing.l }}>{t('rate.driver')}</Sub>
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: spacing.l }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <TouchableOpacity key={n} onPress={() => setStars(n)}>
              <Text style={{ fontSize: 34, opacity: n <= stars ? 1 : 0.25 }}>⭐</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Sub style={{ marginBottom: 6, fontWeight: '600' }}>{t('rate.tip')}</Sub>
        <View style={{ flexDirection: 'row', marginBottom: spacing.m }}>
          {[0, 5, 10, 20].map((n) => (
            <TouchableOpacity key={n} onPress={() => setTip(n)}
              style={{ flex: 1, padding: 10, borderRadius: 12, borderWidth: 2, borderColor: tip === n ? colors.brand : colors.line, marginRight: 6, alignItems: 'center' }}>
              <Text style={{ fontWeight: '700', color: tip === n ? colors.brand : colors.sub }}>{n === 0 ? t('rate.noTip') : `${n} zł`}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Input value={comment} onChangeText={setComment} placeholder={t('ph.comment')} />
        <Button title={t('rate.send')} onPress={submit} disabled={stars === 0} />
      </Card>
    </View>
  );
};
