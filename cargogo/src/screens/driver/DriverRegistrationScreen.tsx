import React, { useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, Alert } from 'react-native';
import { Card, Button, Input, Stepper, H2, Sub } from '@/components/UI';
import { useDriverStore } from '@/store/driver';
import { BackButton } from '@/components/BackButton';
import { colors, spacing, radius } from '@/theme';

const TOTAL = 8;
const STEP_TITLES = [
  'Dane osobowe', 'Dokument tożsamości', 'Prawo jazdy', 'Dane do wypłat',
  'Pojazd', 'Dokumenty pojazdu', 'Twoje usługi', 'Zgody i wysyłka',
];

// Mock-загрузка файла: кнопка переключает состояние "загружено"
const MockUpload: React.FC<{ label: string }> = ({ label }) => {
  const [done, setDone] = useState(false);
  return (
    <TouchableOpacity onPress={() => setDone(!done)}
      style={{ borderRadius: radius.m, borderWidth: 2, borderStyle: 'dashed', borderColor: done ? colors.brand : colors.line, padding: spacing.m, marginBottom: spacing.s, backgroundColor: done ? colors.brandSoft : '#FFF' }}>
      <Text style={{ fontWeight: '700', color: done ? colors.brand : colors.sub }}>
        {done ? '✅ ' : '📷 '} {label}{done ? ' — przesłano' : ''}
      </Text>
    </TouchableOpacity>
  );
};

export const DriverRegistrationScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { draft, updateDraft, submitForReview } = useDriverStore();
  const [step, setStep] = useState(draft.step);
  const [form, setForm] = useState<Record<string, string>>({ ownership: 'owner' });
  const [consents, setConsents] = useState<Record<string, boolean>>({});
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const CONSENTS = ['Regulamin kierowcy', 'Polityka prywatności', 'Zgoda na weryfikację dokumentów', 'Zgoda na geolokalizację podczas pracy', 'Zakaz przekazywania konta'];

  const next = () => {
    updateDraft({ step: step + 1 }); // черновик сохраняется автоматически
    if (step < TOTAL) setStep(step + 1);
  };

  const submit = () => {
    if (CONSENTS.some((c) => !consents[c])) return Alert.alert('Błąd', 'Zaznacz wszystkie wymagane zgody.');
    submitForReview();
    navigation.replace('VerificationStatus');
  };

  return (
    <View style={{ flex: 1 }}>
    <BackButton navigation={navigation} />
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.l, paddingTop: 110, paddingBottom: 40 }}>
      <Stepper step={step} total={TOTAL} />
      <H2 style={{ marginBottom: spacing.m }}>{STEP_TITLES[step - 1]}</H2>
      <Card>
        {step === 1 && (<>
          <Input label="Imię" value={form.firstName ?? ''} onChangeText={(v) => set('firstName', v)} />
          <Input label="Nazwisko" value={form.lastName ?? ''} onChangeText={(v) => set('lastName', v)} />
          <Input label="Data urodzenia" value={form.birthDate ?? ''} onChangeText={(v) => set('birthDate', v)} placeholder="DD.MM.RRRR" />
          <Input label="PESEL" value={form.pesel ?? ''} onChangeText={(v) => set('pesel', v)} keyboardType="numeric" />
          <Input label="Numer telefonu" value={form.phone ?? ''} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" />
          <Input label="Adres zamieszkania" value={form.address ?? ''} onChangeText={(v) => set('address', v)} />
        </>)}
        {step === 2 && (<>
          <Sub style={{ marginBottom: spacing.s }}>Dowód osobisty / paszport / karta pobytu</Sub>
          <Input label="Numer dokumentu" value={form.docNumber ?? ''} onChangeText={(v) => set('docNumber', v)} />
          <Input label="Data ważności" value={form.docExpiry ?? ''} onChangeText={(v) => set('docExpiry', v)} placeholder="DD.MM.RRRR" />
          <MockUpload label="Przednia strona dokumentu" />
          <MockUpload label="Tylna strona dokumentu" />
          <MockUpload label="Selfie z dokumentem" />
        </>)}
        {step === 3 && (<>
          <Input label="Numer prawa jazdy" value={form.license ?? ''} onChangeText={(v) => set('license', v)} />
          <Sub style={{ marginBottom: 6, fontWeight: '600' }}>Kategoria</Sub>
          <View style={{ flexDirection: 'row', marginBottom: spacing.m }}>
            {['B', 'B+E', 'C', 'C+E'].map((c) => (
              <TouchableOpacity key={c} onPress={() => set('licenseCat', c)}
                style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.full, borderWidth: 2, borderColor: form.licenseCat === c ? colors.brand : colors.line, marginRight: 8 }}>
                <Text style={{ fontWeight: '700', color: form.licenseCat === c ? colors.brand : colors.sub }}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <MockUpload label="Przednia strona prawa jazdy" />
          <MockUpload label="Tylna strona prawa jazdy" />
        </>)}
        {step === 4 && (<>
          <Input label="Właściciel konta" value={form.bankOwner ?? ''} onChangeText={(v) => set('bankOwner', v)} />
          <Input label="IBAN" value={form.iban ?? ''} onChangeText={(v) => set('iban', v)} placeholder="PL.." />
          <Sub>Weryfikacja bankowa: mock (MVP). Dane nie są przesyłane.</Sub>
        </>)}
        {step === 5 && (<>
          <Input label="Marka" value={form.brand ?? ''} onChangeText={(v) => set('brand', v)} placeholder="np. Renault" />
          <Input label="Model" value={form.model ?? ''} onChangeText={(v) => set('model', v)} placeholder="np. Master" />
          <Input label="Numer rejestracyjny" value={form.reg ?? ''} onChangeText={(v) => set('reg', v)} placeholder="DW ..." />
          <Input label="Ładowność (kg)" value={form.payload ?? ''} onChangeText={(v) => set('payload', v)} keyboardType="numeric" />
          <Input label="Wymiary kuzowa (D×S×W, m)" value={form.dims ?? ''} onChangeText={(v) => set('dims', v)} placeholder="4.3 × 2.0 × 2.1" />
          <MockUpload label="Zdjęcia pojazdu (8 wymaganych)" />
        </>)}
        {step === 6 && (<>
          <MockUpload label="Dowód rejestracyjny" />
          <MockUpload label="Polisa OC" />
          <MockUpload label="Badanie techniczne" />
          <Sub style={{ marginVertical: spacing.s, fontWeight: '600' }}>Czy pojazd należy do Ciebie?</Sub>
          {[['owner', 'Tak, jestem właścicielem'], ['leasing', 'Pojazd jest leasingowany'], ['rental', 'Pojazd jest wynajmowany'], ['company', 'Pojazd należy do firmy']].map(([k, label]) => (
            <TouchableOpacity key={k} onPress={() => set('ownership', k)}
              style={{ padding: spacing.m, borderRadius: radius.m, borderWidth: 2, borderColor: form.ownership === k ? colors.brand : colors.line, marginBottom: 6 }}>
              <Text style={{ fontWeight: '700', color: form.ownership === k ? colors.brand : colors.sub }}>{label}</Text>
            </TouchableOpacity>
          ))}
          {form.ownership === 'rental' && <MockUpload label="Umowa najmu + zgoda na przewozy" />}
          {form.ownership === 'leasing' && <MockUpload label="Umowa leasingu" />}
        </>)}
        {step === 7 && (<>
          <Input label="Miasto pracy" value={form.city ?? 'Wrocław'} onChangeText={(v) => set('city', v)} />
          <Input label="Promień (km)" value={form.radius ?? '30'} onChangeText={(v) => set('radius', v)} keyboardType="numeric" />
          <Input label="Minimalna cena zlecenia (zł)" value={form.minPrice ?? '30'} onChangeText={(v) => set('minPrice', v)} keyboardType="numeric" />
        </>)}
        {step === 8 && (<>
          {CONSENTS.map((c) => (
            <TouchableOpacity key={c} onPress={() => setConsents((s) => ({ ...s, [c]: !s[c] }))}
              style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.s }}>
              <Text style={{ fontSize: 18, marginRight: 8 }}>{consents[c] ? '☑️' : '⬜'}</Text>
              <Text style={{ color: colors.ink, flex: 1 }}>{c}</Text>
            </TouchableOpacity>
          ))}
        </>)}
      </Card>
      <View style={{ marginTop: spacing.l }}>
        {step < TOTAL
          ? <Button title="Dalej" onPress={next} />
          : <Button title="Wyślij do weryfikacji" onPress={submit} />}
        {step > 1 && <Button title="Wstecz" variant="ghost" onPress={() => setStep(step - 1)} style={{ marginTop: spacing.s }} />}
      </View>
      <Sub style={{ textAlign: 'center', marginTop: spacing.m }}>Szkic zapisuje się automatycznie — możesz wrócić później.</Sub>
    </ScrollView>
    </View>
  );
};
