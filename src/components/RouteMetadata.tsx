import React from 'react';
import { useLocation } from 'react-router-dom';

const SITE_NAME = 'Grupo Lina Ecommerce';
const SITE_URL = 'https://grupolinaecommerce.com';
const DEFAULT_DESCRIPTION =
  'Catálogo ecommerce e inventario en línea de Importadora Lina en Ecuador. Revisa productos, stock, precios y pedidos desde grupolinaecommerce.com.';

const ROUTE_METADATA: Record<string, { title: string; description: string; canonical: string }> = {
  '/': {
    title: `${SITE_NAME} | Importadora Lina Ecuador`,
    description: DEFAULT_DESCRIPTION,
    canonical: `${SITE_URL}/`,
  },
  '/productos': {
    title: `Productos | ${SITE_NAME}`,
    description:
      'Explora el catálogo online de Grupo Lina Ecommerce con productos, precios y stock actualizado para Ecuador.',
    canonical: `${SITE_URL}/productos`,
  },
  '/carrito': {
    title: `Carrito | ${SITE_NAME}`,
    description: 'Gestiona tu carrito de compras y prepara tu pedido en Grupo Lina Ecommerce.',
    canonical: `${SITE_URL}/carrito`,
  },
  '/login': {
    title: `Acceso | ${SITE_NAME}`,
    description: 'Accede al panel administrativo y al sistema de gestión de Grupo Lina Ecommerce.',
    canonical: `${SITE_URL}/login`,
  },
  '/dashboard': {
    title: `Dashboard | ${SITE_NAME}`,
    description: 'Panel administrativo de Grupo Lina Ecommerce para control de inventario, órdenes y catálogo.',
    canonical: `${SITE_URL}/dashboard`,
  },
};

const upsertMeta = (selector: string, attribute: 'name' | 'property', value: string, content: string) => {
  let element = document.head.querySelector<HTMLMetaElement>(selector);

  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, value);
    document.head.appendChild(element);
  }

  element.setAttribute('content', content);
};

const upsertCanonical = (href: string) => {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', 'canonical');
    document.head.appendChild(element);
  }

  element.setAttribute('href', href);
};

const resolveMetadata = (pathname: string) => {
  if (ROUTE_METADATA[pathname]) {
    return ROUTE_METADATA[pathname];
  }

  if (pathname.startsWith('/dashboard/')) {
    return {
      title: `Panel Interno | ${SITE_NAME}`,
      description: 'Vista interna de gestión operativa para Grupo Lina Ecommerce.',
      canonical: `${SITE_URL}${pathname}`,
    };
  }

  return {
    title: `${SITE_NAME} | Importadora Lina Ecuador`,
    description: DEFAULT_DESCRIPTION,
    canonical: `${SITE_URL}${pathname}`,
  };
};

const RouteMetadata: React.FC = () => {
  const location = useLocation();

  React.useEffect(() => {
    const metadata = resolveMetadata(location.pathname);

    document.title = metadata.title;
    upsertMeta('meta[name="description"]', 'name', 'description', metadata.description);
    upsertMeta('meta[property="og:title"]', 'property', 'og:title', metadata.title);
    upsertMeta('meta[property="og:description"]', 'property', 'og:description', metadata.description);
    upsertMeta('meta[property="og:url"]', 'property', 'og:url', metadata.canonical);
    upsertMeta('meta[property="twitter:title"]', 'property', 'twitter:title', metadata.title);
    upsertMeta('meta[property="twitter:description"]', 'property', 'twitter:description', metadata.description);
    upsertCanonical(metadata.canonical);
  }, [location.pathname]);

  return null;
};

export default RouteMetadata;