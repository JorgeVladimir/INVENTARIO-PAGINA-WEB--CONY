import { Product } from '../types';

const keywordImageMap: Array<{ keywords: string[]; url: string }> = [
  {
    keywords: ['smartphone', 'telefono', 'celular', 'mobile'],
    url: 'https://source.unsplash.com/800x800/?smartphone',
  },
  {
    keywords: ['drone'],
    url: 'https://source.unsplash.com/800x800/?drone',
  },
  {
    keywords: ['cocina', 'kitchen', 'olla', 'sarten'],
    url: 'https://source.unsplash.com/800x800/?kitchen,utensils',
  },
  {
    keywords: ['lampara', 'lámpara', 'solar', 'luz'],
    url: 'https://source.unsplash.com/800x800/?lamp,light',
  },
  {
    keywords: ['juguete', 'toy'],
    url: 'https://source.unsplash.com/800x800/?toy',
  },
  {
    keywords: ['moda', 'ropa', 'fashion'],
    url: 'https://source.unsplash.com/800x800/?fashion,clothing',
  },
  {
    keywords: ['herramienta', 'tool'],
    url: 'https://source.unsplash.com/800x800/?tools',
  },
  {
    keywords: ['hogar', 'home'],
    url: 'https://source.unsplash.com/800x800/?home,appliance',
  },
  {
    keywords: ['electronica', 'electrónica', 'tech'],
    url: 'https://source.unsplash.com/800x800/?electronics',
  },
];

const normalizeText = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export const resolveProductImage = (product: Product): string => {
  const normalizedName = normalizeText(product.name || '');
  const normalizedCategory = normalizeText(product.category_name || '');
  const sourceText = `${normalizedName} ${normalizedCategory}`;

  const match = keywordImageMap.find(({ keywords }) =>
    keywords.some((keyword) => sourceText.includes(normalizeText(keyword)))
  );

  if (match) {
    return match.url;
  }

  if (product.image_url && !product.image_url.includes('picsum.photos')) {
    return product.image_url;
  }

  return `https://source.unsplash.com/800x800/?${encodeURIComponent(product.name || 'producto')}`;
};
