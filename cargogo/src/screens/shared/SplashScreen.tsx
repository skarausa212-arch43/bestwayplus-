import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Dimensions, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { APP_CONFIG } from '@/config/app';
import { gradients } from '@/theme';

const { width } = Dimensions.get('window');

// Заставка: грузовик въезжает, коробка падает в кузов, буквы выпрыгивают по одной
export const SplashScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const truckX = useRef(new Animated.Value(-width * 0.7)).current;
  const boxY = useRef(new Animated.Value(-160)).current;
  const boxOpacity = useRef(new Animated.Value(0)).current;
  const road = useRef(new Animated.Value(0)).current;
  const tagOpacity = useRef(new Animated.Value(0)).current;
  const letters = useRef(APP_CONFIG.name.split('').map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.sequence([
      // 1. Грузовик въезжает слева
      Animated.spring(truckX, { toValue: 0, useNativeDriver: true, speed: 5, bounciness: 8 }),
      // 2. Коробка падает в кузов с отскоком
      Animated.parallel([
        Animated.timing(boxOpacity, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.spring(boxY, { toValue: -34, useNativeDriver: true, speed: 9, bounciness: 16 }),
      ]),
      // 3. Буквы названия выпрыгивают каскадом
      Animated.stagger(60, letters.map((l) =>
        Animated.spring(l, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 14 }))),
      Animated.timing(tagOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
    Animated.loop(
      Animated.timing(road, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }),
    ).start();
    const timer = setTimeout(() => navigation.replace('RoleSelect'), 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <LinearGradient colors={gradients.splash} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ alignItems: 'center' }}>
        <View style={{ height: 110, justifyContent: 'flex-end' }}>
          <Animated.Text style={{
            fontSize: 34, position: 'absolute', top: 0, alignSelf: 'center', zIndex: 2,
            opacity: boxOpacity, transform: [{ translateY: boxY }],
          }}>📦</Animated.Text>
          <Animated.Text style={{ fontSize: 64, transform: [{ translateX: truckX }] }}>🚚</Animated.Text>
        </View>
        {/* «Бегущая» дорожная разметка */}
        <View style={{ width: 190, height: 4, overflow: 'hidden', marginTop: 6, borderRadius: 2 }}>
          <Animated.View style={{
            flexDirection: 'row',
            transform: [{ translateX: road.interpolate({ inputRange: [0, 1], outputRange: [0, -60] }) }],
          }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <View key={i} style={{ width: 34, height: 4, marginRight: 26, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 2 }} />
            ))}
          </Animated.View>
        </View>
        <View style={{ flexDirection: 'row', marginTop: 18 }}>
          {APP_CONFIG.name.split('').map((ch, i) => (
            <Animated.Text key={i} style={{
              fontSize: 44, fontWeight: '900', color: '#FFF', letterSpacing: -1,
              opacity: letters[i],
              transform: [
                { scale: letters[i] },
                { translateY: letters[i].interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
              ],
            }}>{ch}</Animated.Text>
          ))}
        </View>
        <Animated.Text style={{ color: 'rgba(255,255,255,0.85)', marginTop: 8, fontSize: 15, opacity: tagOpacity }}>
          {APP_CONFIG.tagline}
        </Animated.Text>
      </View>
    </LinearGradient>
  );
};
