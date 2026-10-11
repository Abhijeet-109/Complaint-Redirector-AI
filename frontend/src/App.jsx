import React from 'react';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { Home } from './pages/Home';

export function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <Home />
      </CartProvider>
    </AuthProvider>
  );
}

export default App;
