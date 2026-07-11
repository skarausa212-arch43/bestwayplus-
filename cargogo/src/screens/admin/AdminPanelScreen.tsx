import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Card, H2, Sub, Row, StatusPill, Button } from '@/components/UI';
import { useOrderStore } from '@/store/orders';
import { colors, spacing } from '@/theme';

const TABS = ['Dashboard', 'Kierowcy', 'Zamówienia', 'Taryfy'];

export const AdminPanelScreen: React.FC = () => {
  const [tab, setTab] = useState('Dashboard');
  const orders = useOrderStore((s) => s.orders);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.l, paddingTop: 60 }}>
      <H2 style={{ marginBottom: spacing.m }}>Panel administratora</H2>
      <Row style={{ marginBottom: spacing.m, flexWrap: 'wrap' }}>
        {TABS.map((t2) => (
          <TouchableOpacity key={t2} onPress={() => setTab(t2)}
            style={{ backgroundColor: tab === t2 ? colors.brand : '#FFF', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, marginBottom: 8 }}>
            <Text style={{ color: tab === t2 ? '#FFF' : colors.sub, fontWeight: '700' }}>{t2}</Text>
          </TouchableOpacity>
        ))}
      </Row>
      {tab === 'Dashboard' && (
        <Row style={{ flexWrap: 'wrap' }}>
          {[['Zamówienia', orders.length], ['Kierowcy online', 1], ['Przychód dziś', '138 zł'], ['Spory', 0]].map(([l, v]) => (
            <Card key={String(l)} style={{ width: '47%', marginRight: '3%', marginBottom: spacing.s }}>
              <Sub>{l}</Sub><Text style={{ fontSize: 24, fontWeight: '900', color: colors.ink }}>{v}</Text>
            </Card>
          ))}
        </Row>
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
            <Sub>{o.pickup.full} → {o.destination.full}</Sub>
            <Text style={{ fontWeight: '800', color: colors.ink }}>{o.price.total} zł</Text>
          </Row>
          <StatusPill label={o.status} tone="info" />
        </Card>
      ))}
      {tab === 'Taryfy' && (
        <Card>
          {[['Mały bus — baza', '25 zł'], ['Duży bus — baza', '35 zł'], ['Laweta — baza', '80 zł'], ['Prowizja serwisu', '18%'], ['Pomocnik (ładowacz)', '40 zł'], ['Oczekiwanie', '2 zł/min']].map(([l, v]) => (
            <Row key={String(l)} style={{ justifyContent: 'space-between', paddingVertical: 8 }}>
              <Sub>{l}</Sub><Text style={{ fontWeight: '700', color: colors.ink }}>{v}</Text>
            </Row>
          ))}
        </Card>
      )}
    </ScrollView>
  );
};
