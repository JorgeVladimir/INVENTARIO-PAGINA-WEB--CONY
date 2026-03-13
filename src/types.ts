export interface User {
  id: number;
  username: string;
  role: 'admin' | 'tienda' | 'bodega';
  full_name: string;
}

export interface Product {
  id: number;
  internal_code: string;
  name: string;
  codbarras?: string;
  nombre?: string;
  descripcion?: string;
  grupo?: string;
  category_id: number;
  category_name?: string;
  price: number;
  precio_bulto?: number;
  precio_mayorista?: number;
  precio_unidad?: number;
  cost: number;
  stock: number;
  container_id: number;
  container_code?: string;
  warehouse_id: number;
  warehouse_name?: string;
  image_url: string;
}

export interface Order {
  id: number;
  order_number: string;
  user_id: number;
  user_name?: string;
  order_date: string;
  total: number;
  status: 'pendiente' | 'pagado' | 'despachado';
  shipping_guide?: string | null;
  shipment_status?: 'guia_generada' | 'en_transito' | 'entregado' | 'sin_guia' | string;
  details?: OrderDetail[];
}

export interface OrderDetail {
  id: number;
  order_id: number;
  product_id: number;
  product_name: string;
  internal_code: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface Container {
  id: number;
  code: string;
  arrival_date: string;
  status: string;
}

export interface Category {
  id: number;
  name: string;
}

export interface Warehouse {
  id: number;
  name: string;
}
