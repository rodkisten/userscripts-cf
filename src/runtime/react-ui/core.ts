import { MenuSchema } from './types';

export function createInitialValues(schema: MenuSchema, customInitial?: Record<string, any>): Record<string, any> {
  const defaults: Record<string, any> = {};
  if (schema.fields) {
    schema.fields.forEach(field => {
      defaults[field.id] = field.defaultValue !== undefined ? field.defaultValue : (field.type === 'checkbox' || field.type === 'toggle' ? false : '');
    });
  }
  return { ...defaults, ...customInitial };
}

export function loadPersistence(persistKey?: string): Record<string, any> {
  if (!persistKey || typeof window === 'undefined') return {};
  try {
    const saved = localStorage.getItem(`rod_menu_${persistKey}`);
    return saved ? JSON.parse(saved) : {};
  } catch (e) {
    console.error('Failed to load menu persistence', e);
    return {};
  }
}

export function savePersistence(persistKey: string | undefined, values: Record<string, any>) {
  if (!persistKey || typeof window === 'undefined') return;
  try {
    localStorage.setItem(`rod_menu_${persistKey}`, JSON.stringify(values));
  } catch (e) {
    console.error('Failed to save menu persistence', e);
  }
}
