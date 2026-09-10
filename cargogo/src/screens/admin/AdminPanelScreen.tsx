import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Card, H2, Sub, Row, StatusPill, Button } from '@/components/UI';
import { useOrderStore } from '@/store/orders';
import { useCommunityStore } from '@/store/community';
import { usePricingStore } from '@/features/pricing/pricingService';
import { getAdminPricingView } from '@/features/pricing/pricingSelectors';
import { DEMAND_SCENARIOS } from '@/features/pricing/pricingMocks';
import { formatGr } from '@/features/pricing/pricingHelpers';
import { PricingVehicleType } from '@/features/pricing/pricingTypes';
import { useT } from '@/i18n';
import { colors, spacing, radius } from '@/theme';

const TABS = ['Dashboard', 'Kierowcy', 'Zamówienia', 'Taryfy'];
const VEHICLES: PricingVehicleType[] = ['small_bus', 'big_bus', 'laweta'];

export const AdminPanelScreen: React.FC = () => {
  const t = useT();
  const [tab, setTab] = useState('Dashboard');
  const orders = useOrderStore((s) => s.orders);
  const reports = useCommunityStore((s) => s.reports);
  const cfg = usePricingStore((s) => s.config);
  const setConfig = usePricingStore((s) => s.setConfig);
  const demandScenarioId = usePricingStore((s) => s.demandScenarioId);
  const setDemandScenario = usePricingStore((s) => s.setDemandScenario);

  // Внутренний доход платформы за завершённые заказы (только админ видит маржу)
  const revenueGr = orders
    .filter((o) => o.status === 'completed' && o.pricing)
    .reduce((s, o) => s + getAdminPricingView(o.pricing!).platformRevenueGr, 0);

  const setVehicle = (v: PricingVehicleType, field: 'basePickupGr' | 'perKmGr' | 'minimumGr', delta: number) =>
    setConfig({ vehicles: { ...cfg.vehicles, [v]: { ...cfg.vehicles[v], [field]: Math.max(0, cfg.vehicles[v][field] + delta) } } });

  const setAddition = (field: 'loaderPerHourGr' | 'extraStopGr' | 'floorNoElevatorGr' | 'waitingPerMinGr', delta: number) =>
    setConfig({ additions: { ...cfg.additions, [field]: Math.max(0, cfg.additions[field] + delta) } });

  const setMargin = (delta: number) =>
    setConfig({ marginPct: Math.min(0.5, Math.max(0, Math.round((cfg.marginPct + delta) * 100) / 100)) });

  const setMaxCoef = (delta: number) =>
    setConfig({ demand: { ...cfg.demand, maxCoef: Math.min(3, Math.max(1, Math.round((cfg.demand.maxCoef + delta) * 100) / 100)) } });

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.l, paddingTop: 60 }}>
      <H2 style={{ marginBottom: spacing.m }}>Panel administratora</H2>
      <Row style={{ marginBottom: spacing.m, flexWrap: 'wrap' }}>
        {TABS.map((t2) => (
          <TouchableOpacity key={t2} onPress={() => setTab(t2)}
            style={{ backgroundColor: tab === t2 ? colors.brand : colors.card, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, marginBottom: 8 }}>
            <Text style={{ color: tab === t2 ? '#FFF' : colors.sub, fontWeight: '700' }}>{t2}</Text>
          </TouchableOpacity>
        ))}
      </Row>

      {tab === 'Dashboard' && (
        <>
          <Row style={{ flexWrap: 'wrap' }}>
            {([['Zamówienia', orders.length], ['Kierowcy online', 1], ['Przychód platformy', formatGr(revenueGr)], [t('admin.reports'), reports.length]] as [string, any][]).map(([l, v]) => (
              <Card key={l} style={{ width: '47%', marginRight: '3%', marginBottom: spacing.s }}>
                <Sub>{l}</Sub><Text style={{ fontSize: 22, fontWeight: '900', color: colors.ink }}>{v}</Text>
              </Card>
            ))}
          </Row>

          {/* Dev-only: переключатель мок-сценария спроса. В production скрыт. */}
          {__DEV__ && (
            <Card style={{ marginTop: spacing.s, borderWidth: 1, borderColor: colors.warn, borderStyle: 'dashed' }}>
              <Row style={{ marginBottom: spacing.s }}>
                <Feather name="tool" size={14} color={colors.warn} />
                <Sub style={{ marginLeft: 6, fontWeight: '800', color: colors.warn }}>DEV · scenariusz popytu</Sub>
              </Row>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {DEMAND_SCENARIOS.map((s) => (
                  <TouchableOpacity key={s.id} onPress={() => setDemandScenario(s.id)}
                    style={{ backgroundColor: demandScenarioId === s.id ? colors.brand : colors.surface, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 7, margin: 3 }}>
                    <Text style={{ color: demandScenarioId === s.id ? '#FFF' : colors.sub, fontWeight: '700', fontSize: 12 }}>{t(s.labelKey)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Card>
          )}
        </>
      )}

      {tab === 'Kierowcy' && (
        <Card>
          <Row style={{ justifyContent: 'space-between', marginBottom: spacing.s }}>
            <View><Text style={{ fontWeight: '800', color: colors.ink }}>Marek Kaczmarek</Text><Sub>Renault Master · DW 4521K</Sub></View>
            <StatusPill label="Zatwierdzony" />
          </Row>
          <Row>
            <Button title="Zatwierdź" variant="secondary" onPress={() => {}} style={{ flex: 1, marginRight: 6 }} />
            <Button title="Zablokuj" variant="danger" onPress={() => {}} style={{ flex: 1 }} />
          </Row>
        </Card>
      )}

      {tab === 'Zamówienia' && orders.map((o) => (
        <Card key={o.id} style={{ marginBottom: spacing.s }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Sub style={{ flex: 1, marginRight: 8 }}>{o.pickup.full} → {o.destination.full}</Sub>
            <Text style={{ fontWeight: '800', color: colors.ink }}>{o.price.total} zł</Text>
          </Row>
          {/* Админ видит и выплату водителю, и доход платформы (§16) */}
          {o.pricing && (
            <Sub style={{ marginTop: 2 }}>
              wypłata: {formatGr(o.pricing.driverPayoutGr, 2)} · platforma: {formatGr(o.pricing.marginGr, 2)}
            </Sub>
          )}
          <StatusPill label={o.status} tone="info" />
        </Card>
      ))}

      {tab === 'Taryfy' && (
        <>
          <Sub style={{ marginBottom: spacing.s }}>Wersja taryfy: {cfg.version} · zmiany zapisują się automatycznie i nie zmieniają cen aktywnych zamówień.</Sub>
          {VEHICLES.map((v) => (
            <Card key={v} style={{ marginBottom: spacing.s }}>
              <Text style={{ fontWeight: '800', color: colors.ink, marginBottom: spacing.s }}>{t(`vehicle.${v === 'small_bus' ? 'small' : v === 'big_bus' ? 'big' : 'laweta'}`)}</Text>
              <EditRow label="Podstawa (podjazd)" value={formatGr(cfg.vehicles[v].basePickupGr)} onMinus={() => setVehicle(v, 'basePickupGr', -500)} onPlus={() => setVehicle(v, 'basePickupGr', 500)} />
              <EditRow label="Za kilometr" value={formatGr(cfg.vehicles[v].perKmGr, 2)} onMinus={() => setVehicle(v, 'perKmGr', -10)} onPlus={() => setVehicle(v, 'perKmGr', 10)} />
              <EditRow label="Cena minimalna" value={formatGr(cfg.vehicles[v].minimumGr)} onMinus={() => setVehicle(v, 'minimumGr', -500)} onPlus={() => setVehicle(v, 'minimumGr', 500)} />
            </Card>
          ))}
          <Card style={{ marginBottom: spacing.s }}>
            <Text style={{ fontWeight: '800', color: colors.ink, marginBottom: spacing.s }}>Usługi dodatkowe</Text>
            <EditRow label="Pomocnik / godz." value={formatGr(cfg.additions.loaderPerHourGr)} onMinus={() => setAddition('loaderPerHourGr', -500)} onPlus={() => setAddition('loaderPerHourGr', 500)} />
            <EditRow label="Dodatkowy przystanek" value={formatGr(cfg.additions.extraStopGr)} onMinus={() => setAddition('extraStopGr', -500)} onPlus={() => setAddition('extraStopGr', 500)} />
            <EditRow label="Piętro bez windy" value={formatGr(cfg.additions.floorNoElevatorGr)} onMinus={() => setAddition('floorNoElevatorGr', -500)} onPlus={() => setAddition('floorNoElevatorGr', 500)} />
            <EditRow label="Oczekiwanie / min" value={formatGr(cfg.additions.waitingPerMinGr, 2)} onMinus={() => setAddition('waitingPerMinGr', -10)} onPlus={() => setAddition('waitingPerMinGr', 10)} />
          </Card>
          <Card>
            <Text style={{ fontWeight: '800', color: colors.ink, marginBottom: spacing.s }}>Parametry platformy (poufne)</Text>
            <EditRow label="Marża platformy" value={`${Math.round(cfg.marginPct * 100)}%`} onMinus={() => setMargin(-0.01)} onPlus={() => setMargin(0.01)} />
            <EditRow label="Maks. współczynnik popytu" value={`×${cfg.demand.maxCoef.toFixed(2)}`} onMinus={() => setMaxCoef(-0.05)} onPlus={() => setMaxCoef(0.05)} />
          </Card>
        </>
      )}
    </ScrollView>
  );
};

const EditRow: React.FC<{ label: string; value: string; onMinus: () => void; onPlus: () => void }> = ({ label, value, onMinus, onPlus }) => (
  <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
    <Sub style={{ flex: 1 }}>{label}</Sub>
    <Row>
      <StepBtn icon="minus" onPress={onMinus} />
      <Text style={{ fontWeight: '800', color: colors.ink, minWidth: 74, textAlign: 'center' }}>{value}</Text>
      <StepBtn icon="plus" onPress={onPlus} />
    </Row>
  </Row>
);

const StepBtn: React.FC<{ icon: 'plus' | 'minus'; onPress: () => void }> = ({ icon, onPress }) => (
  <TouchableOpacity onPress={onPress}
    style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
    <Feather name={icon} size={16} color={colors.brandDark} />
  </TouchableOpacity>
);
