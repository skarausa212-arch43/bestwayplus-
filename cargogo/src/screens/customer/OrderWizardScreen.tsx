import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, Alert, Image, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Card, Button, Input, H2, Sub, Row } from '@/components/UI';
import { VEHICLE_TYPES, CARGO_CATEGORIES } from '@/constants';
import { useOrderStore } from '@/store/orders';
import { MOCK_CUSTOMER_PROFILE } from '@/mocks';
import { VehicleType, Address } from '@/types';
import { useT } from '@/i18n';
import { FadeSlideIn, AnimatedNumber } from '@/components/Anim';
import { BackButton } from '@/components/BackButton';
import { colors, spacing, radius } from '@/theme';
import { buildInput, calculateQuote, usePricingStore } from '@/features/pricing/pricingService';
import { getCustomerPricingView } from '@/features/pricing/pricingSelectors';
import { mockRouteKm } from '@/features/pricing/pricingMocks';
import { formatGr } from '@/features/pricing/pricingHelpers';
import { CustomerPriceView } from '@/features/pricing/pricingTypes';

const TOTAL_STEPS = 5;
const MAX_STOPS = 3;

// Фото транспорта из ассетов бренда
const VEHICLE_PHOTOS: Record<VehicleType, any> = {
  small_bus: require('../../../assets/vehicles/van-small.png'),
  big_bus: require('../../../assets/vehicles/van-big.png'),
  laweta: require('../../../assets/vehicles/laweta.png'),
};

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

  // Конфиг прайсинга — из стора (редактируется админкой, НЕ хардкод)
  const cfg = usePricingStore((s) => s.config);
  const demandScenarioId = usePricingStore((s) => s.demandScenarioId);

  const filledStops = stops.filter((s) => s.trim());
  const distanceKm = mockRouteKm(from, to);
  const floorsNoElevator = elevator
    ? 0
    : Math.max(0, Number(floorFrom) || 0) + Math.max(0, Number(floorTo) || 0);

  // §11: живой пересчёт с защитой от гонок — устаревший ответ не затирает новый
  const [view, setView] = useState<CustomerPriceView | null>(null);
  const [calculating, setCalculating] = useState(false);
  const reqRef = useRef(0);
  useEffect(() => {
    const reqId = ++reqRef.current;
    setCalculating(true);
    // имитация запроса к бэкенду расчёта (в production — API)
    const timer = setTimeout(() => {
      const breakdown = calculateQuote(buildInput({
        vehicleType, distanceKm,
        extraStops: filledStops.length,
        loaders, floorsNoElevator, urgent,
      }));
      if (reqRef.current !== reqId) return; // пришёл более новый расчёт
      setView(getCustomerPricingView(breakdown));
      setCalculating(false);
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleType, distanceKm, filledStops.length, loaders, floorsNoElevator, urgent, cfg.version, demandScenarioId]);

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

  const chip = (active: boolean) => ({
    backgroundColor: active ? colors.brand : colors.surface,
    borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6, margin: 3,
  });

  return (
    <View style={{ flex: 1 }}>
    <BackButton navigation={navigation} />
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.l, paddingTop: 110, paddingBottom: 40 }}>
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
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.brandSoft, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8 }}>
                <Feather name={a.label === 'Dom' ? 'home' : 'briefcase'} size={13} color={colors.brandDark} />
                <Text style={{ color: colors.brandDark, fontWeight: '700', fontSize: 12, marginLeft: 5 }}>
                  {a.label === 'Dom' ? t('profile.home') : t('profile.work')}
                </Text>
              </TouchableOpacity>
            ))}
          </Row>
          {/* Доп. остановки — до 3, тариф из конфига прайсинга */}
          <Sub style={{ marginBottom: 6, fontWeight: '600' }}>
            {t('wizard.stops')} · {t('wizard.stopPrice', [Math.round(cfg.additions.extraStopGr / 100)])}
          </Sub>
          {stops.map((s, i) => (
            <Row key={i}>
              <Input label={t('wizard.stop', [i + 1])} value={s}
                onChangeText={(v) => setStops(stops.map((x, j) => (j === i ? v : x)))}
                placeholder={t('ph.from')} style={{ flex: 1, marginRight: 8 }} />
              <TouchableOpacity onPress={() => setStops(stops.filter((_, j) => j !== i))}
                style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.dangerSoft, alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
                <Feather name="x" size={16} color={colors.danger} />
              </TouchableOpacity>
            </Row>
          ))}
          {stops.length < MAX_STOPS && (
            <TouchableOpacity onPress={() => setStops([...stops, ''])}
              style={{ flexDirection: 'row', alignItems: 'center', borderRadius: radius.m, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.line, padding: spacing.m, marginBottom: spacing.m }}>
              <Feather name="plus-circle" size={16} color={colors.brand} />
              <Text style={{ color: colors.brand, fontWeight: '700', marginLeft: 8 }}>{t('wizard.addStop')}</Text>
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
                style={{ borderRadius: radius.l, borderWidth: 2, borderColor: active ? colors.brand : colors.line, padding: spacing.m, marginBottom: spacing.s, backgroundColor: active ? colors.brandSoft : colors.card }}>
                <Row>
                  <Image source={VEHICLE_PHOTOS[k]} style={{ width: 84, height: 56 }} resizeMode="contain" />
                  <View style={{ flex: 1, marginLeft: spacing.m }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Text style={{ fontWeight: '800', color: colors.ink }}>{t(v.labelKey)}</Text>
                      {active && <Feather name="check-circle" size={18} color={colors.brand} />}
                    </Row>
                    <Sub style={{ marginTop: 2 }}>{t('wizard.upTo', [v.maxPayload])}</Sub>
                    {/* минимальная цена — из конфига, не из хардкода */}
                    <Text style={{ color: colors.brandDark, fontWeight: '800', fontSize: 13, marginTop: 4 }}>
                      {t('wizard.fromPrice', [Math.round(cfg.vehicles[k].minimumGr / 100)])}
                    </Text>
                  </View>
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
              <TouchableOpacity key={c} onPress={() => setCategory(c)} style={chip(category === c)}>
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
                    style={{ backgroundColor: carRunning === v ? colors.brand : colors.surface, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 7, marginLeft: 6 }}>
                    <Text style={{ color: carRunning === v ? '#FFF' : colors.sub, fontWeight: '700', fontSize: 12 }}>
                      {v ? t('common.yes') : t('common.no')}
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
                      style={{ backgroundColor: loaders === n ? colors.brand : colors.surface, borderRadius: radius.full, width: 38, height: 32, alignItems: 'center', justifyContent: 'center', marginLeft: 6 }}>
                      <Text style={{ color: loaders === n ? '#FFF' : colors.sub, fontWeight: '700' }}>{n === 0 ? '—' : n}</Text>
                    </TouchableOpacity>
                  ))}
                </Row>
              </Row>
              <Row style={{ justifyContent: 'space-between', marginBottom: spacing.s }}>
                <Text style={{ fontWeight: '700', color: colors.ink }}>{t('wizard.elevator')}</Text>
                <Row>
                  {[true, false].map((v) => (
                    <TouchableOpacity key={String(v)} onPress={() => setElevator(v)}
                      style={{ backgroundColor: elevator === v ? colors.brand : colors.surface, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 7, marginLeft: 6 }}>
                      <Text style={{ color: elevator === v ? '#FFF' : colors.sub, fontWeight: '700', fontSize: 12 }}>
                        {v ? t('common.yes') : t('common.no')}
                      </Text>
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
          {[{ v: true, label: t('wizard.asap'), sub: t('wizard.asapSub', [Math.round(cfg.coefficients.urgentPct * 100)]) },
            { v: false, label: t('wizard.schedule'), sub: t('wizard.scheduleSub') }].map((o) => (
            <TouchableOpacity key={String(o.v)} onPress={() => setUrgent(o.v)}
              style={{ borderRadius: radius.l, borderWidth: 2, borderColor: urgent === o.v ? colors.brand : colors.line, padding: spacing.m, marginBottom: spacing.s, backgroundColor: urgent === o.v ? colors.brandSoft : colors.card }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '800', color: colors.ink }}>{o.label}</Text>
                {urgent === o.v && <Feather name="check-circle" size={18} color={colors.brand} />}
              </Row>
              <Sub>{o.sub}</Sub>
            </TouchableOpacity>
          ))}
        </Card></FadeSlideIn>
      )}

      {step === 5 && (
        <FadeSlideIn key="s5"><Card>
          <H2 style={{ marginBottom: spacing.m }}>{t('wizard.summary')}</H2>
          {/* §5: клиент видит ТОЛЬКО CustomerPriceView — без маржи, коэффициентов и выплат */}
          {view?.lines.map((l) => (
            <Row key={l.labelKey} style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <Sub>{l.labelKey === 'sum.transport' ? `${t(l.labelKey)} · ${distanceKm.toFixed(0)} km` : t(l.labelKey)}</Sub>
              <Sub>{formatGr(l.amountGr)}</Sub>
            </Row>
          ))}
          {view?.demandNotice && (
            <Row style={{ backgroundColor: colors.infoSoft, borderRadius: radius.m, padding: spacing.s, marginTop: 4 }}>
              <Feather name="info" size={14} color={colors.info} style={{ marginTop: 1 }} />
              <Sub style={{ color: colors.info, marginLeft: 6, flex: 1 }}>{t('price.demandNote')}</Sub>
            </Row>
          )}
          <Row style={{ justifyContent: 'space-between', borderTopWidth: 1, borderColor: colors.line, paddingTop: spacing.s, marginTop: spacing.s, marginBottom: spacing.m }}>
            <Text style={{ fontWeight: '800', color: colors.ink }}>{t('order.total')}</Text>
            {calculating || !view
              ? <Row><ActivityIndicator size="small" color={colors.brand} /><Sub style={{ marginLeft: 8 }}>{t('price.calculating')}</Sub></Row>
              : <AnimatedNumber value={Math.round(view.totalGr / 100)} textStyle={{ fontWeight: '900', fontSize: 24, color: colors.ink }} />}
          </Row>
          {MOCK_CUSTOMER_PROFILE.paymentMethods.map((pm) => (
            <TouchableOpacity key={pm.id} onPress={() => setPayMethod(pm.id)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.m, borderRadius: radius.m, borderWidth: 2, borderColor: payMethod === pm.id ? colors.brand : colors.line, marginBottom: spacing.s }}>
              <Row>
                <Feather name={pm.type === 'card' ? 'credit-card' : 'smartphone'} size={16} color={colors.ink} />
                <Text style={{ fontWeight: '700', color: colors.ink, marginLeft: 8 }}>{pm.label}</Text>
              </Row>
              {payMethod === pm.id && <Feather name="check" size={18} color={colors.brand} />}
            </TouchableOpacity>
          ))}
          <Sub style={{ marginBottom: spacing.m }}>{t('pay.note')}</Sub>
        </Card></FadeSlideIn>
      )}

      <View style={{ marginTop: spacing.l }}>
        {step < TOTAL_STEPS
          ? <Button title={t('common.next')} onPress={next} />
          : <Button title={t('order.toPayment')} onPress={submit} disabled={calculating} />}
        {step > 1 && <Button title={t('common.back')} variant="ghost" onPress={() => setStep(step - 1)} style={{ marginTop: spacing.s }} />}
      </View>
    </ScrollView>
    </View>
  );
};
