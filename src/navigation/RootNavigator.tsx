import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppStore } from '@/store/appStore';

import OnboardingScreen from '@/screens/OnboardingScreen';
import StandbyScreen from '@/screens/StandbyScreen';
import GoLiveScreen from '@/screens/GoLiveScreen';
import OrientationUploadScreen from '@/screens/OrientationUploadScreen';
import EscalationScreen from '@/screens/EscalationScreen';
import SessionLogScreen from '@/screens/SessionLogScreen';

export type RootStackParamList = {
  Onboarding: undefined;
  Standby: undefined;
  GoLive: { moduleTab?: string };
  OrientationUpload: undefined;
  Escalation: { issueSummary?: string };
  SessionLog: undefined;
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
  const { consultantProfile } = useAppStore();
  const isOnboarded = !!consultantProfile;

  return (
    <NavigationContainer theme={THEME}>
      <Stack.Navigator
        initialRouteName={isOnboarded ? 'Standby' : 'Onboarding'}
        screenOptions={{ headerShown: false, animation: 'fade' }}
      >
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="Standby" component={StandbyScreen} />
        <Stack.Screen name="GoLive" component={GoLiveScreen} />
        <Stack.Screen name="OrientationUpload" component={OrientationUploadScreen} />
        <Stack.Screen name="Escalation" component={EscalationScreen} />
        <Stack.Screen name="SessionLog" component={SessionLogScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
