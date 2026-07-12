import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { APP_CONFIG, Locale } from '@/config/app';
import { setLocale, useT } from '@/i18n';
import { useLocaleStore } from '@/store/locale';
import { useNotificationStore } from '@/store/notifications';
import { colors, radius, spacing } from '@/theme';

// Все языки полные и равноправные: PL / EN / RU / UK / DE (выбор в настройках)
const META: Record<Locale, { flag: string; name: string }> = {
  pl: { flag: '🇵🇱', name: 'Polski' },
  en: { flag: '🇬🇧', name: 'English' },
  ru: { flag: '🇷🇺', name: 'Русский' },
  uk: { flag: '🇺🇦', name: 'Українська' },
  de: { flag: '🇩🇪', name: 'Deutsch' },
};

export const LangSwitcher: React.FC = () => {
  const t = useT();
  const role = useNotificationStore((s) => s.activeRole) ?? 'customer';
  const lang = useLocaleStore((s) => s.langs[role]);

  return (
    <View>
      <Text style={{ fontWeight: '800', color: colors.ink, marginBottom: spacing.s, fontSize: 16 }}>{t('profile.language')}</Text>
      {APP_CONFIG.supportedLocales.map((l) => {
        const active = lang === l;
        const m = META[l];
        return (
          <TouchableOpacity key={l} onPress={() => setLocale(l)}
            style={{
              flexDirection: 'row', alignItems: 'center',
              paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.l, marginBottom: 8,
              backgroundColor: active ? colors.brandSoft : colors.surface,
              borderWidth: 1.5, borderColor: active ? colors.brand : 'transparent',
            }}>
            <Text style={{ fontSize: 22, marginRight: 12 }}>{m.flag}</Text>
            <Text style={{ flex: 1, fontWeight: '700', color: colors.ink, fontSize: 15 }}>{m.name}</Text>
            <Text style={{ color: active ? colors.brandDark : colors.faint, fontWeight: '800', fontSize: 12, marginRight: 8 }}>{l.toUpperCase()}</Text>
            {active && <Feather name="check-circle" size={20} color={colors.brand} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};
