import React from 'react';
import { TouchableOpacity, Text, ViewStyle } from 'react-native';
import { useT } from '@/i18n';
import { colors, shadows } from '@/theme';

// Плавающая кнопка «назад» для экранов, открытых поверх табов (чат, заказ, мастер…)
export const BackButton: React.FC<{ navigation: any; style?: ViewStyle }> = ({ navigation, style }) => {
  const t = useT();
  if (!navigation?.canGoBack?.()) return null;
  return (
    <TouchableOpacity
      onPress={() => navigation.goBack()}
      accessibilityLabel={t('common.back')}
      style={[{
        position: 'absolute', top: 54, left: 16, zIndex: 60,
        width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF',
        alignItems: 'center', justifyContent: 'center', ...shadows.card,
      }, style]}>
      <Text style={{ fontSize: 20, color: colors.ink, fontWeight: '800' }}>←</Text>
    </TouchableOpacity>
  );
};
