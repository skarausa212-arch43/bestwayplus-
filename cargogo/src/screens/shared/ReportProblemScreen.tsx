import React, { useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Card, Button, H2, Sub, Input } from '@/components/UI';
import { BackButton } from '@/components/BackButton';
import { useCommunityStore } from '@/store/community';
import { useAuthStore } from '@/store/auth';
import { ReportReason } from '@/types';
import { useT } from '@/i18n';
import { colors, spacing, radius } from '@/theme';

const REASONS: ReportReason[] = ['damaged_cargo', 'driver_no_show', 'wrong_price', 'behavior', 'delay', 'other'];

/**
 * «Проблема с заказом» — доступно обеим ролям. Жалоба уходит в поддержку/админку
 * и подтверждается отправителю (§поддержка). Реальных писем/SMS нет (§59).
 */
export const ReportProblemScreen: React.FC<{ navigation: any; route?: any }> = ({ navigation, route }) => {
  const t = useT();
  const orderId: string = route?.params?.orderId ?? 'o-unknown';
  const role = useAuthStore((s) => s.user?.role) ?? 'customer';
  const reportProblem = useCommunityStore((s) => s.reportProblem);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [comment, setComment] = useState('');

  const submit = () => {
    if (!reason) return Alert.alert(t('rep.title'), t('rep.pickReason'));
    reportProblem(orderId, role === 'driver' ? 'driver' : 'customer', reason, comment.trim() || undefined);
    Alert.alert(t('rep.sentTitle'), t('rep.sentBody'));
    navigation.goBack();
  };

  return (
    <View style={{ flex: 1 }}>
      <BackButton navigation={navigation} />
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.l, paddingTop: 110, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.s }}>
          <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: colors.warnSoft, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
            <Feather name="alert-triangle" size={26} color={colors.warn} />
          </View>
          <H2 style={{ flex: 1 }}>{t('rep.title')}</H2>
        </View>
        <Sub style={{ marginBottom: spacing.l }}>{t('rep.sub')}</Sub>

        <Card>
          <Sub style={{ fontWeight: '700', marginBottom: spacing.s }}>{t('rep.what')}</Sub>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.m }}>
            {REASONS.map((r) => {
              const on = reason === r;
              return (
                <TouchableOpacity key={r} onPress={() => setReason(r)}
                  style={{ backgroundColor: on ? colors.brand : colors.surface, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 9, margin: 3 }}>
                  <Text style={{ color: on ? '#FFF' : colors.sub, fontWeight: '700', fontSize: 13 }}>{t(`rep.${r}`)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Input value={comment} onChangeText={setComment} placeholder={t('rep.details')} />
        </Card>

        <Button title={t('rep.send')} onPress={submit} style={{ marginTop: spacing.s }} />
      </ScrollView>
    </View>
  );
};
