import React, { useEffect, useRef } from 'react';
import { View, Animated, Dimensions, Easing, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { APP_CONFIG } from '@/config/app';
import { colors, gradients } from '@/theme';

const { width } = Dimensions.get('window');

// Заставка: логотип PakujGo плавно въезжает и «пружинит», бегущая дорожная разметка
export const SplashScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const logoX = useRef(new Animated.Value(-width * 0.6)).current;
  const logoScale = useRef(new Animated.Value(0.7)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const road = useRef(new Animated.Value(0)).current;
  const tagOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
        Animated.spring(logoX, { toValue: 0, useNativeDriver: true, speed: 6, bounciness: 9 }),
        Animated.spring(logoScale, { toValue: 1, useNativeDriver: true, speed: 6, bounciness: 11 }),
      ]),
      Animated.timing(tagOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
    Animated.loop(
      Animated.timing(road, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }),
    ).start();
    const timer = setTimeout(() => navigation.replace('RoleSelect'), 2600);
    return () => clearTimeout(timer);
  }, []);

  return (
    <LinearGradient colors={gradients.splash} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ alignItems: 'center' }}>
        <Animated.View style={{ opacity: logoOpacity, transform: [{ translateX: logoX }, { scale: logoScale }] }}>
          <Image source={require('../../../assets/brand/logo-light.png')} style={{ width: width * 0.72, height: width * 0.44 }} resizeMode="contain" />
        </Animated.View>
        {/* «Бегущая» дорожная разметка — тиффани, видна на светлом фоне */}
        <View style={{ width: 190, height: 4, overflow: 'hidden', marginTop: 10, borderRadius: 2 }}>
          <Animated.View style={{
            flexDirection: 'row',
            transform: [{ translateX: road.interpolate({ inputRange: [0, 1], outputRange: [0, -60] }) }],
          }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <View key={i} style={{ width: 34, height: 4, marginRight: 26, backgroundColor: colors.brand, borderRadius: 2, opacity: 0.5 }} />
            ))}
          </Animated.View>
        </View>
        <Animated.Text style={{ color: colors.sub, marginTop: 14, fontSize: 14, fontWeight: '600', opacity: tagOpacity }}>
          {APP_CONFIG.tagline}
        </Animated.Text>
      </View>
    </LinearGradient>
  );
};
