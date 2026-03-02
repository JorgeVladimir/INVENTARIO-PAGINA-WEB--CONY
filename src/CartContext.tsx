import React, { useState, createContext, useContext } from 'react';
import { Product } from './types';

interface CartItem extends Product {
  quantity: number;
}

interface CartContextType {
  items: CartItem[];
  addToCart: (product: Product, quantity: number) => void;
  removeFromCart: (productId: number) => void;
  clearCart: () => void;
  total: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>([]);

  const addToCart = (product: Product, quantity: number) => {
    setItems(prev => {
      const existing = prev.find(i => i.id === product.id);
      if (existing) {
        const nextQuantity = existing.quantity + quantity;
        if (nextQuantity <= 0) {
          return prev.filter(i => i.id !== product.id);
        }
        return prev.map(i => i.id === product.id ? { ...i, quantity: nextQuantity } : i);
      }
      if (quantity <= 0) {
        return prev;
      }
      return [...prev, { ...product, quantity }];
    });
  };

  const removeFromCart = (productId: number) => {
    setItems(prev => prev.filter(i => i.id !== productId));
  };

  const clearCart = () => setItems([]);

  const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  return (
    <CartContext.Provider value={{ items, addToCart, removeFromCart, clearCart, total }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
