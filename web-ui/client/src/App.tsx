// import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { WhatsAppProvider } from './contexts/WhatsAppContext';
import { SocketProvider } from './contexts/SocketContext';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route 
          path="/*" 
          element={
            <ProtectedRoute>
              <WhatsAppProvider>
                <SocketProvider>
                  <Dashboard />
                </SocketProvider>
              </WhatsAppProvider>
            </ProtectedRoute>
          } 
        />
      </Routes>
    </AuthProvider>
  );
}

export default App;