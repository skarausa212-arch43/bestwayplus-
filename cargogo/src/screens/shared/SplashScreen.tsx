import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Dimensions, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { APP_CONFIG } from '@/config/app';
import { gradients } from '@/theme';

const { width } = Dimensions.get('window');

export const SplashScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const truckX = useRef(new Animated.Value(-width * 0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.85)).current;
  const road = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      // Грузовик въезжает слева
      Animated.spring(truckX, { toValue: 0, useNativeDriver: true, speed: 4, bounciness: 7 }),
      Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
    ]).start();
    Animated.loop(
      Animated.timing(road, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }),
    ).start();
    const timer = setTimeout(() => navigation.replace('RoleSelect'), 2100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <LinearGradient colors={gradients.splash} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ alignItems: 'center', opacity, transform: [{ scale }] }}>
        <Animated.Text style={{ fontSize: 64, transform: [{ translateX: truckX }] }}>🚚</Animated.Text>
        {/* «Бегущая» дорожная разметка под грузовиком */}
        <View style={{ width: 180, height: 4, overflow: 'hidden', marginTop: 6, borderRadius: 2 }}>
          <Animated.View style={{
            flexDirection: 'row',
            transform: [{ translateX: road.interpolate({ inputRange: [0, 1], outputRange: [0, -60] }) }],
          }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <View key={i} style={{ width: 34, height: 4, marginRight: 26, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 2 }} />
            ))}
          </Animated.View>
        </View>
        <Text style={{ fontSize: 42, fontWeight: '900', color: '#FFF', marginTop: 18, letterSpacing: -1 }}>{APP_CONFIG.name}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.85)', marginTop: 8, fontSize: 15 }}>{APP_CONFIG.tagline}</Text>
      </Animated.View>
    </LinearGradient>
  );
};
