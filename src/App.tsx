import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import AppShell from '@/components/AppShell';
import AuthScreen from '@/screens/AuthScreen';
import ConsentGate from '@/screens/ConsentGate';
import TodayScreen from '@/screens/TodayScreen';
import ProvidersScreen from '@/screens/ProvidersScreen';
import ProviderScreen from '@/screens/ProviderScreen';
import BookingsScreen from '@/screens/BookingsScreen';
import ProfileScreen from '@/screens/ProfileScreen';
import SetupNotice from '@/screens/SetupNotice';
import { isConfigured } from '@/lib/supabase';
import { Spinner } from '@/components/ui';

function Gate() {
  const { loading, session, consentGiven } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Starting up" />
      </div>
    );
  }

  if (!session) return <AuthScreen />;
  if (!consentGiven) return <ConsentGate />;

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<TodayScreen />} />
        <Route path="providers" element={<ProvidersScreen />} />
        <Route path="providers/:id" element={<ProviderScreen />} />
        <Route path="bookings" element={<BookingsScreen />} />
        <Route path="profile" element={<ProfileScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  if (!isConfigured) return <SetupNotice />;

  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  );
}
