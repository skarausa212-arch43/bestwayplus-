import React, { useEffect, useRef } from 'react';
import { View, Text, Animated } from 'react-native';
import { APP_CONFIG } from '@/config/app';
import { colors } from '@/theme';

export const SplashScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();
    const timer = setTimeout(() => navigation.replace('RoleSelect'), 1800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ transform: [{ scale }], opacity, alignItems: 'center' }}>
        <Text style={{ fontSize: 56 }}>🚚</Text>
        <Text style={{ fontSize: 40, fontWeight: '900', color: '#FFF', marginTop: 8 }}>{APP_CONFIG.name}</Text>
        <Text style={{ color: '#D7F2E8', marginTop: 8, fontSize: 15 }}>{APP_CONFIG.tagline}</Text>
      </Animated.View>
    </View>
  );
};
