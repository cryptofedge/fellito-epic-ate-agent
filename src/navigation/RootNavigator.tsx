import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppStore } from '@/store/appStore';
import { verifyStoredToken } from '@/services/authService';
import { BRANDING } from '@/constants/persona';

import LoginScreen from '@/screens/LoginScreen';
import OnboardingScreen from '@/screens/OnboardingScreen';
import StandbyScreen from '@/screens/StandbyScreen';
import GoLiveScreen from '@/screens/GoLiveScreen';
import OrientationUploadScreen from '@/screens/OrientationUploadScreen';
import EscalationScreen from '@/screens/EscalationScreen';
import SessionLogScreen from '@/screens/SessionLogScreen';
import TicketTrackerScreen from '@/screens/TicketTrackerScreen';

export type RootStackParamList = {
  Login: undefined;
  Onboarding: undefined;
  Standby: undefined;
  GoLive: { moduleTab?: string };
  OrientationUpload: undefined;
  Escalation: { issueSummary?: string };
  SessionLog: undefined;
  TicketTracker: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const THEME = {
  colors: {
    background: '#0A0A0F',
    card: '#12121A',
    text: '#FFFFFF',
    border: '#1E1E2E',
    notification: '#FF3B5C',
    primary: '#00E5FF',
  },
  dark: true,
  fonts: {} as any,
};

export default function RootNavigator() {
  const { authUser, setAuthUser, consultantProfile } = useAppStore();
  const [checking, setChecking] = useState(true);

  // On mount, restore session from AsyncStorage
  useEffect(() => {
    verifyStoredToken().then((user) => {
      if (user) setAuthUser(user);
      setChecking(false);
    });
  }, []);

  if (checking) {
    return (
      <View style={{ flex: 1, backgroundColor: BRANDING.bgColor, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={BRANDING.accentColor} size="large" />
      </View>
    );
  }

  const isLoggedIn = !!authUser;
  const isOnboarded = !!consultantProfile;

  return (
    <NavigationContainer theme={THEME}>
      <Stack.Navigator
        screenOptions={{ headerShown: false, animation: 'fade' }}
      >
        {!isLoggedIn ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : !isOnboarded ? (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        ) : (
          <>
            <Stack.Screen name="Standby" component={StandbyScreen} />
            <Stack.Screen name="GoLive" component={GoLiveScreen} />
            <Stack.Screen name="OrientationUpload" component={OrientationUploadScreen} />
            <Stack.Screen name="Escalation" component={EscalationScreen} />
            <Stack.Screen name="SessionLog" component={SessionLogScreen} />
            <Stack.Screen name="TicketTracker" component={TicketTrackerScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
