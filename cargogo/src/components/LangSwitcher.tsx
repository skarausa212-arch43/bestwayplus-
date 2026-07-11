import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { APP_CONFIG, Locale } from '@/config/app';
import { setLocale, useT } from '@/i18n';
import { useLocaleStore } from '@/store/locale';
import { useNotificationStore } from '@/store/notifications';
import { colors, radius, spacing } from '@/theme';

// PL/RU/EN — полные переводы; uk/be/de — заглушки (падают на pl)
const MAIN_LANGS: Locale[] = ['pl', 'ru', 'en'];
const STUB_LANGS: Locale[] = APP_CONFIG.supportedLocales.filter((l) => !MAIN_LANGS.includes(l));

export const LangSwitcher: React.FC = () => {
  const t = useT();
  const role = useNotificationStore((s) => s.activeRole) ?? 'customer';
  const lang = useLocaleStore((s) => s.langs[role]);

  const pill = (l: Locale, main: boolean) => {
    const active = lang === l;
    return (
      <TouchableOpacity key={l} onPress={() => setLocale(l)}
        style={{
          paddingHorizontal: main ? 16 : 10, paddingVertical: main ? 8 : 5,
          borderRadius: radius.full, marginRight: 6, marginBottom: 6,
          backgroundColor: active ? colors.brand : '#F1F3F7',
          opacity: main ? 1 : 0.7,
        }}>
        <Text style={{ color: active ? '#FFF' : colors.sub, fontWeight: '800', fontSize: main ? 14 : 11 }}>
          {l.toUpperCase()}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View>
      <Text style={{ fontWeight: '700', color: colors.ink, marginBottom: spacing.s }}>{t('profile.language')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
        {MAIN_LANGS.map((l) => pill(l, true))}
        {STUB_LANGS.map((l) => pill(l, false))}
      </View>
    </View>
  );
};
