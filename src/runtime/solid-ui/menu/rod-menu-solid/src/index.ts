import { render } from 'solid-js/web';
import type {
  ActionRole,
  ActionVariant,
  AnyRecord,
  Presentation,
  RodMenuAction,
  RodMenuHandle,
  RodMenuResult,
  RodMenuSchema,
} from './types';
import { RodMenuHost, spawnSurface, closeAllSurfaces } from './components/RodMenuProvider';
import { activateSurface, getAllHandles, getHandleById } from './store/stackManager';
import { presets } from './presets/presets';

export * from './types';
export { Surface } from './components/Surface';
export { RodMenuHost } from './components/RodMenuProvider';
export { presets };

let hostMounted = false;

function ensureHostMounted() {
  if (hostMounted || typeof document === 'undefined') return;
  hostMounted = true;
  const container = document.createElement('div');
  container.id = 'rod-menu-solid-root';
  document.documentElement.appendChild(container);
  render(() => RodMenuHost(), container);
}

export const RodMenu = {
  version: '2.3.0' as const,
  presets,
  aio: presets,

  open<TValues extends AnyRecord = AnyRecord>(schema: RodMenuSchema<TValues>): RodMenuHandle<TValues> {
    ensureHostMounted();
    return spawnSurface(schema);
  },

  async form<TValues extends AnyRecord = AnyRecord>(
    schema: Omit<RodMenuSchema<TValues>, 'actions'> & { actions?: readonly RodMenuAction[] },
  ): Promise<RodMenuResult<TValues>> {
    const actions = schema.actions || [
      { id: 'cancel', label: 'Cancelar', role: 'cancel', variant: 'secondary' },
      { id: 'submit', label: 'Continuar', role: 'submit', variant: 'primary' },
    ];
    const handle = RodMenu.open<TValues>({ ...schema, actions });
    await handle.ready;
    return handle.result;
  },

  async confirm(options: {
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    presentation?: Presentation;
  }): Promise<boolean> {
    const result = await RodMenu.open({
      title: options.title,
      description: options.description,
      presentation: options.presentation,
      actions: [
        { id: 'cancel', label: options.cancelLabel || 'Cancelar', role: 'cancel', variant: 'secondary' },
        {
          id: 'confirm',
          label: options.confirmLabel || 'Confirmar',
          role: options.danger ? 'destructive' : 'submit',
          variant: options.danger ? 'danger' : 'primary',
        },
      ],
    }).result;
    return result.action === 'confirm';
  },

  async actions<T extends string = string>(options: {
    title?: string;
    description?: string;
    presentation?: Presentation;
    anchor?: RodMenuSchema['anchor'];
    items: readonly {
      label: string;
      value: T;
      variant?: ActionVariant;
      icon?: string;
      badge?: string | number;
      shortcut?: string;
    }[];
  }): Promise<T | null> {
    const result = await RodMenu.open({
      title: options.title,
      description: options.description,
      presentation: options.presentation,
      anchor: options.anchor,
      actions: [
        ...options.items.map((item) => ({
          id: item.value,
          label: item.label,
          icon: item.icon,
          badge: item.badge,
          shortcut: item.shortcut,
          variant: item.variant || ('secondary' as ActionVariant),
          role: 'custom' as ActionRole,
          close: true,
        })),
        { id: 'cancel', label: 'Cancelar', variant: 'ghost', role: 'cancel' },
      ],
    }).result;
    return result.action === 'dismiss' || result.action === 'cancel' ? null : (result.action as T);
  },

  get: getHandleById,
  activate: activateSurface,
  stack: getAllHandles,
  closeAll: closeAllSurfaces,
};

export default RodMenu;
