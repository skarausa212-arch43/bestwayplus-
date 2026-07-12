import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { colors } from '@/theme';
import { useT } from '@/i18n';

import { SplashScreen } from '@/screens/shared/SplashScreen';
import { RoleSelectScreen } from '@/screens/shared/RoleSelectScreen';
import { NotificationsScreen } from '@/screens/shared/NotificationsScreen';
import { ReportProblemScreen } from '@/screens/shared/ReportProblemScreen';
import { CustomerAuthScreen } from '@/screens/auth/CustomerAuthScreen';
import { DriverAuthScreen } from '@/screens/auth/DriverAuthScreen';
import { CustomerHomeScreen } from '@/screens/customer/CustomerHomeScreen';
import { OrderWizardScreen } from '@/screens/customer/OrderWizardScreen';
import { SearchingScreen } from '@/screens/customer/SearchingScreen';
import { ActiveOrderScreen } from '@/screens/customer/ActiveOrderScreen';
import { ChatScreen } from '@/screens/customer/ChatScreen';
import { OrdersHistoryScreen } from '@/screens/customer/OrdersHistoryScreen';
import { OrderDetailsScreen } from '@/screens/customer/OrderDetailsScreen';
import { RateOrderScreen } from '@/screens/customer/RateOrderScreen';
import { CustomerProfileScreen } from '@/screens/customer/CustomerProfileScreen';
import { DriverRegistrationScreen } from '@/screens/driver/DriverRegistrationScreen';
import { VerificationStatusScreen } from '@/screens/driver/VerificationStatusScreen';
import { DriverHomeScreen } from '@/screens/driver/DriverHomeScreen';
import { DriverActiveOrderScreen } from '@/screens/driver/DriverActiveOrderScreen';
import { EarningsScreen } from '@/screens/driver/EarningsScreen';
import { DriverProfileScreen } from '@/screens/driver/DriverProfileScreen';
import { AdminPanelScreen } from '@/screens/admin/AdminPanelScreen';

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

const tabIcon = (name: React.ComponentProps<typeof Feather>['name']) =>
  ({ color }: { focused: boolean; color: string }) => <Feather name={name} size={22} color={color} />;

// Подписи табов через useT — перерисовываются при смене языка в профиле
const CustomerTabs = () => {
  const t = useT();
  return (
    <Tabs.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.brand, tabBarInactiveTintColor: colors.faint, tabBarLabelStyle: { fontWeight: '700', fontSize: 11 }, tabBarStyle: { height: 62, paddingBottom: 8, paddingTop: 6, borderTopWidth: 0, backgroundColor: '#FFFFFF', shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: -4 }, elevation: 10 } }}>
      <Tabs.Screen name="Home" component={CustomerHomeScreen} options={{ title: t('tabs.map'), tabBarIcon: tabIcon('map') }} />
      <Tabs.Screen name="Orders" component={OrdersHistoryScreen} options={{ title: t('tabs.orders'), tabBarIcon: tabIcon('package') }} />
      <Tabs.Screen name="Messages" component={ChatScreen} options={{ title: t('tabs.messages'), tabBarIcon: tabIcon('message-circle') }} />
      <Tabs.Screen name="Profile" component={CustomerProfileScreen} options={{ title: t('tabs.profile'), tabBarIcon: tabIcon('user') }} />
    </Tabs.Navigator>
  );
};

const DriverTabs = () => {
  const t = useT();
  return (
    <Tabs.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.brand, tabBarInactiveTintColor: colors.faint, tabBarLabelStyle: { fontWeight: '700', fontSize: 11 }, tabBarStyle: { height: 62, paddingBottom: 8, paddingTop: 6, borderTopWidth: 0, backgroundColor: '#FFFFFF', shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: -4 }, elevation: 10 } }}>
      <Tabs.Screen name="DHome" component={DriverHomeScreen} options={{ title: t('tabs.map'), tabBarIcon: tabIcon('map') }} />
      <Tabs.Screen name="DJobs" component={DriverActiveOrderScreen} options={{ title: t('tabs.jobs'), tabBarIcon: tabIcon('truck') }} />
      <Tabs.Screen name="DChat" component={ChatScreen} options={{ title: t('tabs.messages'), tabBarIcon: tabIcon('message-circle') }} />
      <Tabs.Screen name="DEarnings" component={EarningsScreen} options={{ title: t('tabs.earnings'), tabBarIcon: tabIcon('dollar-sign') }} />
      <Tabs.Screen name="DProfile" component={DriverProfileScreen} options={{ title: t('tabs.profile'), tabBarIcon: tabIcon('user') }} />
    </Tabs.Navigator>
  );
};

export const RootNavigator = () => (
  <NavigationContainer>
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="RoleSelect" component={RoleSelectScreen} />
      <Stack.Screen name="CustomerAuth" component={CustomerAuthScreen} />
      <Stack.Screen name="DriverAuth" component={DriverAuthScreen} />
      <Stack.Screen name="CustomerTabs" component={CustomerTabs} />
      <Stack.Screen name="DriverTabs" component={DriverTabs} />
      <Stack.Screen name="OrderWizard" component={OrderWizardScreen} />
      <Stack.Screen name="Searching" component={SearchingScreen} />
      <Stack.Screen name="ActiveOrder" component={ActiveOrderScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="DriverChat" component={ChatScreen} />
      <Stack.Screen name="OrderDetails" component={OrderDetailsScreen} />
      <Stack.Screen name="RateOrder" component={RateOrderScreen} />
      <Stack.Screen name="DriverRegistration" component={DriverRegistrationScreen} />
      <Stack.Screen name="VerificationStatus" component={VerificationStatusScreen} />
      <Stack.Screen name="DriverActiveOrder" component={DriverActiveOrderScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="ReportProblem" component={ReportProblemScreen} />
      <Stack.Screen name="AdminPanel" component={AdminPanelScreen} />
    </Stack.Navigator>
  </NavigationContainer>
);
