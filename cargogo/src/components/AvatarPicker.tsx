import React from 'react';
import { View, Image, TouchableOpacity, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { Role } from '@/types';
import { useProfileStore } from '@/store/profile';
import { colors } from '@/theme';

/**
 * Аватар с возможностью выбрать своё фото (доступно всем ролям).
 * Использует expo-image-picker; в Expo Go работает без доп. сборки.
 * Реальной загрузки на сервер нет — храним локальный URI (MVP).
 */
export const AvatarPicker: React.FC<{
  role: Role; size?: number; icon?: React.ComponentProps<typeof Feather>['name']; bg?: string; fg?: string;
}> = ({ role, size = 84, icon = 'user', bg = colors.brand, fg = '#FFF' }) => {
  const uri = useProfileStore((s) => s.avatars[role]);
  const setAvatar = useProfileStore((s) => s.setAvatar);

  const pick = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('PakujGo', 'Potrzebujemy dostępu do zdjęć, aby ustawić awatar.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (!res.canceled && res.assets?.[0]?.uri) setAvatar(role, res.assets[0].uri);
    } catch (e) {
      // В некоторых окружениях (симулятор без библиотеки) выбор недоступен — тихо игнорируем
    }
  };

  const badge = Math.round(size * 0.34);
  return (
    <TouchableOpacity onPress={pick} activeOpacity={0.85} style={{ width: size, height: size }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name={icon} size={Math.round(size * 0.5)} color={fg} />
        </View>
      )}
      {/* значок «камера» — подсказка, что фото можно сменить */}
      <View style={{ position: 'absolute', right: -2, bottom: -2, width: badge, height: badge, borderRadius: badge / 2, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg }}>
        <Feather name="camera" size={Math.round(badge * 0.5)} color={colors.brandDark} />
      </View>
    </TouchableOpacity>
  );
};
