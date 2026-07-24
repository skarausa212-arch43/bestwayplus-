import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Animated, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Card, Button, H2, Sub, Input, Row } from '@/components/UI';
import { Confetti, PopIn, FadeSlideIn } from '@/components/Anim';
import { useCommunityStore } from '@/store/community';
import { useT } from '@/i18n';
import { colors, spacing, radius } from '@/theme';

/**
 * Экран оценки — двусторонний. По умолчанию клиент оценивает водителя;
 * с route.params.target='customer' водитель оценивает клиента (§оценки в обе стороны).
 */
export const RateOrderScreen: React.FC<{ navigation: any; route?: any }> = ({ navigation, route }) => {
  const t = useT();
  const target: 'driver' | 'customer' = route?.params?.target ?? 'driver';
  const orderId: string = route?.params?.orderId ?? 'o-unknown';
  const [stars, setStars] = useState(0);
  const [tip, setTip] = useState(0);
  const [comment, setComment] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const rateDriver = useCommunityStore((s) => s.rateDriver);
  const rateCustomer = useCommunityStore((s) => s.rateCustomer);

  const isDriverTarget = target === 'driver';
  const name = isDriverTarget ? 'Marek K.' : 'Anna W.';
  const tagKeys = isDriverTarget
    ? ['rate.t.punctual', 'rate.t.polite', 'rate.t.careful']
    : ['rate.t.cargoOk', 'rate.t.reachable', 'rate.t.onTime'];

  const toggleTag = (k: string) => setTags((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  const submit = () => {
    const labels = tags.map((k) => t(k));
    if (isDriverTarget) rateDriver(orderId, 'u-drv-1', stars, comment, tip, labels);
    else rateCustomer(orderId, 'u-cust-1', stars, comment, labels);
    navigation.popToTop();
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.l, paddingTop: 80 }}>
      {isDriverTarget && <Confetti />}
      <FadeSlideIn>
        <Card>
          <PopIn delay={200} style={{ alignSelf: 'center' }}>
            <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: isDriverTarget ? colors.brandSoft : colors.brand, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name={isDriverTarget ? 'check-circle' : 'user'} size={40} color={isDriverTarget ? colors.brandDark : '#FFF'} />
            </View>
          </PopIn>
          <H2 style={{ textAlign: 'center', marginTop: spacing.s }}>{name}</H2>
          <Sub style={{ textAlign: 'center', marginBottom: spacing.l }}>
            {isDriverTarget ? t('rate.driver') : t('rate.customer')}
          </Sub>

          <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: spacing.l }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity key={n} onPress={() => setStars(n)} style={{ paddingHorizontal: 4 }}>
                <StarPop lit={n <= stars}>
                  <Feather name="star" size={38} color={n <= stars ? colors.warn : colors.line}
                    style={{ opacity: n <= stars ? 1 : 0.9 }} />
                </StarPop>
              </TouchableOpacity>
            ))}
          </View>

          {/* Быстрые теги-качества */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginBottom: spacing.m }}>
            {tagKeys.map((k) => {
              const on = tags.includes(k);
              return (
                <TouchableOpacity key={k} onPress={() => toggleTag(k)}
                  style={{ backgroundColor: on ? colors.brand : colors.surface, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 8, margin: 3 }}>
                  <Text style={{ color: on ? '#FFF' : colors.sub, fontWeight: '700', fontSize: 13 }}>{t(k)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {isDriverTarget && (
            <>
              <Sub style={{ marginBottom: 6, fontWeight: '600' }}>{t('rate.tip')}</Sub>
              <Row style={{ marginBottom: spacing.m }}>
                {[0, 5, 10, 20].map((n) => (
                  <TouchableOpacity key={n} onPress={() => setTip(n)}
                    style={{ flex: 1, padding: 10, borderRadius: radius.m, borderWidth: 2, borderColor: tip === n ? colors.brand : colors.line, marginRight: 6, alignItems: 'center', backgroundColor: tip === n ? colors.brandSoft : colors.card }}>
                    <Text style={{ fontWeight: '700', color: tip === n ? colors.brandDark : colors.sub }}>{n === 0 ? t('rate.noTip') : `${n} zł`}</Text>
                  </TouchableOpacity>
                ))}
              </Row>
            </>
          )}

          <Input value={comment} onChangeText={setComment} placeholder={t('ph.comment')} />
          {!isDriverTarget && (
            <View style={{ backgroundColor: colors.infoSoft, borderRadius: radius.m, padding: spacing.m, marginBottom: spacing.m }}>
              <Text style={{ color: colors.info, fontSize: 13 }}>{t('rate.twoWay')}</Text>
            </View>
          )}
          <Button title={t('rate.send')} onPress={submit} disabled={stars === 0} />
        </Card>
      </FadeSlideIn>
    </ScrollView>
  );
};

const StarPop: React.FC<{ lit: boolean; children: React.ReactNode }> = ({ lit, children }) => {
  const s = React.useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
    if (lit) {
      s.setValue(0.4);
      Animated.spring(s, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 18 }).start();
    }
  }, [lit]);
  return <Animated.View style={{ transform: [{ scale: s }] }}>{children}</Animated.View>;
};
