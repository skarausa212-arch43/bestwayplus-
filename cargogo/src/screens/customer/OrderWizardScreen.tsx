import React, { useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, Alert } from 'react-native';
import { Card, Button, Input, H2, Sub, Row } from '@/components/UI';
import { VEHICLE_TYPES, CARGO_CATEGORIES, TARIFF } from '@/constants';
import { calcPrice, useOrderStore } from '@/store/orders';
import { MOCK_CUSTOMER_PROFILE } from '@/mocks';
import { VehicleType, Address } from '@/types';
import { useT } from '@/i18n';
import { FadeSlideIn, AnimatedNumber } from '@/components/Anim';
import { colors, spacing, radius } from '@/theme';

const TOTAL_STEPS = 5;
const MAX_STOPS = 3;

export const OrderWizardScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const t = useT();
  const [step, setStep] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [stops, setStops] = useState<string[]>([]);
  const [vehicleType, setVehicleType] = useState<VehicleType>('small_bus');
  const [category, setCategory] = useState('meble');
  const [cargoName, setCargoName] = useState('');
  const [weightKg, setWeightKg] = useState('50');
  const [loaders, setLoaders] = useState(0);
  const [floorFrom, setFloorFrom] = useState('0');
  const [floorTo, setFloorTo] = useState('0');
  const [elevator, setElevator] = useState(true);
  const [carRunning, setCarRunning] = useState(true);
  const [urgent, setUrgent] = useState(true);
  const [payMethod, setPayMethod] = useState('pm-1');
  const createOrder = useOrderStore((s) => s.createOrder);
  const payOrder = useOrderStore((s) => s.payOrder);

  const filledStops = stops.filter((s) => s.trim());
  const distanceKm = Math.max(3, Math.min(40, (from.length + to.length) * 0.4)); // mock-дистанция
  const cargoDraft = { loadersCount: loaders, carRunning };
  const price = calcPrice(vehicleType, distanceKm, cargoDraft, filledStops.length, urgent);

  const next = () => {
    if (step === 1 && (!from.trim() || !to.trim())) return Alert.alert(t('common.error'), t('alert.addr'));
    if (step < TOTAL_STEPS) setStep(step + 1);
  };

  const submit = () => {
    const stopAddresses: Address[] = filledStops.map((s, i) => ({
      full: s.trim(), lat: 51.1 + i * 0.01, lng: 17.0 + i * 0.01,
    }));
    const order = createOrder({
      pickup: { full: from, lat: 51.11, lng: 16.99 },
      destination: { full: to, lat: 51.10, lng: 17.06 },
      stops: stopAddresses,
      cargo: {
        category, name: cargoName || category, itemsCount: 1, weightKg: Number(weightKg) || 50,
        fragile: false, valuable: false, needsStraps: true, loadersCount: loaders,
        floorFrom: Number(floorFrom) || 0, floorTo: Number(floorTo) || 0,
        hasElevatorFrom: elevator, hasElevatorTo: elevator, photos: [],
        carRunning: vehicleType === 'laweta' ? carRunning : undefined,
      },
      vehicleType, distanceKm, urgent,
    });
    payOrder(order.id); // Mock-оплата: блокировка средств
    navigation.replace('Searching');
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.l, paddingTop: 60, paddingBottom: 40 }}>
      <View style={{ marginBottom: spacing.l }}>
        <Text style={{ fontSize: 13, color: colors.sub, fontWeight: '700', marginBottom: 6 }}>{t('step.of', [step, TOTAL_STEPS])}</Text>
        <View style={{ height: 6, backgroundColor: colors.line, borderRadius: 3 }}>
          <View style={{ height: 6, width: `${(step / TOTAL_STEPS) * 100}%`, backgroundColor: colors.brand, borderRadius: 3 }} />
        </View>
      </View>

      {step === 1 && (
        <FadeSlideIn key="s1"><Card>
          <H2 style={{ marginBottom: spacing.m }}>{t('wizard.addresses')}</H2>
          <Input label={t('wizard.from')} value={from} onChangeText={setFrom} placeholder={t('ph.from')} />
          <Row style={{ marginBottom: spacing.m }}>
            {[MOCK_CUSTOMER_PROFILE.homeAddress, MOCK_CUSTOMER_PROFILE.workAddress].map((a) => a && (
              <TouchableOpacity key={a.label} onPress={() => setFrom(a.full)}
                style={{ backgroundColor: colors.brandSoft, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8 }}>
                <Text style={{ color: colors.brand, fontWeight: '700', fontSize: 12 }}>
                  {a.label === 'Dom' ? `🏠 ${t('profile.home')}` : `💼 ${t('profile.work')}`}
                </Text>
              </TouchableOpacity>
            ))}
          </Row>
          {/* Доп. остановки — до 3, тарифицируются по TARIFF.extraStopPrice */}
          <Sub style={{ marginBottom: 6, fontWeight: '600' }}>{t('wizard.stops')} · {t('wizard.stopPrice', [TARIFF.extraStopPrice])}</Sub>
          {stops.map((s, i) => (
            <Row key={i}>
              <Input label={t('wizard.stop', [i + 1])} value={s}
                onChangeText={(v) => setStops(stops.map((x, j) => (j === i ? v : x)))}
                placeholder={t('ph.from')} style={{ flex: 1, marginRight: 8 }} />
              <TouchableOpacity onPress={() => setStops(stops.filter((_, j) => j !== i))}
                style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.dangerSoft, alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
                <Text style={{ color: colors.danger, fontWeight: '800' }}>✕</Text>
              </TouchableOpacity>
            </Row>
          ))}
          {stops.length < MAX_STOPS && (
            <TouchableOpacity onPress={() => setStops([...stops, ''])}
              style={{ borderRadius: radius.m, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.line, padding: spacing.m, marginBottom: spacing.m }}>
              <Text style={{ color: colors.brand, fontWeight: '700' }}>{t('wizard.addStop')}</Text>
            </TouchableOpacity>
          )}
          <Input label={t('wizard.to')} value={to} onChangeText={setTo} placeholder={t('ph.to')} />
        </Card></FadeSlideIn>
      )}

      {step === 2 && (
        <FadeSlideIn key="s2"><Card>
          <H2 style={{ marginBottom: spacing.m }}>{t('wizard.vehicleType')}</H2>
          {(Object.keys(VEHICLE_TYPES) as VehicleType[]).map((k) => {
            const v = VEHICLE_TYPES[k];
            const active = vehicleType === k;
            return (
              <TouchableOpacity key={k} onPress={() => setVehicleType(k)}
                style={{ borderRadius: radius.l, borderWidth: 2, borderColor: active ? colors.brand : colors.line, padding: spacing.m, marginBottom: spacing.s, backgroundColor: active ? colors.brandSoft : '#FFF' }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 24 }}>{v.emoji}</Text>
                  <Text style={{ fontWeight: '800', color: colors.ink }}>{t(v.labelKey)}</Text>
                  <Text style={{ color: colors.sub, fontSize: 12 }}>{t('wizard.upTo', [v.maxPayload])}</Text>
                </Row>
                <Sub style={{ marginTop: 6 }}>{t(v.descKey)}</Sub>
              </TouchableOpacity>
            );
          })}
        </Card></FadeSlideIn>
      )}

      {step === 3 && (
        <FadeSlideIn key="s3"><Card>
          <H2 style={{ marginBottom: spacing.m }}>{t('wizard.cargo')}</H2>
          <Sub style={{ marginBottom: 6, fontWeight: '600' }}>{t('wizard.category')}</Sub>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.m }}>
            {CARGO_CATEGORIES.map((c) => (
              <TouchableOpacity key={c} onPress={() => setCategory(c)}
                style={{ backgroundColor: category === c ? colors.brand : '#F1F3F7', borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6, margin: 3 }}>
                <Text style={{ color: category === c ? '#FFF' : colors.sub, fontWeight: '700', fontSize: 12 }}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Input label={t('wizard.what')} value={cargoName} onChangeText={setCargoName} placeholder={t('ph.cargo')} />
          <Input label={t('wizard.weight')} value={weightKg} onChangeText={setWeightKg} keyboardType="numeric" />
          {vehicleType === 'laweta' ? (
            <Row style={{ justifyContent: 'space-between', marginTop: spacing.s }}>
              <Text style={{ fontWeight: '700', color: colors.ink, flex: 1 }}>{t('wizard.carRun')}</Text>
              <Row>
                {[true, false].map((v) => (
                  <TouchableOpacity key={String(v)} onPress={() => setCarRunning(v)}
                    style={{ backgroundColor: carRunning === v ? colors.brand : '#F1F3F7', borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 7, marginLeft: 6 }}>
                    <Text style={{ color: carRunning === v ? '#FFF' : colors.sub, fontWeight: '700', fontSize: 12 }}>
                      {v ? t('common.yes') : t('wizard.noWinch', [TARIFF.winchFee])}
                    </Text>
                  </TouchableOpacity>
                ))}
              </Row>
            </Row>
          ) : (
            <>
              <Row style={{ justifyContent: 'space-between', marginTop: spacing.s, marginBottom: spacing.s }}>
                <Text style={{ fontWeight: '700', color: colors.ink }}>{t('wizard.loaders')}</Text>
                <Row>
                  {[0, 1, 2].map((n) => (
                    <TouchableOpacity key={n} onPress={() => setLoaders(n)}
                      style={{ backgroundColor: loaders === n ? colors.brand : '#F1F3F7', borderRadius: radius.full, width: 38, height: 32, alignItems: 'center', justifyContent: 'center', marginLeft: 6 }}>
                      <Text style={{ color: loaders === n ? '#FFF' : colors.sub, fontWeight: '700' }}>{n === 0 ? '—' : n}</Text>
                    </TouchableOpacity>
                  ))}
                </Row>
              </Row>
              <Row>
                <Input label={t('wizard.floorFrom')} value={floorFrom} onChangeText={setFloorFrom} keyboardType="numeric" style={{ flex: 1, marginRight: 8 }} />
                <Input label={t('wizard.floorTo')} value={floorTo} onChangeText={setFloorTo} keyboardType="numeric" style={{ flex: 1 }} />
              </Row>
            </>
          )}
        </Card></FadeSlideIn>
      )}

      {step === 4 && (
        <FadeSlideIn key="s4"><Card>
          <H2 style={{ marginBottom: spacing.m }}>{t('wizard.when')}</H2>
          {[{ v: true, label: t('wizard.asap'), sub: t('wizard.asapSub', [TARIFF.urgentFee]) },
            { v: false, label: t('wizard.schedule'), sub: t('wizard.scheduleSub') }].map((o) => (
            <TouchableOpacity key={String(o.v)} onPress={() => setUrgent(o.v)}
              style={{ borderRadius: radius.l, borderWidth: 2, borderColor: urgent === o.v ? colors.brand : colors.line, padding: spacing.m, marginBottom: spacing.s }}>
              <Text style={{ fontWeight: '800', color: colors.ink }}>{o.label}</Text>
              <Sub>{o.sub}</Sub>
            </TouchableOpacity>
          ))}
        </Card></FadeSlideIn>
      )}

      {step === 5 && (
        <FadeSlideIn key="s5"><Card>
          <H2 style={{ marginBottom: spacing.m }}>{t('wizard.summary')}</H2>
          {([
            [t('sum.transport'), price.transport],
            [`${t('sum.dist')} · ${distanceKm.toFixed(0)} km`, price.distance],
            ...(price.loaders ? [[t('sum.loader'), price.loaders] as [string, number]] : []),
            ...(price.extraStops ? [[`${t('sum.stops')} × ${filledStops.length}`, price.extraStops] as [string, number]] : []),
            [t('sum.svc'), price.serviceFee],
            ...(price.urgentFee ? [[t('sum.urgent'), price.urgentFee] as [string, number]] : []),
          ] as [string, number][]).map(([label, val]) => (
            <Row key={label} style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <Sub>{label}</Sub><Sub>{val} zł</Sub>
            </Row>
          ))}
          <Row style={{ justifyContent: 'space-between', borderTopWidth: 1, borderColor: colors.line, paddingTop: spacing.s, marginTop: spacing.s, marginBottom: spacing.m }}>
            <Text style={{ fontWeight: '800', color: colors.ink }}>{t('order.total')}</Text>
            <AnimatedNumber value={price.total} textStyle={{ fontWeight: '900', fontSize: 24, color: colors.ink }} />
          </Row>
          {MOCK_CUSTOMER_PROFILE.paymentMethods.map((pm) => (
            <TouchableOpacity key={pm.id} onPress={() => setPayMethod(pm.id)}
              style={{ flexDirection: 'row', justifyContent: 'space-between', padding: spacing.m, borderRadius: radius.m, borderWidth: 2, borderColor: payMethod === pm.id ? colors.brand : colors.line, marginBottom: spacing.s }}>
              <Text style={{ fontWeight: '700', color: colors.ink }}>{pm.type === 'card' ? '💳' : '📱'} {pm.label}</Text>
              {payMethod === pm.id && <Text style={{ color: colors.brand }}>✓</Text>}
            </TouchableOpacity>
          ))}
          <Sub style={{ marginBottom: spacing.m }}>{t('pay.note')}</Sub>
        </Card></FadeSlideIn>
      )}

      <View style={{ marginTop: spacing.l }}>
        {step < TOTAL_STEPS
          ? <Button title={t('common.next')} onPress={next} />
          : <Button title={t('order.toPayment')} onPress={submit} />}
        {step > 1 && <Button title={t('common.back')} variant="ghost" onPress={() => setStep(step - 1)} style={{ marginTop: spacing.s }} />}
      </View>
    </ScrollView>
  );
};
